-- ============================================================
-- get_team_season_advanced_stats(p_room_id) RPC 신설
--
-- 배경: 팀 화면(RosterView.tsx) 헤더에 Off Rtg/Def Rtg/Pace(+리그 순위)를 추가하기 위함.
-- 이 세 스탯은 포제션(possession) 추정치가 필요해서 PPG/OPPG처럼 스케줄의 최종 스코어만으로는
-- 계산이 안 되고, 게임별 팀 단위 박스스코어 합계(FGA/FGM/FTA/offReb/defReb/TOV/MP)가 필요하다.
-- game_pbp는 room 전체 30팀의 매 경기 박스스코어를 home_box/away_box JSONB 배열로 담고 있으나
-- player_id 단위라 클라이언트에서 이걸 통째로 받아 시즌 전체를 합산하는 건 무겁다
-- (add_player_season_stats_batch_rpc.sql과 동일한 이유) — 이번에도 무거운 스캔은 서버에서 하고
-- 팀당 한 줄(30줄)만 내려준다.
--
-- [2026-09-06] 최초 버전은 팀당 필요한 7개 필드(fga/fgm/fta/offReb/defReb/tov/mp)를 각각
-- 별도 상관 서브쿼리로 짜서 home_box/away_box를 jsonb_array_elements()로 7번씩(양팀 합쳐 14번)
-- 반복해서 펼쳤다 — 실측(EXPLAIN ANALYZE, 1329경기 room) 639ms/버퍼히트 98,876. LATERAL
-- 서브쿼리 하나로 7개 합계를 한 번에 내도록 고쳐 배열 순회를 게임당 14회→2회로 줄이니
-- 244ms/버퍼히트 11,450으로 측정(약 2.6배 빠름, 버퍼히트 8.6배 감소) — 아래는 그 최적화 버전.
--
-- 포제션 추정 공식은 basketball-reference의 표준 팀 페이스 공식을 그대로 씀:
--   Poss = 0.5 * ( (TmFGA + 0.4*TmFTA - 1.07*(TmORB/(TmORB+OppDRB))*(TmFGA-TmFGM) + TmTOV)
--                + (OppFGA + 0.4*OppFTA - 1.07*(OppORB/(OppORB+TmDRB))*(OppFGA-OppFGM) + OppTOV) )
-- 이 값(경기당 포제션 추정치, 양팀 평균)을 그 경기의 두 팀 모두에게 동일하게 적용해
-- Off Rtg = 100*PTS/Poss, Def Rtg = 100*OppPTS/Poss, Pace = 48*Poss/(팀 합산 MP/5)로 계산한다.
--
-- get_player_season_stats_batch와 동일하게 SECURITY DEFINER 아님(RLS는 room 멤버에게 이미
-- 열려 있음), REPLAY_DURATION_MS(10분) 경과 조건도 동일하게 적용. 단, 이 RPC는 그 RPC와
-- 마찬가지로 플레이오프 경기를 별도로 걸러내지 않는다 — game_pbp에 isPlayoff 플래그가 없고
-- (스케줄의 해당 정보는 room 밖 JSONB에 있어 조인이 번거로움), 기존 선수 시즌 스탯 배치 RPC도
-- 동일하게 전체 포함이라 일관성을 맞췄다. 컨퍼런스 순위(RosterView의 conferenceStandings)도
-- 마찬가지로 플레이오프를 거르지 않는 기존 로직과 같은 수준.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_team_season_advanced_stats(p_room_id uuid)
 RETURNS TABLE (
    team_id text,
    g       integer,
    ppg     numeric,
    oppg    numeric,
    off_rtg numeric,
    def_rtg numeric,
    pace    numeric
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    WITH game_box AS (
        SELECT
            gp.id AS game_id,
            gp.home_team_id, gp.away_team_id,
            gp.home_score::numeric AS home_pts, gp.away_score::numeric AS away_pts,
            h.fga AS h_fga, h.fgm AS h_fgm, h.fta AS h_fta, h.oreb AS h_oreb, h.dreb AS h_dreb, h.tov AS h_tov, h.mp AS h_mp,
            a.fga AS a_fga, a.fgm AS a_fgm, a.fta AS a_fta, a.oreb AS a_oreb, a.dreb AS a_dreb, a.tov AS a_tov, a.mp AS a_mp
        FROM game_pbp gp
        CROSS JOIN LATERAL (
            SELECT
                COALESCE(sum((e->>'fga')::numeric), 0)    AS fga,
                COALESCE(sum((e->>'fgm')::numeric), 0)    AS fgm,
                COALESCE(sum((e->>'fta')::numeric), 0)    AS fta,
                COALESCE(sum((e->>'offReb')::numeric), 0) AS oreb,
                COALESCE(sum((e->>'defReb')::numeric), 0) AS dreb,
                COALESCE(sum((e->>'tov')::numeric), 0)    AS tov,
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
                COALESCE(sum((e->>'mp')::numeric), 0)     AS mp
            FROM jsonb_array_elements(gp.away_box) e
        ) a
        WHERE gp.room_id = p_room_id
          AND gp.game_start_time + interval '10 minutes' <= now()
    ),
    game_poss AS (
        SELECT
            game_id, home_team_id, away_team_id, home_pts, away_pts,
            0.5 * (
                (h_fga + 0.4*h_fta - 1.07*(h_oreb / NULLIF(h_oreb + a_dreb, 0)) * (h_fga - h_fgm) + h_tov)
              + (a_fga + 0.4*a_fta - 1.07*(a_oreb / NULLIF(a_oreb + h_dreb, 0)) * (a_fga - a_fgm) + a_tov)
            ) AS poss,
            GREATEST(h_mp, a_mp) / 5.0 AS team_minutes
        FROM game_box
    ),
    team_rows AS (
        SELECT home_team_id AS tid, home_pts AS pts, away_pts AS opp_pts, poss, team_minutes FROM game_poss
        UNION ALL
        SELECT away_team_id, away_pts, home_pts, poss, team_minutes FROM game_poss
    )
    SELECT
        tid AS team_id,
        count(*)::integer AS g,
        (sum(pts) / count(*))::numeric AS ppg,
        (sum(opp_pts) / count(*))::numeric AS oppg,
        (100 * sum(pts) / NULLIF(sum(poss), 0))::numeric AS off_rtg,
        (100 * sum(opp_pts) / NULLIF(sum(poss), 0))::numeric AS def_rtg,
        (48 * sum(poss) / NULLIF(sum(team_minutes), 0))::numeric AS pace
    FROM team_rows
    GROUP BY tid;
$function$;
