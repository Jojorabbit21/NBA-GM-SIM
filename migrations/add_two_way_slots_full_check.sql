-- ============================================================
-- sign_free_agent_negotiated() — 투웨이 슬롯(leagues.two_way_slots) 소진 여부 검증 추가
--
-- 배경: fix_roster_full_check_exclude_two_way.sql에서 투웨이 계약은 정규 계약 슬롯
-- (max_roster_size) 체크를 건너뛰도록 고쳤는데, 그 시점엔 투웨이 슬롯 자체의 상한
-- (leagues.two_way_slots, 1~5, 기본 3) 검증이 없어 투웨이 슬롯이 이미 꽉 찬 팀도 투웨이
-- 계약을 무제한 체결할 수 있는 상태였다(알려진 갭으로 명시해둠). 이번에 클라이언트
-- (MultiNegotiationView.tsx의 isTwoWaySlotsFull)와 함께 서버 쪽도 막는다.
--
-- 변경: p_contract->>'type'이 'two-way'일 때만, 로스터 중 이미 투웨이 계약인 선수 수를
-- 세서 leagues.two_way_slots 이상이면 'two_way_slots_full' 예외를 던진다(클라이언트
-- 매핑: services/multi/faService.ts mapFaError). sign_free_agent()(즉시계약, 계약 유형
-- 개념 자체가 없음)는 해당 없어 건드리지 않음.
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
    v_max_roster integer;
    v_two_way_slots integer;
    v_regular_count integer;
    v_two_way_count integer;
    v_sim_date   date;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO v_team FROM league_teams WHERE id = p_team_id FOR UPDATE;
    IF v_team.id IS NULL THEN
        RAISE EXCEPTION 'team_not_found';
    END IF;

    SELECT l.admin_user_id = v_uid, coalesce(l.fa_enabled, true), coalesce(l.max_roster_size, 15), coalesce(l.two_way_slots, 3)
    INTO v_admin, v_fa_enabled, v_max_roster, v_two_way_slots
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

    IF p_contract->>'type' = 'two-way' THEN
        SELECT count(*) INTO v_two_way_count
        FROM jsonb_array_elements_text(v_team.roster) AS pid
        WHERE EXISTS (
            SELECT 1 FROM room_player_state rps
            WHERE rps.room_id = v_team.room_id AND rps.player_id = pid
              AND rps.contract->>'type' = 'two-way'
        );
        IF v_two_way_count >= v_two_way_slots THEN
            RAISE EXCEPTION 'two_way_slots_full';
        END IF;
    ELSE
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
