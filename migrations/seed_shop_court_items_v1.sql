-- ============================================================
-- 상점 1차 카탈로그 — 코트 디자인만 (2026-11-09 결정: 코스메틱 전용, 코트 범위, 가격대 커먼 200~300 / 레어 500~800, 시즌 한정 미출시)
--
-- shop_items.data 스키마 (services/points/pointsService.ts):
--   court_palette: { background, three, paint, line }   — CourtPreview 4색
--   court_rim:     { rim, backboard }                    — 림·백보드 색
-- 장착(league_teams.court_loadout)과 소유 검증은 후속. 이 파일은 데이터만.
-- 재실행 안전: on conflict (id) do update.
-- ============================================================

insert into public.shop_items (id, item_type, name, price, rarity, stackable, data, is_active, sort) values
  -- 커먼 팔레트 250
  ('palette_classic_wood', 'court_palette', '클래식 우드', 250, 'common', false,
   '{"background":"#D9B98C","three":"#CFAD7C","paint":"#B8925F","line":"#3B2A1A"}', true, 10),
  ('palette_dark_ash',     'court_palette', '다크 애쉬',   250, 'common', false,
   '{"background":"#2B2F36","three":"#353A42","paint":"#1F2228","line":"#D7DBE0"}', true, 20),
  ('palette_ivory',        'court_palette', '아이보리',    250, 'common', false,
   '{"background":"#F1EBDD","three":"#E8E0CE","paint":"#DCD2BC","line":"#5B4636"}', true, 30),
  ('palette_navy',         'court_palette', '네이비',      250, 'common', false,
   '{"background":"#1E2A44","three":"#24345A","paint":"#16203A","line":"#E6EAF2"}', true, 40),
  -- 레어 팔레트 600
  ('palette_pastel',       'court_palette', '파스텔',      600, 'rare', false,
   '{"background":"#F6E7E4","three":"#EED9D5","paint":"#CFE3F0","line":"#5C6B7A"}', true, 50),
  ('palette_black_gold',   'court_palette', '블랙 & 골드', 600, 'rare', false,
   '{"background":"#121212","three":"#1B1B1B","paint":"#2A2210","line":"#D4AF37"}', true, 60),
  ('palette_forest',       'court_palette', '포레스트',    600, 'rare', false,
   '{"background":"#1F3D2B","three":"#27503A","paint":"#163023","line":"#E3EBD9"}', true, 70),
  -- 커먼 림 세트 200
  ('rim_gold',             'court_rim',     '골드 림',     200, 'common', false,
   '{"rim":"#D4AF37","backboard":"#333333"}', true, 10),
  ('rim_white_glass',      'court_rim',     '화이트 백보드', 200, 'common', false,
   '{"rim":"#E65100","backboard":"#F8FAFC"}', true, 20)
on conflict (id) do update set
  item_type = excluded.item_type, name = excluded.name, price = excluded.price, rarity = excluded.rarity,
  stackable = excluded.stackable, data = excluded.data, is_active = excluded.is_active, sort = excluded.sort;
