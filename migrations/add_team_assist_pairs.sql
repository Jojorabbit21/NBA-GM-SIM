-- [2026-11-21] 어시스트 네트워크(팀 전술 › 인사이트 최하단) — 경기 종료 시 서버(simRunner 5-3)가 팀×패서×슈터 행을 저장.
-- 엔진 집계: statsMappers.recordAssistPair(client·server 미러) — 어시스트가 인정된 야투 1개 = 패서→슈터 1건, pts = 그 야투 득점(앤드원 자유투 제외).
-- 보관본 엔진(stable 방, 예: NBA-L S2)은 이 집계가 없어 행이 생기지 않는다.
-- 새 테이블·새 함수뿐(기존 함수 재정의 없음).

create table if not exists public.team_assist_pairs (
    room_id       uuid    not null references public.rooms(id) on delete cascade,
    game_id       text    not null,
    team_id       text    not null,
    passer_id     text    not null,
    receiver_id   text    not null,
    season_number integer,
    is_playoff    boolean not null default false,
    ast           integer not null default 0,
    pts           integer not null default 0,
    created_at    timestamptz not null default now(),
    primary key (room_id, game_id, team_id, passer_id, receiver_id)
);

create index if not exists team_assist_pairs_room_team_idx
    on public.team_assist_pairs (room_id, team_id, season_number);

alter table public.team_assist_pairs enable row level security;

-- 읽기: 같은 경기의 game_pbp가 보일 때만(game_pbp RLS 상속 → 방 멤버·관전 + 리플레이 공개 시각 이후) — player_playtype_stats와 같은 스포일러 방지
create policy tap_select_revealed on public.team_assist_pairs
    for select using (
        exists (select 1 from public.game_pbp gp
                where gp.room_id = team_assist_pairs.room_id and gp.game_id = team_assist_pairs.game_id)
    );

-- 쓰기: 서버(service_role)만
create policy tap_service_write on public.team_assist_pairs
    for all using ((select auth.role()) = 'service_role') with check ((select auth.role()) = 'service_role');

-- 팀 1개의 시즌 합산(패서·슈터 쌍별). p_season_number null이면 방의 현재 시즌. p_is_playoff false = 정규시즌만, true = 플레이오프만.
-- SECURITY INVOKER라 위 RLS(공개된 경기만)가 적용된다. 이적한 선수의 이전 팀 시절 쌍은 그 팀 쪽에 남는다(team_id = 경기 당시 팀).
create or replace function public.get_team_assist_pairs(
    p_room_id uuid,
    p_team_id text,
    p_season_number integer default null,
    p_is_playoff boolean default false
)
returns table (passer_id text, receiver_id text, ast bigint, pts bigint, games bigint)
language sql
stable
security invoker
set search_path to 'public'
as $$
    select t.passer_id, t.receiver_id, sum(t.ast), sum(t.pts), count(distinct t.game_id)
    from team_assist_pairs t
    where t.room_id = p_room_id
      and t.team_id = p_team_id
      and t.season_number is not distinct from coalesce(p_season_number, (select r.season_number from rooms r where r.id = p_room_id))
      and t.is_playoff = p_is_playoff
    group by t.passer_id, t.receiver_id
$$;

grant execute on function public.get_team_assist_pairs(uuid, text, integer, boolean) to anon, authenticated, service_role;

-- 롤백:
--   drop function if exists public.get_team_assist_pairs(uuid, text, integer, boolean);
--   drop table if exists public.team_assist_pairs;
--   (테이블 삭제 전에 서버 simRunner 5-3 저장 블록을 먼저 되돌릴 것)
