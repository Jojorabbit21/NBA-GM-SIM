-- ============================================================
-- get_player_season_stats_league(p_room_id, p_player_ids) RPC 신설
-- get_team_opponent_zone_stats(p_room_id) RPC 신설
--
-- 배경: services/multi/buildLeagueTeams.ts가 홈/리더보드/트레이드/선수상세/전술(인사이트)
-- 5개 화면에서 공용으로 쓰이는데, room 전체 game_pbp 원본(수 MB)을 매번 클라이언트로
-- 받아 선수별 시즌 스탯 + 팀별 "상대에게 허용한 존별 슈팅"(oppZoneStats)을 직접 집계하고
-- 있었다 — MultiRosterView.tsx에서 이미 한 번 겪은 것과 동일한 병목(2026-09-07 실측,
-- 홈 화면만 8.2초). get_player_season_stats_full(add_player_season_stats_full_rpc.sql)과
-- 같은 패턴으로 서버 집계로 옮기되, buildLeagueTeams()가 필요로 하는 필드가 그 RPC보다
-- 많아서(tovForced/techFouls/flagrantFouls + 구버전 3존 수비 지표 defRim*/defMid*/defThree*)
-- 별도 함수로 분리했다(기존 get_player_season_stats_full을 쓰는 MultiRosterView.tsx에
-- 영향 없음).
--
-- get_player_season_stats_batch/get_player_season_stats_full과 동일하게 SECURITY DEFINER
-- 아님, isFinal 기준(리플레이 공개 딜레이 10분)과 mp>0 필터도 동일.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_player_season_stats_league(p_room_id uuid, p_player_ids uuid[])
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
    CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(gp.home_box, '[]'::jsonb) || COALESCE(gp.away_box, '[]'::jsonb)
    ) AS elem
    WHERE gp.room_id = p_room_id
      AND gp.game_start_time + interval '10 minutes' <= now()
      AND (elem->>'playerId')::uuid = ANY(p_player_ids)
      AND COALESCE((elem->>'mp')::numeric, 0) > 0
    GROUP BY (elem->>'playerId')::uuid;
$function$;

-- 팀별 "상대에게 허용한 존별 슈팅" 시즌 누적(전술 > 인사이트 탭 CONTEST 섹션 전용,
-- buildLeagueTeams.ts의 oppZoneStats와 동일 정의) — 홈팀 기준 oppZoneStats는 원정팀
-- away_box의 zone_* 합계, 원정팀 기준은 홈팀 home_box의 zone_* 합계.
CREATE OR REPLACE FUNCTION public.get_team_opponent_zone_stats(p_room_id uuid)
 RETURNS TABLE (
    team_id text,
    zone_rim_m    numeric, zone_rim_a    numeric,
    zone_paint_m  numeric, zone_paint_a  numeric,
    zone_mid_l_m  numeric, zone_mid_l_a  numeric,
    zone_mid_c_m  numeric, zone_mid_c_a  numeric,
    zone_mid_r_m  numeric, zone_mid_r_a  numeric,
    zone_c3_l_m   numeric, zone_c3_l_a   numeric,
    zone_c3_r_m   numeric, zone_c3_r_a   numeric,
    zone_atb3_l_m numeric, zone_atb3_l_a numeric,
    zone_atb3_c_m numeric, zone_atb3_c_a numeric,
    zone_atb3_r_m numeric, zone_atb3_r_a numeric
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    WITH box_zones AS (
        SELECT
            gp.home_team_id, gp.away_team_id,
            h.z AS home_z, a.z AS away_z
        FROM game_pbp gp
        CROSS JOIN LATERAL (
            SELECT jsonb_build_object(
                'zone_rim_m',    COALESCE(sum((e->'zoneData'->>'zone_rim_m')::numeric), 0),
                'zone_rim_a',    COALESCE(sum((e->'zoneData'->>'zone_rim_a')::numeric), 0),
                'zone_paint_m',  COALESCE(sum((e->'zoneData'->>'zone_paint_m')::numeric), 0),
                'zone_paint_a',  COALESCE(sum((e->'zoneData'->>'zone_paint_a')::numeric), 0),
                'zone_mid_l_m',  COALESCE(sum((e->'zoneData'->>'zone_mid_l_m')::numeric), 0),
                'zone_mid_l_a',  COALESCE(sum((e->'zoneData'->>'zone_mid_l_a')::numeric), 0),
                'zone_mid_c_m',  COALESCE(sum((e->'zoneData'->>'zone_mid_c_m')::numeric), 0),
                'zone_mid_c_a',  COALESCE(sum((e->'zoneData'->>'zone_mid_c_a')::numeric), 0),
                'zone_mid_r_m',  COALESCE(sum((e->'zoneData'->>'zone_mid_r_m')::numeric), 0),
                'zone_mid_r_a',  COALESCE(sum((e->'zoneData'->>'zone_mid_r_a')::numeric), 0),
                'zone_c3_l_m',   COALESCE(sum((e->'zoneData'->>'zone_c3_l_m')::numeric), 0),
                'zone_c3_l_a',   COALESCE(sum((e->'zoneData'->>'zone_c3_l_a')::numeric), 0),
                'zone_c3_r_m',   COALESCE(sum((e->'zoneData'->>'zone_c3_r_m')::numeric), 0),
                'zone_c3_r_a',   COALESCE(sum((e->'zoneData'->>'zone_c3_r_a')::numeric), 0),
                'zone_atb3_l_m', COALESCE(sum((e->'zoneData'->>'zone_atb3_l_m')::numeric), 0),
                'zone_atb3_l_a', COALESCE(sum((e->'zoneData'->>'zone_atb3_l_a')::numeric), 0),
                'zone_atb3_c_m', COALESCE(sum((e->'zoneData'->>'zone_atb3_c_m')::numeric), 0),
                'zone_atb3_c_a', COALESCE(sum((e->'zoneData'->>'zone_atb3_c_a')::numeric), 0),
                'zone_atb3_r_m', COALESCE(sum((e->'zoneData'->>'zone_atb3_r_m')::numeric), 0),
                'zone_atb3_r_a', COALESCE(sum((e->'zoneData'->>'zone_atb3_r_a')::numeric), 0)
            ) AS z
            FROM jsonb_array_elements(gp.home_box) e
        ) h
        CROSS JOIN LATERAL (
            SELECT jsonb_build_object(
                'zone_rim_m',    COALESCE(sum((e->'zoneData'->>'zone_rim_m')::numeric), 0),
                'zone_rim_a',    COALESCE(sum((e->'zoneData'->>'zone_rim_a')::numeric), 0),
                'zone_paint_m',  COALESCE(sum((e->'zoneData'->>'zone_paint_m')::numeric), 0),
                'zone_paint_a',  COALESCE(sum((e->'zoneData'->>'zone_paint_a')::numeric), 0),
                'zone_mid_l_m',  COALESCE(sum((e->'zoneData'->>'zone_mid_l_m')::numeric), 0),
                'zone_mid_l_a',  COALESCE(sum((e->'zoneData'->>'zone_mid_l_a')::numeric), 0),
                'zone_mid_c_m',  COALESCE(sum((e->'zoneData'->>'zone_mid_c_m')::numeric), 0),
                'zone_mid_c_a',  COALESCE(sum((e->'zoneData'->>'zone_mid_c_a')::numeric), 0),
                'zone_mid_r_m',  COALESCE(sum((e->'zoneData'->>'zone_mid_r_m')::numeric), 0),
                'zone_mid_r_a',  COALESCE(sum((e->'zoneData'->>'zone_mid_r_a')::numeric), 0),
                'zone_c3_l_m',   COALESCE(sum((e->'zoneData'->>'zone_c3_l_m')::numeric), 0),
                'zone_c3_l_a',   COALESCE(sum((e->'zoneData'->>'zone_c3_l_a')::numeric), 0),
                'zone_c3_r_m',   COALESCE(sum((e->'zoneData'->>'zone_c3_r_m')::numeric), 0),
                'zone_c3_r_a',   COALESCE(sum((e->'zoneData'->>'zone_c3_r_a')::numeric), 0),
                'zone_atb3_l_m', COALESCE(sum((e->'zoneData'->>'zone_atb3_l_m')::numeric), 0),
                'zone_atb3_l_a', COALESCE(sum((e->'zoneData'->>'zone_atb3_l_a')::numeric), 0),
                'zone_atb3_c_m', COALESCE(sum((e->'zoneData'->>'zone_atb3_c_m')::numeric), 0),
                'zone_atb3_c_a', COALESCE(sum((e->'zoneData'->>'zone_atb3_c_a')::numeric), 0),
                'zone_atb3_r_m', COALESCE(sum((e->'zoneData'->>'zone_atb3_r_m')::numeric), 0),
                'zone_atb3_r_a', COALESCE(sum((e->'zoneData'->>'zone_atb3_r_a')::numeric), 0)
            ) AS z
            FROM jsonb_array_elements(gp.away_box) e
        ) a
        WHERE gp.room_id = p_room_id
          AND gp.game_start_time + interval '10 minutes' <= now()
    ),
    -- 홈팀의 "상대 슈팅"은 원정팀(away_box)이 기록한 슈팅, 원정팀의 "상대 슈팅"은 홈팀(home_box) 슈팅.
    team_opp AS (
        SELECT home_team_id AS tid, away_z AS opp_z FROM box_zones
        UNION ALL
        SELECT away_team_id, home_z FROM box_zones
    )
    SELECT
        tid AS team_id,
        sum((opp_z->>'zone_rim_m')::numeric)    AS zone_rim_m,
        sum((opp_z->>'zone_rim_a')::numeric)    AS zone_rim_a,
        sum((opp_z->>'zone_paint_m')::numeric)  AS zone_paint_m,
        sum((opp_z->>'zone_paint_a')::numeric)  AS zone_paint_a,
        sum((opp_z->>'zone_mid_l_m')::numeric)  AS zone_mid_l_m,
        sum((opp_z->>'zone_mid_l_a')::numeric)  AS zone_mid_l_a,
        sum((opp_z->>'zone_mid_c_m')::numeric)  AS zone_mid_c_m,
        sum((opp_z->>'zone_mid_c_a')::numeric)  AS zone_mid_c_a,
        sum((opp_z->>'zone_mid_r_m')::numeric)  AS zone_mid_r_m,
        sum((opp_z->>'zone_mid_r_a')::numeric)  AS zone_mid_r_a,
        sum((opp_z->>'zone_c3_l_m')::numeric)   AS zone_c3_l_m,
        sum((opp_z->>'zone_c3_l_a')::numeric)   AS zone_c3_l_a,
        sum((opp_z->>'zone_c3_r_m')::numeric)   AS zone_c3_r_m,
        sum((opp_z->>'zone_c3_r_a')::numeric)   AS zone_c3_r_a,
        sum((opp_z->>'zone_atb3_l_m')::numeric) AS zone_atb3_l_m,
        sum((opp_z->>'zone_atb3_l_a')::numeric) AS zone_atb3_l_a,
        sum((opp_z->>'zone_atb3_c_m')::numeric) AS zone_atb3_c_m,
        sum((opp_z->>'zone_atb3_c_a')::numeric) AS zone_atb3_c_a,
        sum((opp_z->>'zone_atb3_r_m')::numeric) AS zone_atb3_r_m,
        sum((opp_z->>'zone_atb3_r_a')::numeric) AS zone_atb3_r_a
    FROM team_opp
    GROUP BY tid;
$function$;
