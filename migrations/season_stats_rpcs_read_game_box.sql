-- ✅ 운영 DB 적용 완료(2026-11-13 16:40 KST, Supabase 마이그레이션 season_stats_rpcs_read_game_box). 적용 직후 7개 방에서 새 결과 = 기존 결과
-- (선수 정규/플레이오프/합산, 팀 정규/플레이오프, 상대 존, 팀별 스플릿 160명 — 차이 0). 결과·속도는 docs/plan/season-stats-speedup-plan.md §14.
-- 이 파일은 2a(정수형 전환) + 2b(조회 4개 교체)를 한 번에 담는다. 표를 다시 쓰는 몇 초 동안 경기 저장이 겹치지 않게 경기 없는 시간에 적용할 것.
-- [2026-11-12] 시즌 기록 조회 4개가 경기별·선수별 표를 읽게 교체 (docs/plan/season-stats-speedup-plan.md 방식 B, 2단계)
--
-- 대상(이름·인자·결과 열은 그대로 — 화면 코드는 바꿀 것이 없다):
--   get_player_season_stats_league / get_team_season_advanced_stats / get_player_team_splits / get_team_opponent_zone_stats
--
-- 조회 하나가 세 겹이 된다:
--   <name>         바깥(SECURITY DEFINER). ① 볼 수 있는 사람인가(방 멤버 또는 관전 허용 리그의 로그인 유저 — game_pbp RLS 와 같은 규칙)
--                  ② 방의 모든 경기가 새 표에 있는가 → 있으면 <name>_box, 없거나 _box 가 오류를 내면 <name>_legacy
--   <name>_box     새 계산. game_player_box / game_box_header 만 읽는다. 유저는 직접 부를 수 없다(접근 확인이 없으므로).
--   <name>_legacy  지금 함수의 사본(글자 하나 안 바꿈). 안전망이자 되돌릴 때의 원본.
--
-- 공개 시각: 시작한 지 리플레이 길이의 3배가 지난 경기는 공개된 것으로 보고, 그 안쪽 경기만 game_reveal_at() 으로 판정한다
-- (경계는 지금과 똑같고, 경기마다 함수를 부르던 비용 0.3ms × 1,300 이 없어진다).
--
-- 다시 실행해도 안전하다(legacy 사본은 처음 한 번만 만든다).
-- 되돌리기(이름마다): 아래 '롤백' 블록 — <name>_legacy 의 정의를 원래 이름으로 다시 만든다.

do $alt$
declare
    v_alter text;
    v_def text;
begin
    -- Whole-number columns become integer. Minutes (mp) keep their decimal.
    -- Checked in the engine: every other box score field is only ever increased by 1, by points (1/2/3) or by free-throw counts,
    -- plus/minus moves by whole points, gs is 0/1 — and all 111,171 existing rows hold whole numbers (range -53..66).
    select 'alter table public.game_player_box '
           || string_agg(format('alter column %1$I type integer using %1$I::integer', column_name), ', ' order by ordinal_position)
      into v_alter
    from information_schema.columns
    where table_schema = 'public' and table_name = 'game_player_box' and data_type = 'numeric' and column_name <> 'mp';
    if v_alter is not null then
        execute v_alter;
    end if;

    -- The sync function fills the same columns: cast to integer everywhere except minutes.
    -- A value that is not a whole number then fails the cast on purpose — the trigger leaves that game out and readers fall back.
    v_def := pg_get_functiondef('public.sync_game_box(uuid, text)'::regprocedure);
    v_def := replace(v_def, ')::numeric', ')::integer');
    v_def := replace(v_def, $k$(t.e->>'mp')::integer$k$, $k$(t.e->>'mp')::numeric$k$);
    execute v_def;
end
$alt$;

analyze public.game_player_box;

create or replace function public.can_read_room_games(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
    -- Same rule the game_pbp RLS policies apply today: a member of the room, or any signed-in user when the league allows spectators.
    -- The service key and sessions that do not come through the API (no role switched: SQL editor, scheduled jobs) are trusted.
    select coalesce(nullif(current_setting('role', true), ''), 'none') in ('none', 'service_role')
        or exists (select 1 from public.room_members rm where rm.room_id = p_room_id and rm.user_id = (select auth.uid()))
        or p_room_id in (select public.spectatable_room_ids());
$fn$;

create or replace function public.game_box_in_sync(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
    -- True when every saved game of the room has its row in game_box_header (the trigger removes the row of a game it could not sync).
    select (select count(*) from public.game_pbp gp where gp.room_id = p_room_id)
         = (select count(*) from public.game_box_header h where h.room_id = p_room_id);
$fn$;

revoke all on function public.can_read_room_games(uuid), public.game_box_in_sync(uuid) from public, anon, authenticated;

do $mig$
declare
    r record;
    v_args text; v_ident text; v_result text; v_call text;
    v_bodies jsonb := jsonb_build_object(
        'get_player_season_stats_league', $b1$
    select b.player_id, count(*)::integer,
           sum(b.gs)::numeric, sum(b.mp), sum(b.pts)::numeric, sum(b.reb)::numeric, sum(b.off_reb)::numeric,
           sum(b.def_reb)::numeric, sum(b.ast)::numeric, sum(b.stl)::numeric, sum(b.blk)::numeric, sum(b.tov)::numeric,
           sum(b.tov_forced)::numeric, sum(b.pf)::numeric, sum(b.tech_fouls)::numeric, sum(b.flagrant_fouls)::numeric, sum(b.fgm)::numeric,
           sum(b.fga)::numeric, sum(b.p3m)::numeric, sum(b.p3a)::numeric, sum(b.ftm)::numeric, sum(b.fta)::numeric,
           sum(b.rim_m)::numeric, sum(b.rim_a)::numeric, sum(b.mid_m)::numeric, sum(b.mid_a)::numeric, sum(b.plus_minus)::numeric,
           sum(b.contested_attempted)::numeric, sum(b.contested_made)::numeric, sum(b.def_rim_attempted)::numeric, sum(b.def_rim_made)::numeric, sum(b.def_mid_attempted)::numeric,
           sum(b.def_mid_made)::numeric, sum(b.def_three_attempted)::numeric, sum(b.def_three_made)::numeric, sum(b.def_ra_attempted)::numeric, sum(b.def_ra_made)::numeric,
           sum(b.def_itp_attempted)::numeric, sum(b.def_itp_made)::numeric, sum(b.def_mid6_attempted)::numeric, sum(b.def_mid6_made)::numeric, sum(b.def_cnr_attempted)::numeric,
           sum(b.def_cnr_made)::numeric, sum(b.def_wing_attempted)::numeric, sum(b.def_wing_made)::numeric, sum(b.def_atb_attempted)::numeric, sum(b.def_atb_made)::numeric,
           sum(b.zone_rim_m)::numeric, sum(b.zone_rim_a)::numeric, sum(b.zone_paint_m)::numeric, sum(b.zone_paint_a)::numeric, sum(b.zone_mid_l_m)::numeric,
           sum(b.zone_mid_l_a)::numeric, sum(b.zone_mid_c_m)::numeric, sum(b.zone_mid_c_a)::numeric, sum(b.zone_mid_r_m)::numeric, sum(b.zone_mid_r_a)::numeric,
           sum(b.zone_c3_l_m)::numeric, sum(b.zone_c3_l_a)::numeric, sum(b.zone_c3_r_m)::numeric, sum(b.zone_c3_r_a)::numeric, sum(b.zone_atb3_l_m)::numeric,
           sum(b.zone_atb3_l_a)::numeric, sum(b.zone_atb3_c_m)::numeric, sum(b.zone_atb3_c_a)::numeric, sum(b.zone_atb3_r_m)::numeric, sum(b.zone_atb3_r_a)::numeric,
           coalesce(sum(b.scr_clean), 0)::numeric, coalesce(sum(b.scr_partial), 0)::numeric, coalesce(sum(b.scr_fail), 0)::numeric
    from public.game_player_box b
    join (
        select h.game_id
        from public.game_box_header h
        join public.games gm on gm.room_id = h.room_id and gm.game_id = h.game_id
         and gm.is_allstar = false and (p_is_playoff is null or gm.is_playoff = p_is_playoff)
        where h.room_id = p_room_id
          and (h.game_start_time <= (select now() - public.room_replay_interval(p_room_id) * 3)
           or public.game_reveal_at(p_room_id, h.game_start_time, h.ot_periods) <= now())
    ) rev on rev.game_id = b.game_id
    where b.room_id = p_room_id
      and (p_player_ids is null or b.player_id = any(p_player_ids))
      and coalesce(b.mp, 0) > 0
    group by b.player_id;
$b1$,
        'get_team_season_advanced_stats', $b2$
    with gms as (
        select h.game_id, h.home_team_id, h.away_team_id, h.home_score, h.away_score, h.team_misc
        from public.game_box_header h
        join public.games gm on gm.room_id = h.room_id and gm.game_id = h.game_id
         and gm.is_allstar = false and gm.is_playoff = p_is_playoff
        where h.room_id = p_room_id
          and (h.game_start_time <= (select now() - public.room_replay_interval(p_room_id) * 3)
           or public.game_reveal_at(p_room_id, h.game_start_time, h.ot_periods) <= now())
    ),
    tb as (
        select b.game_id, b.team_id,
               coalesce(sum(b.fga), 0)::numeric as fga, coalesce(sum(b.fgm), 0)::numeric as fgm, coalesce(sum(b.fta), 0)::numeric as fta,
               coalesce(sum(b.off_reb), 0)::numeric as oreb, coalesce(sum(b.def_reb), 0)::numeric as dreb, coalesce(sum(b.tov), 0)::numeric as tov,
               coalesce(sum(b.stl), 0)::numeric as stl, coalesce(sum(b.mp), 0) as mp
        from public.game_player_box b
        join gms on gms.game_id = b.game_id
        where b.room_id = p_room_id
        group by b.game_id, b.team_id
    ),
    game_box as (
        select h.home_team_id, h.away_team_id,
               h.home_score::numeric as home_pts, h.away_score::numeric as away_pts,
               (h.team_misc->'home'->>'potv')::numeric as h_potv, (h.team_misc->'home'->>'fbps')::numeric as h_fbps,
               (h.team_misc->'home'->>'pitp')::numeric as h_pitp, (h.team_misc->'home'->>'spts')::numeric as h_spts,
               (h.team_misc->'away'->>'potv')::numeric as a_potv, (h.team_misc->'away'->>'fbps')::numeric as a_fbps,
               (h.team_misc->'away'->>'pitp')::numeric as a_pitp, (h.team_misc->'away'->>'spts')::numeric as a_spts,
               coalesce(hb.fga, 0) as h_fga, coalesce(hb.fgm, 0) as h_fgm, coalesce(hb.fta, 0) as h_fta, coalesce(hb.oreb, 0) as h_oreb, coalesce(hb.dreb, 0) as h_dreb, coalesce(hb.tov, 0) as h_tov, coalesce(hb.stl, 0) as h_stl, coalesce(hb.mp, 0) as h_mp,
               coalesce(ab.fga, 0) as a_fga, coalesce(ab.fgm, 0) as a_fgm, coalesce(ab.fta, 0) as a_fta, coalesce(ab.oreb, 0) as a_oreb, coalesce(ab.dreb, 0) as a_dreb, coalesce(ab.tov, 0) as a_tov, coalesce(ab.stl, 0) as a_stl, coalesce(ab.mp, 0) as a_mp
        from gms h
        left join tb hb on hb.game_id = h.game_id and hb.team_id = h.home_team_id
        left join tb ab on ab.game_id = h.game_id and ab.team_id = h.away_team_id
    ),
    game_poss as (
        select *,
               0.5 * (
                   (h_fga + 0.4*h_fta - 1.07*(h_oreb / NULLIF(h_oreb + a_dreb, 0)) * (h_fga - h_fgm) + h_tov)
                 + (a_fga + 0.4*a_fta - 1.07*(a_oreb / NULLIF(a_oreb + h_dreb, 0)) * (a_fga - a_fgm) + a_tov)
               ) as gposs,
               GREATEST(h_mp, a_mp) / 5.0 as team_minutes
        from game_box
    ),
    team_rows as (
        select home_team_id as tid, home_pts as pts, away_pts as opp_pts, gposs, team_minutes,
               h_mp as mp, h_fga as fga, h_fta as fta, h_tov as tov, h_stl as stl,
               h_potv as potv, h_fbps as fbps, h_pitp as pitp, h_spts as spts
        from game_poss
        union all
        select away_team_id, away_pts, home_pts, gposs, team_minutes,
               a_mp, a_fga, a_fta, a_tov, a_stl,
               a_potv, a_fbps, a_pitp, a_spts
        from game_poss
    )
    select
        tid as team_id,
        count(*)::integer as g,
        (sum(pts) / count(*))::numeric as ppg,
        (sum(opp_pts) / count(*))::numeric as oppg,
        (sum(gposs) / count(*))::numeric as poss,
        (48 * sum(gposs) / NULLIF(sum(team_minutes), 0))::numeric as pace,
        (100 * sum(pts) / NULLIF(sum(gposs), 0))::numeric as off_rtg,
        (100 * sum(opp_pts) / NULLIF(sum(gposs), 0))::numeric as def_rtg,
        (100 * (sum(pts) - sum(opp_pts)) / NULLIF(sum(gposs), 0))::numeric as net_rtg,
        (sum(tov) / NULLIF(sum(fga) + 0.44 * sum(fta) + sum(tov), 0))::numeric as tov_pct,
        (sum(stl) / NULLIF(sum(gposs), 0))::numeric as stl_pct,
        sum(gposs)::numeric as poss_total,
        sum(mp)::numeric as mp_total,
        sum(fga)::numeric as fga,
        sum(fta)::numeric as fta,
        sum(tov)::numeric as tov,
        avg(potv)::numeric as potv,
        avg(fbps)::numeric as fbps,
        avg(pitp)::numeric as pitp,
        avg(spts)::numeric as spts
    from team_rows
    group by tid;
$b2$,
        'get_player_team_splits', $b3$
    select b.team_id, gm.is_playoff, min(h.game_start_time), count(*)::integer,
           sum(b.gs)::numeric, sum(b.mp), sum(b.pts)::numeric, sum(b.reb)::numeric, sum(b.off_reb)::numeric, sum(b.def_reb)::numeric,
           sum(b.ast)::numeric, sum(b.stl)::numeric, sum(b.blk)::numeric, sum(b.tov)::numeric, sum(b.pf)::numeric, sum(b.fgm)::numeric,
           sum(b.fga)::numeric, sum(b.p3m)::numeric, sum(b.p3a)::numeric, sum(b.ftm)::numeric, sum(b.fta)::numeric, sum(b.contested_attempted)::numeric,
           sum(b.contested_made)::numeric
    from public.game_player_box b
    join public.game_box_header h on h.room_id = b.room_id and h.game_id = b.game_id
    join public.games gm on gm.room_id = b.room_id and gm.game_id = b.game_id and gm.is_allstar = false
    where b.room_id = p_room_id
      and b.player_id = p_player_id::uuid
      and (h.game_start_time <= (select now() - public.room_replay_interval(p_room_id) * 3)
           or public.game_reveal_at(p_room_id, h.game_start_time, h.ot_periods) <= now())
      and coalesce(b.mp, 0) > 0
    group by b.team_id, gm.is_playoff;
$b3$,
        'get_team_opponent_zone_stats', $b4$
    select b.opp_team_id,
           coalesce(sum(b.zone_rim_m), 0)::numeric, coalesce(sum(b.zone_rim_a), 0)::numeric, coalesce(sum(b.zone_paint_m), 0)::numeric,
           coalesce(sum(b.zone_paint_a), 0)::numeric, coalesce(sum(b.zone_mid_l_m), 0)::numeric, coalesce(sum(b.zone_mid_l_a), 0)::numeric,
           coalesce(sum(b.zone_mid_c_m), 0)::numeric, coalesce(sum(b.zone_mid_c_a), 0)::numeric, coalesce(sum(b.zone_mid_r_m), 0)::numeric,
           coalesce(sum(b.zone_mid_r_a), 0)::numeric, coalesce(sum(b.zone_c3_l_m), 0)::numeric, coalesce(sum(b.zone_c3_l_a), 0)::numeric,
           coalesce(sum(b.zone_c3_r_m), 0)::numeric, coalesce(sum(b.zone_c3_r_a), 0)::numeric, coalesce(sum(b.zone_atb3_l_m), 0)::numeric,
           coalesce(sum(b.zone_atb3_l_a), 0)::numeric, coalesce(sum(b.zone_atb3_c_m), 0)::numeric, coalesce(sum(b.zone_atb3_c_a), 0)::numeric,
           coalesce(sum(b.zone_atb3_r_m), 0)::numeric, coalesce(sum(b.zone_atb3_r_a), 0)::numeric
    from public.game_player_box b
    join public.game_box_header h on h.room_id = b.room_id and h.game_id = b.game_id
    where b.room_id = p_room_id
      and (h.game_start_time <= (select now() - public.room_replay_interval(p_room_id) * 3)
           or public.game_reveal_at(p_room_id, h.game_start_time, h.ot_periods) <= now())
    group by b.opp_team_id;
$b4$);
    v_wrapper text := $w$
#variable_conflict use_column
begin
    -- 1) who may read: room members and spectators only (the side tables cannot be read directly)
    if not public.can_read_room_games(p_room_id) then
        return;
    end if;
    -- 2) fast path: per-player rows. Used only when every game of the room is present in them.
    if public.game_box_in_sync(p_room_id) then
        begin
            return query select * from public.%1$s_box(%2$s);
            return;
        exception when others then
            raise warning '[game_box] %1$s fell back to the JSON scan: %% (%%)', sqlerrm, sqlstate;
        end;
    end if;
    -- 3) original calculation (kept unchanged as %1$s_legacy)
    return query select * from public.%1$s_legacy(%2$s);
end
$w$;
begin
    for r in
        select p.oid, p.proname, p.prosecdef, p.proargnames, p.proargmodes
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in (select jsonb_object_keys(v_bodies))
    loop
        -- signature and result columns are taken from the live function, so they cannot drift
        v_args := pg_get_function_arguments(r.oid);
        v_ident := pg_get_function_identity_arguments(r.oid);
        v_result := pg_get_function_result(r.oid);
        select string_agg(quote_ident(a.n), ', ' order by a.ord) into v_call
        from unnest(r.proargnames, r.proargmodes::text[]) with ordinality as a(n, m, ord)
        where a.m = 'i';

        -- 1) keep the current function, byte for byte, as <name>_legacy. Only on the first run:
        --    once the name holds the new wrapper (security definer) it must not overwrite the copy.
        if not r.prosecdef and not exists (select 1 from pg_proc p2 join pg_namespace n2 on n2.oid = p2.pronamespace where n2.nspname = 'public' and p2.proname = r.proname || '_legacy') then
            execute replace(pg_get_functiondef(r.oid),
                            'FUNCTION public.' || r.proname || '(', 'FUNCTION public.' || r.proname || '_legacy(');
        end if;
        if not exists (select 1 from pg_proc p2 join pg_namespace n2 on n2.oid = p2.pronamespace where n2.nspname = 'public' and p2.proname = r.proname || '_legacy') then
            raise exception 'legacy copy of % is missing — refusing to replace it', r.proname;
        end if;

        -- 2) new implementation over game_player_box / game_box_header (not callable by users: it has no access check)
        execute format('create or replace function public.%I(%s) returns %s language sql stable set search_path to ''public'' as %L',
                       r.proname || '_box', v_args, v_result, v_bodies->>r.proname);
        execute format('revoke all on function public.%I(%s) from public, anon, authenticated', r.proname || '_box', v_ident);

        -- 3) the public name: access check -> fast path -> original calculation
        execute format('create or replace function public.%I(%s) returns %s language plpgsql stable security definer set search_path to ''public'' as %L',
                       r.proname, v_args, v_result, format(v_wrapper, r.proname, v_call));
    end loop;
end
$mig$;

-- ── 롤백 ──
-- do $$
-- declare r record;
-- begin
--     for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--              where n.nspname = 'public' and p.proname in ('get_player_season_stats_league_legacy', 'get_team_season_advanced_stats_legacy',
--                                                             'get_player_team_splits_legacy', 'get_team_opponent_zone_stats_legacy') loop
--         execute replace(pg_get_functiondef(r.oid), 'FUNCTION public.' || r.proname || '(',
--                         'FUNCTION public.' || left(r.proname, length(r.proname) - 7) || '(');
--     end loop;
-- end $$;
-- (사본·_box·도우미 함수는 남겨 둬도 무해하다. 지우려면 drop function … 으로.)
