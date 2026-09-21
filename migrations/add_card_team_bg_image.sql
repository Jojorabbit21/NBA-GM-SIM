-- 팀별 카드 배경 이미지 — 사용자 요청 (2026-09-21): "팀별 컬러에서 팀별 배경이미지 지정도 가능하게 해줘"
-- meta_card_team_colors.bg_image_url: 있으면 팀 그라디언트 위에 cover로 깔린다(컬렉션 배경이 '팀 컬러'이거나 컬렉션이 없는 카드,
-- 그리고 컬렉션 이미지/단색 아래 폴백 층). 스토리지는 기존 'card-backgrounds' 버킷의 teams/{teamId}/{timestamp}.webp.
ALTER TABLE public.meta_card_team_colors
    ADD COLUMN IF NOT EXISTS bg_image_url text NULL;

-- 롤백: ALTER TABLE public.meta_card_team_colors DROP COLUMN bg_image_url;

-- [적용] 2026-09-21 Supabase MCP로 반영
