-- ============================================================================
-- 시즌 카드: 에디션 지정 필수화 (기본 카드 개념 제거)
-- 사용자 요청 (2026-09-20): "한 명의 선수에게 동일 시즌 + 다른 에디션일 경우 무제한 카드 생성이
-- 가능하도록 수정해줘. 시즌/에디션 지정은 필수"
--
-- - 기존 edition_id NULL 카드는 '기본' 에디션(없으면 생성, sort_order 0)으로 옮긴 뒤 NOT NULL.
-- - 고유 제약은 (source_player_id, season, edition_id) 그대로 — NULL이 없으니 일반 UNIQUE로 교체.
--   같은 선수·시즌이라도 에디션이 다르면 장수 제한 없음(에디션 수만큼).
-- ============================================================================

INSERT INTO public.meta_card_editions (name, sort_order)
VALUES ('기본', 0)
ON CONFLICT (name) DO NOTHING;

UPDATE public.meta_player_cards
SET edition_id = (SELECT id FROM public.meta_card_editions WHERE name = '기본')
WHERE edition_id IS NULL;

ALTER TABLE public.meta_player_cards ALTER COLUMN edition_id SET NOT NULL;

ALTER TABLE public.meta_player_cards DROP CONSTRAINT IF EXISTS meta_player_cards_source_season_edition_key;
ALTER TABLE public.meta_player_cards
    ADD CONSTRAINT meta_player_cards_source_season_edition_key
    UNIQUE (source_player_id, season, edition_id);

-- 롤백: ALTER COLUMN edition_id DROP NOT NULL 후 add_meta_card_editions.sql 의 NULLS NOT DISTINCT 제약으로 재정의.
--       '기본' 에디션으로 옮긴 카드는 그대로 두어도 무방.

-- [적용] 2026-09-20 Supabase MCP로 반영
