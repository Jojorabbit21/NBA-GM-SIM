-- [2026-11-21] 라인업 순위·선수 온/오프(팀 전술 › 인사이트) — 경기별 5인 조합 집계
-- 새 테이블·새 함수뿐(기존 함수 재정의 없음). 엔진 변경 없음 — 저장된 game_pbp(rotation_data·events·box)만으로 계산하므로
-- 보관본 엔진 방(S2 포함)에도 그대로 적용된다.
--
-- 계산(compute_game_lineups, 한 경기):
--   출전 구간 = rotation_data[선수] = [{in, out}] (초, 정규 48분 = 2880, 연장 1회 300초; out 없으면 경기 끝)
--   팀별 경계(모든 in/out + 0 + 경기 끝)로 자른 구간마다 코트 위 선수 = in <= 구간 시작 < out 인 선수 → 5인 조합(선수 id 정렬)
--   이벤트 시각 t = 쿼터 시작 + 쿼터 길이 − 남은 시간(MM:SS) → 구간 (시작, 끝] 에 배정(교체 직후 들어온 선수는 그 순간 득점에 안 들어감)
--   득점 = 이벤트의 home/awayScore 직전 대비 증가분, 포제션 = isPossessionEnd = true 이벤트의 possessionTeamId
-- refresh_game_lineup_stats = 그 경기 행을 지우고 다시 넣음(서버 simRunner가 경기 저장 직후 호출, 백필도 같은 함수).

create table if not exists public.team_lineup_stats (
    room_id       uuid    not null references public.rooms(id) on delete cascade,
    game_id       text    not null,
    team_id       text    not null,
    lineup_key    text    not null,           -- 선수 id 정렬 후 ',' 연결
    player_ids    text[]  not null,
    player_names  text[]  not null,           -- player_ids 순서, 경기 당시 박스스코어 이름
    season_number integer,
    is_playoff    boolean not null default false,
    secs          numeric not null default 0,
    pts_for       integer not null default 0,
    pts_against   integer not null default 0,
    poss_for      integer not null default 0,
    poss_against  integer not null default 0,
    created_at    timestamptz not null default now(),
    primary key (room_id, game_id, team_id, lineup_key)
);

create index if not exists team_lineup_stats_room_team_idx
    on public.team_lineup_stats (room_id, team_id, season_number);

alter table public.team_lineup_stats enable row level security;

-- 읽기: 같은 경기의 game_pbp가 보일 때만(스포일러 방지 — team_assist_pairs와 같음)
create policy tls_select_revealed on public.team_lineup_stats
    for select using (
        exists (select 1 from public.game_pbp gp
                where gp.room_id = team_lineup_stats.room_id and gp.game_id = team_lineup_stats.game_id)
    );
create policy tls_service_write on public.team_lineup_stats
    for all using ((select auth.role()) = 'service_role') with check ((select auth.role()) = 'service_role');

-- 한 경기의 팀×5인 조합 집계(저장 안 함 — 미리보기·검증용, refresh가 이걸 저장)
create or replace function public.compute_game_lineups(p_room_id uuid, p_game_id text)
returns table (team_id text, lineup_key text, player_ids text[], player_names text[], season_number integer, is_playoff boolean,
               secs numeric, pts_for integer, pts_against integer, poss_for integer, poss_against integer)
language sql
stable
security definer
set search_path to 'public'
as $$
with gp as (
    select gp.game_id, gp.events, gp.rotation_data, gp.home_box, gp.away_box, gp.home_team_id, gp.away_team_id,
           2880 + 300 * coalesce(gp.ot_periods, 0) as gend, g.series_id, r.season_number as season
    from game_pbp gp
    join games g on g.room_id = gp.room_id and g.game_id = gp.game_id
    join rooms r on r.id = gp.room_id
    where gp.room_id = p_room_id and gp.game_id = p_game_id and coalesce(g.is_allstar, false) = false
),
box as (
    select b->>'playerId' as pid, b->>'playerName' as pname, gp.home_team_id as team from gp, jsonb_array_elements(gp.home_box) b
    union all
    select b->>'playerId', b->>'playerName', gp.away_team_id from gp, jsonb_array_elements(gp.away_box) b
),
stints as (
    select rd.key as pid, bx.team, (s->>'in')::numeric as a, coalesce((s->>'out')::numeric, gp.gend) as b
    from gp
    cross join lateral jsonb_each(gp.rotation_data) rd
    cross join lateral jsonb_array_elements(rd.value) s
    join box bx on bx.pid = rd.key
),
bounds as (
    select team, a as t from stints
    union select team, b from stints
    union select t2.team, 0 from (select distinct team from stints) t2
    union select t2.team, gp.gend from (select distinct team from stints) t2, gp
),
intervals as (
    select team, t as a, lead(t) over (partition by team order by t) as b from bounds
),
oncourt as (
    select i.team, i.a, i.b, array_agg(s.pid order by s.pid) as pids
    from intervals i join stints s on s.team = i.team and s.a <= i.a and s.b > i.a
    where i.b is not null and i.b > i.a
    group by i.team, i.a, i.b
),
ev as (
    select e.i,
           -- 0초(1쿼터 12:00 — 경기 전 테크니컬 자유투 등)·경기 끝 밖 이벤트도 첫·마지막 구간에 들어가게 (0.5, gend]로 자름
           greatest(0.5, least(gp.gend,
             (case when (e.v->>'quarter')::int <= 4 then ((e.v->>'quarter')::int - 1) * 720 + 720
                   else 2880 + ((e.v->>'quarter')::int - 4) * 300 end)
             - (split_part(e.v->>'timeRemaining', ':', 1)::numeric * 60 + split_part(e.v->>'timeRemaining', ':', 2)::numeric))) as t,
           (e.v->>'homeScore')::int as hs, (e.v->>'awayScore')::int as aws,
           e.v->>'possessionTeamId' as poss_team, coalesce((e.v->>'isPossessionEnd')::boolean, false) as pe
    from gp, jsonb_array_elements(gp.events) with ordinality as e(v, i)
    where e.v->>'quarter' is not null and e.v->>'timeRemaining' like '%:%'
),
ev_s as (   -- 점수가 실린 이벤트끼리만 직전 대비 증가분(점수 없는 이벤트가 끼면 lag가 비어 누적 점수가 통째로 잡히는 것 방지)
    select i, t, poss_team, pe,
           coalesce(hs - lag(hs) over (order by i), hs) as dh,
           coalesce(aws - lag(aws) over (order by i), aws) as da
    from ev where hs is not null and aws is not null
),
ev_d as (
    select t, poss_team, pe, dh, da from ev_s
    union all
    select t, poss_team, pe, 0, 0 from ev where (hs is null or aws is null) and pe
),
ev_team as (
    select o.team, o.pids,
           sum(case when o.team = gp.home_team_id then coalesce(d.dh, 0) else coalesce(d.da, 0) end) as pf,
           sum(case when o.team = gp.home_team_id then coalesce(d.da, 0) else coalesce(d.dh, 0) end) as pa,
           count(*) filter (where d.pe and d.poss_team = o.team) as possf,
           count(*) filter (where d.pe and d.poss_team is not null and d.poss_team <> o.team) as possa
    from oncourt o
    join ev_d d on d.t > o.a and d.t <= o.b
    cross join gp
    group by o.team, o.pids
),
secs as (
    select team, pids, sum(b - a) as secs from oncourt group by team, pids
)
select s.team, array_to_string(s.pids, ','), s.pids,
       array(select coalesce(bx.pname, '?') from unnest(s.pids) with ordinality u(pid, n) left join box bx on bx.pid = u.pid order by u.n),
       gp.season, gp.series_id is not null,
       s.secs, coalesce(et.pf, 0)::int, coalesce(et.pa, 0)::int, coalesce(et.possf, 0)::int, coalesce(et.possa, 0)::int
from secs s
cross join gp
left join ev_team et on et.team = s.team and et.pids = s.pids
$$;

create or replace function public.refresh_game_lineup_stats(p_room_id uuid, p_game_id text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n integer;
begin
    delete from team_lineup_stats where room_id = p_room_id and game_id = p_game_id;
    insert into team_lineup_stats (room_id, game_id, team_id, lineup_key, player_ids, player_names, season_number, is_playoff,
                                   secs, pts_for, pts_against, poss_for, poss_against)
    select p_room_id, p_game_id, c.team_id, c.lineup_key, c.player_ids, c.player_names, c.season_number, c.is_playoff,
           c.secs, c.pts_for, c.pts_against, c.poss_for, c.poss_against
    from compute_game_lineups(p_room_id, p_game_id) c;
    get diagnostics v_n = row_count;
    return v_n;
end;
$$;

revoke all on function public.compute_game_lineups(uuid, text) from public, anon, authenticated;
revoke all on function public.refresh_game_lineup_stats(uuid, text) from public, anon, authenticated;
grant execute on function public.compute_game_lineups(uuid, text) to service_role;
grant execute on function public.refresh_game_lineup_stats(uuid, text) to service_role;

-- 팀 시즌 라인업 합산(5인 조합별). SECURITY INVOKER — 위 RLS(공개된 경기만) 적용.
create or replace function public.get_team_lineup_stats(p_room_id uuid, p_team_id text, p_season_number integer default null, p_is_playoff boolean default false)
returns table (lineup_key text, player_ids text[], player_names text[], games bigint, secs numeric,
               pts_for bigint, pts_against bigint, poss_for bigint, poss_against bigint)
language sql
stable
security invoker
set search_path to 'public'
as $$
    -- 배열의 array_agg는 2차원이 돼 [1]이 원소 하나를 돌려준다 → id는 lineup_key를 다시 나누고, 이름은 구분자(chr(31))로 이었다가 나눔(가장 최근 경기 이름)
    select t.lineup_key, string_to_array(t.lineup_key, ','),
           string_to_array((array_agg(array_to_string(t.player_names, chr(31)) order by t.created_at desc))[1], chr(31)),
           count(distinct t.game_id), sum(t.secs), sum(t.pts_for), sum(t.pts_against), sum(t.poss_for), sum(t.poss_against)
    from team_lineup_stats t
    where t.room_id = p_room_id and t.team_id = p_team_id
      and t.season_number is not distinct from coalesce(p_season_number, (select r.season_number from rooms r where r.id = p_room_id))
      and t.is_playoff = p_is_playoff
    group by t.lineup_key
$$;

-- 팀 시즌 선수 온/오프 — 선수가 코트에 있던 조합 합(on)과 팀 전체 합. off = 전체 − on(화면에서 계산).
create or replace function public.get_team_on_off(p_room_id uuid, p_team_id text, p_season_number integer default null, p_is_playoff boolean default false)
returns table (player_id text, player_name text, on_secs numeric, on_pts_for bigint, on_pts_against bigint, on_poss_for bigint, on_poss_against bigint,
               tot_secs numeric, tot_pts_for bigint, tot_pts_against bigint, tot_poss_for bigint, tot_poss_against bigint)
language sql
stable
security invoker
set search_path to 'public'
as $$
    with t as (
        select * from team_lineup_stats t
        where t.room_id = p_room_id and t.team_id = p_team_id
          and t.season_number is not distinct from coalesce(p_season_number, (select r.season_number from rooms r where r.id = p_room_id))
          and t.is_playoff = p_is_playoff
    ),
    tot as (select sum(secs) s, sum(pts_for) pf, sum(pts_against) pa, sum(poss_for) qf, sum(poss_against) qa from t),
    p as (
        select u.pid, u.pname, t.created_at, t.secs, t.pts_for, t.pts_against, t.poss_for, t.poss_against
        from t, unnest(t.player_ids, t.player_names) as u(pid, pname)
    )
    select p.pid, (array_agg(p.pname order by p.created_at desc))[1],
           sum(p.secs), sum(p.pts_for), sum(p.pts_against), sum(p.poss_for), sum(p.poss_against),
           tot.s, tot.pf, tot.pa, tot.qf, tot.qa
    from p cross join tot
    group by p.pid, tot.s, tot.pf, tot.pa, tot.qf, tot.qa
$$;

grant execute on function public.get_team_lineup_stats(uuid, text, integer, boolean) to anon, authenticated, service_role;
grant execute on function public.get_team_on_off(uuid, text, integer, boolean) to anon, authenticated, service_role;

-- 롤백:
--   drop function if exists public.get_team_on_off(uuid, text, integer, boolean);
--   drop function if exists public.get_team_lineup_stats(uuid, text, integer, boolean);
--   drop function if exists public.refresh_game_lineup_stats(uuid, text);
--   drop function if exists public.compute_game_lineups(uuid, text);
--   drop table if exists public.team_lineup_stats;   (서버 simRunner의 refresh 호출을 먼저 되돌릴 것)

-- [2026-11-21 후속] 고른 선수 묶음(1~5명) 한 줄 — 그 선수들이 모두 코트에 있던 시간의 합과 함께 뛴 경기 수(선수 필터, 사용자 요청)
create or replace function public.get_team_lineup_combo(p_room_id uuid, p_team_id text, p_player_ids text[], p_season_number integer default null, p_is_playoff boolean default false)
returns table (games bigint, secs numeric, pts_for bigint, pts_against bigint, poss_for bigint, poss_against bigint)
language sql
stable
security invoker
set search_path to 'public'
as $$
    select count(distinct t.game_id), coalesce(sum(t.secs), 0), coalesce(sum(t.pts_for), 0), coalesce(sum(t.pts_against), 0),
           coalesce(sum(t.poss_for), 0), coalesce(sum(t.poss_against), 0)
    from team_lineup_stats t
    where t.room_id = p_room_id and t.team_id = p_team_id
      and t.season_number is not distinct from coalesce(p_season_number, (select r.season_number from rooms r where r.id = p_room_id))
      and t.is_playoff = p_is_playoff
      and t.player_ids @> p_player_ids
$$;
grant execute on function public.get_team_lineup_combo(uuid, text, text[], integer, boolean) to anon, authenticated, service_role;
-- 롤백 추가: drop function if exists public.get_team_lineup_combo(uuid, text, text[], integer, boolean);
