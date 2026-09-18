-- ============================================================================
-- 카드 컬렉션 — 어드민이 meta_player_cards를 묶어서 관리하기 위한 그룹.
-- 사용자 요청: "카드 컬렉션을 생성하고, 이미 생성된 카드를 컬렉션에 넣거나 제거할 수 있어야."
--
-- 카드 1장이 여러 컬렉션에 동시에 속할 수 있게 M:N으로 설계(예: "2000년대 레전드"와
-- "시카고 불스 특집"에 조던 2000-01 카드가 동시에 들어갈 수 있어야 함). meta_player_cards/
-- meta_players는 건드리지 않는다 — 순수하게 컬렉션과 그 멤버십만 담는 신규 테이블 2개.
--
-- 이번 마이그레이션은 콘텐츠 조직 도구까지만 — 개인 팩 드래프트가 실제로 "이 컬렉션을
-- 라운드 풀로 쓴다" 같은 소비 로직은 아직 배선하지 않는다(카드 자체의 드래프트 소비 배선과
-- 마찬가지로 별도 후속 작업).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.meta_player_card_collections (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text        NOT NULL UNIQUE,
    description text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meta_player_card_collection_members (
    collection_id uuid        NOT NULL REFERENCES public.meta_player_card_collections(id) ON DELETE CASCADE,
    card_id       uuid        NOT NULL REFERENCES public.meta_player_cards(id) ON DELETE CASCADE,
    added_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (collection_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_card_collection_members_card ON public.meta_player_card_collection_members(card_id);

ALTER TABLE public.meta_player_card_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_player_card_collection_members ENABLE ROW LEVEL SECURITY;

-- meta_players/meta_player_cards와 동일 패턴: 읽기 전체공개, 쓰기는 고정 어드민 계정만.
CREATE POLICY "Enable read access for all users" ON public.meta_player_card_collections
    FOR SELECT USING (true);
CREATE POLICY "admin_insert_card_collections" ON public.meta_player_card_collections
    FOR INSERT WITH CHECK (auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid);
CREATE POLICY "admin_update_card_collections" ON public.meta_player_card_collections
    FOR UPDATE
    USING (auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid)
    WITH CHECK (auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid);
CREATE POLICY "admin_delete_card_collections" ON public.meta_player_card_collections
    FOR DELETE USING (auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid);

CREATE POLICY "Enable read access for all users" ON public.meta_player_card_collection_members
    FOR SELECT USING (true);
CREATE POLICY "admin_insert_card_collection_members" ON public.meta_player_card_collection_members
    FOR INSERT WITH CHECK (auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid);
CREATE POLICY "admin_delete_card_collection_members" ON public.meta_player_card_collection_members
    FOR DELETE USING (auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid);

-- [적용] 2026-09-18 Supabase MCP로 반영
