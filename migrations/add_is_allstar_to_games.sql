-- ============================================================
-- games.is_allstar 컬럼 추가 + 시즌 스탯 RPC 3종에 올스타 경기 제외 필터 추가
--
-- 배경: 올스타 본경기/라이징스타 챌린지를 실제로 시뮬레이션하는 기능(docs/simulation/
-- allstar-game-plan.md)을 추가하면서, 이 경기들이 games 테이블에 정규시즌 경기와 똑같이
-- played=true로 기록된다. is_allstar 플래그가 없으면:
--   1) 시즌 통산 스탯(get_player_season_stats_full/batch/league)에 올스타 경기 스탯이
--      섞여 유저 시즌 평균이 왜곡된다(1경기뿐이지만 출전시간/득점이 큰 폭으로 튈 수 있음)
--   2) 스탠딩(팀 승패)에는 영향 없음 — computeMultiStandingsStats()가 어차피 실제
--      30팀 team_slug만 집계해 가상 팀 ID(EAST-ALLSTAR 등)는 자동 배제됨(코드 확인 완료)
--
-- 본경기/라이징스타전 구분은 별도 컬럼 없이 games.home_team_id/away_team_id의 가상 팀 ID
-- 자체로 한다(EAST-ALLSTAR/WEST-ALLSTAR vs RISINGSTARS-A/RISINGSTARS-B) — is_allstar는
-- "시즌 통계에서 빼야 하는 경기인지"만 표시.
--
-- get_player_season_stats_full/batch/league 3종은 현재 games JOIN이 전혀 없다(is_playoff
-- 필터조차 없음 — 별도 이슈, 이번 마이그레이션 범위 밖). games JOIN을 새로 추가하면서
-- is_allstar=false 필터만 얹는다. 참고 패턴: add_league_player_awards.sql의
-- get_league_season_awards_stats (JOIN games g ON ... AND g.is_playoff = false).
-- ============================================================

ALTER TABLE public.games ADD COLUMN IF NOT EXISTS is_allstar boolean NOT NULL DEFAULT false;

-- ── get_player_season_stats_full ────────────────────────────────────────────
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
    JOIN public.games g
      ON g.room_id = gp.room_id AND g.game_id = gp.game_id AND g.is_allstar = false
    CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(gp.home_box, '[]'::jsonb) || COALESCE(gp.away_box, '[]'::jsonb)
    ) AS elem
    WHERE gp.room_id = p_room_id
      AND gp.game_start_time + interval '10 minutes' <= now()
      AND (elem->>'playerId')::uuid = ANY(p_player_ids)
      AND COALESCE((elem->>'mp')::numeric, 0) > 0
    GROUP BY (elem->>'playerId')::uuid;
$function$;

-- ── get_player_season_stats_batch ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_season_stats_batch(p_room_id uuid, p_player_ids uuid[])
 RETURNS TABLE (
    player_id uuid,
    g   integer,
    mp  numeric,
    pts numeric,
    reb numeric,
    ast numeric,
    stl numeric,
    blk numeric,
    tov numeric,
    fgm numeric,
    fga numeric,
    p3m numeric,
    p3a numeric,
    ftm numeric,
    fta numeric
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT
        (elem->>'playerId')::uuid AS player_id,
        count(*)::integer                      AS g,
        sum((elem->>'mp')::numeric)             AS mp,
        sum((elem->>'pts')::numeric)            AS pts,
        sum((elem->>'reb')::numeric)            AS reb,
        sum((elem->>'ast')::numeric)            AS ast,
        sum((elem->>'stl')::numeric)            AS stl,
        sum((elem->>'blk')::numeric)            AS blk,
        sum((elem->>'tov')::numeric)            AS tov,
        sum((elem->>'fgm')::numeric)            AS fgm,
        sum((elem->>'fga')::numeric)            AS fga,
        sum((elem->>'p3m')::numeric)            AS p3m,
        sum((elem->>'p3a')::numeric)            AS p3a,
        sum((elem->>'ftm')::numeric)            AS ftm,
        sum((elem->>'fta')::numeric)            AS fta
    FROM game_pbp gp
    JOIN public.games g
      ON g.room_id = gp.room_id AND g.game_id = gp.game_id AND g.is_allstar = false
    CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(gp.home_box, '[]'::jsonb) || COALESCE(gp.away_box, '[]'::jsonb)
    ) AS elem
    WHERE gp.room_id = p_room_id
      AND gp.game_start_time + interval '10 minutes' <= now()
      AND (elem->>'playerId')::uuid = ANY(p_player_ids)
      AND COALESCE((elem->>'mp')::numeric, 0) > 0
    GROUP BY (elem->>'playerId')::uuid;
$function$;

-- ── get_player_season_stats_league ──────────────────────────────────────────
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
    JOIN public.games g
      ON g.room_id = gp.room_id AND g.game_id = gp.game_id AND g.is_allstar = false
    CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(gp.home_box, '[]'::jsonb) || COALESCE(gp.away_box, '[]'::jsonb)
    ) AS elem
    WHERE gp.room_id = p_room_id
      AND gp.game_start_time + interval '10 minutes' <= now()
      AND (elem->>'playerId')::uuid = ANY(p_player_ids)
      AND COALESCE((elem->>'mp')::numeric, 0) > 0
    GROUP BY (elem->>'playerId')::uuid;
$function$;
