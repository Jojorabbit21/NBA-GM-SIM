-- ============================================================
-- game_pbp_team_misc.sql — 팀 미스크 득점 4종 컬럼 추가
--
-- 배경 (2026-11-05): 팀 스탯에 POTV(턴오버 직후 첫 공격 득점) / FBPS(속공) / PITP(페인트) / SPTS(세컨찬스)를
-- 표시하기 위해, 엔진이 경기 중 집계한 값(SimulationResult.teamMisc)을 경기당 1회 저장한다.
-- 형태: {"home":{"potv":n,"fbps":n,"pitp":n,"spts":n},"away":{...}} — server/src/simRunner.ts가 채운다.
-- 이 컬럼이 없던 경기는 scripts/backfillTeamMisc.py(박스 틱 기반 재구성)로 채운다. 값이 NULL이면 화면에서 해당 4개를 숨긴다.
-- 상세: docs/history/dev-log.md 2026-11-05 항목.
--
-- 롤백: ALTER TABLE public.game_pbp DROP COLUMN IF EXISTS team_misc;
-- ============================================================

ALTER TABLE public.game_pbp
    ADD COLUMN IF NOT EXISTS team_misc jsonb;
