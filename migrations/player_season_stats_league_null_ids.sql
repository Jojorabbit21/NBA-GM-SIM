
-- ============================================================
-- get_player_season_stats_league: p_player_ids가 NULL이면 "방 전체 선수" 반환
--
-- 배경(2026-10-20 장애 조사): 이 RPC가 재시작 이후 75분간 임시 파일 약 3GB를 쓰며 DB 컴퓨트를
-- 가장 많이 먹었다. 호출 자체가 비싼데(경기 수에 비례), 클라이언트가 화면마다 다른 선수 목록을
-- 넘겨 캐시 키가 8종 넘게 갈려 같은 계산을 반복했다. 방 전체를 한 번에 받아 클라이언트가 필요한
-- 선수만 골라 쓰게 하려고, p_player_ids를 비우면(NULL) 선수 필터를 건너뛴다.
--
-- 하위호환: 시그니처(인자 개수·타입)는 그대로고 p_player_ids에 DEFAULT NULL만 추가 — 오버로드가
-- 생기지 않는다. 기존 호출(선수 배열을 넘기는 경우)은 결과가 완전히 동일하다.
--
-- 롤백: 이 함수를 DROP한 뒤 p_player_ids uuid[] (DEFAULT 없음) + WHERE 절을
--   AND (elem->>'playerId')::uuid = ANY(p_player_ids)
-- 로 되돌려 재생성한다. (CREATE OR REPLACE로는 기존 파라미터 기본값을 제거할 수 없어 DROP이 필요.)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_player_season_stats_league(p_room_id uuid, p_player_ids uuid[] DEFAULT NULL, p_is_playoff boolean DEFAULT false)
 RETURNS TABLE(player_id uuid, g integer, gs numeric, mp numeric, pts numeric, reb numeric, off_reb numeric, def_reb numeric, ast numeric, stl numeric, blk numeric, tov numeric, tov_forced numeric, pf numeric, tech_fouls numeric, flagrant_fouls numeric, fgm numeric, fga numeric, p3m numeric, p3a numeric, ftm numeric, fta numeric, rim_m numeric, rim_a numeric, mid_m numeric, mid_a numeric, plus_minus numeric, contested_attempted numeric, contested_made numeric, def_rim_attempted numeric, def_rim_made numeric, def_mid_attempted numeric, def_mid_made numeric, def_three_attempted numeric, def_three_made numeric, def_ra_attempted numeric, def_ra_made numeric, def_itp_attempted numeric, def_itp_made numeric, def_mid6_attempted numeric, def_mid6_made numeric, def_cnr_attempted numeric, def_cnr_made numeric, def_wing_attempted numeric, def_wing_made numeric, def_atb_attempted numeric, def_atb_made numeric, zone_rim_m numeric, zone_rim_a numeric, zone_paint_m numeric, zone_paint_a numeric, zone_mid_l_m numeric, zone_mid_l_a numeric, zone_mid_c_m numeric, zone_mid_c_a numeric, zone_mid_r_m numeric, zone_mid_r_a numeric, zone_c3_l_m numeric, zone_c3_l_a numeric, zone_c3_r_m numeric, zone_c3_r_a numeric, zone_atb3_l_m numeric, zone_atb3_l_a numeric, zone_atb3_c_m numeric, zone_atb3_c_a numeric, zone_atb3_r_m numeric, zone_atb3_r_a numeric)
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
      AND gp.game_start_time + public.room_replay_interval(p_room_id) <= now()
      AND (p_player_ids IS NULL OR (elem->>'playerId')::uuid = ANY(p_player_ids))
      AND COALESCE((elem->>'mp')::numeric, 0) > 0
    GROUP BY (elem->>'playerId')::uuid;
$function$;
