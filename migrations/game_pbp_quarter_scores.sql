-- ============================================================
-- game_pbp_quarter_scores.sql — 쿼터별 점수 컬럼 추가
--
-- 배경: 일정 화면 카드 뷰에 쿼터별 점수 테이블을 표시하기 위해, 매번 game_pbp.events
-- (경기당 수십~백KB PBP 로그) 전체를 다시 훑지 않고 시뮬레이션 완료 시 한 번만 계산해
-- 저장해두는 컬럼. server/src/simRunner.ts의 computeQuarterScoresFromEvents()가 채운다.
-- 상세: docs/history/dev-log.md 참조.
-- ============================================================

ALTER TABLE public.game_pbp
    ADD COLUMN IF NOT EXISTS quarter_scores jsonb;
