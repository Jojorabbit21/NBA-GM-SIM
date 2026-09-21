-- 카드 에디션별 로고 표시 옵션 — 사용자 요청 (2026-09-20): "카드 에디션 설정 옵션에 로고 표시 옵션도 표시해줘"
-- show_center_logo: 카드 정중앙 팀 로고, show_corner_logo: 우상단 40px 팀 로고. 기본 둘 다 켜짐(지금 카드와 동일).
-- 에디션이 없는 카드는 없으므로(에디션 필수) 모든 카드가 소속 에디션의 값을 따른다.
ALTER TABLE public.meta_card_editions
    ADD COLUMN IF NOT EXISTS show_center_logo boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS show_corner_logo boolean NOT NULL DEFAULT true;

-- 롤백: ALTER TABLE public.meta_card_editions DROP COLUMN show_center_logo, DROP COLUMN show_corner_logo;

-- [적용] 2026-09-20 Supabase MCP로 반영
