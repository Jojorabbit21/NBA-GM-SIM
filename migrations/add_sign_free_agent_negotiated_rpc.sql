-- ============================================================
-- sign_free_agent_negotiated() — 멀티플레이어 FA "협상 화면" 전용 계약 체결 RPC
--
-- 배경: MultiFreeAgentView.tsx "계약" 버튼이 cba_rules_enabled 리그에서는 즉시계약
-- (sign_free_agent(), add_sign_free_agent_release_player_rpc.sql) 대신 협상 화면
-- (MultiNegotiationView.tsx)으로 이동해 실제 연봉/연수/signingType을 정해 계약한다.
-- 기존 sign_free_agent()와 거의 동일한 패턴(SECURITY DEFINER, FOR UPDATE 행 잠금,
-- auth.uid() 소유권 검증, admin 예외, fa_enabled 체크, 로스터 중복/경합 체크)을 그대로
-- 따르되, 계약 내용(p_contract)을 room_player_state.contract에 함께 기록하고
-- league_transactions.details에 협상 결과(계약/signingType)를 남긴다는 점이 다르다.
--
-- 기존 sign_free_agent()는 건드리지 않음 — cba_rules_enabled=false인 캐주얼 리그는
-- 계속 그 함수(즉시계약, 캡 체크 없음)를 쓴다.
--
-- v1 스코프: 슬롯/에이프런/MLE/버드권한 자격 검증은 여기서도 하지 않는다(협상 화면 쪽의
-- calcFADemand/evaluateFAOffer로 "얼마를 받아들이는가"만 판정하고, 캡 룰 자체의 서버측
-- 재검증은 후속 작업). signingType은 정보성 필드로만 저장.
-- ============================================================

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
    v_sim_date   date;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO v_team FROM league_teams WHERE id = p_team_id FOR UPDATE;
    IF v_team.id IS NULL THEN
        RAISE EXCEPTION 'team_not_found';
    END IF;

    SELECT l.admin_user_id = v_uid, coalesce(l.fa_enabled, true)
    INTO v_admin, v_fa_enabled
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

-- [적용] 2026-09-15 Supabase MCP로 반영 (확인: pg_proc에 pronargs=4, prosecdef=true로 생성됨)
