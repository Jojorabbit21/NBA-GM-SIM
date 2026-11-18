-- add_court_paint.sql — 상점 "페인트"(색별 소모품) + 구역 칠하기 (2026-11-18)
--
-- 페인트: shop_items.item_type = 'court_paint', stackable, data = {"color":"#RRGGBB"}, 1개 30 BP.
-- 칠하기: 구역마다 필요한 개수만큼 그 색 페인트를 소모한다 — 3점 바깥(outside) 10 · 3점 안쪽(inside) 6 · 페인트존(paint) 3.
-- 칠한 결과는 플로어마다 따로 남는다: user_court_paint(user_id, floor_id, zone). floor_id 는 플로어 상품 id, 기본 코트는 'default'.
-- 지우기는 무료이고 페인트는 돌려주지 않는다.
-- purchase_item: 베이스 = 라이브 정의(2026-11-18). p_quantity(기본 1)만 얹었다 — 2인자 판은 drop(같은 이름 오버로드 충돌 방지,
--   기존 2인자 호출은 기본값으로 그대로 동작). 쌓이지 않는 상품은 1개만.
-- 운영 적용 완료(2026-11-18). 단, 상품은 판매 중지(is_active=false)로 넣어 두었다 — 배포돼 있던 옛 상점 화면이 모르는 종류도 탭으로
--   보여 주기 때문. 새 화면을 배포한 직후에 켠다:  update public.shop_items set is_active = true where item_type = 'court_paint';
--
-- 롤백(클라이언트를 먼저 되돌린 뒤):
--   drop function if exists public.paint_court_zone(uuid, text, text, text);
--   drop function if exists public.clear_court_zone(uuid, text, text);
--   drop table if exists public.user_court_paint;
--   delete from public.user_items where item_id like 'paint_%';
--   delete from public.shop_items where item_type = 'court_paint';
--   purchase_item 은 3인자 판을 그대로 둬도 무방(p_quantity 기본 1).

-- ── 1. 상품 ──
insert into public.shop_items (id, item_type, name, price, rarity, stackable, data, is_active, sort) values
  ('paint_red',    'court_paint', '레드 페인트',   30, 'common', true, '{"color":"#C8102E"}', false, 201),
  ('paint_orange', 'court_paint', '오렌지 페인트', 30, 'common', true, '{"color":"#E8702A"}', false, 202),
  ('paint_yellow', 'court_paint', '옐로 페인트',   30, 'common', true, '{"color":"#F2B82E"}', false, 203),
  ('paint_green',  'court_paint', '그린 페인트',   30, 'common', true, '{"color":"#1E7B45"}', false, 204),
  ('paint_teal',   'court_paint', '틸 페인트',     30, 'common', true, '{"color":"#128C8C"}', false, 205),
  ('paint_blue',   'court_paint', '블루 페인트',   30, 'common', true, '{"color":"#1F5FBF"}', false, 206),
  ('paint_navy',   'court_paint', '네이비 페인트', 30, 'common', true, '{"color":"#14254A"}', false, 207),
  ('paint_purple', 'court_paint', '퍼플 페인트',   30, 'common', true, '{"color":"#5B2D8E"}', false, 208),
  ('paint_black',  'court_paint', '블랙 페인트',   30, 'common', true, '{"color":"#17181C"}', false, 209),
  ('paint_white',  'court_paint', '화이트 페인트', 30, 'common', true, '{"color":"#F2F0EA"}', false, 210)
on conflict (id) do nothing;

-- ── 2. 칠 저장 ──
create table if not exists public.user_court_paint (
  user_id    uuid not null references auth.users(id) on delete cascade,
  floor_id   text not null,
  zone       text not null check (zone in ('outside', 'inside', 'paint')),
  item_id    text not null references public.shop_items(id),
  updated_at timestamptz not null default now(),
  primary key (user_id, floor_id, zone)
);
alter table public.user_court_paint enable row level security;
-- 코트는 그 팀과 경기하는 모두가 본다 → user_court_loadout 과 같은 공개 읽기. 쓰기는 RPC 만.
drop policy if exists ucp_select on public.user_court_paint;
create policy ucp_select on public.user_court_paint for select to authenticated using (true);
revoke all on public.user_court_paint from anon, authenticated;
grant select on public.user_court_paint to authenticated;

-- ── 3. 칠하기 / 지우기 ──
create or replace function public.paint_court_zone(p_user_id uuid, p_floor_id text, p_zone text, p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cost integer := case p_zone when 'outside' then 10 when 'inside' then 6 when 'paint' then 3 end;
  v_type text;
  v_left integer;
begin
  perform public.assert_caller_is(p_user_id);

  if v_cost is null then raise exception 'invalid_zone'; end if;

  select item_type into v_type from shop_items where id = p_item_id;
  if not found or v_type <> 'court_paint' then raise exception 'not_paint'; end if;

  if p_floor_id is distinct from 'default' then
    if not exists (
      select 1 from user_items ui join shop_items si on si.id = ui.item_id
       where ui.user_id = p_user_id and ui.item_id = p_floor_id and si.item_type = 'court_floor'
    ) then
      raise exception 'floor_not_owned';
    end if;
  end if;

  update user_items set quantity = quantity - v_cost
   where user_id = p_user_id and item_id = p_item_id and quantity >= v_cost
  returning quantity into v_left;
  if not found then raise exception 'insufficient_paint'; end if;
  if v_left = 0 then
    delete from user_items where user_id = p_user_id and item_id = p_item_id;
  end if;

  insert into user_court_paint (user_id, floor_id, zone, item_id, updated_at)
  values (p_user_id, p_floor_id, p_zone, p_item_id, now())
  on conflict (user_id, floor_id, zone) do update set item_id = excluded.item_id, updated_at = now();

  return jsonb_build_object('floor_id', p_floor_id, 'zone', p_zone, 'item_id', p_item_id, 'used', v_cost, 'left', v_left);
end;
$function$;

create or replace function public.clear_court_zone(p_user_id uuid, p_floor_id text, p_zone text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.assert_caller_is(p_user_id);
  delete from user_court_paint where user_id = p_user_id and floor_id = p_floor_id and zone = p_zone;
  return jsonb_build_object('floor_id', p_floor_id, 'zone', p_zone);
end;
$function$;

revoke all on function public.paint_court_zone(uuid, text, text, text) from public, anon;
revoke all on function public.clear_court_zone(uuid, text, text) from public, anon;
grant execute on function public.paint_court_zone(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.clear_court_zone(uuid, text, text) to authenticated, service_role;

-- ── 4. 여러 개 구매 ──
drop function if exists public.purchase_item(uuid, text);

create or replace function public.purchase_item(p_user_id uuid, p_item_id text, p_quantity integer default 1)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item shop_items%rowtype;
  v_res  jsonb;
  v_bal  integer;
  v_key  text;
  v_qty  integer := coalesce(p_quantity, 1);
begin
  perform public.assert_caller_is(p_user_id);

  select * into v_item from shop_items where id = p_item_id and is_active;
  if not found then raise exception 'item_not_found'; end if;

  if v_qty < 1 or v_qty > 99 or (not v_item.stackable and v_qty <> 1) then
    raise exception 'invalid_quantity';
  end if;

  if not v_item.stackable and exists (select 1 from user_items where user_id = p_user_id and item_id = p_item_id) then
    raise exception 'already_owned';
  end if;

  if v_item.price > 0 then
    v_key := case when v_item.stackable
                  then 'purchase:' || p_user_id || ':' || p_item_id || ':' || gen_random_uuid()
                  else 'purchase:' || p_user_id || ':' || p_item_id end;
    v_res := public.grant_points(
      p_user_id, -v_item.price * v_qty, 'purchase', v_key, 'item', p_item_id,
      jsonb_build_object('item_name', v_item.name, 'price', v_item.price, 'quantity', v_qty)
    );
    if not (v_res->>'granted')::boolean then raise exception 'already_owned'; end if;
    v_bal := (v_res->>'balance')::integer;
  else
    select coalesce(balance, 0) into v_bal from user_wallets where user_id = p_user_id;
    v_bal := coalesce(v_bal, 0);
  end if;

  insert into user_items (user_id, item_id, quantity, source)
  values (p_user_id, p_item_id, v_qty, 'purchase')
  on conflict (user_id, item_id) do update
     set quantity = user_items.quantity + case when v_item.stackable then v_qty else 0 end;

  return jsonb_build_object('item_id', p_item_id, 'balance', v_bal);
end;
$function$;

revoke all on function public.purchase_item(uuid, text, integer) from public, anon;
grant execute on function public.purchase_item(uuid, text, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
