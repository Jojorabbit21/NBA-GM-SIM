-- ============================================================
-- rollback_games_to_jsonb.sql — games 테이블 → rooms.schedule / bracket_data.schedule 복원
--
-- 컷오버(서버+클라이언트 배포) 이후 심각한 문제가 발견되어 구버전으로
-- 되돌려야 할 때만 사용. 순서: flyctl scale count 0 → 이 스크립트 실행
-- → 구버전 서버/클라이언트 재배포 → flyctl scale count 1.
-- ============================================================

UPDATE rooms r SET schedule = COALESCE(sub.arr, '[]'::jsonb)
FROM (
    SELECT room_id, jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id',          game_id,
        'homeTeamId',  home_team_id,
        'awayTeamId',  away_team_id,
        'date',        to_char(game_date, 'YYYY-MM-DD'),
        'time',        game_time,
        'game_seq',    game_seq,
        'scheduledAt', to_char(scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'homeScore',   home_score,
        'awayScore',   away_score,
        'played',      played,
        'isPlayoff',   is_playoff,
        'seriesId',    series_id
    )) ORDER BY game_seq, game_id) AS arr
    FROM games GROUP BY room_id
) sub
WHERE sub.room_id = r.id;

UPDATE leagues l SET bracket_data = jsonb_set(
    COALESCE(l.bracket_data, '{}'::jsonb), '{schedule}', r.schedule
)
FROM rooms r
WHERE r.league_id = l.id AND l.bracket_data IS NOT NULL;
