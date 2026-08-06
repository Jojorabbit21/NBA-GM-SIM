-- ============================================================
-- backfill_games.sql — rooms.schedule JSONB → games 테이블 백필 (멱등)
--
-- ⚠️ 이 스크립트는 "컷오버 전"에만 안전하다. 컷오버(서버/클라이언트가
-- games 테이블을 SSOT로 쓰기 시작한) 후에는 games가 최신이고
-- rooms.schedule이 stale이므로, 이 스크립트를 다시 돌리면
-- ON CONFLICT DO UPDATE가 최신 결과를 stale 데이터로 되돌린다.
-- 컷오버 후 재실행 금지 — 상세 순서는 docs/history/dev-log.md 참조.
--
-- rooms.schedule과 leagues.bracket_data.schedule은 바이트 단위로 동일함이
-- 확인되었으므로(2026-08-06 조사) 백필 소스는 rooms.schedule 하나면 충분.
-- ============================================================

INSERT INTO public.games (
    room_id, league_id, game_id,
    home_team_id, away_team_id,
    game_date, game_time, game_seq, scheduled_at,
    played, home_score, away_score, is_playoff, series_id
)
SELECT
    r.id,
    r.league_id,
    e->>'id',
    e->>'homeTeamId',
    e->>'awayTeamId',
    (e->>'date')::date,
    NULLIF(e->>'time', ''),
    (e->>'game_seq')::int,
    COALESCE(
        (e->>'scheduledAt')::timestamptz,
        -- 레거시(scheduledAt 누락) 폴백 — scheduler.ts의 gameSeqToRealMs()와 동일 공식
        CASE
          WHEN l.sim_real_start_at IS NOT NULL AND (e->>'game_seq') IS NOT NULL
          THEN date_trunc('minute',
                 l.sim_real_start_at
                 + ((e->>'game_seq')::numeric / COALESCE(l.games_per_real_day, 5)) * INTERVAL '1 day'
                 + INTERVAL '30 second')
        END
    ),
    COALESCE((e->>'played')::boolean, false),
    (e->>'homeScore')::int,
    (e->>'awayScore')::int,
    COALESCE((e->>'isPlayoff')::boolean, false),
    NULLIF(e->>'seriesId', '')
FROM rooms r
JOIN leagues l ON l.id = r.league_id,
LATERAL jsonb_array_elements(r.schedule) e
WHERE jsonb_typeof(r.schedule) = 'array'
ON CONFLICT (room_id, game_id) DO UPDATE SET
    league_id    = EXCLUDED.league_id,
    home_team_id = EXCLUDED.home_team_id,
    away_team_id = EXCLUDED.away_team_id,
    game_date    = EXCLUDED.game_date,
    game_time    = EXCLUDED.game_time,
    game_seq     = EXCLUDED.game_seq,
    scheduled_at = EXCLUDED.scheduled_at,
    played       = EXCLUDED.played,
    home_score   = EXCLUDED.home_score,
    away_score   = EXCLUDED.away_score,
    is_playoff   = EXCLUDED.is_playoff,
    series_id    = EXCLUDED.series_id;

-- prune된(시리즈 조기 확정으로 JSONB에서 splice된) 경기 회수 —
-- 이전 실행에서 들어왔지만 지금은 원본 배열에 없는 행 제거
DELETE FROM public.games g
WHERE NOT EXISTS (
    SELECT 1 FROM rooms r, LATERAL jsonb_array_elements(r.schedule) e
    WHERE r.id = g.room_id AND e->>'id' = g.game_id
);
