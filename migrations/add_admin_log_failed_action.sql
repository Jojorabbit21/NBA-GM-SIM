-- ============================================================
-- [적용] 2026-10-06 Supabase MCP로 반영
-- admin_log_failed_action — 어드민 조작 실패(예: 어드민 트레이드 실패)를 league_action_logs에 남기는 RPC
--
-- 배경: 사용자 결정 — 어드민 트레이드 실패는 토스트로 띄우지 않고 세션 설정 "로그" 탭에만 기록한다.
-- 실패한 RPC(execute_admin_trade 등)는 예외로 트랜잭션이 롤백되므로 서버 안에서는 로그를 쓸 수 없다.
-- 클라이언트가 오류를 받은 뒤 이 RPC를 따로 호출한다(leagueService.logAdminFailedAction).
-- p_action은 'admin_<무엇>_failed' 형식만 허용, 호출자는 리그 어드민 또는 글로벌 어드민.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_log_failed_action(
    p_room_id uuid, p_action text, p_team_ids uuid[] DEFAULT '{}', p_player_ids text[] DEFAULT '{}', p_details jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_uid uuid := auth.uid(); v_admin uuid;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
    IF p_action !~ '^admin_[a-z_]+_failed$' THEN RAISE EXCEPTION 'invalid_action: %', p_action; END IF;
    SELECT l.admin_user_id INTO v_admin FROM rooms r JOIN leagues l ON l.id = r.league_id WHERE r.id = p_room_id;
    IF v_admin IS NULL THEN RAISE EXCEPTION 'room_not_found'; END IF;
    IF v_admin <> v_uid AND NOT public.is_global_admin() THEN RAISE EXCEPTION 'not_league_admin'; END IF;
    PERFORM public.league_action_log_write(p_room_id, NULL, p_action, coalesce(p_player_ids, '{}'), coalesce(p_team_ids, '{}'),
        coalesce(p_details, '{}'::jsonb) || jsonb_build_object('failed', true), v_uid);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_log_failed_action(uuid, text, uuid[], text[], jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_log_failed_action(uuid, text, uuid[], text[], jsonb) TO authenticated;
