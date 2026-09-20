-- 카드별 커스텀 배경 이미지 — 사용자 요청 "카드별로 배경 이미지를 커스텀할 수 있나? 커스텀 배경
-- 이미지가 없으면 콜렉션의 기본 배경 적용"
-- 카드는 이미지 커스텀만 허용(단색/그라디언트는 컬렉션 몫). 해석 순서는 클라이언트
-- utils/cardBackground.ts: 카드 이미지 → 컬렉션 배경(bg_*) → 팀 그라디언트.
-- 이미지는 기존 'card-backgrounds' 버킷의 cards/{cardId}/{timestamp}.webp 경로에 올린다
-- (버킷 정책은 add_card_collection_background.sql에서 이미 공개 읽기/어드민 쓰기).
ALTER TABLE public.meta_player_cards
    ADD COLUMN IF NOT EXISTS bg_image_url text NULL;

-- 롤백: ALTER TABLE public.meta_player_cards DROP COLUMN bg_image_url; (스토리지 객체는 별도 정리)

-- [적용] 2026-09-20 Supabase MCP로 반영
