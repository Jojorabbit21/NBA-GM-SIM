-- 카드 하단 텍스트 그라디언트(이름·시즌·팀·아키타입 뒤의 어두운 층) on/off + 불투명도 — 컬렉션 단위 설정.
-- 사용자 요청 (2026-09-20): "카드 하단의 그라디언트를 컬렉션 배경 설정 화면에서 끄고 켤 수 있고,
-- 불투명도를 조절할 수 있는 옵션도 만들어줘."
-- 기본값은 지금 카드와 동일(켜짐, 하단 최대 불투명도 85%). CSS 변환은 utils/cardBackground.ts buildCardBottomGradient().
ALTER TABLE public.meta_player_card_collections
    ADD COLUMN IF NOT EXISTS bottom_gradient_enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS bottom_gradient_opacity integer NOT NULL DEFAULT 85
        CHECK (bottom_gradient_opacity BETWEEN 0 AND 100);

-- 롤백: ALTER TABLE public.meta_player_card_collections DROP COLUMN bottom_gradient_enabled, DROP COLUMN bottom_gradient_opacity;

-- [적용] 2026-09-20 Supabase MCP로 반영
