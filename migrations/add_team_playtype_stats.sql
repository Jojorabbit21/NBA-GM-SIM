-- [2026-10-18] 팀별 플레이타입 실적(멀티 전술 화면 "PPP") — 경기 종료 시 서버(simRunner)가 팀×플레이타입 행을 저장.
-- 엔진 집계 규칙: services/game/engine/pbp/statsMappers.ts recordPlayTypeStat (server 미러 동일).
-- 원본 game_pbp(경기당 ~200KB)를 매번 훑지 않도록 숫자만 담은 좁은 테이블 + 합산 RPC.

create table if not exists public.team_playtype_stats (
    room_id       uuid    not null references public.rooms(id) on delete cascade,
    game_id       text    not null,
    team_id       text    not null,
    play_type     text    not null,
    season_number integer,
    is_playoff    boolean not null default false,
    poss          integer not null default 0,
    pts           integer not null default 0,
    fga           integer not null default 0,
    fgm           integer not null default 0,
    fta           integer not null default 0,
    tov           integer not null default 0,
    created_at    timestamptz not null default now(),
    primary key (room_id, game_id, team_id, play_type)
);

create index if not exists team_playtype_stats_room_season_idx
    on public.team_playtype_stats (room_id, season_number, team_id);

alter table public.team_playtype_stats enable row level security;

-- 읽기: 같은 경기의 game_pbp가 보일 때만(하위 조회에 game_pbp RLS가 그대로 적용 → 방 멤버 + 리플레이 공개 시각 이후).
-- 중계 중인 경기 결과가 PPP로 먼저 새어 나가는 스포일러 방지.
create policy tps_select_revealed on public.team_playtype_stats
    for select using (
        exists (select 1 from public.game_pbp gp
                where gp.room_id = team_playtype_stats.room_id and gp.game_id = team_playtype_stats.game_id)
    );

-- 쓰기: 서버(service_role)만 — game_pbp와 동일
create policy tps_service_write on public.team_playtype_stats
    for all using ((select auth.role()) = 'service_role') with check ((select auth.role()) = 'service_role');

-- 시즌 합산. p_season_number null이면 방의 현재 시즌. SECURITY INVOKER라 위 RLS(공개된 경기만)가 적용된다.
create or replace function public.get_team_playtype_stats(
    p_room_id uuid,
    p_season_number integer default null,
    p_include_playoffs boolean default true
)
returns table (team_id text, play_type text, poss bigint, pts bigint, fga bigint, fgm bigint, fta bigint, tov bigint)
language sql
stable
security invoker
set search_path to 'public'
as $$
    select t.team_id, t.play_type,
           sum(t.poss), sum(t.pts), sum(t.fga), sum(t.fgm), sum(t.fta), sum(t.tov)
    from team_playtype_stats t
    where t.room_id = p_room_id
      and t.season_number is not distinct from coalesce(p_season_number, (select r.season_number from rooms r where r.id = p_room_id))
      and (p_include_playoffs or not t.is_playoff)
    group by t.team_id, t.play_type
$$;

grant execute on function public.get_team_playtype_stats(uuid, integer, boolean) to authenticated;

-- [2026-10-18 v2] 백필 추정치 표시 — 엔진 집계 도입 전 경기는 슛·앤드원만 정확하고 턴오버·자유투 기회는
-- 엔진 플레이타입별 비율로 배분한 추정치(scripts는 dev-log 참조). 화면에 "추정치 포함" 안내용.
alter table public.team_playtype_stats add column if not exists is_estimated boolean not null default false;

drop function if exists public.get_team_playtype_stats(uuid, integer, boolean);
create or replace function public.get_team_playtype_stats(
    p_room_id uuid,
    p_season_number integer default null,
    p_include_playoffs boolean default true
)
returns table (team_id text, play_type text, poss bigint, pts bigint, fga bigint, fgm bigint, fta bigint, tov bigint, estimated_games bigint)
language sql
stable
security invoker
set search_path to 'public'
as $$
    select t.team_id, t.play_type,
           sum(t.poss), sum(t.pts), sum(t.fga), sum(t.fgm), sum(t.fta), sum(t.tov),
           count(distinct t.game_id) filter (where t.is_estimated)
    from team_playtype_stats t
    where t.room_id = p_room_id
      and t.season_number is not distinct from coalesce(p_season_number, (select r.season_number from rooms r where r.id = p_room_id))
      and (p_include_playoffs or not t.is_playoff)
    group by t.team_id, t.play_type
$$;

grant execute on function public.get_team_playtype_stats(uuid, integer, boolean) to authenticated;
