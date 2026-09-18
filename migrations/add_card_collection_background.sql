-- ============================================================================
-- 카드 컬렉션 배경 설정 + 배경 이미지 스토리지 버킷
-- 사용자 결정: 오일 슬릭 같은 복잡한 배경은 CSS 라이브 필터 대신 이미지를 만들어 WebP로 올리는
-- 방식으로 간다. 그래서 컬렉션 관리 화면에 "배경" 옵션이 필요 — 팀 컬러(기본) / 단색 /
-- 그라디언트(2색+각도) / 업로드 이미지 중 하나.
--
-- 배경은 카드가 아니라 "컬렉션" 단위다(같은 컬렉션의 카드는 같은 배경). 카드 1장이 여러
-- 컬렉션에 속할 수 있으므로(M:N), 실제 드래프트 화면에서 어느 컬렉션의 배경을 쓸지는 그
-- 팩/라운드가 어느 컬렉션에서 뽑혔는지(드래프트 소비 배선, 아직 미구현)에 따라 정해진다.
-- ============================================================================

ALTER TABLE public.meta_player_card_collections
    ADD COLUMN IF NOT EXISTS bg_type           text    NOT NULL DEFAULT 'team',
    ADD COLUMN IF NOT EXISTS bg_color          text,
    ADD COLUMN IF NOT EXISTS bg_gradient_from  text,
    ADD COLUMN IF NOT EXISTS bg_gradient_to    text,
    ADD COLUMN IF NOT EXISTS bg_gradient_angle integer NOT NULL DEFAULT 165,
    ADD COLUMN IF NOT EXISTS bg_image_url      text;

ALTER TABLE public.meta_player_card_collections
    DROP CONSTRAINT IF EXISTS meta_player_card_collections_bg_type_check;
ALTER TABLE public.meta_player_card_collections
    ADD CONSTRAINT meta_player_card_collections_bg_type_check
    CHECK (bg_type IN ('team', 'solid', 'gradient', 'image'));

-- 배경 이미지 버킷: 공개 읽기(카드는 모든 참가자가 봄), 쓰기는 고정 어드민 계정만.
-- 기존 'images' 버킷은 읽기 정책만 있고 코드에서 쓰는 곳이 없어 건드리지 않고 전용 버킷을 둔다.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('card-backgrounds', 'card-backgrounds', true, 5242880,
        ARRAY['image/webp', 'image/png', 'image/jpeg', 'image/avif'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "card_backgrounds_public_read" ON storage.objects
    FOR SELECT USING (bucket_id = 'card-backgrounds');
CREATE POLICY "card_backgrounds_admin_insert" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'card-backgrounds' AND auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid);
CREATE POLICY "card_backgrounds_admin_update" ON storage.objects
    FOR UPDATE USING (bucket_id = 'card-backgrounds' AND auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid)
    WITH CHECK (bucket_id = 'card-backgrounds' AND auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid);
CREATE POLICY "card_backgrounds_admin_delete" ON storage.objects
    FOR DELETE USING (bucket_id = 'card-backgrounds' AND auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid);

-- [적용] 2026-09-18 Supabase MCP로 반영
