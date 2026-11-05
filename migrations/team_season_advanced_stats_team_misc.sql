-- ============================================================
-- get_team_season_advanced_stats — 팀 미스크 득점 4종(POTV/FBPS/PITP/SPTS) 경기당 평균 추가
--
-- 배경 (2026-11-05): game_pbp.team_misc(migrations/game_pbp_team_misc.sql)를 팀별로 평균 내 반환 컬럼 4개 추가
-- (potv, fbps, pitp, spts). 리더보드 팀 화면·전술 인사이트가 teamAdvanced로 받아 쓴다.
-- 기준 정의는 배포본(2026-11-05 조회) — 공개 조건은 game_reveal_at(p_room_id, game_start_time, ot_periods)로,
-- unify_team_season_advanced_stats_rpc.sql 파일의 room_replay_interval 조건은 이미 배포본과 어긋나 있었다(이 파일이 최신).
-- 반환 컬럼이 늘어 DROP 후 재생성(같은 파라미터 시그니처, 오버로드 공존 방지).
--
-- 롤백: DROP FUNCTION public.get_team_season_advanced_stats(uuid, boolean); 후 이 파일에서 potv/fbps/pitp/spts 관련 줄을 뺀 버전으로 재생성.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_team_season_advanced_stats(uuid, boolean);

CREATE OR REPLACE FUNCTION public.get_team_season_advanced_stats(
    p_room_id uuid, p_is_playoff boolean DEFAULT false
)
 RETURNS TABLE (
    team_id    text,
    g          integer,
    ppg        numeric,
    oppg       numeric,
    poss       numeric,
    pace       numeric,
    off_rtg    numeric,
    def_rtg    numeric,
    net_rtg    numeric,
    tov_pct    numeric,
    stl_pct    numeric,
    poss_total numeric,
    mp_total   numeric,
    fga        numeric,
    fta        numeric,
    tov        numeric,
    potv       numeric,
    fbps       numeric,
    pitp       numeric,
    spts       numeric
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    WITH game_box AS (
        SELECT
            gp.home_team_id, gp.away_team_id,
            gp.home_score::numeric AS home_pts, gp.away_score::numeric AS away_pts,
            (gp.team_misc->'home'->>'potv')::numeric AS h_potv, (gp.team_misc->'home'->>'fbps')::numeric AS h_fbps,
            (gp.team_misc->'home'->>'pitp')::numeric AS h_pitp, (gp.team_misc->'home'->>'spts')::numeric AS h_spts,
            (gp.team_misc->'away'->>'potv')::numeric AS a_potv, (gp.team_misc->'away'->>'fbps')::numeric AS a_fbps,
            (gp.team_misc->'away'->>'pitp')::numeric AS a_pitp, (gp.team_misc->'away'->>'spts')::numeric AS a_spts,
            h.fga AS h_fga, h.fgm AS h_fgm, h.fta AS h_fta, h.oreb AS h_oreb, h.dreb AS h_dreb, h.tov AS h_tov, h.stl AS h_stl, h.mp AS h_mp,
            a.fga AS a_fga, a.fgm AS a_fgm, a.fta AS a_fta, a.oreb AS a_oreb, a.dreb AS a_dreb, a.tov AS a_tov, a.stl AS a_stl, a.mp AS a_mp
        FROM game_pbp gp
        JOIN games gm
          ON gm.room_id = gp.room_id AND gm.game_id = gp.game_id
         AND gm.is_allstar = false AND gm.is_playoff = p_is_playoff
        CROSS JOIN LATERAL (
            SELECT
                COALESCE(sum((e->>'fga')::numeric), 0)    AS fga,
                COALESCE(sum((e->>'fgm')::numeric), 0)    AS fgm,
                COALESCE(sum((e->>'fta')::numeric), 0)    AS fta,
                COALESCE(sum((e->>'offReb')::numeric), 0) AS oreb,
                COALESCE(sum((e->>'defReb')::numeric), 0) AS dreb,
                COALESCE(sum((e->>'tov')::numeric), 0)    AS tov,
                COALESCE(sum((e->>'stl')::numeric), 0)    AS stl,
                COALESCE(sum((e->>'mp')::numeric), 0)     AS mp
            FROM jsonb_array_elements(gp.home_box) e
        ) h
        CROSS JOIN LATERAL (
            SELECT
                COALESCE(sum((e->>'fga')::numeric), 0)    AS fga,
                COALESCE(sum((e->>'fgm')::numeric), 0)    AS fgm,
                COALESCE(sum((e->>'fta')::numeric), 0)    AS fta,
                COALESCE(sum((e->>'offReb')::numeric), 0) AS oreb,
                COALESCE(sum((e->>'defReb')::numeric), 0) AS dreb,
                COALESCE(sum((e->>'tov')::numeric), 0)    AS tov,
                COALESCE(sum((e->>'stl')::numeric), 0)    AS stl,
                COALESCE(sum((e->>'mp')::numeric), 0)     AS mp
            FROM jsonb_array_elements(gp.away_box) e
        ) a
        WHERE gp.room_id = p_room_id
          AND public.game_reveal_at(p_room_id, gp.game_start_time, gp.ot_periods) <= now()
    ),
    game_poss AS (
        SELECT
            *,
            0.5 * (
                (h_fga + 0.4*h_fta - 1.07*(h_oreb / NULLIF(h_oreb + a_dreb, 0)) * (h_fga - h_fgm) + h_tov)
              + (a_fga + 0.4*a_fta - 1.07*(a_oreb / NULLIF(a_oreb + h_dreb, 0)) * (a_fga - a_fgm) + a_tov)
            ) AS gposs,
            GREATEST(h_mp, a_mp) / 5.0 AS team_minutes
        FROM game_box
    ),
    team_rows AS (
        SELECT home_team_id AS tid, home_pts AS pts, away_pts AS opp_pts, gposs, team_minutes,
               h_mp AS mp, h_fga AS fga, h_fta AS fta, h_tov AS tov, h_stl AS stl,
               h_potv AS potv, h_fbps AS fbps, h_pitp AS pitp, h_spts AS spts
        FROM game_poss
        UNION ALL
        SELECT away_team_id, away_pts, home_pts, gposs, team_minutes,
               a_mp, a_fga, a_fta, a_tov, a_stl,
               a_potv, a_fbps, a_pitp, a_spts
        FROM game_poss
    )
    SELECT
        tid AS team_id,
        count(*)::integer AS g,
        (sum(pts) / count(*))::numeric AS ppg,
        (sum(opp_pts) / count(*))::numeric AS oppg,
        (sum(gposs) / count(*))::numeric AS poss,
        (48 * sum(gposs) / NULLIF(sum(team_minutes), 0))::numeric AS pace,
        (100 * sum(pts) / NULLIF(sum(gposs), 0))::numeric AS off_rtg,
        (100 * sum(opp_pts) / NULLIF(sum(gposs), 0))::numeric AS def_rtg,
        (100 * (sum(pts) - sum(opp_pts)) / NULLIF(sum(gposs), 0))::numeric AS net_rtg,
        (sum(tov) / NULLIF(sum(fga) + 0.44 * sum(fta) + sum(tov), 0))::numeric AS tov_pct,
        (sum(stl) / NULLIF(sum(gposs), 0))::numeric AS stl_pct,
        sum(gposs)::numeric AS poss_total,
        sum(mp)::numeric AS mp_total,
        sum(fga)::numeric AS fga,
        sum(fta)::numeric AS fta,
        sum(tov)::numeric AS tov,
        avg(potv)::numeric AS potv,   -- 경기당 평균 — team_misc가 없는 경기(NULL)는 평균에서 제외
        avg(fbps)::numeric AS fbps,
        avg(pitp)::numeric AS pitp,
        avg(spts)::numeric AS spts
    FROM team_rows
    GROUP BY tid;
$function$;
