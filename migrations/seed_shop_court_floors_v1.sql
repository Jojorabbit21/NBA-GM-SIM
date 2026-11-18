-- ============================================================
-- seed_shop_court_floors_v1.sql — 상점 '플로어' 카테고리 1차 (2026-11-18, 가격 사용자 지정)
--
-- item_type = 'court_floor' (장착 칸 court_floor, migrations/add_court_loadout.sql).
-- data = CourtFloorData (services/points/pointsService.ts):
--   material 'wood' | 'urethane' | 'concrete', image(바닥 이미지, 없으면 단색), background(이미지가 뜨기 전 바탕·단색 바닥),
--   line, three?, paint?, wear?(낡은 자국 겹)
-- 이미지: public/images/court/*-v1.webp (1880×1000, vercel.json 1년 캐시 — 바꾸면 파일명 버전 올림)
-- 등급: 250 = 커먼, 450~600 = 레어 (기존 가격대 커먼 200~300 · 레어 500~800 기준, 450은 레어로 둠)
--
-- [적용 순서] 1) 이 파일로 비활성(is_active=false) 상태로 넣는다 — 플로어를 모르는 구버전 상점 화면에 안 보이게.
--            2) 플로어를 그리는 클라이언트 배포 뒤 하단 "ACTIVATE" 문장으로 판매 시작.
-- ============================================================

insert into public.shop_items (id, item_type, name, price, rarity, stackable, data, is_active, sort) values
  ('floor_wood_maple',   'court_floor', '하드 메이플', 250, 'common', false,
   '{"material":"wood","image":"/images/court/maple-strip-v1.webp","background":"#DDBA95","line":"#3E2C1C"}', false, 10),
  ('floor_wood_oak',     'court_floor', '골든 오크',   450, 'rare',   false,
   '{"material":"wood","image":"/images/court/wood-oak-strip-v1.webp","background":"#CDA064","line":"#38230F"}', false, 20),
  ('floor_wood_cherry',  'court_floor', '체리',        450, 'rare',   false,
   '{"material":"wood","image":"/images/court/wood-cherry-strip-v1.webp","background":"#AB613E","line":"#F6E9D8"}', false, 30),
  ('floor_wood_walnut',  'court_floor', '월넛',        450, 'rare',   false,
   '{"material":"wood","image":"/images/court/wood-walnut-strip-v1.webp","background":"#6C4C36","line":"#EFE2CC"}', false, 40),
  ('floor_wood_ash',     'court_floor', '애쉬',        600, 'rare',   false,
   '{"material":"wood","image":"/images/court/wood-ash-strip-v1.webp","background":"#BCB6AC","line":"#2A2928"}', false, 50),
  ('floor_urethane',     'court_floor', '우레탄 기본', 500, 'rare',   false,
   '{"material":"urethane","background":"#3C7C4E","three":"#3C7C4E","paint":"#9C4A3B","line":"#F2F1EA"}', false, 60),
  ('floor_urethane_old', 'court_floor', '우레탄 올드', 550, 'rare',   false,
   '{"material":"urethane","background":"#3C7C4E","three":"#3C7C4E","paint":"#9C4A3B","line":"#F2F1EA","wear":true}', false, 70),
  ('floor_concrete',     'court_floor', '콘크리트',    600, 'rare',   false,
   '{"material":"concrete","image":"/images/court/concrete-soft-v1.webp","background":"#939393","line":"#F5F5F1"}', false, 80);

-- ACTIVATE (클라이언트 배포 뒤 실행)
--   update public.shop_items set is_active = true where item_type = 'court_floor';

-- ROLLBACK (아무도 사지 않았을 때만 — user_items FK)
--   delete from public.user_court_loadout where item_id like 'floor\_%';
--   delete from public.shop_items where item_type = 'court_floor';
