-- ============================================================
-- add_court_loadout.sql — 인벤토리 장착 정보 (2026-11-18)
--
-- 코스메틱은 계정 귀속. 장착도 계정 단위로 한 번만 저장하고, 그 계정이 맡은 모든 팀의 코트에 적용된다.
-- 칸(slot) = shop_items.item_type. 한 칸에 아이템 하나. 행이 없으면 그 칸은 기본값
-- (바닥 = 하드 메이플 우드, 팔레트·질감 없음, 림 기본색 — 기본값 정의는 클라이언트 services/points/courtLoadout.ts).
--
--   user_court_loadout  (user_id, slot) → item_id
--   equip_court_item(p_user_id, p_slot, p_item_id)  본인 또는 전역 어드민. p_item_id null = 그 칸 해제(기본값으로)
--
-- 권한:
--   - 테이블은 SELECT 만, 로그인 유저 전체에 공개(다른 팀 홈 경기 코트를 그려야 하므로). 쓰기는 RPC 단일 경로.
--   - 장착은 보유(user_items) 확인 후에만. 칸과 아이템 종류가 다르면 거부.
-- 롤백: 파일 하단 "ROLLBACK" 주석 참고.
-- ============================================================

create table public.user_court_loadout (
  user_id    uuid not null references auth.users(id) on delete cascade,
  slot       text not null check (slot in ('court_floor', 'court_palette', 'court_texture', 'court_rim')),
  item_id    text not null references public.shop_items(id),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot)
);

alter table public.user_court_loadout enable row level security;
revoke all on table public.user_court_loadout from anon, authenticated;
grant select on table public.user_court_loadout to authenticated;

create policy ucl_select on public.user_court_loadout
  for select to authenticated
  using (true);

create or replace function public.equip_court_item(p_user_id uuid, p_slot text, p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_type text;
begin
  perform public.assert_caller_is(p_user_id);

  if p_slot not in ('court_floor', 'court_palette', 'court_texture', 'court_rim') then
    raise exception 'invalid_slot';
  end if;

  if p_item_id is null then
    delete from user_court_loadout where user_id = p_user_id and slot = p_slot;
    return jsonb_build_object('slot', p_slot, 'item_id', null);
  end if;

  select item_type into v_type from shop_items where id = p_item_id;
  if not found then raise exception 'item_not_found'; end if;
  if v_type <> p_slot then raise exception 'slot_mismatch'; end if;

  if not exists (select 1 from user_items where user_id = p_user_id and item_id = p_item_id) then
    raise exception 'not_owned';
  end if;

  insert into user_court_loadout (user_id, slot, item_id, updated_at)
  values (p_user_id, p_slot, p_item_id, now())
  on conflict (user_id, slot) do update set item_id = excluded.item_id, updated_at = now();

  return jsonb_build_object('slot', p_slot, 'item_id', p_item_id);
end;
$function$;

revoke all on function public.equip_court_item(uuid, text, text) from public, anon;
grant execute on function public.equip_court_item(uuid, text, text) to authenticated;

-- ROLLBACK
--   drop function if exists public.equip_court_item(uuid, text, text);
--   drop table if exists public.user_court_loadout;
