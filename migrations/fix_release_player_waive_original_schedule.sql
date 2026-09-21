-- ============================================================
-- release_player(): waive 데드캡을 "이번 시즌 전액 가속"에서 "원래 계약 스케줄 그대로"로 수정
--
-- 배경: 지금까지 waive는 잔여 연봉 전액(v_remaining)을 방출 시점 시즌 딱 1건으로 몰아
-- 넣었다 — 실제 CBA는 그렇지 않다. 스트레치를 쓰지 않으면 팀은 "원래 계약 스케줄
-- 그대로"(연도별 실제 금액이 각자의 원래 시즌에) 데드캡을 남기는 쪽을 선택할 수 있다
-- ("A team can stick to the original schedule for cap hit purposes, if it so chooses" —
-- Hoops Rumors Glossary: Stretch Provision). 즉 3년 남은 계약을 웨이브하면 이번 시즌엔
-- 올해분만 잡히고, 나머지 2년치는 각자의 원래 시즌에 잡힌다 — 총액을 한 시즌에 몰아
-- 잡는 게 아니다. **스트레치가 바로 이 "원래 스케줄"을 대체해서 더 길고 평평하게
-- 늘리는 선택지**다(총액은 그대로, 기간만 2×잔여연수+1년으로 확장).
-- docs/domain/nba-salary-cap-2025-26.md §8-2/§8-4 정정 완료.
--
-- 변경: waive 분기를 stretch와 동일하게 "연도별 N개 항목 생성" 방식으로 바꾼다. 단
-- stretch는 총액을 균등 분할(연간액 동일)하는 반면, waive는 계약의 원래 연도별 실제
-- 금액(v_contract->'years'의 각 원소)을 그대로 쓴다. 시즌 라벨은 contract.yearSeasons가
-- 있으면 그 값을, 없으면(구버전 데이터) rooms.season부터 순차 계산.
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
    v_yr_amount      numeric;
    v_yr_start       int;
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
            v_start_year := substring(v_room_season from 1 for 4)::int;

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

                    IF v_remaining_yrs = 1 THEN
                        v_vdate := current_virtual_date(v_team.room_id);
                        v_stretch_deadline := make_date(v_start_year, 8, 31);
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

                    -- 스트레치: 총액을 (잔여연수×2)+1년에 균등 분할 — 원래 스케줄을 대체.
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
                    -- waive: 원래 계약 스케줄 그대로 — 연도별 실제 금액을 각자의 원래 시즌에
                    -- 남긴다(총액을 이번 시즌에 몰아 잡지 않음). yearSeasons가 있으면 그 값을,
                    -- 없으면 rooms.season부터 순차로 시즌 라벨을 매긴다.
                    v_dead_entries := '[]'::jsonb;
                    FOR v_i IN v_current_year..(jsonb_array_length(v_contract->'years') - 1) LOOP
                        v_yr_amount := (v_contract->'years'->v_i)::numeric;
                        IF v_contract ? 'yearSeasons' AND jsonb_typeof(v_contract->'yearSeasons') = 'array'
                           AND jsonb_array_length(v_contract->'yearSeasons') > v_i THEN
                            v_yr_start := (v_contract->'yearSeasons'->>v_i)::int;
                        ELSE
                            v_yr_start := v_start_year + (v_i - v_current_year);
                        END IF;
                        v_label := v_yr_start::text || '-' || lpad(((v_yr_start + 1) % 100)::text, 2, '0');
                        v_dead_entries := v_dead_entries || jsonb_build_array(jsonb_build_object(
                            'playerId',    p_player_id,
                            'playerName',  coalesce(v_player_name, ''),
                            'amount',      v_yr_amount,
                            'season',      v_label,
                            'releaseType', 'waive'
                        ));
                    END LOOP;
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
