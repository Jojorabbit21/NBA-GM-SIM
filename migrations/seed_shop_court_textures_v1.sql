-- ============================================================
-- 상점 — 코트 바닥 질감 4종 (2026-11-09). 유니크 1,500~2,000 (가격대 결정 범위 안)
-- data.texture ∈ 'plank' | 'herringbone' | 'parquet' | 'gloss' (types/points.ts CourtTexture) — 렌더링 components/multi/CourtPreview.tsx
-- 재실행 안전: on conflict (id) do update.
-- ============================================================

insert into public.shop_items (id, item_type, name, price, rarity, stackable, data, is_active, sort) values
  ('texture_plank',       'court_texture', '우드 플랭크', 1500, 'unique', false, '{"texture":"plank"}',       true, 10),
  ('texture_herringbone', 'court_texture', '헤링본',      1800, 'unique', false, '{"texture":"herringbone"}', true, 20),
  ('texture_parquet',     'court_texture', '파케이',      1800, 'unique', false, '{"texture":"parquet"}',     true, 30),
  ('texture_gloss',       'court_texture', '하이글로스',  2000, 'unique', false, '{"texture":"gloss"}',       true, 40)
on conflict (id) do update set
  item_type = excluded.item_type, name = excluded.name, price = excluded.price, rarity = excluded.rarity,
  stackable = excluded.stackable, data = excluded.data, is_active = excluded.is_active, sort = excluded.sort;
