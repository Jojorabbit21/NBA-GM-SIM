-- ============================================================
-- get_player_season_stats_league에 p_is_playoff 파라미터 추가
--
-- 배경: 멀티리그 리더보드(MultiLeaderboardView.tsx)의 "플레이오프" 토글이 항상 0으로만
-- 나오는 버그. 원인: buildLeagueTeams.ts가 이 RPC 결과를 player.stats에만 채우고
-- player.playoffStats는 세팅한 적이 없는데, useLeaderboardData.ts는 토글이 playoff일 때
-- p.playoffStats(항상 undefined)를 읽어서 매번 0으로 폴백했다. 근본 원인은 이 RPC 자체가
-- is_allstar=false 조인만 있고(2026-09-09 add_is_allstar_to_games.sql에서 추가) is_playoff
-- 구분이 아예 없어서, 정규시즌/플레이오프를 애초에 나눠 가져올 방법이 없었다는 것.
--
-- 형제 RPC 패턴(add_pf_to_awards_rpc.sql, add_league_player_awards.sql의
-- get_league_season_awards_stats: JOIN games g ON ... AND g.is_playoff = false)을 참고해
-- p_is_playoff boolean DEFAULT false 파라미터를 추가한다. 기본값 false라 기존 호출부
-- (5개 화면: 홈/트레이드/선수상세/전술/리더보드 정규시즌)는 인자를 안 바꿔도 그대로 동작 —
-- 리더보드만 playoff=true로 한 번 더 호출해서 player.playoffStats를 채운다.
-- ============================================================

-- [주의] 파라미터 개수가 바뀌면(2개→3개) CREATE OR REPLACE가 기존 2-파라미터 함수를
-- 대체하지 않고 오버로드로 새로 만들어버린다 — PostgREST가 2개 인자로 호출할 때 두 함수
-- 시그니처(2개짜리 원본 vs 3번째가 기본값인 3개짜리 신규)가 동시에 매치돼 "function ...
-- is not unique" 에러가 난다(이 프로젝트에서 이미 겪은 패턴, add_gs_to_awards_rpc_drop_first
-- 참고). 반드시 먼저 DROP 하고 새로 만든다.
DROP FUNCTION IF EXISTS public.get_player_season_stats_league(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.get_player_season_stats_league(
    p_room_id uuid, p_player_ids uuid[], p_is_playoff boolean DEFAULT false
)
 RETURNS TABLE (
    player_id uuid,
    g   integer,
    gs  numeric,
    mp  numeric,
    pts numeric,
    reb numeric,
    off_reb numeric,
    def_reb numeric,
    ast numeric,
    stl numeric,
    blk numeric,
    tov numeric,
    tov_forced numeric,
    pf  numeric,
    tech_fouls numeric,
    flagrant_fouls numeric,
    fgm numeric,
    fga numeric,
    p3m numeric,
    p3a numeric,
    ftm numeric,
    fta numeric,
    rim_m numeric,
    rim_a numeric,
    mid_m numeric,
    mid_a numeric,
    plus_minus numeric,
    contested_attempted numeric,
    contested_made numeric,
    def_rim_attempted   numeric,
    def_rim_made        numeric,
    def_mid_attempted   numeric,
    def_mid_made        numeric,
    def_three_attempted numeric,
    def_three_made      numeric,
    def_ra_attempted   numeric,
    def_ra_made        numeric,
    def_itp_attempted  numeric,
    def_itp_made       numeric,
    def_mid6_attempted  numeric,
    def_mid6_made       numeric,
    def_cnr_attempted  numeric,
    def_cnr_made       numeric,
    def_wing_attempted numeric,
    def_wing_made      numeric,
    def_atb_attempted  numeric,
    def_atb_made       numeric,
    zone_rim_m    numeric,
    zone_rim_a    numeric,
    zone_paint_m  numeric,
    zone_paint_a  numeric,
    zone_mid_l_m  numeric,
    zone_mid_l_a  numeric,
    zone_mid_c_m  numeric,
    zone_mid_c_a  numeric,
    zone_mid_r_m  numeric,
    zone_mid_r_a  numeric,
    zone_c3_l_m   numeric,
    zone_c3_l_a   numeric,
    zone_c3_r_m   numeric,
    zone_c3_r_a   numeric,
    zone_atb3_l_m numeric,
    zone_atb3_l_a numeric,
    zone_atb3_c_m numeric,
    zone_atb3_c_a numeric,
    zone_atb3_r_m numeric,
    zone_atb3_r_a numeric
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT
        (elem->>'playerId')::uuid AS player_id,
        count(*)::integer                                    AS g,
        sum((elem->>'gs')::numeric)                          AS gs,
        sum((elem->>'mp')::numeric)                          AS mp,
        sum((elem->>'pts')::numeric)                         AS pts,
        sum((elem->>'reb')::numeric)                         AS reb,
        sum((elem->>'offReb')::numeric)                      AS off_reb,
        sum((elem->>'defReb')::numeric)                      AS def_reb,
        sum((elem->>'ast')::numeric)                         AS ast,
        sum((elem->>'stl')::numeric)                         AS stl,
        sum((elem->>'blk')::numeric)                         AS blk,
        sum((elem->>'tov')::numeric)                         AS tov,
        sum((elem->>'tovForced')::numeric)                   AS tov_forced,
        sum((elem->>'pf')::numeric)                          AS pf,
        sum((elem->>'techFouls')::numeric)                   AS tech_fouls,
        sum((elem->>'flagrantFouls')::numeric)               AS flagrant_fouls,
        sum((elem->>'fgm')::numeric)                         AS fgm,
        sum((elem->>'fga')::numeric)                         AS fga,
        sum((elem->>'p3m')::numeric)                         AS p3m,
        sum((elem->>'p3a')::numeric)                         AS p3a,
        sum((elem->>'ftm')::numeric)                         AS ftm,
        sum((elem->>'fta')::numeric)                         AS fta,
        sum((elem->>'rimM')::numeric)                        AS rim_m,
        sum((elem->>'rimA')::numeric)                        AS rim_a,
        sum((elem->>'midM')::numeric)                        AS mid_m,
        sum((elem->>'midA')::numeric)                        AS mid_a,
        sum((elem->>'plusMinus')::numeric)                   AS plus_minus,
        sum((elem->>'contestedAttempted')::numeric)          AS contested_attempted,
        sum((elem->>'contestedMade')::numeric)               AS contested_made,
        sum((elem->>'defRimAttempted')::numeric)             AS def_rim_attempted,
        sum((elem->>'defRimMade')::numeric)                  AS def_rim_made,
        sum((elem->>'defMidAttempted')::numeric)             AS def_mid_attempted,
        sum((elem->>'defMidMade')::numeric)                  AS def_mid_made,
        sum((elem->>'defThreeAttempted')::numeric)           AS def_three_attempted,
        sum((elem->>'defThreeMade')::numeric)                AS def_three_made,
        sum((elem->>'defRAAttempted')::numeric)              AS def_ra_attempted,
        sum((elem->>'defRAMade')::numeric)                   AS def_ra_made,
        sum((elem->>'defITPAttempted')::numeric)             AS def_itp_attempted,
        sum((elem->>'defITPMade')::numeric)                  AS def_itp_made,
        sum((elem->>'defMIDAttempted')::numeric)             AS def_mid6_attempted,
        sum((elem->>'defMIDMade')::numeric)                  AS def_mid6_made,
        sum((elem->>'defCNRAttempted')::numeric)             AS def_cnr_attempted,
        sum((elem->>'defCNRMade')::numeric)                  AS def_cnr_made,
        sum((elem->>'defWINGAttempted')::numeric)            AS def_wing_attempted,
        sum((elem->>'defWINGMade')::numeric)                 AS def_wing_made,
        sum((elem->>'defATBAttempted')::numeric)             AS def_atb_attempted,
        sum((elem->>'defATBMade')::numeric)                  AS def_atb_made,
        sum((elem->'zoneData'->>'zone_rim_m')::numeric)      AS zone_rim_m,
        sum((elem->'zoneData'->>'zone_rim_a')::numeric)      AS zone_rim_a,
        sum((elem->'zoneData'->>'zone_paint_m')::numeric)    AS zone_paint_m,
        sum((elem->'zoneData'->>'zone_paint_a')::numeric)    AS zone_paint_a,
        sum((elem->'zoneData'->>'zone_mid_l_m')::numeric)    AS zone_mid_l_m,
        sum((elem->'zoneData'->>'zone_mid_l_a')::numeric)    AS zone_mid_l_a,
        sum((elem->'zoneData'->>'zone_mid_c_m')::numeric)    AS zone_mid_c_m,
        sum((elem->'zoneData'->>'zone_mid_c_a')::numeric)    AS zone_mid_c_a,
        sum((elem->'zoneData'->>'zone_mid_r_m')::numeric)    AS zone_mid_r_m,
        sum((elem->'zoneData'->>'zone_mid_r_a')::numeric)    AS zone_mid_r_a,
        sum((elem->'zoneData'->>'zone_c3_l_m')::numeric)     AS zone_c3_l_m,
        sum((elem->'zoneData'->>'zone_c3_l_a')::numeric)     AS zone_c3_l_a,
        sum((elem->'zoneData'->>'zone_c3_r_m')::numeric)     AS zone_c3_r_m,
        sum((elem->'zoneData'->>'zone_c3_r_a')::numeric)     AS zone_c3_r_a,
        sum((elem->'zoneData'->>'zone_atb3_l_m')::numeric)   AS zone_atb3_l_m,
        sum((elem->'zoneData'->>'zone_atb3_l_a')::numeric)   AS zone_atb3_l_a,
        sum((elem->'zoneData'->>'zone_atb3_c_m')::numeric)   AS zone_atb3_c_m,
        sum((elem->'zoneData'->>'zone_atb3_c_a')::numeric)   AS zone_atb3_c_a,
        sum((elem->'zoneData'->>'zone_atb3_r_m')::numeric)   AS zone_atb3_r_m,
        sum((elem->'zoneData'->>'zone_atb3_r_a')::numeric)   AS zone_atb3_r_a
    FROM game_pbp gp
    JOIN public.games g
      ON g.room_id = gp.room_id AND g.game_id = gp.game_id
     AND g.is_allstar = false AND g.is_playoff = p_is_playoff
    CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(gp.home_box, '[]'::jsonb) || COALESCE(gp.away_box, '[]'::jsonb)
    ) AS elem
    WHERE gp.room_id = p_room_id
      AND gp.game_start_time + interval '10 minutes' <= now()
      AND (elem->>'playerId')::uuid = ANY(p_player_ids)
      AND COALESCE((elem->>'mp')::numeric, 0) > 0
    GROUP BY (elem->>'playerId')::uuid;
$function$;
