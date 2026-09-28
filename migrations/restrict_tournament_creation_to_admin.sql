-- 온라인 토너먼트(leagues.type='tournament')는 전역 어드민 계정만 생성할 수 있도록 제한.
-- 배경: admin@mail.com이 아닌 일반 유저 계정이 "새 리그" 모달로 토너먼트를 2개(스필이/스핑)
-- 만든 사례 발견 — leagues.admin_user_id는 "그 리그를 만든 사람(방장)"일 뿐 사이트 전역
-- 어드민과 무관했고, 기존 RLS(l_admin_write)는 "본인을 admin_user_id로 지정해 INSERT"하는
-- 모든 유저를 허용하고 있었음. main_league(메인리그) 생성은 계속 누구나 허용, tournament만 제한.
--
-- ADMIN_USER_ID는 App.tsx / server/src/index.ts 등에서 쓰는 것과 동일한 고정값
-- (project_admin_account.md — admin@mail.com, 별도 권한 시스템 구현 전까지 고정).

DROP POLICY IF EXISTS l_admin_write ON public.leagues;

CREATE POLICY l_admin_write ON public.leagues
    FOR ALL
    USING (admin_user_id = auth.uid())
    WITH CHECK (
        admin_user_id = auth.uid()
        AND (
            type <> 'tournament'
            OR admin_user_id = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid
        )
    );
