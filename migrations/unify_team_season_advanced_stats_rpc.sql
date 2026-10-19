-- ============================================================
-- get_team_season_advanced_stats — 멀티 팀 어드밴스드 스탯 단일 기준(BBRef)으로 통일
--
-- 배경 (2026-10-19): 팀 화면 헤더(이 RPC, BBRef 포제션)와 리더보드 팀 > 어드밴스드
-- (useLeaderboardData, 단순식 FGA+0.44FTA+TOV-ORB)가 같은 이름의 스탯을 서로 다른 공식으로
-- 계산해 PACE/ORTG/DRTG가 약 1씩 어긋났다. 멀티에서는 이 RPC를 유일한 계산 경로로 삼고
-- 클라이언트(useLeaderboardData)는 teamAdvanced 인자로 받은 값을 그대로 덮어쓴다.
--
-- 이전 버전(add_team_season_advanced_stats_rpc.sql) 대비 변경점:
--   1) games JOIN 추가 — is_allstar=false(올스타/라이징스타 4팀이 팀 행으로 섞여 순위를
--      오염시키던 버그) + is_playoff=p_is_playoff(정규시즌/플레이오프 분리, 기존엔 혼합).
--      형제 RPC(get_player_season_stats_league 등)와 동일한 (room_id, game_id) 조인 패턴.
--      game_pbp에 플래그를 복제하지 않고 games를 원본으로 둔다.
--   2) 반환 컬럼 확장: poss, net_rtg, tov_pct, stl_pct + 선수 STL%/USG% 분모용 합계
--      (poss_total, mp_total, fga, fta, tov).
--   3) 공개 지연은 배포본과 동일하게 room_replay_interval(p_room_id) 사용(옛 파일의
--      interval '10 minutes'는 배포본과 어긋나 있었음).
--
-- 정의 (전부 Basketball-Reference 기준):
--   Poss(경기)  = 0.5 * ( (TmFGA + 0.4*TmFTA - 1.07*(TmORB/(TmORB+OppDRB))*(TmFGA-TmFGM) + TmTOV)
--                       + (OppFGA + 0.4*OppFTA - 1.07*(OppORB/(OppORB+TmDRB))*(OppFGA-OppFGM) + OppTOV) )
--                 → 양팀 공통 값(팀 포제션 = 상대 포제션)
--   POSS        = ΣPoss / G
--   PACE        = 48 * ΣPoss / Σ(팀 출전시간/5)          (연장 보정)
--   ORTG / DRTG = 100 * ΣPTS / ΣPoss, 100 * ΣOppPTS / ΣPoss
--   NRTG        = ORTG - DRTG
--   TOV%        = TOV / (FGA + 0.44*FTA + TOV)            (포제션이 아니라 플레이 기회 분모)
--   STL%        = STL / ΣPoss(=상대 포제션)
--   비율 스탯은 0~1 분수로 반환(리더보드 percent 포맷이 ×100 표시).
--
-- 파라미터 개수가 바뀌므로(1→2) 기존 함수를 먼저 DROP — 안 하면 오버로드로 공존해
-- PostgREST가 "function ... is not unique" 에러를 낸다(add_is_playoff_to_player_season_stats_league_rpc.sql 참고).
--
-- 롤백: 이 함수를 DROP 하고 add_team_season_advanced_stats_rpc.sql 재적용(단, 그 파일의
-- 공개 조건을 room_replay_interval(p_room_id)로 고친 뒤 적용할 것) + 클라이언트 원복.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_team_season_advanced_stats(uuid);

CREATE OR REPLACE FUNCTION public.get_team_season_advanced_stats(
    p_room_id uuid, p_is_playoff boolean DEFAULT false
)
 RETURNS TABLE (
    team_id    text,
    g          integer,
    ppg        numeric,
    oppg       numeric,
    poss       numeric,
    pace       numeric,
    off_rtg    numeric,
    def_rtg    numeric,
    net_rtg    numeric,
    tov_pct    numeric,
    stl_pct    numeric,
    poss_total numeric,
    mp_total   numeric,
    fga        numeric,
    fta        numeric,
    tov        numeric
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    WITH game_box AS (
        SELECT
            gp.home_team_id, gp.away_team_id,
            gp.home_score::numeric AS home_pts, gp.away_score::numeric AS away_pts,
            h.fga AS h_fga, h.fgm AS h_fgm, h.fta AS h_fta, h.oreb AS h_oreb, h.dreb AS h_dreb, h.tov AS h_tov, h.stl AS h_stl, h.mp AS h_mp,
            a.fga AS a_fga, a.fgm AS a_fgm, a.fta AS a_fta, a.oreb AS a_oreb, a.dreb AS a_dreb, a.tov AS a_tov, a.stl AS a_stl, a.mp AS a_mp
        FROM game_pbp gp
        JOIN games gm
          ON gm.room_id = gp.room_id AND gm.game_id = gp.game_id
         AND gm.is_allstar = false AND gm.is_playoff = p_is_playoff
        CROSS JOIN LATERAL (
            SELECT
                COALESCE(sum((e->>'fga')::numeric), 0)    AS fga,
                COALESCE(sum((e->>'fgm')::numeric), 0)    AS fgm,
                COALESCE(sum((e->>'fta')::numeric), 0)    AS fta,
                COALESCE(sum((e->>'offReb')::numeric), 0) AS oreb,
                COALESCE(sum((e->>'defReb')::numeric), 0) AS dreb,
                COALESCE(sum((e->>'tov')::numeric), 0)    AS tov,
                COALESCE(sum((e->>'stl')::numeric), 0)    AS stl,
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
                COALESCE(sum((e->>'stl')::numeric), 0)    AS stl,
                COALESCE(sum((e->>'mp')::numeric), 0)     AS mp
            FROM jsonb_array_elements(gp.away_box) e
        ) a
        WHERE gp.room_id = p_room_id
          AND gp.game_start_time + public.room_replay_interval(p_room_id) <= now()
    ),
    game_poss AS (
        SELECT
            *,
            0.5 * (
                (h_fga + 0.4*h_fta - 1.07*(h_oreb / NULLIF(h_oreb + a_dreb, 0)) * (h_fga - h_fgm) + h_tov)
              + (a_fga + 0.4*a_fta - 1.07*(a_oreb / NULLIF(a_oreb + h_dreb, 0)) * (a_fga - a_fgm) + a_tov)
            ) AS gposs,
            GREATEST(h_mp, a_mp) / 5.0 AS team_minutes
        FROM game_box
    ),
    team_rows AS (
        SELECT home_team_id AS tid, home_pts AS pts, away_pts AS opp_pts, gposs, team_minutes,
               h_mp AS mp, h_fga AS fga, h_fta AS fta, h_tov AS tov, h_stl AS stl
        FROM game_poss
        UNION ALL
        SELECT away_team_id, away_pts, home_pts, gposs, team_minutes,
               a_mp, a_fga, a_fta, a_tov, a_stl
        FROM game_poss
    )
    SELECT
        tid AS team_id,
        count(*)::integer AS g,
        (sum(pts) / count(*))::numeric AS ppg,
        (sum(opp_pts) / count(*))::numeric AS oppg,
        (sum(gposs) / count(*))::numeric AS poss,
        (48 * sum(gposs) / NULLIF(sum(team_minutes), 0))::numeric AS pace,
        (100 * sum(pts) / NULLIF(sum(gposs), 0))::numeric AS off_rtg,
        (100 * sum(opp_pts) / NULLIF(sum(gposs), 0))::numeric AS def_rtg,
        (100 * (sum(pts) - sum(opp_pts)) / NULLIF(sum(gposs), 0))::numeric AS net_rtg,
        (sum(tov) / NULLIF(sum(fga) + 0.44 * sum(fta) + sum(tov), 0))::numeric AS tov_pct,
        (sum(stl) / NULLIF(sum(gposs), 0))::numeric AS stl_pct,
        sum(gposs)::numeric AS poss_total,
        sum(mp)::numeric AS mp_total,
        sum(fga)::numeric AS fga,
        sum(fta)::numeric AS fta,
        sum(tov)::numeric AS tov
    FROM team_rows
    GROUP BY tid;
$function$;
