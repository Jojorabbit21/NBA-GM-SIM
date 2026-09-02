-- ============================================================
-- get_player_season_stats_batch(p_room_id, p_player_ids) RPC 신설
--
-- 배경: 뉴스피드/시즌 일정 화면의 PlayerHoverCard가 쓰는 poolPlayers(useMultiSearchData)는
-- meta_players만 조회해 stats가 항상 0(defaultStats)이라 "시즌 기록 없음"만 뜬다.
-- game_pbp는 room 전체 30팀 박스스코어를 담고 있고 player_id 컬럼이 없어(home_box/away_box
-- JSONB 배열) 클라이언트에서 특정 선수 몇 명만 가볍게 필터링할 방법이 없다 — 기존
-- useLeagueRawStats처럼 room 전체를 받아와 클라이언트에서 집계하면 리그 전체 시즌 박스스코어를
-- 통째로 내려받아야 해서, 뉴스피드에 보이는 선수 20~40명만 필요한 경우엔 과잉이다.
-- 이 RPC는 무거운 스캔(room 전체 game_pbp)을 서버(Postgres)에서 그대로 수행하되, 응답은
-- 요청한 player_id들의 집계 결과(선수당 한 줄)만 돌려줘 네트워크 전송량을 크게 줄인다.
--
-- SECURITY DEFINER 아님 — game_pbp SELECT는 이미 클라이언트가 직접 쿼리할 수 있을 만큼
-- RLS가 room 멤버에게 열려 있어(hooks/useLeagueRawStats.ts), 호출자의 권한 그대로 실행되는
-- 일반 함수로 충분하다(불필요한 권한 상승 회피).
--
-- isFinal(views/multi/season/multiGameReveal.ts) 기준과 동일하게 REPLAY_DURATION_MS(10분)
-- 경과한 경기만 집계 — 아직 리플레이 공개 전인 live 구간 박스는 제외.
-- ============================================================

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
    CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(gp.home_box, '[]'::jsonb) || COALESCE(gp.away_box, '[]'::jsonb)
    ) AS elem
    WHERE gp.room_id = p_room_id
      AND gp.game_start_time + interval '10 minutes' <= now()
      AND (elem->>'playerId')::uuid = ANY(p_player_ids)
      AND COALESCE((elem->>'mp')::numeric, 0) > 0
    GROUP BY (elem->>'playerId')::uuid;
$function$;
