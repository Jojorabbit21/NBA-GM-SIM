-- ============================================================
-- get_league_season_awards_stats RPC 확장 — 올해의 수비수(DPOY) 서신 테이블에 TOVF
-- (상대 턴오버 유발: 스틸 + 차징 유도) 컬럼 추가를 위해 tov_forced 합계 컬럼 추가.
--
-- 이전 컬럼 추가(add_pf_to_awards_rpc.sql 등)와 동일하게, 기존 컬럼 중간에 새 컬럼을
-- 끼워 넣어 반환 타입이 바뀌므로 DROP 후 CREATE.
--
-- 기존에 저장된 game_pbp.home_box/away_box(JSONB)는 tovForced 키가 없는 레코드도
-- 있을 수 있음(엔진에 tovForced 필드 추가 이전 경기) — COALESCE(..., 0)으로 안전 처리.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_league_season_awards_stats(uuid);

CREATE FUNCTION public.get_league_season_awards_stats(p_room_id uuid)
 RETURNS TABLE (
    player_id uuid,
    g       integer,
    gs      integer,
    mp      numeric,
    pts     numeric,
    reb     numeric,
    off_reb numeric,
    def_reb numeric,
    ast     numeric,
    stl     numeric,
    blk     numeric,
    tov     numeric,
    tov_forced numeric,
    pf      numeric,
    fgm     numeric,
    fga     numeric,
    p3m     numeric,
    p3a     numeric,
    ftm     numeric,
    fta     numeric,
    contested_attempted numeric,
    contested_made      numeric
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      ON g.room_id = gp.room_id AND g.game_id = gp.game_id AND g.is_playoff = false
    CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(gp.home_box, '[]'::jsonb) || COALESCE(gp.away_box, '[]'::jsonb)
    ) AS elem
    WHERE gp.room_id = p_room_id
      AND gp.game_start_time + interval '10 minutes' <= now()
      AND COALESCE((elem->>'mp')::numeric, 0) > 0
    GROUP BY (elem->>'playerId')::uuid;
$function$;
