-- 전역 어드민이 "본인이 만들지 않은 리그"의 설정 화면에 실제로 들어가서 편집할 수 있게 확장.
-- 배경: allow_global_admin_manage_leagues.sql로 leagues 테이블은 열었지만,
-- LeagueSettingsView.tsx의 isAdmin(=league.admin_user_id===userId) 게이트가 비어드민을
-- 세션 화면으로 즉시 리다이렉트시켜서 전역 어드민도 남의 리그 설정 화면에 들어가지 못했고,
-- 들어가더라도 실제 저장 시 rooms/league_teams/games 등 여러 테이블 RLS가 전부
-- "그 리그를 만든 사람 본인(l.admin_user_id = auth.uid())"만 쓰기 허용이라 저장이 실패했다.
-- 공용 헬퍼 is_global_admin()을 만들고, 방 목록/멤버 조회에 쓰이는 my_room_ids()/
-- accessible_room_ids()와 관련 테이블 쓰기 정책, RPC 2종에 전역 어드민 예외를 추가한다.
--
-- ADMIN_USER_ID는 App.tsx / server/src/index.ts / services/multi/leagueService.ts 등과
-- 동일한 고정값(project_admin_account.md — admin@mail.com).

CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
    SELECT auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid
$$;

-- ── 방 조회 범위 확장 — 전역 어드민은 멤버가 아닌 방(진행중/종료 포함)도 전부 조회 가능 ──
-- (rooms/room_members/games/league_events/draft_picks 등 이 두 함수를 쓰는 모든 SELECT
-- 정책에 자동으로 반영됨)

CREATE OR REPLACE FUNCTION public.my_room_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT room_id FROM room_members WHERE user_id = auth.uid()
    UNION
    SELECT id FROM rooms WHERE is_global_admin()
$function$;

CREATE OR REPLACE FUNCTION public.accessible_room_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT room_id FROM room_members WHERE user_id = auth.uid()
    UNION
    SELECT r.id FROM rooms r
    JOIN leagues l ON l.id = r.league_id
    WHERE l.status IN ('recruiting', 'drafting')
    UNION
    SELECT id FROM rooms WHERE is_global_admin()
$function$;

-- ── 쓰기 정책 — 리그 설정 화면 저장(updateLeagueSettings/resetTournament/updateTeamName)이
-- 실제로 거치는 테이블에 "소유자 무관 전역 어드민 ALL" permissive 정책을 추가.
-- 기존 <table>_admin_write류 정책(소유자 본인 제약)은 건드리지 않고 그대로 둔다.

CREATE POLICY r_global_admin_manage ON public.rooms
    FOR ALL USING (is_global_admin()) WITH CHECK (is_global_admin());

CREATE POLICY league_teams_global_admin_manage ON public.league_teams
    FOR ALL USING (is_global_admin()) WITH CHECK (is_global_admin());

CREATE POLICY rm_global_admin_manage ON public.room_members
    FOR ALL USING (is_global_admin()) WITH CHECK (is_global_admin());

CREATE POLICY g_global_admin_manage ON public.games
    FOR ALL USING (is_global_admin()) WITH CHECK (is_global_admin());

-- ── RPC 2종 — "호출자가 이 리그의 admin_user_id인가"만 검사하던 곳에 전역 어드민 예외 추가 ──

CREATE OR REPLACE FUNCTION public.get_room_member_emails(p_room_id uuid)
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT is_global_admin() AND NOT EXISTS (
        SELECT 1
        FROM rooms r
        JOIN leagues l ON l.id = r.league_id
        WHERE r.id = p_room_id AND l.admin_user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    RETURN QUERY
    SELECT rm.user_id, p.email
    FROM room_members rm
    JOIN profiles p ON p.id = rm.user_id
    WHERE rm.room_id = p_room_id AND rm.is_ai = false;
END;
$$;

CREATE OR REPLACE FUNCTION public.personal_draft_cleanup_room(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_admin      uuid;
    v_caller     uuid    := auth.uid();
    v_is_service boolean := (auth.jwt()->>'role') = 'service_role';
    v_states     integer := 0;
    v_instances  integer := 0;
    v_progress   integer := 0;
BEGIN
    SELECT l.admin_user_id INTO v_admin
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = p_room_id;
    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'room_not_found';
    END IF;
    IF NOT v_is_service AND NOT is_global_admin() AND (v_caller IS NULL OR v_caller <> v_admin) THEN
        RAISE EXCEPTION 'not_league_admin';
    END IF;

    WITH del AS (
        DELETE FROM room_player_state s
        WHERE s.room_id = p_room_id
          AND EXISTS (
              SELECT 1 FROM room_player_instances i
              WHERE i.room_id = p_room_id AND i.instance_id::text = s.player_id
          )
        RETURNING 1
    ) SELECT count(*) INTO v_states FROM del;

    WITH del AS (
        DELETE FROM room_player_instances WHERE room_id = p_room_id RETURNING 1
    ) SELECT count(*) INTO v_instances FROM del;

    WITH del AS (
        DELETE FROM personal_draft_progress WHERE room_id = p_room_id RETURNING 1
    ) SELECT count(*) INTO v_progress FROM del;

    RETURN jsonb_build_object('playerStates', v_states, 'instances', v_instances, 'progress', v_progress);
END;
$function$;
