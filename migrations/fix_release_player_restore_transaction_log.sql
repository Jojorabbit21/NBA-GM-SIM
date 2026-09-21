-- ============================================================
-- release_player() 회귀 수정: league_transactions 로그 유실분 복원
--
-- 배경: add_release_player_waive_dead_money.sql(2026-09-21, waive 데드캡 추가)이
-- add_sign_free_agent_release_player_rpc.sql(2026-09-04, 데드캡 로직 없음) 시점의 본문을
-- 베이스로 삼는 바람에, 그 사이에 add_league_transactions_log.sql(2026-09-04, 같은 날 나중에
-- 적용)이 추가한 `INSERT INTO league_transactions(...)` 호출을 통째로 덮어써버렸다 — 방출이
-- 여전히 정상 동작하고 데드캡도 정상 기록됐지만, "선수 이동 내역" 위젯
-- (services/multi/playerHistoryService.ts)이 쓰는 league_transactions.type='waive' 행이
-- 이 시점 이후 방출부터는 하나도 안 쌓이는 사일런트 회귀였다. 실제로 이 기간 방출 건수만큼
-- league_transactions에 구멍이 남는다(과거분 소급 복원 불가 — 애초에 안 쓰였으므로).
--
-- 이번 정의는 add_league_transactions_log.sql의 v_sim_date + INSERT 블록과
-- add_release_player_waive_dead_money.sql의 캡 활성 리그 데드캡 블록을 합친 것 —
-- 앞으로 release_player()를 또 고칠 땐 반드시 이 파일(가장 최신)을 베이스로 할 것.
-- [적용] 2026-09-21 Supabase MCP로 반영
-- ============================================================

CREATE OR REPLACE FUNCTION public.release_player(p_team_id uuid, p_player_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid          uuid := auth.uid();
    v_team         league_teams%ROWTYPE;
    v_admin        boolean;
    v_cap_enabled  boolean;
    v_sim_date     date;
    v_room_season  text;
    v_contract     jsonb;
    v_player_name  text;
    v_current_year int;
    v_remaining    numeric;
    v_dead_entry   jsonb;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO v_team FROM league_teams WHERE id = p_team_id FOR UPDATE;
    IF v_team.id IS NULL THEN
        RAISE EXCEPTION 'team_not_found';
    END IF;

    SELECT l.admin_user_id = v_uid, coalesce(l.cap_enabled, false)
    INTO v_admin, v_cap_enabled
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

    -- 방출 선수가 걸려있던 트레이드 블록 정리 (트레이드 accept 로직과 동일 관례)
    DELETE FROM league_trade_blocks WHERE team_id = v_team.id AND player_id = p_player_id;

    -- 뎁스차트/전술이 방금 방출된 선수를 참조하고 있을 수 있음 — 트레이드 accept와
    -- 동일하게 리셋(다음 접속 시 자동 재생성 폴백)해 stale 참조를 방지.
    UPDATE room_members SET tactics = NULL, depth_chart = NULL
    WHERE room_id = v_team.room_id AND team_id = v_team.team_slug;

    SELECT sim_date::date INTO v_sim_date FROM rooms WHERE id = v_team.room_id;

    INSERT INTO league_transactions (room_id, type, team_id, player_id, sim_date, acted_by, resolved_as_admin)
    VALUES (v_team.room_id, 'waive', v_team.id, p_player_id, v_sim_date, v_uid, v_admin);

    -- ── 캡 활성 리그: waive 데드캡 기록 (2026-09-21, migrations/add_release_player_waive_dead_money.sql) ──
    IF v_cap_enabled THEN
        SELECT coalesce(rps.contract, mp.base_attributes->'contract'), mp.name, r.season
        INTO v_contract, v_player_name, v_room_season
        FROM meta_players mp
        JOIN rooms r ON r.id = v_team.room_id
        LEFT JOIN room_player_state rps ON rps.room_id = v_team.room_id AND rps.player_id = p_player_id
        WHERE mp.id::text = p_player_id;

        IF v_contract IS NOT NULL AND jsonb_typeof(v_contract->'years') = 'array' THEN
            v_current_year := coalesce((v_contract->>'currentYear')::int, 0);

            SELECT coalesce(sum((y.val)::numeric), 0) INTO v_remaining
            FROM jsonb_array_elements_text(v_contract->'years') WITH ORDINALITY AS y(val, idx)
            WHERE y.idx - 1 >= v_current_year;

            IF v_remaining > 0 THEN
                v_dead_entry := jsonb_build_object(
                    'playerId',    p_player_id,
                    'playerName',  coalesce(v_player_name, ''),
                    'amount',      v_remaining,
                    'season',      coalesce(v_room_season, ''),
                    'releaseType', 'waive'
                );
                UPDATE rooms
                SET team_finances = coalesce(team_finances, '{}'::jsonb)
                    || jsonb_build_object(
                        v_team.team_slug,
                        coalesce(team_finances -> v_team.team_slug, '{}'::jsonb)
                            || jsonb_build_object('deadMoney',
                                coalesce(team_finances #> array[v_team.team_slug, 'deadMoney'], '[]'::jsonb)
                                    || jsonb_build_array(v_dead_entry))
                    )
                WHERE id = v_team.room_id;
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$function$
;
