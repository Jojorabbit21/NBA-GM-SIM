-- ============================================================
-- BP 도전 과제(계정당 1회) — user_achievements + unlock_achievement RPC + 시즌 이력 평가 표식
--
-- 계획: docs/plan/points-system-plan.md "도전 과제". 정의(이름·등급·보상): server/src/shared/points/achievements.ts
-- 서버: server/src/pointsAchievements.ts (시즌 종료·운영 스윕) + pointsSettlement/pointsAllStar 의 훅
--
--   user_achievements        달성 기록. PK(user_id, achievement_id) 가 멱등 앵커.
--   unlock_achievement(...)  행 insert 가 들어갔을 때만 grant_points(source 'achievement', key ach:{user}:{id}) — 한 트랜잭션. service_role 전용.
--   league_user_history.points_evaluated_at  시즌 종료형 과제(통산 승수·시즌 승수·우승 횟수 등) 평가 완료 표식.
--
-- 소급: 끝난 리그 기록은 세지 않는다(2026-11-08 결정) — 서버 상수 ACHIEVEMENT_SINCE(2026-11-08) 이전 completed_at 행은 평가하지 않고
--       여기서 미리 표식을 찍어 둔다.
-- ============================================================

create table public.user_achievements (
  user_id        uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null,
  reward         integer not null,
  ref            jsonb not null default '{}'::jsonb,
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

alter table public.user_achievements enable row level security;
revoke all on table public.user_achievements from anon, authenticated;
grant select on table public.user_achievements to authenticated;
create policy ua_select on public.user_achievements
  for select to authenticated
  using (user_id = auth.uid() or public.is_global_admin());

create or replace function public.unlock_achievement(
  p_user_id uuid, p_achievement_id text, p_reward integer, p_ref jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  if p_user_id is null or p_achievement_id is null then raise exception 'invalid_args'; end if;
  insert into user_achievements (user_id, achievement_id, reward, ref)
  values (p_user_id, p_achievement_id, coalesce(p_reward, 0), coalesce(p_ref, '{}'::jsonb))
  on conflict do nothing;
  if not found then
    return jsonb_build_object('unlocked', false);
  end if;
  if coalesce(p_reward, 0) > 0 then
    v_res := public.grant_points(
      p_user_id, p_reward, 'achievement', 'ach:' || p_user_id || ':' || p_achievement_id,
      'achievement', p_achievement_id, coalesce(p_ref, '{}'::jsonb)
    );
    return jsonb_build_object('unlocked', true, 'balance', v_res->'balance');
  end if;
  return jsonb_build_object('unlocked', true);
end;
$$;

revoke execute on function public.unlock_achievement(uuid, text, integer, jsonb) from public, anon, authenticated;
grant  execute on function public.unlock_achievement(uuid, text, integer, jsonb) to service_role;

alter table public.league_user_history add column if not exists points_evaluated_at timestamptz;
-- 끝난 리그(2026-11-08 이전 완료) 기록은 평가 대상 아님
update public.league_user_history set points_evaluated_at = now()
 where points_evaluated_at is null and (completed_at is null or completed_at < '2026-11-08T00:00:00Z');

-- ROLLBACK:
--   drop function if exists public.unlock_achievement(uuid, text, integer, jsonb);
--   drop table if exists public.user_achievements;
--   alter table public.league_user_history drop column if exists points_evaluated_at;
