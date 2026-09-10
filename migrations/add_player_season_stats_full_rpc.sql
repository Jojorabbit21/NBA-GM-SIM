-- ============================================================
-- get_player_season_stats_full(p_room_id, p_player_ids) RPC 신설
--
-- 배경: 멀티 팀 화면(RosterView.tsx) 개요 탭이 로스터 전체 선수(허 최대 30팀치, 250명+)의
-- 시즌 평균(존 슛차트/수비존 포함 전체 스탯)을 보여주기 위해 game_pbp 원본(room 전체
-- 박스스코어, home_box/away_box JSONB, 게임당 수 MB)을 클라이언트로 통째로 받아
-- MultiRosterView.tsx의 buildStatsMap()에서 직접 집계했다 — 실측 결과 이 fetch 하나가
-- 7초 이상 걸려 팀 화면 진입 자체를 지연시키는 최대 병목이었다(2026-09-07 네트워크 탭 실측).
--
-- get_player_season_stats_batch(add_player_season_stats_batch_rpc.sql)가 이미 같은 목적으로
-- 서버 집계를 하고 있지만, 뉴스피드 호버카드용이라 컬럼이 기본 스탯(pts/reb/ast 등)만 있고
-- buildStatsMap이 필요로 하는 존 슛차트(zone_rim_m 등 20개)·수비존(defRAAttempted 등
-- 12개)·gs/offReb/defReb/pf/plusMinus/contested*가 빠져 있어 그대로 재사용할 수 없다.
-- 기존 함수를 쓰는 뉴스피드 쪽 타입을 깨지 않도록 컬럼을 확장한 별도 함수로 분리한다.
--
-- get_player_season_stats_batch와 동일하게 SECURITY DEFINER 아님, isFinal 기준(리플레이
-- 공개 딜레이 10분)과 mp>0 필터도 동일 — MultiRosterView.tsx의 buildStatsMap()이 쓰던
-- 조건(isFinal + bs.mp<=0 skip)을 그대로 서버로 옮긴 것.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_player_season_stats_full(p_room_id uuid, p_player_ids uuid[])
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
    pf  numeric,
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
    def_ra_attempted   numeric,
    def_ra_made        numeric,
    def_itp_attempted  numeric,
    def_itp_made       numeric,
    def_mid_attempted  numeric,
    def_mid_made       numeric,
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
        sum((elem->>'pf')::numeric)                          AS pf,
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
        sum((elem->>'defRAAttempted')::numeric)              AS def_ra_attempted,
        sum((elem->>'defRAMade')::numeric)                   AS def_ra_made,
        sum((elem->>'defITPAttempted')::numeric)             AS def_itp_attempted,
        sum((elem->>'defITPMade')::numeric)                  AS def_itp_made,
        sum((elem->>'defMIDAttempted')::numeric)             AS def_mid_attempted,
        sum((elem->>'defMIDMade')::numeric)                  AS def_mid_made,
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
