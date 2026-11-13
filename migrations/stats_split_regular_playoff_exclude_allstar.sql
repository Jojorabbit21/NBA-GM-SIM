-- [2026-11-13] 기록 조회 4종 — 정규시즌·플레이오프 분리 + 이벤트 경기(올스타·라이징 스타) 제외
-- ✅ 운영 DB 적용 완료(2026-11-13, Supabase 마이그레이션 stats_split_regular_playoff_exclude_allstar). 사전 점검·결과는 docs/history/dev-log.md 같은 날짜 항목.
--
-- 1) get_league_season_awards_stats    시즌 어워드 투표용 기록. is_playoff = false 만 걸러 올스타·라이징 스타 경기가 섞였다 → is_allstar = false 추가.
-- 2) get_player_shot_events            선수 프로필 샷 차트. 이벤트 경기를 빼고, 슛마다 isPlayoff 를 붙여 화면이 정규/플레이오프를 나눠 볼 수 있게 한다.
-- 3) get_team_opponent_zone_stats      전술 화면 CONTEST. 경기 종류 구분이 없었다(정규+플레이오프+이벤트 합산) → p_is_playoff 인자(기본 false = 정규시즌).
--                                      인자가 늘어나므로 래퍼·_box·_legacy 세 겹을 모두 새 시그니처로 다시 만든다.
-- 4) get_team_playtype_stats           전술 화면 PPP. p_include_playoffs(기본 true)로는 플레이오프만 볼 수 없었다 → p_is_playoff 인자 추가
--                                      (null = 예전 동작 그대로, false = 정규시즌만, true = 플레이오프만).
--
-- 3)·4)는 인자 목록이 바뀌어 create or replace 로는 안 된다(같은 이름의 함수가 둘이 되어 인자 하나짜리 호출이 모호해짐) —
-- 같은 트랜잭션에서 옛 함수를 지우고 새로 만든다. 새 인자는 모두 기본값이 있어 예전 방식 호출(p_room_id 만)도 그대로 동작한다.
-- 다시 실행해도 안전하다(옛 시그니처가 남아 있을 때만 교체).
--
-- 롤백: 1)·2)는 migrations/add_overtime_reveal_delay.sql(어워드 기록의 직전 정의) · migrations/player_shot_events_rpc.sql 의 정의로 create or replace.
--       3)은 새 시그니처 3개를 drop 한 뒤 migrations/add_player_season_stats_league_rpc.sql(원본) → season_stats_rpcs_read_game_box.sql 순으로 다시 적용.
--       4)는 새 함수를 drop 하고 migrations/add_team_playtype_stats.sql 의 마지막 정의를 다시 만든다.

-- ── 1) season awards: regular season only (no playoffs, no all-star / Rising Stars games) ──
create or replace function public.get_league_season_awards_stats(p_room_id uuid)
returns table(player_id uuid, g integer, gs integer, mp numeric, pts numeric, reb numeric, off_reb numeric, def_reb numeric, ast numeric, stl numeric, blk numeric, tov numeric, tov_forced numeric, pf numeric, fgm numeric, fga numeric, p3m numeric, p3a numeric, ftm numeric, fta numeric, contested_attempted numeric, contested_made numeric)
language sql
stable
set search_path to 'public'
as $fn$
    SELECT
        (elem->>'playerId')::uuid AS player_id,
        count(*)::integer                       AS g,
        sum(COALESCE((elem->>'gs')::numeric, 0))::integer AS gs,
        sum((elem->>'mp')::numeric)              AS mp,
        sum((elem->>'pts')::numeric)             AS pts,
        sum((elem->>'reb')::numeric)             AS reb,
        sum((elem->>'offReb')::numeric)          AS off_reb,
        sum((elem->>'defReb')::numeric)          AS def_reb,
        sum((elem->>'ast')::numeric)             AS ast,
        sum((elem->>'stl')::numeric)             AS stl,
        sum((elem->>'blk')::numeric)             AS blk,
        sum((elem->>'tov')::numeric)             AS tov,
        sum(COALESCE((elem->>'tovForced')::numeric, 0)) AS tov_forced,
        sum(COALESCE((elem->>'pf')::numeric, 0)) AS pf,
        sum((elem->>'fgm')::numeric)             AS fgm,
        sum((elem->>'fga')::numeric)             AS fga,
        sum((elem->>'p3m')::numeric)             AS p3m,
        sum((elem->>'p3a')::numeric)             AS p3a,
        sum((elem->>'ftm')::numeric)             AS ftm,
        sum((elem->>'fta')::numeric)             AS fta,
        sum(COALESCE((elem->>'contestedAttempted')::numeric, 0)) AS contested_attempted,
        sum(COALESCE((elem->>'contestedMade')::numeric, 0))      AS contested_made
    FROM public.game_pbp gp
    JOIN public.games g
      ON g.room_id = gp.room_id AND g.game_id = gp.game_id AND g.is_playoff = false AND g.is_allstar = false
    CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(gp.home_box, '[]'::jsonb) || COALESCE(gp.away_box, '[]'::jsonb)
    ) AS elem
    WHERE gp.room_id = p_room_id
      AND public.game_reveal_at(p_room_id, gp.game_start_time, gp.ot_periods) <= now()
      AND COALESCE((elem->>'mp')::numeric, 0) > 0
    GROUP BY (elem->>'playerId')::uuid;
$fn$;

-- ── 2) shot events: no all-star games, each shot tagged with isPlayoff ──
create or replace function public.get_player_shot_events(p_room_id uuid, p_player_id text)
returns setof jsonb
language sql
stable
set search_path to 'public'
as $fn$
  select elem || jsonb_build_object('homeTeamId', gp.home_team_id, 'awayTeamId', gp.away_team_id, 'isPlayoff', g.is_playoff)
  from game_pbp gp
  join games g on g.room_id = gp.room_id and g.game_id = gp.game_id and g.is_allstar = false
  cross join lateral jsonb_array_elements(gp.shot_events) as elem
  where gp.room_id = p_room_id
    and gp.shot_events is not null
    and gp.game_start_time is not null
    and public.game_reveal_at(p_room_id, gp.game_start_time, gp.ot_periods) <= now()
    and elem->>'playerId' = p_player_id;
$fn$;

-- ── 3) opponent zone stats: one kind of game at a time (p_is_playoff, default false = regular season) ──
do $mig$
declare
    v_result text;
    v_legacy text;
    v_anchor constant text := 'WHERE gp.room_id = p_room_id';
    v_old_sig constant text := 'get_team_opponent_zone_stats_legacy(p_room_id uuid)';
begin
    if to_regprocedure('public.get_team_opponent_zone_stats(uuid)') is null then
        return;   -- already migrated
    end if;
    v_result := pg_get_function_result('public.get_team_opponent_zone_stats(uuid)'::regprocedure);

    -- original JSON-scan calculation, now restricted to one kind of game (still the fallback when a room is not fully synced)
    v_legacy := pg_get_functiondef('public.get_team_opponent_zone_stats_legacy(uuid)'::regprocedure);
    if (length(v_legacy) - length(replace(v_legacy, v_anchor, ''))) / length(v_anchor) <> 1
       or position(v_old_sig in v_legacy) = 0 then
        raise exception 'get_team_opponent_zone_stats_legacy does not look like the expected definition — refusing to rewrite it';
    end if;
    v_legacy := replace(v_legacy, v_old_sig, 'get_team_opponent_zone_stats_legacy(p_room_id uuid, p_is_playoff boolean DEFAULT false)');
    v_legacy := replace(v_legacy, v_anchor, v_anchor || '
          AND EXISTS (SELECT 1 FROM public.games g WHERE g.room_id = gp.room_id AND g.game_id = gp.game_id
                        AND g.is_allstar = false AND g.is_playoff = p_is_playoff)');

    drop function public.get_team_opponent_zone_stats(uuid);
    drop function public.get_team_opponent_zone_stats_box(uuid);
    drop function public.get_team_opponent_zone_stats_legacy(uuid);

    execute v_legacy;

    execute format('create function public.get_team_opponent_zone_stats_box(p_room_id uuid, p_is_playoff boolean default false) returns %s language sql stable set search_path to ''public'' as %L',
                   v_result, $box$
    select b.opp_team_id,
           coalesce(sum(b.zone_rim_m), 0)::numeric, coalesce(sum(b.zone_rim_a), 0)::numeric, coalesce(sum(b.zone_paint_m), 0)::numeric,
           coalesce(sum(b.zone_paint_a), 0)::numeric, coalesce(sum(b.zone_mid_l_m), 0)::numeric, coalesce(sum(b.zone_mid_l_a), 0)::numeric,
           coalesce(sum(b.zone_mid_c_m), 0)::numeric, coalesce(sum(b.zone_mid_c_a), 0)::numeric, coalesce(sum(b.zone_mid_r_m), 0)::numeric,
           coalesce(sum(b.zone_mid_r_a), 0)::numeric, coalesce(sum(b.zone_c3_l_m), 0)::numeric, coalesce(sum(b.zone_c3_l_a), 0)::numeric,
           coalesce(sum(b.zone_c3_r_m), 0)::numeric, coalesce(sum(b.zone_c3_r_a), 0)::numeric, coalesce(sum(b.zone_atb3_l_m), 0)::numeric,
           coalesce(sum(b.zone_atb3_l_a), 0)::numeric, coalesce(sum(b.zone_atb3_c_m), 0)::numeric, coalesce(sum(b.zone_atb3_c_a), 0)::numeric,
           coalesce(sum(b.zone_atb3_r_m), 0)::numeric, coalesce(sum(b.zone_atb3_r_a), 0)::numeric
    from public.game_player_box b
    join (
        select h.game_id
        from public.game_box_header h
        join public.games gm on gm.room_id = h.room_id and gm.game_id = h.game_id
         and gm.is_allstar = false and gm.is_playoff = p_is_playoff
        where h.room_id = p_room_id
          and (h.game_start_time <= (select now() - public.room_replay_interval(p_room_id) * 3)
           or public.game_reveal_at(p_room_id, h.game_start_time, h.ot_periods) <= now())
    ) rev on rev.game_id = b.game_id
    where b.room_id = p_room_id
    group by b.opp_team_id;
$box$);
    revoke all on function public.get_team_opponent_zone_stats_box(uuid, boolean) from public, anon, authenticated;

    execute format('create function public.get_team_opponent_zone_stats(p_room_id uuid, p_is_playoff boolean default false) returns %s language plpgsql stable security definer set search_path to ''public'' as %L',
                   v_result, $w$
#variable_conflict use_column
begin
    -- 1) who may read: room members and spectators only (the side tables cannot be read directly)
    if not public.can_read_room_games(p_room_id) then
        return;
    end if;
    -- 2) fast path: per-player rows. Used only when every game of the room is present in them.
    if public.game_box_in_sync(p_room_id) then
        begin
            return query select * from public.get_team_opponent_zone_stats_box(p_room_id, p_is_playoff);
            return;
        exception when others then
            raise warning '[game_box] get_team_opponent_zone_stats fell back to the JSON scan: % (%)', sqlerrm, sqlstate;
        end;
    end if;
    -- 3) original calculation
    return query select * from public.get_team_opponent_zone_stats_legacy(p_room_id, p_is_playoff);
end
$w$);
end
$mig$;

-- ── 4) play type stats: p_is_playoff picks one kind (null keeps the old p_include_playoffs behaviour) ──
do $mig$
begin
    if to_regprocedure('public.get_team_playtype_stats(uuid, integer, boolean)') is not null then
        drop function public.get_team_playtype_stats(uuid, integer, boolean);
    end if;
end
$mig$;

create or replace function public.get_team_playtype_stats(
    p_room_id uuid,
    p_season_number integer default null,
    p_include_playoffs boolean default true,
    p_is_playoff boolean default null
)
returns table (team_id text, play_type text, poss bigint, pts bigint, fga bigint, fgm bigint, fta bigint, tov bigint, estimated_games bigint)
language sql
stable
set search_path to 'public'
as $fn$
    select t.team_id, t.play_type,
           sum(t.poss), sum(t.pts), sum(t.fga), sum(t.fgm), sum(t.fta), sum(t.tov),
           count(distinct t.game_id) filter (where t.is_estimated)
    from team_playtype_stats t
    where t.room_id = p_room_id
      and t.season_number is not distinct from coalesce(p_season_number, (select r.season_number from rooms r where r.id = p_room_id))
      and case when p_is_playoff is null then (p_include_playoffs or not t.is_playoff) else t.is_playoff = p_is_playoff end
    group by t.team_id, t.play_type
$fn$;

notify pgrst, 'reload schema';
