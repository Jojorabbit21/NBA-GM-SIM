-- add_court_paint_colors.sql — 페인트 색 10종 → 26종 (2026-11-18)
-- 새 16색 추가 + 전체를 색상환 순서(빨강 → 주황·노랑 → 초록 → 파랑 → 보라 → 갈색 → 무채색)로 다시 정렬.
-- 기존 10색의 id·색·가격은 그대로, sort 만 바뀐다. 운영 적용 완료(2026-11-18).
-- 롤백: 새 16색을 아무도 사지 않았다면 delete, 샀다면 is_active = false 로.

insert into public.shop_items (id, item_type, name, price, rarity, stackable, data, is_active, sort) values
  ('paint_red', 'court_paint', '레드 페인트', 30, 'common', true, '{"color":"#C8102E"}', true, 201),
  ('paint_crimson', 'court_paint', '크림슨 페인트', 30, 'common', true, '{"color":"#9B1B30"}', true, 202),
  ('paint_burgundy', 'court_paint', '버건디 페인트', 30, 'common', true, '{"color":"#6D1A2B"}', true, 203),
  ('paint_coral', 'court_paint', '코랄 페인트', 30, 'common', true, '{"color":"#F26B5B"}', true, 204),
  ('paint_pink', 'court_paint', '핑크 페인트', 30, 'common', true, '{"color":"#E85D9A"}', true, 205),
  ('paint_orange', 'court_paint', '오렌지 페인트', 30, 'common', true, '{"color":"#E8702A"}', true, 206),
  ('paint_gold', 'court_paint', '골드 페인트', 30, 'common', true, '{"color":"#C9A227"}', true, 207),
  ('paint_yellow', 'court_paint', '옐로 페인트', 30, 'common', true, '{"color":"#F2B82E"}', true, 208),
  ('paint_lime', 'court_paint', '라임 페인트', 30, 'common', true, '{"color":"#8CC63F"}', true, 209),
  ('paint_green', 'court_paint', '그린 페인트', 30, 'common', true, '{"color":"#1E7B45"}', true, 210),
  ('paint_forest', 'court_paint', '포레스트 페인트', 30, 'common', true, '{"color":"#14532D"}', true, 211),
  ('paint_mint', 'court_paint', '민트 페인트', 30, 'common', true, '{"color":"#7FD6B5"}', true, 212),
  ('paint_teal', 'court_paint', '틸 페인트', 30, 'common', true, '{"color":"#128C8C"}', true, 213),
  ('paint_sky', 'court_paint', '스카이 페인트', 30, 'common', true, '{"color":"#5BB7E8"}', true, 214),
  ('paint_blue', 'court_paint', '블루 페인트', 30, 'common', true, '{"color":"#1F5FBF"}', true, 215),
  ('paint_royal', 'court_paint', '로열 블루 페인트', 30, 'common', true, '{"color":"#2443C8"}', true, 216),
  ('paint_navy', 'court_paint', '네이비 페인트', 30, 'common', true, '{"color":"#14254A"}', true, 217),
  ('paint_lavender', 'court_paint', '라벤더 페인트', 30, 'common', true, '{"color":"#A58BD6"}', true, 218),
  ('paint_purple', 'court_paint', '퍼플 페인트', 30, 'common', true, '{"color":"#5B2D8E"}', true, 219),
  ('paint_brown', 'court_paint', '브라운 페인트', 30, 'common', true, '{"color":"#6B4226"}', true, 220),
  ('paint_tan', 'court_paint', '탠 페인트', 30, 'common', true, '{"color":"#C8A27A"}', true, 221),
  ('paint_white', 'court_paint', '화이트 페인트', 30, 'common', true, '{"color":"#F2F0EA"}', true, 222),
  ('paint_silver', 'court_paint', '실버 페인트', 30, 'common', true, '{"color":"#C4C9CF"}', true, 223),
  ('paint_gray', 'court_paint', '그레이 페인트', 30, 'common', true, '{"color":"#8A9099"}', true, 224),
  ('paint_charcoal', 'court_paint', '차콜 페인트', 30, 'common', true, '{"color":"#3A3F47"}', true, 225),
  ('paint_black', 'court_paint', '블랙 페인트', 30, 'common', true, '{"color":"#17181C"}', true, 226)
on conflict (id) do update set sort = excluded.sort;
