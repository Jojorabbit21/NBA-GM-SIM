-- ============================================================
-- sign_free_agent() / release_player() — 멀티플레이어 FA 영입/방출 RPC
--
-- 배경: MultiFreeAgentView.tsx "계약" 버튼 클릭 시 즉시 서명(협상 없음, 1단계),
-- 로스터 화면 "방출" 버튼으로 즉시 방출. 트레이드 accept(respond_trade_offer)와
-- 동일한 패턴(SECURITY DEFINER, FOR UPDATE 행 잠금, auth.uid() 소유권 검증,
-- league_teams.roster jsonb 배열 직접 조작, 관리자는 어느 팀이든 조작 가능)을 그대로 따름.
--
-- 캡/샐러리 룰 검증은 아직 없음(1단계 스코프 — "우선 캡 체크 없이 즉시 추가").
-- [적용] 2026-09-04 Supabase MCP로 반영
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

    RETURN jsonb_build_object('ok', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.release_player(p_team_id uuid, p_player_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid   uuid := auth.uid();
    v_team  league_teams%ROWTYPE;
    v_admin boolean;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO v_team FROM league_teams WHERE id = p_team_id FOR UPDATE;
    IF v_team.id IS NULL THEN
        RAISE EXCEPTION 'team_not_found';
    END IF;

    SELECT l.admin_user_id = v_uid INTO v_admin
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

    RETURN jsonb_build_object('ok', true);
END;
$function$
;
