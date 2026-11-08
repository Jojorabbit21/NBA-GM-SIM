-- ============================================================
-- 포인트 어드민 운영 — 유저별 지급/회수(메모 필수) + 전체 지급/회수
--
-- 선행: migrations/add_points_infra.sql (grant_points / admin_grant_points)
-- 계획: docs/plan/points-system-plan.md
--
-- 변경:
--   admin_grant_points(p_user_id, p_amount, p_note)  — 재정의. p_note 빈 값이면 'note_required'.
--     원장 ref_type='admin', ref_id=배치 uuid, meta={note, by, requested}
--   admin_grant_points_all(p_amount, p_note)         — 신규. profiles 전원 대상.
--     회수(음수)는 잔액까지만 차감(잔액 0 이면 건너뜀). 같은 배치는 ref_id 로 묶인다.
--   둘 다 is_global_admin() 전용. grant_points 는 service_role 전용이라 SECURITY DEFINER 안에서만 닿는다.
-- 롤백: 파일 하단 참고.
-- ============================================================

create or replace function public.admin_grant_points(p_user_id uuid, p_amount integer, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch uuid := gen_random_uuid();
begin
  if not coalesce(public.is_global_admin(), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_note is null or length(btrim(p_note)) = 0 then raise exception 'note_required'; end if;
  return public.grant_points(
    p_user_id, p_amount, 'admin', 'admin:' || v_batch, 'admin', v_batch::text,
    jsonb_build_object('note', btrim(p_note), 'by', auth.uid(), 'requested', p_amount)
  );
end;
$$;

create or replace function public.admin_grant_points_all(p_amount integer, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch   uuid := gen_random_uuid();
  v_user    uuid;
  v_bal     integer;
  v_delta   integer;
  v_granted integer := 0;
  v_skipped integer := 0;
  v_total   integer := 0;
begin
  if not coalesce(public.is_global_admin(), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_amount is null or p_amount = 0 then raise exception 'invalid_amount'; end if;
  if p_note is null or length(btrim(p_note)) = 0 then raise exception 'note_required'; end if;

  for v_user in select id from profiles loop
    v_delta := p_amount;
    if p_amount < 0 then
      select coalesce(balance, 0) into v_bal from user_wallets where user_id = v_user;
      v_bal := coalesce(v_bal, 0);
      if v_bal = 0 then v_skipped := v_skipped + 1; continue; end if;
      v_delta := -least(v_bal, -p_amount);
    end if;
    perform public.grant_points(
      v_user, v_delta, 'admin', 'admin:' || v_batch || ':' || v_user, 'admin_all', v_batch::text,
      jsonb_build_object('note', btrim(p_note), 'by', auth.uid(), 'requested', p_amount)
    );
    v_granted := v_granted + 1;
    v_total := v_total + v_delta;
  end loop;

  return jsonb_build_object('batch_id', v_batch, 'granted', v_granted, 'skipped', v_skipped, 'total_delta', v_total);
end;
$$;

revoke execute on function public.admin_grant_points_all(integer, text) from public, anon;
grant  execute on function public.admin_grant_points_all(integer, text) to authenticated;

-- ============================================================
-- ROLLBACK
--   drop function if exists public.admin_grant_points_all(integer, text);
--   admin_grant_points 는 add_points_infra.sql 의 정의로 되돌린다(메모 선택).
-- ============================================================
