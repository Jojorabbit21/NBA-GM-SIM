-- ============================================================
-- get_room_member_emails(p_room_id) — 리그 설정 화면 "팀 목록"에 이메일 컬럼 추가
--
-- 배경: 어드민이 세션 설정 > 리그 탭 우측 팀 목록에서 각 인간 GM의 이메일을 보고
-- 싶어함. profiles 테이블 SELECT RLS("Users can view own profile", auth.uid() = id)가
-- 본인 행만 허용해서 클라이언트에서 그냥 profiles를 조회하면 다른 사람 이메일은
-- 전부 비어 보임 — 이 RPC로 우회.
--
-- 스코프 제한: 전역 이메일 조회가 아니라 "호출자가 admin_user_id인 리그의 room 하나"로만
-- 한정(leagues.admin_user_id = auth.uid() 체크). league_teams_update_owner_or_admin RLS
-- 정책과 동일한 관리자 판별 패턴을 재사용.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_room_member_emails(p_room_id uuid)
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
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

GRANT EXECUTE ON FUNCTION public.get_room_member_emails(uuid) TO authenticated;
