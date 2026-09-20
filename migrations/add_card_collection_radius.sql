-- 카드 모서리 둥글기(px) — 컬렉션 단위 설정. 사용자 요청 (2026-09-20): "카드에 보더 라디우스를 제거해보고싶어"
-- 기본 12 = 지금 카드(rounded-xl)와 동일. 0이면 직각. utils/cardBackground.ts cardRadiusPx().
ALTER TABLE public.meta_player_card_collections
    ADD COLUMN IF NOT EXISTS card_radius integer NOT NULL DEFAULT 12 CHECK (card_radius BETWEEN 0 AND 32);

-- [2026-09-20 후속] 사용자 요청 "보더 라디우스 없음이 모든 카드의 기본 형식이 되도록" → 기본값 0으로 변경,
-- 기존 12(초기 기본값 그대로였던 행)를 0으로 갱신. 클라이언트 기본값(DEFAULT_CARD_BACKGROUND.card_radius)도 0.
ALTER TABLE public.meta_player_card_collections ALTER COLUMN card_radius SET DEFAULT 0;
UPDATE public.meta_player_card_collections SET card_radius = 0 WHERE card_radius = 12;

-- 롤백: ALTER TABLE public.meta_player_card_collections DROP COLUMN card_radius;

-- [적용] 2026-09-20 Supabase MCP로 반영
