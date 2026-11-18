-- add_wood_floor_layouts.sql — 우드 플로어 배열 6종 × 수종 5종 = 30종 (2026-11-18)
-- 기존 5종(스트립)에 헤링본·파케이·쉐브론·와이드 플랭크·빈티지 플랭크 25종 추가. 이미지: public/images/court/wood-{수종}-{배열}-v1.webp(1880×1000).
-- 가격 = 수종 값(메이플 250 · 오크·체리·월넛 450 · 애쉬 600) + 배열 값(스트립 0 · 파케이·와이드 +100 · 헤링본·쉐브론 +150 · 빈티지 +200).
-- 기존 스트립 5종: 이름에 " 스트립"을 붙이고 data.layout = 'strip', sort 재배열(id·가격·이미지는 그대로 → 보유·장착 유지).
-- data.background = 그 이미지의 평균색(이미지가 뜨기 전 바탕색 + 칠 위 결 블렌드의 기준 밝기).
-- 새 25종은 판매 중지로 넣는다. 이미지가 배포된 뒤 켠다:  update public.shop_items set is_active = true where item_type = 'court_floor' and not is_active;
-- 운영 적용 완료(2026-11-18).
-- 롤백: 새 25종을 산 사람이 없으면 delete, 있으면 is_active = false. 스트립 이름은 update 로 되돌린다.

update public.shop_items set name = '하드 메이플 스트립', sort = 1, data = data || '{"layout":"strip"}'::jsonb where id = 'floor_wood_maple';
update public.shop_items set name = '골든 오크 스트립', sort = 2, data = data || '{"layout":"strip"}'::jsonb where id = 'floor_wood_oak';
update public.shop_items set name = '체리 스트립', sort = 3, data = data || '{"layout":"strip"}'::jsonb where id = 'floor_wood_cherry';
update public.shop_items set name = '월넛 스트립', sort = 4, data = data || '{"layout":"strip"}'::jsonb where id = 'floor_wood_walnut';
update public.shop_items set name = '애쉬 스트립', sort = 5, data = data || '{"layout":"strip"}'::jsonb where id = 'floor_wood_ash';

insert into public.shop_items (id, item_type, name, price, rarity, stackable, data, is_active, sort) values
  ('floor_wood_maple_herringbone', 'court_floor', '하드 메이플 헤링본', 400, 'rare', false, '{"line": "#3E2C1C", "image": "/images/court/wood-maple-herringbone-v1.webp", "material": "wood", "layout": "herringbone", "background": "#DCB994"}', false, 11),
  ('floor_wood_oak_herringbone', 'court_floor', '골든 오크 헤링본', 600, 'rare', false, '{"line": "#38230F", "image": "/images/court/wood-oak-herringbone-v1.webp", "material": "wood", "layout": "herringbone", "background": "#C89B60"}', false, 12),
  ('floor_wood_cherry_herringbone', 'court_floor', '체리 헤링본', 600, 'rare', false, '{"line": "#F6E9D8", "image": "/images/court/wood-cherry-herringbone-v1.webp", "material": "wood", "layout": "herringbone", "background": "#A8603E"}', false, 13),
  ('floor_wood_walnut_herringbone', 'court_floor', '월넛 헤링본', 600, 'rare', false, '{"line": "#EFE2CC", "image": "/images/court/wood-walnut-herringbone-v1.webp", "material": "wood", "layout": "herringbone", "background": "#694B35"}', false, 14),
  ('floor_wood_ash_herringbone', 'court_floor', '애쉬 헤링본', 750, 'rare', false, '{"line": "#2A2928", "image": "/images/court/wood-ash-herringbone-v1.webp", "material": "wood", "layout": "herringbone", "background": "#B8B2A8"}', false, 15),
  ('floor_wood_maple_parquet', 'court_floor', '하드 메이플 파케이', 350, 'rare', false, '{"line": "#3E2C1C", "image": "/images/court/wood-maple-parquet-v1.webp", "material": "wood", "layout": "parquet", "background": "#DCB894"}', false, 21),
  ('floor_wood_oak_parquet', 'court_floor', '골든 오크 파케이', 550, 'rare', false, '{"line": "#38230F", "image": "/images/court/wood-oak-parquet-v1.webp", "material": "wood", "layout": "parquet", "background": "#C79A60"}', false, 22),
  ('floor_wood_cherry_parquet', 'court_floor', '체리 파케이', 550, 'rare', false, '{"line": "#F6E9D8", "image": "/images/court/wood-cherry-parquet-v1.webp", "material": "wood", "layout": "parquet", "background": "#A75F3D"}', false, 23),
  ('floor_wood_walnut_parquet', 'court_floor', '월넛 파케이', 550, 'rare', false, '{"line": "#EFE2CC", "image": "/images/court/wood-walnut-parquet-v1.webp", "material": "wood", "layout": "parquet", "background": "#684A34"}', false, 24),
  ('floor_wood_ash_parquet', 'court_floor', '애쉬 파케이', 700, 'rare', false, '{"line": "#2A2928", "image": "/images/court/wood-ash-parquet-v1.webp", "material": "wood", "layout": "parquet", "background": "#B7B1A7"}', false, 25),
  ('floor_wood_maple_chevron', 'court_floor', '하드 메이플 쉐브론', 400, 'rare', false, '{"line": "#3E2C1C", "image": "/images/court/wood-maple-chevron-v1.webp", "material": "wood", "layout": "chevron", "background": "#DCB995"}', false, 31),
  ('floor_wood_oak_chevron', 'court_floor', '골든 오크 쉐브론', 600, 'rare', false, '{"line": "#38230F", "image": "/images/court/wood-oak-chevron-v1.webp", "material": "wood", "layout": "chevron", "background": "#C89C61"}', false, 32),
  ('floor_wood_cherry_chevron', 'court_floor', '체리 쉐브론', 600, 'rare', false, '{"line": "#F6E9D8", "image": "/images/court/wood-cherry-chevron-v1.webp", "material": "wood", "layout": "chevron", "background": "#A9603E"}', false, 33),
  ('floor_wood_walnut_chevron', 'court_floor', '월넛 쉐브론', 600, 'rare', false, '{"line": "#EFE2CC", "image": "/images/court/wood-walnut-chevron-v1.webp", "material": "wood", "layout": "chevron", "background": "#694B35"}', false, 34),
  ('floor_wood_ash_chevron', 'court_floor', '애쉬 쉐브론', 750, 'rare', false, '{"line": "#2A2928", "image": "/images/court/wood-ash-chevron-v1.webp", "material": "wood", "layout": "chevron", "background": "#B8B2A8"}', false, 35),
  ('floor_wood_maple_wide', 'court_floor', '하드 메이플 와이드 플랭크', 350, 'rare', false, '{"line": "#3E2C1C", "image": "/images/court/wood-maple-wide-v1.webp", "material": "wood", "layout": "wide", "background": "#DCB894"}', false, 41),
  ('floor_wood_oak_wide', 'court_floor', '골든 오크 와이드 플랭크', 550, 'rare', false, '{"line": "#38230F", "image": "/images/court/wood-oak-wide-v1.webp", "material": "wood", "layout": "wide", "background": "#C89B60"}', false, 42),
  ('floor_wood_cherry_wide', 'court_floor', '체리 와이드 플랭크', 550, 'rare', false, '{"line": "#F6E9D8", "image": "/images/court/wood-cherry-wide-v1.webp", "material": "wood", "layout": "wide", "background": "#A9603E"}', false, 43),
  ('floor_wood_walnut_wide', 'court_floor', '월넛 와이드 플랭크', 550, 'rare', false, '{"line": "#EFE2CC", "image": "/images/court/wood-walnut-wide-v1.webp", "material": "wood", "layout": "wide", "background": "#694A35"}', false, 44),
  ('floor_wood_ash_wide', 'court_floor', '애쉬 와이드 플랭크', 700, 'rare', false, '{"line": "#2A2928", "image": "/images/court/wood-ash-wide-v1.webp", "material": "wood", "layout": "wide", "background": "#B8B2A8"}', false, 45),
  ('floor_wood_maple_aged', 'court_floor', '하드 메이플 빈티지 플랭크', 450, 'rare', false, '{"line": "#3E2C1C", "image": "/images/court/wood-maple-aged-v1.webp", "material": "wood", "layout": "aged", "background": "#CBA173"}', false, 51),
  ('floor_wood_oak_aged', 'court_floor', '골든 오크 빈티지 플랭크', 650, 'rare', false, '{"line": "#38230F", "image": "/images/court/wood-oak-aged-v1.webp", "material": "wood", "layout": "aged", "background": "#B8884D"}', false, 52),
  ('floor_wood_cherry_aged', 'court_floor', '체리 빈티지 플랭크', 650, 'rare', false, '{"line": "#F6E9D8", "image": "/images/court/wood-cherry-aged-v1.webp", "material": "wood", "layout": "aged", "background": "#9B5432"}', false, 53),
  ('floor_wood_walnut_aged', 'court_floor', '월넛 빈티지 플랭크', 650, 'rare', false, '{"line": "#EFE2CC", "image": "/images/court/wood-walnut-aged-v1.webp", "material": "wood", "layout": "aged", "background": "#60412A"}', false, 54),
  ('floor_wood_ash_aged', 'court_floor', '애쉬 빈티지 플랭크', 800, 'rare', false, '{"line": "#2A2928", "image": "/images/court/wood-ash-aged-v1.webp", "material": "wood", "layout": "aged", "background": "#A79881"}', false, 55)
on conflict (id) do nothing;
