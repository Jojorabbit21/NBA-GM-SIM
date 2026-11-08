-- ============================================================
-- BP 선수 스탯 마일스톤 — 선수 시즌 카운터 + 경기 반영 RPC + 비율 판정 표식
--
-- 계획: docs/plan/points-system-plan.md "선수 스탯 마일스톤". 서버: server/src/pointsSettlement.ts (경기 정산 루프 안)
--
--   points_game_counted            경기 1건이 카운터에 반영됐는지 표식(PK room_id, game_id). 정산 루프가 같은 경기를 재처리해도 두 번 더해지지 않는다.
--   points_player_season_counters  방·시즌·선수별 정규시즌 누적(gp·pts·reb·ast·stl·blk·p3m·p3a·fgm·fga·ftm·fta) + 마지막 소속 team_slug.
--   apply_player_game_stats(...)   표식 insert → 들어갔을 때만 rows 를 카운터에 더하고 [{player_id, team_slug, before, after}] 반환(이미 반영됐으면 []).
--                                  service_role 전용 — 서버 정산 루프가 호출. 넘은 단계 판정·지급은 서버(TS)가 before/after 로 한다.
--   rooms.points_ratio_settled_at  비율 지표(야투율·자유투·3점) 정규시즌 종료 1회 판정 완료 표식.
-- ============================================================

create table public.points_game_counted (
  room_id    uuid not null references public.rooms(id) on delete cascade,
  game_id    text not null,
  counted_at timestamptz not null default now(),
  primary key (room_id, game_id)
);

create table public.points_player_season_counters (
  room_id       uuid not null references public.rooms(id) on delete cascade,
  season_number integer not null,
  player_id     text not null,
  team_slug     text not null,
  gp  integer not null default 0,
  pts integer not null default 0,
  reb integer not null default 0,
  ast integer not null default 0,
  stl integer not null default 0,
  blk integer not null default 0,
  p3m integer not null default 0,
  p3a integer not null default 0,
  fgm integer not null default 0,
  fga integer not null default 0,
  ftm integer not null default 0,
  fta integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (room_id, season_number, player_id)
);

alter table public.points_game_counted enable row level security;
alter table public.points_player_season_counters enable row level security;
revoke all on table public.points_game_counted, public.points_player_season_counters from anon, authenticated;
-- 클라이언트 노출 없음(서버 전용). 어드민 조회가 필요해지면 그때 SELECT 정책 추가.

alter table public.rooms add column if not exists points_ratio_settled_at timestamptz;

create or replace function public.apply_player_game_stats(
  p_room_id uuid, p_season integer, p_game_id text, p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r      jsonb;
  v_old  points_player_season_counters%rowtype;
  v_new  points_player_season_counters%rowtype;
  v_out  jsonb := '[]'::jsonb;
  v_pid  text;
begin
  insert into points_game_counted (room_id, game_id) values (p_room_id, p_game_id) on conflict do nothing;
  if not found then return v_out; end if;   -- 이미 반영된 경기

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_pid := r->>'player_id';
    if v_pid is null or r->>'team_slug' is null then continue; end if;

    select * into v_old from points_player_season_counters
     where room_id = p_room_id and season_number = p_season and player_id = v_pid;

    insert into points_player_season_counters as c
      (room_id, season_number, player_id, team_slug, gp, pts, reb, ast, stl, blk, p3m, p3a, fgm, fga, ftm, fta)
    values (p_room_id, p_season, v_pid, r->>'team_slug',
      coalesce((r->>'gp')::int,0), coalesce((r->>'pts')::int,0), coalesce((r->>'reb')::int,0), coalesce((r->>'ast')::int,0),
      coalesce((r->>'stl')::int,0), coalesce((r->>'blk')::int,0), coalesce((r->>'p3m')::int,0), coalesce((r->>'p3a')::int,0),
      coalesce((r->>'fgm')::int,0), coalesce((r->>'fga')::int,0), coalesce((r->>'ftm')::int,0), coalesce((r->>'fta')::int,0))
    on conflict (room_id, season_number, player_id) do update set
      team_slug = excluded.team_slug,
      gp = c.gp + excluded.gp, pts = c.pts + excluded.pts, reb = c.reb + excluded.reb, ast = c.ast + excluded.ast,
      stl = c.stl + excluded.stl, blk = c.blk + excluded.blk, p3m = c.p3m + excluded.p3m, p3a = c.p3a + excluded.p3a,
      fgm = c.fgm + excluded.fgm, fga = c.fga + excluded.fga, ftm = c.ftm + excluded.ftm, fta = c.fta + excluded.fta,
      updated_at = now()
    returning * into v_new;

    v_out := v_out || jsonb_build_object(
      'player_id', v_pid, 'team_slug', v_new.team_slug,
      'before', case when v_old.player_id is null then '{}'::jsonb else
        jsonb_build_object('gp', v_old.gp, 'pts', v_old.pts, 'reb', v_old.reb, 'ast', v_old.ast, 'stl', v_old.stl, 'blk', v_old.blk, 'p3m', v_old.p3m) end,
      'after', jsonb_build_object('gp', v_new.gp, 'pts', v_new.pts, 'reb', v_new.reb, 'ast', v_new.ast, 'stl', v_new.stl, 'blk', v_new.blk, 'p3m', v_new.p3m)
    );
    v_old := null;
  end loop;
  return v_out;
end;
$$;

revoke execute on function public.apply_player_game_stats(uuid, integer, text, jsonb) from public, anon, authenticated;
grant  execute on function public.apply_player_game_stats(uuid, integer, text, jsonb) to service_role;

-- ROLLBACK:
--   drop function if exists public.apply_player_game_stats(uuid, integer, text, jsonb);
--   drop table if exists public.points_player_season_counters, public.points_game_counted;
--   alter table public.rooms drop column if exists points_ratio_settled_at;
