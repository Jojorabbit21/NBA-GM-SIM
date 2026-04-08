-- ============================================================
-- meta_players: 멀티 모드 드래프트 풀 포함 여부 컬럼 추가
-- 실행: Supabase SQL Editor (수동 적용)
-- 의존: meta_players 테이블 존재
-- ============================================================

ALTER TABLE meta_players
    ADD COLUMN IF NOT EXISTS in_multi_pool BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN meta_players.in_multi_pool IS
    '멀티 모드 드래프트 풀 포함 여부. DEFAULT TRUE = 기존 선수 전원 자동 포함. 2026 루키는 완성형 능력치 입력 후 수동으로 TRUE 설정.';
