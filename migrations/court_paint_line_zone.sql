-- court_paint_line_zone.sql — 페인트로 라인도 칠하기 (2026-11-18)
-- 구역 'line' 추가, 필요 개수 2개. paint_court_zone 베이스 = 라이브 정의(2026-11-18), 바뀐 곳은 v_cost 한 줄뿐(적용 후 대조 확인).
-- 운영 적용 완료(2026-11-18). 클라이언트 값: services/points/courtLoadout.ts PAINT_ZONES.
-- 롤백(클라이언트 먼저): delete from public.user_court_paint where zone = 'line'; 제약과 v_cost 를 3구역으로 되돌린다.

alter table public.user_court_paint drop constraint user_court_paint_zone_check;
alter table public.user_court_paint add constraint user_court_paint_zone_check check (zone in ('outside', 'inside', 'paint', 'line'));

create or replace function public.paint_court_zone(p_user_id uuid, p_floor_id text, p_zone text, p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cost integer := case p_zone when 'outside' then 10 when 'inside' then 6 when 'paint' then 3 when 'line' then 2 end;
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
notify pgrst, 'reload schema';
