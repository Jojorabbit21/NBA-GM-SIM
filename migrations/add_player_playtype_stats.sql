-- [2026-11-16] 선수별 플레이타입 실적(선수 프로필 샷 차트 탭 "플레이타입별 기록") — 경기 종료 시 서버(simRunner 5-2)가 선수×플레이타입 행을 저장.
-- 엔진 집계 규칙: services/game/engine/pbp/statsMappers.ts recordPlayTypeStat (server 미러 동일). 팀 집계(team_playtype_stats)와 같은 플레이를
-- 플레이의 주인(result.actor — 슈터·턴오버한 선수·자유투를 얻은 선수, 패스 차단 턴오버는 패서)에게 누적. 샷클락 바이얼레이션(팀 턴오버)은 선수에게 넣지 않아 선수 합 = 팀 값 − 바이얼레이션.
-- 새 테이블·새 함수뿐(기존 함수 재정의 없음).

create table if not exists public.player_playtype_stats (
    room_id       uuid    not null references public.rooms(id) on delete cascade,
    game_id       text    not null,
    team_id       text    not null,
    player_id     text    not null,
    play_type     text    not null,
    season_number integer,
    is_playoff    boolean not null default false,
    poss          integer not null default 0,
    pts           integer not null default 0,
    fga           integer not null default 0,
    fgm           integer not null default 0,
    fta           integer not null default 0,
    tov           integer not null default 0,
    -- 엔진 집계 도입 전 경기의 백필 행: 야투(시도·성공·득점)·앤드원은 정확, 턴오버·슛 없는 자유투는 추정 배분
    is_estimated  boolean not null default false,
    created_at    timestamptz not null default now(),
    primary key (room_id, game_id, player_id, play_type)
);

create index if not exists player_playtype_stats_room_player_idx
    on public.player_playtype_stats (room_id, player_id, season_number);

alter table public.player_playtype_stats enable row level security;

-- 읽기: 같은 경기의 game_pbp가 보일 때만(game_pbp RLS 상속 → 방 멤버·관전 + 리플레이 공개 시각 이후) — team_playtype_stats와 같은 스포일러 방지
create policy ppts_select_revealed on public.player_playtype_stats
    for select using (
        exists (select 1 from public.game_pbp gp
                where gp.room_id = player_playtype_stats.room_id and gp.game_id = player_playtype_stats.game_id)
    );

-- 쓰기: 서버(service_role)만
create policy ppts_service_write on public.player_playtype_stats
    for all using ((select auth.role()) = 'service_role') with check ((select auth.role()) = 'service_role');

-- 선수 1명의 시즌 합산(이적했다면 팀 합산). p_season_number null이면 방의 현재 시즌. p_is_playoff false = 정규시즌만, true = 플레이오프만.
-- SECURITY INVOKER라 위 RLS(공개된 경기만)가 적용된다.
create or replace function public.get_player_playtype_stats(
    p_room_id uuid,
    p_player_id text,
    p_season_number integer default null,
    p_is_playoff boolean default false
)
returns table (play_type text, poss bigint, pts bigint, fga bigint, fgm bigint, fta bigint, tov bigint, estimated_games bigint)
language sql
stable
security invoker
set search_path to 'public'
as $$
    select t.play_type,
           sum(t.poss), sum(t.pts), sum(t.fga), sum(t.fgm), sum(t.fta), sum(t.tov),
           count(distinct t.game_id) filter (where t.is_estimated)
    from player_playtype_stats t
    where t.room_id = p_room_id
      and t.player_id = p_player_id
      and t.season_number is not distinct from coalesce(p_season_number, (select r.season_number from rooms r where r.id = p_room_id))
      and t.is_playoff = p_is_playoff
    group by t.play_type
$$;

grant execute on function public.get_player_playtype_stats(uuid, text, integer, boolean) to authenticated;

-- 롤백:
--   drop function if exists public.get_player_playtype_stats(uuid, text, integer, boolean);
--   drop table if exists public.player_playtype_stats;
