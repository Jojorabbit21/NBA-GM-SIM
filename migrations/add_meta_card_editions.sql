-- ============================================================================
-- 시즌 카드 에디션 — 같은 선수·같은 시즌 카드를 여러 장 만들 수 있게(에디션별 1장)
-- 사용자 요청 (2026-09-20): "동일한 시즌에 같은 카드를 2개 이상 만들 수 있는 방법은 없을까?" →
-- "카드 에디션은 내가 직접 생성한 에디션만을 선택할 수 있게" → 어드민이 만든 에디션 목록에서만 선택.
--
-- - meta_card_editions: 어드민 관리 목록(이름 유일, 정렬 순서). RLS는 카드/컬렉션과 동일(공개 읽기, 어드민 쓰기).
-- - meta_player_cards.edition_id: NULL = 기본 카드. FK ON DELETE RESTRICT — 카드가 쓰는 에디션은 삭제 불가.
-- - 고유 제약 (source_player_id, season) → (source_player_id, season, edition_id) NULLS NOT DISTINCT
--   (기본 카드도 선수·시즌당 1장만). 기존 504장은 edition_id NULL 그대로.
-- 시즌 문자열은 건드리지 않으므로 career_history 시즌 기록 매칭·드래프트 중복 방지(실제 선수 기준)는 그대로.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.meta_card_editions (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text        NOT NULL UNIQUE,
    sort_order  integer     NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_card_editions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.meta_card_editions;
CREATE POLICY "Enable read access for all users" ON public.meta_card_editions FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_insert_meta_card_editions" ON public.meta_card_editions;
CREATE POLICY "admin_insert_meta_card_editions" ON public.meta_card_editions
    FOR INSERT WITH CHECK (auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid);
DROP POLICY IF EXISTS "admin_update_meta_card_editions" ON public.meta_card_editions;
CREATE POLICY "admin_update_meta_card_editions" ON public.meta_card_editions
    FOR UPDATE USING (auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid)
    WITH CHECK (auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid);
DROP POLICY IF EXISTS "admin_delete_meta_card_editions" ON public.meta_card_editions;
CREATE POLICY "admin_delete_meta_card_editions" ON public.meta_card_editions
    FOR DELETE USING (auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid);

ALTER TABLE public.meta_player_cards
    ADD COLUMN IF NOT EXISTS edition_id uuid NULL REFERENCES public.meta_card_editions(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_meta_player_cards_edition ON public.meta_player_cards(edition_id);

ALTER TABLE public.meta_player_cards DROP CONSTRAINT IF EXISTS meta_player_cards_source_player_id_season_key;
ALTER TABLE public.meta_player_cards DROP CONSTRAINT IF EXISTS meta_player_cards_source_season_edition_key;
ALTER TABLE public.meta_player_cards
    ADD CONSTRAINT meta_player_cards_source_season_edition_key
    UNIQUE NULLS NOT DISTINCT (source_player_id, season, edition_id);

-- 롤백: 제약을 (source_player_id, season)으로 되돌리기 전에 에디션 카드(edition_id NOT NULL)를 정리해야 한다.
--   ALTER TABLE meta_player_cards DROP CONSTRAINT meta_player_cards_source_season_edition_key;
--   ALTER TABLE meta_player_cards ADD CONSTRAINT meta_player_cards_source_player_id_season_key UNIQUE (source_player_id, season);
--   ALTER TABLE meta_player_cards DROP COLUMN edition_id;  DROP TABLE meta_card_editions;

-- [적용] 2026-09-20 Supabase MCP로 반영
