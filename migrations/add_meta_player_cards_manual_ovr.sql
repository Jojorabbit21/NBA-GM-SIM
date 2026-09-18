-- 카드 전용 OVR 고정값 — 사용자 요청 "카드에 한정해서만 OVR을 고정값으로 만들 수 있을까?"
-- meta_players/일반 선수 OVR 계산(calculateOvr, 트레이드/정규화/리더보드 등 전 시스템이 공유)은
-- 건드리지 않는다 — meta_player_cards에만 nullable 컬럼을 추가해 그 카드에서만 능력치 기반
-- 계산값 대신 이 고정값을 쓸 수 있게 한다. null(기본값)이면 지금처럼 36개 능력치로 동적 계산.
ALTER TABLE public.meta_player_cards
    ADD COLUMN IF NOT EXISTS manual_ovr integer NULL
    CONSTRAINT meta_player_cards_manual_ovr_range CHECK (manual_ovr IS NULL OR (manual_ovr BETWEEN 0 AND 99));

-- [적용] 2026-09-18 Supabase MCP로 반영
