-- [2026-11-12] 경기별·선수별 박스스코어 표 (docs/plan/season-stats-speedup-plan.md 방식 B, 1단계)
--
-- 배경: 시즌 기록 조회들(get_player_season_stats_league 등)이 요청마다 방의 모든 경기 JSON(game_pbp.home_box/away_box)을
-- 처음부터 훑는다(선수 시즌 기록 1회 평균 2.2초, DB 실행 시간의 30%). 경기 기록이 저장될 때 박스스코어를
-- "선수 한 명당 한 줄"로 풀어 두고, 조회가 이 표를 읽게 한다(조회 교체는 2단계 — 이 파일은 표·트리거·백필만).
--
--  - game_box_header : 경기당 1줄. game_pbp 의 작은 칼럼 사본(팀·점수·시작 시각·연장 수·팀 부가 득점) + 동기화 상태.
--  - game_player_box : 선수·경기당 1줄. 칼럼 68개는 get_player_season_stats_league 가 합산하는 항목과 1:1.
--    원본은 여전히 game_pbp 의 JSON 이다 — 이 표는 사본이라 어긋나면 sync_game_box() 로 다시 채우면 된다.
--  - 두 표 모두 RLS 를 켜고 정책을 두지 않는다(유저가 직접 읽지 못함). 공개 시각 이전 경기가 들어 있으므로
--    읽기는 멤버·공개 시각을 확인하는 SECURITY DEFINER 함수(2단계)로만 한다.
--  - 트리거는 경기 저장을 막거나 지연시키지 않는다: 본문 전체를 예외 처리로 감싸고(오류는 WARNING 로그),
--    잠금을 0.2초 넘게 기다리지 않는다. 실패한 경기는 헤더 줄을 지워 "빠진 경기"로 드러나게 한다.
--
-- 적용 순서: 표 → 함수 → 트리거 → 백필(방별). 백필은 트리거와 같은 함수(sync_game_box)를 쓴다.
-- 사전 점검(2026-11-12, 한 트랜잭션에서 만들고 되돌림 — Test League 1,294경기): 합계가 기존 조회와 정규/플레이오프/합산 모두 일치,
-- 트리거 재동기화·깨진 박스스코어에서도 저장 성공·경기 삭제 시 줄 삭제 확인. 트리거 비용 경기당 약 13ms.
-- 적용: 2026-11-12 운영 DB(Supabase 마이그레이션 add_game_player_box) + 방 3개 백필(3,939경기 → 선수 111,171줄).
--       적용 후 방 3개 × 정규/플레이오프/합산 합계가 기존 조회와 차이 0, API 경로(서비스 키) 수정에서 트리거 동작 확인.
-- 롤백: drop trigger game_pbp_sync_box on public.game_pbp; drop function public.trg_game_pbp_sync_box();
--       drop function public.sync_game_box(uuid, text); drop table public.game_player_box; drop table public.game_box_header;

set local lock_timeout = '5s';   -- game_pbp 에 잠깐 거는 잠금(FK·트리거 생성)을 오래 기다리지 않는다

create table if not exists public.game_box_header (
    room_id         uuid        not null,
    game_id         text        not null,
    home_team_id    text,
    away_team_id    text,
    home_score      integer,
    away_score      integer,
    game_start_time timestamptz,
    ot_periods      smallint,
    team_misc       jsonb,
    player_rows     integer     not null default 0,
    synced_at       timestamptz not null default now(),
    primary key (room_id, game_id),
    foreign key (room_id, game_id) references public.game_pbp (room_id, game_id) on delete cascade
);

create table if not exists public.game_player_box (
    id          bigint generated always as identity primary key,
    room_id     uuid not null,
    game_id     text not null,
    team_id     text,
    opp_team_id text,
    player_id   uuid not null,
    gs numeric, mp numeric, pts numeric, reb numeric, off_reb numeric,
    def_reb numeric, ast numeric, stl numeric, blk numeric, tov numeric,
    tov_forced numeric, pf numeric, tech_fouls numeric, flagrant_fouls numeric, fgm numeric,
    fga numeric, p3m numeric, p3a numeric, ftm numeric, fta numeric,
    rim_m numeric, rim_a numeric, mid_m numeric, mid_a numeric, plus_minus numeric,
    contested_attempted numeric, contested_made numeric, def_rim_attempted numeric, def_rim_made numeric, def_mid_attempted numeric,
    def_mid_made numeric, def_three_attempted numeric, def_three_made numeric, def_ra_attempted numeric, def_ra_made numeric,
    def_itp_attempted numeric, def_itp_made numeric, def_mid6_attempted numeric, def_mid6_made numeric, def_cnr_attempted numeric,
    def_cnr_made numeric, def_wing_attempted numeric, def_wing_made numeric, def_atb_attempted numeric, def_atb_made numeric,
    zone_rim_m numeric, zone_rim_a numeric, zone_paint_m numeric, zone_paint_a numeric, zone_mid_l_m numeric,
    zone_mid_l_a numeric, zone_mid_c_m numeric, zone_mid_c_a numeric, zone_mid_r_m numeric, zone_mid_r_a numeric,
    zone_c3_l_m numeric, zone_c3_l_a numeric, zone_c3_r_m numeric, zone_c3_r_a numeric, zone_atb3_l_m numeric,
    zone_atb3_l_a numeric, zone_atb3_c_m numeric, zone_atb3_c_a numeric, zone_atb3_r_m numeric, zone_atb3_r_a numeric,
    scr_clean numeric, scr_partial numeric, scr_fail numeric,
    foreign key (room_id, game_id) references public.game_box_header (room_id, game_id) on delete cascade
);

create index if not exists game_player_box_room_game_idx on public.game_player_box (room_id, game_id);

create index if not exists game_player_box_room_player_idx on public.game_player_box (room_id, player_id);

alter table public.game_box_header enable row level security;

alter table public.game_player_box enable row level security;

revoke all on table public.game_box_header from anon, authenticated;

revoke all on table public.game_player_box from anon, authenticated;

create or replace function public.sync_game_box(p_room_id uuid, p_game_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
    p record;
    v_rows integer;
begin
    -- Read only the columns needed (not the large play-by-play columns of the same row).
    select gp.room_id, gp.game_id, gp.home_team_id, gp.away_team_id, gp.home_score, gp.away_score,
           gp.game_start_time, gp.ot_periods, gp.team_misc, gp.home_box, gp.away_box
      into p
      from public.game_pbp gp
     where gp.room_id = p_room_id and gp.game_id = p_game_id;
    if not found then
        delete from public.game_box_header where room_id = p_room_id and game_id = p_game_id;
        return;
    end if;

    insert into public.game_box_header
        (room_id, game_id, home_team_id, away_team_id, home_score, away_score, game_start_time, ot_periods, team_misc, player_rows, synced_at)
    values
        (p.room_id, p.game_id, p.home_team_id, p.away_team_id, p.home_score, p.away_score, p.game_start_time, p.ot_periods, p.team_misc, 0, now())
    on conflict (room_id, game_id) do update set
        home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id,
        home_score = excluded.home_score, away_score = excluded.away_score,
        game_start_time = excluded.game_start_time, ot_periods = excluded.ot_periods,
        team_misc = excluded.team_misc, synced_at = excluded.synced_at;

    delete from public.game_player_box where room_id = p.room_id and game_id = p.game_id;

    insert into public.game_player_box
        (room_id, game_id, team_id, opp_team_id, player_id,
         gs, mp, pts, reb, off_reb, def_reb,
         ast, stl, blk, tov, tov_forced, pf,
         tech_fouls, flagrant_fouls, fgm, fga, p3m, p3a,
         ftm, fta, rim_m, rim_a, mid_m, mid_a,
         plus_minus, contested_attempted, contested_made, def_rim_attempted, def_rim_made, def_mid_attempted,
         def_mid_made, def_three_attempted, def_three_made, def_ra_attempted, def_ra_made, def_itp_attempted,
         def_itp_made, def_mid6_attempted, def_mid6_made, def_cnr_attempted, def_cnr_made, def_wing_attempted,
         def_wing_made, def_atb_attempted, def_atb_made, zone_rim_m, zone_rim_a, zone_paint_m,
         zone_paint_a, zone_mid_l_m, zone_mid_l_a, zone_mid_c_m, zone_mid_c_a, zone_mid_r_m,
         zone_mid_r_a, zone_c3_l_m, zone_c3_l_a, zone_c3_r_m, zone_c3_r_a, zone_atb3_l_m,
         zone_atb3_l_a, zone_atb3_c_m, zone_atb3_c_a, zone_atb3_r_m, zone_atb3_r_a, scr_clean,
         scr_partial, scr_fail)
    select p.room_id, p.game_id, t.tid, t.opp, (t.e->>'playerId')::uuid,
         (t.e->>'gs')::numeric, (t.e->>'mp')::numeric, (t.e->>'pts')::numeric, (t.e->>'reb')::numeric,
         (t.e->>'offReb')::numeric, (t.e->>'defReb')::numeric, (t.e->>'ast')::numeric, (t.e->>'stl')::numeric,
         (t.e->>'blk')::numeric, (t.e->>'tov')::numeric, (t.e->>'tovForced')::numeric, (t.e->>'pf')::numeric,
         (t.e->>'techFouls')::numeric, (t.e->>'flagrantFouls')::numeric, (t.e->>'fgm')::numeric, (t.e->>'fga')::numeric,
         (t.e->>'p3m')::numeric, (t.e->>'p3a')::numeric, (t.e->>'ftm')::numeric, (t.e->>'fta')::numeric,
         (t.e->>'rimM')::numeric, (t.e->>'rimA')::numeric, (t.e->>'midM')::numeric, (t.e->>'midA')::numeric,
         (t.e->>'plusMinus')::numeric, (t.e->>'contestedAttempted')::numeric, (t.e->>'contestedMade')::numeric, (t.e->>'defRimAttempted')::numeric,
         (t.e->>'defRimMade')::numeric, (t.e->>'defMidAttempted')::numeric, (t.e->>'defMidMade')::numeric, (t.e->>'defThreeAttempted')::numeric,
         (t.e->>'defThreeMade')::numeric, (t.e->>'defRAAttempted')::numeric, (t.e->>'defRAMade')::numeric, (t.e->>'defITPAttempted')::numeric,
         (t.e->>'defITPMade')::numeric, (t.e->>'defMIDAttempted')::numeric, (t.e->>'defMIDMade')::numeric, (t.e->>'defCNRAttempted')::numeric,
         (t.e->>'defCNRMade')::numeric, (t.e->>'defWINGAttempted')::numeric, (t.e->>'defWINGMade')::numeric, (t.e->>'defATBAttempted')::numeric,
         (t.e->>'defATBMade')::numeric, (t.e->'zoneData'->>'zone_rim_m')::numeric, (t.e->'zoneData'->>'zone_rim_a')::numeric, (t.e->'zoneData'->>'zone_paint_m')::numeric,
         (t.e->'zoneData'->>'zone_paint_a')::numeric, (t.e->'zoneData'->>'zone_mid_l_m')::numeric, (t.e->'zoneData'->>'zone_mid_l_a')::numeric, (t.e->'zoneData'->>'zone_mid_c_m')::numeric,
         (t.e->'zoneData'->>'zone_mid_c_a')::numeric, (t.e->'zoneData'->>'zone_mid_r_m')::numeric, (t.e->'zoneData'->>'zone_mid_r_a')::numeric, (t.e->'zoneData'->>'zone_c3_l_m')::numeric,
         (t.e->'zoneData'->>'zone_c3_l_a')::numeric, (t.e->'zoneData'->>'zone_c3_r_m')::numeric, (t.e->'zoneData'->>'zone_c3_r_a')::numeric, (t.e->'zoneData'->>'zone_atb3_l_m')::numeric,
         (t.e->'zoneData'->>'zone_atb3_l_a')::numeric, (t.e->'zoneData'->>'zone_atb3_c_m')::numeric, (t.e->'zoneData'->>'zone_atb3_c_a')::numeric, (t.e->'zoneData'->>'zone_atb3_r_m')::numeric,
         (t.e->'zoneData'->>'zone_atb3_r_a')::numeric, (t.e->>'scrClean')::numeric, (t.e->>'scrPartial')::numeric, (t.e->>'scrFail')::numeric
    from (
        select p.home_team_id as tid, p.away_team_id as opp, e from jsonb_array_elements(coalesce(p.home_box, '[]'::jsonb)) e
        union all
        select p.away_team_id, p.home_team_id, e from jsonb_array_elements(coalesce(p.away_box, '[]'::jsonb)) e
    ) t;
    get diagnostics v_rows = row_count;

    update public.game_box_header set player_rows = v_rows where room_id = p.room_id and game_id = p.game_id;
end
$fn$;

create or replace function public.trg_game_pbp_sync_box()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
    v_prev_lock_timeout text := current_setting('lock_timeout');
begin
    -- This trigger must never fail or stall the game save. Any error is swallowed (logged as a WARNING),
    -- and it refuses to wait more than 200ms for a lock on the side tables.
    begin
        perform set_config('lock_timeout', '200ms', true);
        perform public.sync_game_box(new.room_id, new.game_id);
    exception when others then
        raise warning '[game_box] sync failed room=% game=%: % (%)', new.room_id, new.game_id, sqlerrm, sqlstate;
        -- Best effort: drop older rows of this game so the per-room game count check sees it as missing
        -- (readers then fall back to the original calculation until it is refilled).
        begin
            perform set_config('lock_timeout', '200ms', true);
            delete from public.game_box_header where room_id = new.room_id and game_id = new.game_id;
        exception when others then
            raise warning '[game_box] could not clear stale rows room=% game=%: %', new.room_id, new.game_id, sqlerrm;
        end;
    end;
    perform set_config('lock_timeout', v_prev_lock_timeout, true);
    return null;
end
$fn$;

revoke all on function public.sync_game_box(uuid, text) from public, anon, authenticated;

revoke all on function public.trg_game_pbp_sync_box() from public, anon, authenticated;

drop trigger if exists game_pbp_sync_box on public.game_pbp;

create trigger game_pbp_sync_box
    after insert or update of home_box, away_box, home_team_id, away_team_id, home_score, away_score, game_start_time, ot_periods, team_misc
    on public.game_pbp
    for each row execute function public.trg_game_pbp_sync_box();

-- ── 백필 — 방 하나씩 따로 실행한다(1,300경기에 약 17초 — 한 문장에 여러 방을 묶으면 실행 제한 시간에 걸릴 수 있다). ──
-- 다시 실행해도 안전하다(경기 단위로 지우고 다시 넣음). 트리거를 만든 뒤에 실행해야 그 사이 저장된 경기가 빠지지 않는다.
-- select count(*) from (select public.sync_game_box(gp.room_id, gp.game_id) from public.game_pbp gp where gp.room_id = '<room uuid>') s;
--
-- 빠진 경기만 다시 채우기(트리거가 건너뛴 경기 복구용):
-- select count(*) from (
--     select public.sync_game_box(gp.room_id, gp.game_id)
--     from public.game_pbp gp
--     left join public.game_box_header h on h.room_id = gp.room_id and h.game_id = gp.game_id
--     where h.game_id is null
-- ) s;

-- ── 검증(적용 후 수동 실행) ──
-- 1) 빠진 경기: 방마다 game_pbp 경기 수 = game_box_header 경기 수
-- select gp.room_id, count(*) as pbp_games, count(h.game_id) as synced
-- from public.game_pbp gp left join public.game_box_header h on h.room_id = gp.room_id and h.game_id = gp.game_id group by 1;
-- 2) 합계 대조: 아래 집계가 get_player_season_stats_league(room, null, kind) 와 같아야 한다(양방향 EXCEPT = 0줄).
--    kind = false(정규시즌) / true(플레이오프) / null(합산)
-- with rev as (
--         select h.game_id
--         from public.game_box_header h
--         join public.games g on g.room_id = h.room_id and g.game_id = h.game_id
--          and g.is_allstar = false and (:kind::boolean is null or g.is_playoff = :kind::boolean)
--         where h.room_id = :room and public.game_reveal_at(h.room_id, h.game_start_time, h.ot_periods) <= now()
--     )
--     select b.player_id, count(*)::integer as g,
--            sum(b.gs) as gs, sum(b.mp) as mp, sum(b.pts) as pts, sum(b.reb) as reb,
--            sum(b.off_reb) as off_reb, sum(b.def_reb) as def_reb, sum(b.ast) as ast, sum(b.stl) as stl,
--            sum(b.blk) as blk, sum(b.tov) as tov, sum(b.tov_forced) as tov_forced, sum(b.pf) as pf,
--            sum(b.tech_fouls) as tech_fouls, sum(b.flagrant_fouls) as flagrant_fouls, sum(b.fgm) as fgm, sum(b.fga) as fga,
--            sum(b.p3m) as p3m, sum(b.p3a) as p3a, sum(b.ftm) as ftm, sum(b.fta) as fta,
--            sum(b.rim_m) as rim_m, sum(b.rim_a) as rim_a, sum(b.mid_m) as mid_m, sum(b.mid_a) as mid_a,
--            sum(b.plus_minus) as plus_minus, sum(b.contested_attempted) as contested_attempted, sum(b.contested_made) as contested_made, sum(b.def_rim_attempted) as def_rim_attempted,
--            sum(b.def_rim_made) as def_rim_made, sum(b.def_mid_attempted) as def_mid_attempted, sum(b.def_mid_made) as def_mid_made, sum(b.def_three_attempted) as def_three_attempted,
--            sum(b.def_three_made) as def_three_made, sum(b.def_ra_attempted) as def_ra_attempted, sum(b.def_ra_made) as def_ra_made, sum(b.def_itp_attempted) as def_itp_attempted,
--            sum(b.def_itp_made) as def_itp_made, sum(b.def_mid6_attempted) as def_mid6_attempted, sum(b.def_mid6_made) as def_mid6_made, sum(b.def_cnr_attempted) as def_cnr_attempted,
--            sum(b.def_cnr_made) as def_cnr_made, sum(b.def_wing_attempted) as def_wing_attempted, sum(b.def_wing_made) as def_wing_made, sum(b.def_atb_attempted) as def_atb_attempted,
--            sum(b.def_atb_made) as def_atb_made, sum(b.zone_rim_m) as zone_rim_m, sum(b.zone_rim_a) as zone_rim_a, sum(b.zone_paint_m) as zone_paint_m,
--            sum(b.zone_paint_a) as zone_paint_a, sum(b.zone_mid_l_m) as zone_mid_l_m, sum(b.zone_mid_l_a) as zone_mid_l_a, sum(b.zone_mid_c_m) as zone_mid_c_m,
--            sum(b.zone_mid_c_a) as zone_mid_c_a, sum(b.zone_mid_r_m) as zone_mid_r_m, sum(b.zone_mid_r_a) as zone_mid_r_a, sum(b.zone_c3_l_m) as zone_c3_l_m,
--            sum(b.zone_c3_l_a) as zone_c3_l_a, sum(b.zone_c3_r_m) as zone_c3_r_m, sum(b.zone_c3_r_a) as zone_c3_r_a, sum(b.zone_atb3_l_m) as zone_atb3_l_m,
--            sum(b.zone_atb3_l_a) as zone_atb3_l_a, sum(b.zone_atb3_c_m) as zone_atb3_c_m, sum(b.zone_atb3_c_a) as zone_atb3_c_a, sum(b.zone_atb3_r_m) as zone_atb3_r_m,
--            sum(b.zone_atb3_r_a) as zone_atb3_r_a, coalesce(sum(b.scr_clean), 0) as scr_clean, coalesce(sum(b.scr_partial), 0) as scr_partial, coalesce(sum(b.scr_fail), 0) as scr_fail
--     from public.game_player_box b
--     join rev on rev.game_id = b.game_id
--     where b.room_id = :room and coalesce(b.mp, 0) > 0
--     group by b.player_id
