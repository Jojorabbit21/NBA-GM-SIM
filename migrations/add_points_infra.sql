-- ============================================================
-- 인게임 포인트(재화) 인프라 — 지갑 / 원장 / 상점 카탈로그 / 보유 아이템 + RPC
--
-- 계획: docs/plan/points-system-plan.md
-- 범위: 인프라만. 획득 규칙(일일 정산·시즌 마일스톤·도전 과제)과 상점 상품 목록은 후속 작업.
--
-- 구조:
--   user_wallets  잔액 캐시(계정당 1행). 원장과 항상 같은 트랜잭션에서만 갱신된다.
--   point_ledger  append-only 원장. idempotency_key UNIQUE 로 중복 지급을 막는다.
--   shop_items    카탈로그(읽기전용). rarity 는 카드 수집 전환 때도 쓰는 공용 어휘.
--   user_items    보유 아이템. 코스메틱은 quantity 1 고정, stackable 상품만 증가.
--
-- 권한:
--   - 테이블은 SELECT 만 열어 둔다(본인 행 / 카탈로그). 직접 INSERT·UPDATE·DELETE 권한 없음.
--   - grant_points  : service_role 전용(서버 코드가 호출). authenticated·anon 실행 권한 회수.
--   - purchase_item : 본인(assert_caller_is) 또는 전역 어드민.
--   - admin_grant_points : 전역 어드민 전용(테스트·보정용).
-- 롤백: 파일 하단 "ROLLBACK" 주석 참고.
-- ============================================================

-- ── 테이블 ───────────────────────────────────────────────────

create table public.user_wallets (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  balance         integer not null default 0 check (balance >= 0),
  lifetime_earned integer not null default 0 check (lifetime_earned >= 0),
  updated_at      timestamptz not null default now()
);

create table public.point_ledger (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  delta           integer not null check (delta <> 0),
  balance_after   integer not null check (balance_after >= 0),
  -- 'season_daily' | 'season_milestone' | 'achievement' | 'admin' | 'purchase' | 'refund' (CHECK 로 못박지 않음: 새 출처 추가 시 DDL 불필요)
  source          text not null,
  ref_type        text,
  ref_id          text,
  idempotency_key text not null unique,
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index point_ledger_user_idx on public.point_ledger (user_id, id desc);

create table public.shop_items (
  id         text primary key,
  item_type  text not null,
  name       text not null,
  price      integer not null check (price >= 0),
  rarity     text not null check (rarity in ('common', 'rare', 'unique', 'epic')),
  stackable  boolean not null default false,
  data       jsonb not null default '{}'::jsonb,
  is_active  boolean not null default true,
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.user_items (
  user_id     uuid not null references auth.users(id) on delete cascade,
  item_id     text not null references public.shop_items(id),
  quantity    integer not null default 1 check (quantity > 0),
  source      text not null default 'purchase',
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- ── RLS: SELECT 만 ───────────────────────────────────────────

alter table public.user_wallets enable row level security;
alter table public.point_ledger enable row level security;
alter table public.shop_items   enable row level security;
alter table public.user_items   enable row level security;

revoke all on table public.user_wallets, public.point_ledger, public.shop_items, public.user_items from anon, authenticated;
grant select on table public.user_wallets, public.point_ledger, public.shop_items, public.user_items to authenticated;

create policy uw_select on public.user_wallets
  for select to authenticated
  using (user_id = auth.uid() or public.is_global_admin());

create policy pl_select on public.point_ledger
  for select to authenticated
  using (user_id = auth.uid() or public.is_global_admin());

create policy si_select on public.shop_items
  for select to authenticated
  using (is_active or public.is_global_admin());

create policy ui_select on public.user_items
  for select to authenticated
  using (user_id = auth.uid() or public.is_global_admin());

-- ── grant_points: 지급·차감 단일 경로 ────────────────────────
-- p_amount > 0 지급, < 0 차감(잔액 부족이면 'insufficient_points').
-- 같은 idempotency_key 는 두 번 반영되지 않는다 → { granted:false, balance }.
-- 같은 유저의 호출은 지갑 행 잠금으로 직렬화된다.

create or replace function public.grant_points(
  p_user_id         uuid,
  p_amount          integer,
  p_source          text,
  p_idempotency_key text,
  p_ref_type        text  default null,
  p_ref_id          text  default null,
  p_meta            jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bal    integer;
  v_ledger bigint;
begin
  if p_user_id is null then raise exception 'invalid_user'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'invalid_amount'; end if;
  if p_source is null or length(btrim(p_source)) = 0 then raise exception 'source_required'; end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) = 0 then raise exception 'idempotency_key_required'; end if;

  insert into user_wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select balance into v_bal from user_wallets where user_id = p_user_id for update;

  if exists (select 1 from point_ledger where idempotency_key = p_idempotency_key) then
    return jsonb_build_object('granted', false, 'balance', v_bal);
  end if;

  if v_bal + p_amount < 0 then raise exception 'insufficient_points'; end if;
  v_bal := v_bal + p_amount;

  insert into point_ledger (user_id, delta, balance_after, source, ref_type, ref_id, idempotency_key, meta)
  values (p_user_id, p_amount, v_bal, p_source, p_ref_type, p_ref_id, p_idempotency_key, coalesce(p_meta, '{}'::jsonb))
  returning id into v_ledger;

  update user_wallets
     set balance = v_bal,
         lifetime_earned = lifetime_earned + greatest(p_amount, 0),
         updated_at = now()
   where user_id = p_user_id;

  return jsonb_build_object('granted', true, 'balance', v_bal, 'ledger_id', v_ledger);
end;
$$;

revoke execute on function public.grant_points(uuid, integer, text, text, text, text, jsonb) from public, anon, authenticated;
grant  execute on function public.grant_points(uuid, integer, text, text, text, text, jsonb) to service_role;

-- ── purchase_item ─────────────────────────────────────────────
-- 오류 코드(메시지): item_not_found / already_owned / insufficient_points / forbidden(42501)

create or replace function public.purchase_item(p_user_id uuid, p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item shop_items%rowtype;
  v_res  jsonb;
  v_bal  integer;
  v_key  text;
begin
  perform public.assert_caller_is(p_user_id);

  select * into v_item from shop_items where id = p_item_id and is_active;
  if not found then raise exception 'item_not_found'; end if;

  if not v_item.stackable and exists (select 1 from user_items where user_id = p_user_id and item_id = p_item_id) then
    raise exception 'already_owned';
  end if;

  if v_item.price > 0 then
    -- 단일 상품은 키가 (유저, 아이템)으로 고정 → 동시 더블클릭이 와도 두 번째는 granted=false 로 걸러진다.
    v_key := case when v_item.stackable
                  then 'purchase:' || p_user_id || ':' || p_item_id || ':' || gen_random_uuid()
                  else 'purchase:' || p_user_id || ':' || p_item_id end;
    v_res := public.grant_points(
      p_user_id, -v_item.price, 'purchase', v_key, 'item', p_item_id,
      jsonb_build_object('item_name', v_item.name, 'price', v_item.price)
    );
    if not (v_res->>'granted')::boolean then raise exception 'already_owned'; end if;
    v_bal := (v_res->>'balance')::integer;
  else
    select coalesce(balance, 0) into v_bal from user_wallets where user_id = p_user_id;
    v_bal := coalesce(v_bal, 0);
  end if;

  insert into user_items (user_id, item_id, quantity, source)
  values (p_user_id, p_item_id, 1, 'purchase')
  on conflict (user_id, item_id) do update
     set quantity = user_items.quantity + case when v_item.stackable then 1 else 0 end;

  return jsonb_build_object('item_id', p_item_id, 'balance', v_bal);
end;
$$;

revoke execute on function public.purchase_item(uuid, text) from public, anon;
grant  execute on function public.purchase_item(uuid, text) to authenticated, service_role;

-- ── admin_grant_points: 전역 어드민 전용(테스트·보정) ─────────

create or replace function public.admin_grant_points(p_user_id uuid, p_amount integer, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_global_admin(), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.grant_points(
    p_user_id, p_amount, 'admin', 'admin:' || gen_random_uuid(), 'admin', null,
    jsonb_build_object('note', p_note, 'by', auth.uid())
  );
end;
$$;

revoke execute on function public.admin_grant_points(uuid, integer, text) from public, anon;
grant  execute on function public.admin_grant_points(uuid, integer, text) to authenticated;

-- ============================================================
-- ROLLBACK (데이터가 쌓이기 전에만 안전 — 원장은 삭제하면 복구 불가)
--   drop function if exists public.admin_grant_points(uuid, integer, text);
--   drop function if exists public.purchase_item(uuid, text);
--   drop function if exists public.grant_points(uuid, integer, text, text, text, text, jsonb);
--   drop table if exists public.user_items, public.shop_items, public.point_ledger, public.user_wallets;
-- ============================================================
