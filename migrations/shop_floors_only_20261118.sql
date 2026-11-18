-- ============================================================
-- shop_floors_only_20261118.sql — 상점을 플로어 8종만 남김 (2026-11-18, 사용자 지시 "현재 상점의 모든 아이템은 삭제하고 플로어 8종만")
--
-- 지우는 것: 팔레트 7종·림 2종(seed_shop_court_items_v1.sql), 바닥 질감 4종(seed_shop_court_textures_v1.sql).
-- 실행 시점 보유자 0명·장착 0건 확인(user_items·user_court_loadout FK). 구매는 클라이언트에서 잠긴 상태(PURCHASES_ENABLED=false).
-- 켜는 것: 플로어 8종(seed_shop_court_floors_v1.sql, 비활성으로 적재돼 있던 것).
-- 복구: 두 seed 파일을 다시 실행하면 지운 13종이 그대로 돌아온다.
-- ============================================================

delete from public.shop_items where item_type <> 'court_floor';
update public.shop_items set is_active = true where item_type = 'court_floor';
