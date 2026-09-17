-- ============================================================
-- sign_free_agent() / sign_free_agent_negotiated() — roster_full 체크에서 투웨이 계약 제외
--
-- 배경: add_roster_full_check_to_fa_rpcs.sql의 `jsonb_array_length(v_team.roster) >=
-- v_max_roster` 체크는 로스터 배열 전체 길이(정규+투웨이 합산)를 max_roster_size와
-- 비교했다. 투웨이는 정규 계약 슬롯(max_roster_size)과 별개 슬롯인데 합산해버려서,
-- 예를 들어 정규 계약 13명 + 투웨이 2명 = 로스터 15명인 상태에서 max_roster_size=15에
-- 곧바로 걸려 "계약" 버튼이 막히는 버그가 있었다(클라이언트 쪽도 동일한 버그가 있어
-- 같은 커밋에서 함께 수정 — views/multi/season/MultiFreeAgentView.tsx의
-- isMyRosterFull, MultiNegotiationView.tsx의 isRosterFull).
--
-- 변경: roster_full 체크를 "로스터 중 room_player_state.contract->>'type'이 'two-way'가
-- 아닌 선수 수"로 교체 — RosterOverviewGrid.tsx의 "정규 계약 슬롯" 집계
-- (p.contract?.type !== 'two-way')와 동일한 기준. contract 행 자체가 없는 선수(예:
-- sign_free_agent()로 즉시계약된 선수, contract override 없음)는 정규 계약으로 취급된다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sign_free_agent(p_team_id uuid, p_player_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid        uuid := auth.uid();
    v_team       league_teams%ROWTYPE;
    v_admin      boolean;
    v_fa_enabled boolean;
    v_max_roster integer;
    v_regular_count integer;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO v_team FROM league_teams WHERE id = p_team_id FOR UPDATE;
    IF v_team.id IS NULL THEN
        RAISE EXCEPTION 'team_not_found';
    END IF;

    SELECT l.admin_user_id = v_uid, coalesce(l.fa_enabled, true), coalesce(l.max_roster_size, 15)
    INTO v_admin, v_fa_enabled, v_max_roster
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = v_team.room_id;

    IF NOT v_fa_enabled THEN
        RAISE EXCEPTION 'fa_disabled';
    END IF;
    IF NOT v_admin AND v_team.user_id IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'not_team_owner';
    END IF;
    IF v_team.roster ? p_player_id THEN
        RAISE EXCEPTION 'already_on_roster';
    END IF;
    -- 같은 리그(room) 내 다른 팀이 이미 데려간 선수인지 확인(동시 계약 경합 방지)
    IF EXISTS (
        SELECT 1 FROM league_teams
        WHERE room_id = v_team.room_id AND id <> v_team.id AND roster ? p_player_id
    ) THEN
        RAISE EXCEPTION 'player_already_signed';
    END IF;

    SELECT count(*) INTO v_regular_count
    FROM jsonb_array_elements_text(v_team.roster) AS pid
    WHERE NOT EXISTS (
        SELECT 1 FROM room_player_state rps
        WHERE rps.room_id = v_team.room_id AND rps.player_id = pid
          AND rps.contract->>'type' = 'two-way'
    );
    IF v_regular_count >= v_max_roster THEN
        RAISE EXCEPTION 'roster_full';
    END IF;

    UPDATE league_teams SET roster = roster || to_jsonb(p_player_id) WHERE id = v_team.id;

    RETURN jsonb_build_object('ok', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sign_free_agent_negotiated(
    p_team_id     uuid,
    p_player_id   text,
    p_contract    jsonb,
    p_signing_type text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid        uuid := auth.uid();
    v_team       league_teams%ROWTYPE;
    v_admin      boolean;
    v_fa_enabled boolean;
    v_max_roster integer;
    v_regular_count integer;
    v_sim_date   date;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO v_team FROM league_teams WHERE id = p_team_id FOR UPDATE;
    IF v_team.id IS NULL THEN
        RAISE EXCEPTION 'team_not_found';
    END IF;

    SELECT l.admin_user_id = v_uid, coalesce(l.fa_enabled, true), coalesce(l.max_roster_size, 15)
    INTO v_admin, v_fa_enabled, v_max_roster
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = v_team.room_id;

    IF NOT v_fa_enabled THEN
        RAISE EXCEPTION 'fa_disabled';
    END IF;
    IF NOT v_admin AND v_team.user_id IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'not_team_owner';
    END IF;
    IF v_team.roster ? p_player_id THEN
        RAISE EXCEPTION 'already_on_roster';
    END IF;
    -- 같은 리그(room) 내 다른 팀이 이미 데려간 선수인지 확인(동시 계약 경합 방지)
    IF EXISTS (
        SELECT 1 FROM league_teams
        WHERE room_id = v_team.room_id AND id <> v_team.id AND roster ? p_player_id
    ) THEN
        RAISE EXCEPTION 'player_already_signed';
    END IF;

    -- roster_full 체크는 지금 체결하려는 계약 자체가 투웨이면 건너뛴다(투웨이는
    -- max_roster_size가 아니라 별개의 two_way_slots로 관리 — 그 슬롯 상한 검증은 아직
    -- 이 RPC 스코프에 없음, 2026-09-16 dev-log 참고).
    IF p_contract->>'type' IS DISTINCT FROM 'two-way' THEN
        SELECT count(*) INTO v_regular_count
        FROM jsonb_array_elements_text(v_team.roster) AS pid
        WHERE NOT EXISTS (
            SELECT 1 FROM room_player_state rps
            WHERE rps.room_id = v_team.room_id AND rps.player_id = pid
              AND rps.contract->>'type' = 'two-way'
        );
        IF v_regular_count >= v_max_roster THEN
            RAISE EXCEPTION 'roster_full';
        END IF;
    END IF;

    UPDATE league_teams SET roster = roster || to_jsonb(p_player_id) WHERE id = v_team.id;

    -- 협상으로 정해진 계약 내용을 room_player_state.contract에 저장(PK: room_id, player_id —
    -- migrations/room_player_state.sql, add_room_player_state_contract.sql 참고).
    INSERT INTO room_player_state (room_id, player_id, contract)
    VALUES (v_team.room_id, p_player_id, p_contract)
    ON CONFLICT (room_id, player_id) DO UPDATE SET contract = EXCLUDED.contract;

    SELECT sim_date::date INTO v_sim_date FROM rooms WHERE id = v_team.room_id;

    INSERT INTO league_transactions (room_id, type, team_id, player_id, sim_date, acted_by, resolved_as_admin, details)
    VALUES (
        v_team.room_id, 'fa_sign', v_team.id, p_player_id, v_sim_date, v_uid, v_admin,
        jsonb_build_object('contract', p_contract, 'signingType', p_signing_type)
    );

    RETURN jsonb_build_object('ok', true);
END;
$function$
;

-- [적용] 2026-09-16 Supabase MCP로 반영
