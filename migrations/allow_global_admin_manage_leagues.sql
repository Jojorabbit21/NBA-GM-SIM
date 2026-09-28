-- 전역 어드민 계정이 본인이 만들지 않은 리그/토너먼트도 관리(생성/수정/삭제)할 수 있게 허용.
-- 배경: restrict_tournament_creation_to_admin.sql 적용 후 무단 생성 토너먼트 2건을 지우려다
-- 발견 — 기존 leagues.l_admin_write 정책은 "admin_user_id = auth.uid()"(그 리그를 만든
-- 사람 본인)만 UPDATE/DELETE를 허용해서, 사이트 전역 어드민(admin@mail.com)도 남이 만든
-- 리그는 AdminLeagueManagerPage에서 지울 수 없었다(services/multi/leagueService.ts
-- deleteLeague()가 조용히 0행 삭제로 끝남). 별도의 permissive 정책을 추가해 전역 어드민에게만
-- 소유자 제약 없는 ALL 권한을 준다 — 기존 l_admin_write(방장 본인 제약)는 그대로 유지.
--
-- ADMIN_USER_ID는 App.tsx / server/src/index.ts / services/multi/leagueService.ts 등에서
-- 쓰는 것과 동일한 고정값(project_admin_account.md — admin@mail.com, 별도 권한 시스템
-- 구현 전까지 고정).

CREATE POLICY l_global_admin_manage ON public.leagues
    FOR ALL
    USING (auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid)
    WITH CHECK (auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid);
