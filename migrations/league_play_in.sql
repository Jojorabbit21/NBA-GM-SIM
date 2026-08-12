-- ============================================================
-- league_play_in.sql — 메인리그 플레이인 토너먼트 활성화 여부
--
-- 배경: 컨퍼런스별 플레이오프 진출 팀 수(leagues.playoff_team_count, 기존 컬럼 —
-- 이 마이그레이션 이후 "리그 전체" 총원이 아니라 "컨퍼런스당" 진출 팀 수로 의미가
-- 바뀐다, server/src/shared/playoffSeeder.ts 참조)에 더해, NBA 방식 플레이인
-- (7~10위 미니 토너먼트로 마지막 2자리를 가리는 방식) 활성화 여부를 어드민이
-- 세션별로 설정할 수 있도록 컬럼 추가.
-- 상세: docs/history/dev-log.md 참조.
-- ============================================================

ALTER TABLE public.leagues
    ADD COLUMN IF NOT EXISTS play_in_enabled boolean DEFAULT true;
