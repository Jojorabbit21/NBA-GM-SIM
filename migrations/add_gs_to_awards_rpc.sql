-- ============================================================
-- get_league_season_awards_stats RPC 확장 — 올-오펜시브/올-디펜시브 테이블에 G/GS 컬럼을
-- 추가하기 위해 games_started(gs) 합계 컬럼 추가.
--
-- g(경기수)는 이미 count(*)로 나오고 있었지만 gs(선발 출전 횟수, PlayerBoxScore.gs —
-- 그 경기에 선발로 나왔으면 1)는 합산되고 있지 않았음. CREATE OR REPLACE로 함수 시그니처
-- (반환 컬럼) 교체 — migrations/add_contested_stats_to_awards_rpc.sql에 이은 두 번째 확장.
-- ============================================================

-- gs 컬럼이 기존 반환 타입 중간에 끼어들어가 컬럼 순서가 바뀌므로(OUT 파라미터 타입 변경),
-- CREATE OR REPLACE로는 안 되고 먼저 DROP이 필요함(Postgres 42P13 에러).
DROP FUNCTION IF EXISTS public.get_league_season_awards_stats(uuid);

CREATE OR REPLACE FUNCTION public.get_league_season_awards_stats(p_room_id uuid)
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
