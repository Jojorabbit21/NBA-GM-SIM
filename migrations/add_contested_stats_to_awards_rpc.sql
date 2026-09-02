-- ============================================================
-- get_league_season_awards_stats RPC 확장 — DFG%(상대가 이 선수에게 컨테스트당했을 때의
-- 필드골 성공률) 계산에 필요한 contested_attempted/contested_made 합계 컬럼 추가.
--
-- 배경: DPOY 뉴스카드에 OREB/DFG% 추가 요청. OREB는 기존 off_reb 합계를 그대로 쓰면 되고,
-- DFG%는 이 선수가 컨테스트한 상대 슛 시도/성공(server/src/shared/engine/pbp/
-- statsMappers.ts의 contestedAttempted/contestedMade — 수비수 쪽에 기록됨) 합계가
-- 필요한데, 이전 버전 RPC(migrations/add_league_player_awards.sql)엔 이 두 컬럼이
-- 없었다. CREATE OR REPLACE로 함수 시그니처(반환 컬럼) 자체를 교체.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_league_season_awards_stats(p_room_id uuid)
 RETURNS TABLE (
    player_id uuid,
    g       integer,
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
