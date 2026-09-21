-- ============================================================
-- release_player(): 스트레치 프로비전 "마지막 계약연도는 8월 31일까지만" 규정을
-- 서버(RPC)에도 추가 — 지금까지는 클라이언트(MultiReleaseView.tsx)만 이 규정으로 체크박스를
-- 막고 있었고, RPC를 직접 호출하면 우회 가능했다(방어 심도 원칙 위반 — 이 RPC의 다른 자격
-- 조건인 $25만 최소액/15% 캡 상한은 이미 서버에서도 검증하고 있었는데 이것만 빠져 있었음).
--
-- 규정: 잔여 계약 시즌이 딱 1개(마지막 해)인 선수는, 그 시즌(rooms.season)의 시작 연도
-- 8월 31일까지만 스트레치 가능. current_virtual_date(room_id)로 가상 NBA 캘린더 날짜를
-- 구해 비교한다(rooms.sim_date를 직접 쓰면 안 됨 — 실제 KST 날짜라 다른 도메인,
-- project_sim_date_vs_virtual_date.md 참고).
-- [적용] 2026-09-21 Supabase MCP로 반영
-- ============================================================

CREATE OR REPLACE FUNCTION public.release_player(p_team_id uuid, p_player_id text, p_release_type text DEFAULT 'waive')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid            uuid := auth.uid();
    v_team           league_teams%ROWTYPE;
    v_admin          boolean;
    v_cap_enabled    boolean;
    v_cap_amount     numeric;
    v_sim_date       date;
    v_room_season    text;
    v_contract       jsonb;
    v_player_name    text;
    v_current_year   int;
    v_remaining      numeric;
    v_remaining_yrs  int;
    v_dead_entries   jsonb;
    v_stretch_years  int;
    v_annual         numeric;
    v_start_year     int;
    v_label          text;
    v_i              int;
    v_existing_stretch numeric;
    v_vdate          date;
    v_stretch_deadline date;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;
    IF p_release_type NOT IN ('waive', 'stretch') THEN
        RAISE EXCEPTION 'invalid_release_type';
    END IF;

    SELECT * INTO v_team FROM league_teams WHERE id = p_team_id FOR UPDATE;
    IF v_team.id IS NULL THEN
        RAISE EXCEPTION 'team_not_found';
    END IF;

    SELECT l.admin_user_id = v_uid, coalesce(l.cap_enabled, false), l.salary_cap_amount
    INTO v_admin, v_cap_enabled, v_cap_amount
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = v_team.room_id;

    IF NOT v_admin AND v_team.user_id IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'not_team_owner';
    END IF;
    IF NOT (v_team.roster ? p_player_id) THEN
        RAISE EXCEPTION 'player_not_on_roster';
    END IF;

    UPDATE league_teams SET roster = (
        SELECT coalesce(jsonb_agg(e), '[]'::jsonb)
        FROM jsonb_array_elements_text(roster) e
        WHERE e <> p_player_id
    ) WHERE id = v_team.id;

    DELETE FROM league_trade_blocks WHERE team_id = v_team.id AND player_id = p_player_id;

    UPDATE room_members SET tactics = NULL, depth_chart = NULL
    WHERE room_id = v_team.room_id AND team_id = v_team.team_slug;

    SELECT sim_date::date INTO v_sim_date FROM rooms WHERE id = v_team.room_id;

    INSERT INTO league_transactions (room_id, type, team_id, player_id, sim_date, acted_by, resolved_as_admin)
    VALUES (v_team.room_id, 'waive', v_team.id, p_player_id, v_sim_date, v_uid, v_admin);

    IF v_cap_enabled THEN
        SELECT coalesce(rps.contract, mp.base_attributes->'contract'), mp.name, r.season
        INTO v_contract, v_player_name, v_room_season
        FROM meta_players mp
        JOIN rooms r ON r.id = v_team.room_id
        LEFT JOIN room_player_state rps ON rps.room_id = v_team.room_id AND rps.player_id = p_player_id
        WHERE mp.id::text = p_player_id;

        IF v_contract IS NOT NULL AND jsonb_typeof(v_contract->'years') = 'array'
           AND coalesce(v_contract->>'type', '') <> 'two_way' THEN
            v_current_year := coalesce((v_contract->>'currentYear')::int, 0);

            SELECT coalesce(sum((y.val)::numeric), 0) INTO v_remaining
            FROM jsonb_array_elements_text(v_contract->'years') WITH ORDINALITY AS y(val, idx)
            WHERE y.idx - 1 >= v_current_year;

            v_remaining_yrs := jsonb_array_length(v_contract->'years') - v_current_year;

            IF v_remaining > 0 THEN
                IF p_release_type = 'stretch' THEN
                    IF v_remaining_yrs < 1 THEN
                        RAISE EXCEPTION 'stretch_not_eligible';
                    END IF;
                    IF v_remaining < 250000 THEN
                        RAISE EXCEPTION 'stretch_not_eligible';
                    END IF;

                    -- 마지막 계약연도(잔여 1시즌)는 8월 31일까지만 스트레치 가능.
                    IF v_remaining_yrs = 1 THEN
                        v_vdate := current_virtual_date(v_team.room_id);
                        v_stretch_deadline := make_date(substring(v_room_season from 1 for 4)::int, 8, 31);
                        IF v_vdate IS NOT NULL AND v_vdate > v_stretch_deadline THEN
                            RAISE EXCEPTION 'stretch_not_eligible';
                        END IF;
                    END IF;

                    v_stretch_years := 2 * v_remaining_yrs + 1;
                    v_annual := round(v_remaining / v_stretch_years);

                    SELECT coalesce(sum((e->>'amount')::numeric), 0) INTO v_existing_stretch
                    FROM jsonb_array_elements(
                        coalesce((SELECT team_finances FROM rooms WHERE id = v_team.room_id) #> array[v_team.team_slug, 'deadMoney'], '[]'::jsonb)
                    ) e
                    WHERE e->>'releaseType' = 'stretch' AND e->>'season' = v_room_season;

                    IF v_cap_amount IS NOT NULL AND v_cap_amount > 0
                       AND (v_existing_stretch + v_annual) > v_cap_amount * 0.15 THEN
                        RAISE EXCEPTION 'stretch_15pct_exceeded';
                    END IF;

                    v_start_year := substring(v_room_season from 1 for 4)::int;
                    v_dead_entries := '[]'::jsonb;
                    FOR v_i IN 0..(v_stretch_years - 1) LOOP
                        v_label := (v_start_year + v_i)::text || '-' || lpad(((v_start_year + v_i + 1) % 100)::text, 2, '0');
                        v_dead_entries := v_dead_entries || jsonb_build_array(jsonb_build_object(
                            'playerId',              p_player_id,
                            'playerName',            coalesce(v_player_name, ''),
                            'amount',                v_annual,
                            'season',                v_label,
                            'releaseType',           'stretch',
                            'stretchYearsTotal',     v_stretch_years,
                            'stretchYearsRemaining', v_stretch_years - v_i
                        ));
                    END LOOP;
                ELSE
                    v_dead_entries := jsonb_build_array(jsonb_build_object(
                        'playerId',    p_player_id,
                        'playerName',  coalesce(v_player_name, ''),
                        'amount',      v_remaining,
                        'season',      coalesce(v_room_season, ''),
                        'releaseType', 'waive'
                    ));
                END IF;

                UPDATE rooms
                SET team_finances = coalesce(team_finances, '{}'::jsonb)
                    || jsonb_build_object(
                        v_team.team_slug,
                        coalesce(team_finances -> v_team.team_slug, '{}'::jsonb)
                            || jsonb_build_object('deadMoney',
                                coalesce(team_finances #> array[v_team.team_slug, 'deadMoney'], '[]'::jsonb)
                                    || v_dead_entries)
                    )
                WHERE id = v_team.room_id;
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$function$
;
