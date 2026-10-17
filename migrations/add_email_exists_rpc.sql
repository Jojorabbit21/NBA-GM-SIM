-- ============================================================
-- email_exists(p_email) — 비밀번호 찾기에서 가입된 이메일일 때만 인증번호 발송
--
-- 배경: profiles SELECT RLS가 본인 행만 허용해 비로그인 상태에서는 가입 여부를 조회할 수 없음.
-- auth.users 기준(profiles.email은 어긋날 수 있음)으로 존재 여부만 boolean 반환.
-- 계정 존재 여부 노출은 의도된 결정(2026-10-17, 사용자 확인).
--
-- 롤백: DROP FUNCTION public.email_exists(text);
-- ============================================================

CREATE OR REPLACE FUNCTION public.email_exists(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(trim(p_email)));
$$;

REVOKE ALL ON FUNCTION public.email_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_exists(text) TO anon, authenticated;
