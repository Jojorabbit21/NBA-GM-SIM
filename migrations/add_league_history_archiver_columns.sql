-- 멀티플레이어 유저 통산 기록: 기존에 스키마만 있던 league_user_history(0행, 아카이버 미구현)를
-- 실제로 채울 수 있도록 컬럼 보강. tournament_archives엔 league_type을 추가해
-- main_league 플레이오프 브라켓(archiveTournament 재사용 경로)이 "순수 토너먼트" 통계에
-- 섞여 들어가지 않도록 구분한다.
-- 적용됨: 2026-09-10, Supabase 프로젝트 buummihpewiaeltywdff.

alter table public.league_user_history
    add column if not exists league_id      uuid references public.leagues(id),
    add column if not exists league_name    text not null default '',
    add column if not exists team_count     integer not null default 0,
    add column if not exists playoff_wins   integer not null default 0,
    add column if not exists playoff_losses integer not null default 0,
    add column if not exists completed_at   timestamptz not null default now();

alter table public.tournament_archives
    add column if not exists league_type text not null default 'tournament';

comment on column public.league_user_history.playoff_result is
    'champion | runner_up | eliminated | missed_playoffs — archiveLeagueSeason()이 기록';
comment on column public.tournament_archives.league_type is
    'leagues.type 스냅샷(main_league|tournament) — 클라이언트가 "순수 토너먼트" 통계와 main_league 플레이오프 브라켓을 구분하는 용도';
