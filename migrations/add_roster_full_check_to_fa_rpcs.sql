-- ============================================================
-- sign_free_agent() / sign_free_agent_negotiated() — 로스터 슬롯 가득참(roster_full) 검증 추가
--
-- 배경: LeagueSettingsView.tsx에 새로 생긴 "로스터" 탭에서 어드민이 leagues.max_roster_size
-- (15~20, 기본 15)를 정할 수 있게 됐다. 지금까지는 두 RPC 모두 already_on_roster/
-- player_already_signed(중복 서명/경합) 체크만 하고 로스터 인원 상한 자체는 아예 검사하지
-- 않았음 — 팀이 몇 명을 보유하든 FA 계약이 무제한으로 들어갈 수 있었다.
--
-- 변경: 두 함수 모두 팀 소유권 검증 이후, roster UPDATE 직전에
-- `jsonb_array_length(v_team.roster) >= v_max_roster` 체크를 추가해 초과 시 'roster_full'
-- 예외를 던진다(클라이언트 매핑: services/multi/faService.ts mapFaError). v_max_roster는
-- fa_enabled/admin 여부를 조회하는 기존 SELECT에 coalesce(l.max_roster_size, 15)를 얹어
-- 함께 가져온다(쿼리 추가 없음).
--
-- add_sign_free_agent_release_player_rpc.sql / add_sign_free_agent_negotiated_rpc.sql의
-- 함수 본문을 그대로 베이스로 하고 위 체크만 추가한 전체 재정의(CREATE OR REPLACE)다.
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
    IF jsonb_array_length(v_team.roster) >= v_max_roster THEN
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
    IF jsonb_array_length(v_team.roster) >= v_max_roster THEN
        RAISE EXCEPTION 'roster_full';
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
