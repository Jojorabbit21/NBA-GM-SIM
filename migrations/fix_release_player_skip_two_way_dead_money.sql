-- ============================================================
-- release_player(): 투웨이 계약 방출 시 데드캡 생성하지 않도록 수정
--
-- 배경: 투웨이 계약은 실제 CBA상 샐러리캡에 전혀 잡히지 않는다(TeamPayrollTable.tsx의
-- colTotals 합산에서도 `if (!p.contract || p.contract.type === 'two_way') continue;`로
-- 이미 제외하고 있음, docs/domain/nba-salary-cap-2025-26.md §7 Two-Way Contract 참고).
-- 그런데 release_player()의 데드캡 계산은 contract.type을 확인하지 않고 무조건
-- years[currentYear:] 합계를 넣어서, 투웨이 선수를 방출해도(흔한 케이스 — 로스터 정리)
-- 실제로는 없어야 할 데드캡이 잡히는 버그가 있었다. type이 'two_way'면 건너뛴다.
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

        -- 투웨이 계약은 캡에 잡히지 않으므로 데드캡도 없음.
        IF v_contract IS NOT NULL AND jsonb_typeof(v_contract->'years') = 'array'
           AND coalesce(v_contract->>'type', '') <> 'two_way' THEN
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
