-- 팀별 배경 이미지 효과 — 사용자 요청 (2026-09-21): "팀별 카드에 적용되는 이미지에 블러, 불투명도를 조절할 수 있는 옵션"
-- bg_image_blur: px(0~40, 기본 0), bg_image_opacity: %(0~100, 기본 100). 카드는 팀 이미지를 그라디언트 위의 별도 레이어로 그려 적용.
ALTER TABLE public.meta_card_team_colors
    ADD COLUMN IF NOT EXISTS bg_image_blur    integer NOT NULL DEFAULT 0   CHECK (bg_image_blur BETWEEN 0 AND 40),
    ADD COLUMN IF NOT EXISTS bg_image_opacity integer NOT NULL DEFAULT 100 CHECK (bg_image_opacity BETWEEN 0 AND 100);

-- [2026-09-21 후속] 블러는 저사양 기기 부담(카드 수만큼 GPU 레이어) 때문에 제거 — 사용자 결정. 불투명도만 유지.
ALTER TABLE public.meta_card_team_colors DROP COLUMN IF EXISTS bg_image_blur;

-- 롤백: ALTER TABLE public.meta_card_team_colors DROP COLUMN bg_image_opacity;

-- [적용] 2026-09-21 Supabase MCP로 반영
