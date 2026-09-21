-- ============================================================
-- release_player(): 스트레치 프로비전 지원 추가 (waive/stretch 선택 가능)
--
-- 배경: 방출 확인 화면(MultiReleaseView.tsx, 신규)이 웨이브/스트레치 프로비전을 선택할 수
-- 있게 하면서 RPC도 release type을 받아 분기해야 한다. 공식/자격 규정은
-- docs/domain/nba-salary-cap-2025-26.md §8-4 그대로:
--   - 분산 기간 = (잔여 연수 × 2) + 1년(2026-09-21에 코드 전반에서 "-1" 버그 수정한 것과
--     동일 공식, views/NegotiationScreen.tsx 등과 일치)
--   - 자격: 잔여 보장액 $250,000 이상, 잔여 시즌 1개 이상
--   - 팀 단위 15% 캡 상한: 이 팀이 "그 시즌에 스트레치로 잡는 첫 해 금액의 합"이 그 시즌
--     샐러리 캡의 15%를 넘으면 거부(stretch_15pct_exceeded) — 첫 해는 항상 방출 시점의
--     현재 시즌(rooms.season)이므로 league.salary_cap_amount(현재 캡)로 비교하면 됨
--   - 투웨이 계약은 스트레치 자체가 무의미(원래 캡에 안 잡힘) — waive와 동일하게 건너뜀
--
-- 연도별 항목 생성: 시즌 롤오버가 아직 없어(멀티플레이어 미구현, dev-log 2026-09-21 §"팀
-- 페이롤 계산을 calcTeamPayroll() 하나로 통합" 항목 참고) 감가 트리거는 없지만, "해당
-- 시즌의 캡에만 잡혀야 한다"는 원칙은 지금 당장 지킬 수 있다 — 방출 시점에 분산 연수만큼
-- 미리 N개의 DeadMoneyEntry를 각각 그 시즌 라벨로 생성해둔다(시즌 라벨은 rooms.season
-- 'YYYY-YY' 형식에서 연도를 더해 문자열로 계산, 실제 롤오버 여부와 무관한 순수 계산).
-- getTeamDeadMoney(tf, slug, season) 필터가 있어 화면들은 이미 "그 시즌 것만" 집계하므로
-- 추가 클라이언트 변경 없이 바로 올바르게 반영된다.
--
-- p_release_type 기본값 'waive' — 기존 호출부(있다면)는 그대로 웨이브로 동작해 하위호환.
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

                    v_stretch_years := 2 * v_remaining_yrs + 1;
                    v_annual := round(v_remaining / v_stretch_years);

                    -- 팀 단위 15% 캡 상한 — 이 팀이 이번 시즌(v_room_season)에 이미 스트레치로
                    -- 잡아둔 금액 + 이번 건의 연간액이 캡의 15%를 넘으면 거부.
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
