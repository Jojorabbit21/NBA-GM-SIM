-- ============================================================
-- league_events (room_id, type, created_at DESC) 복합 인덱스
--
-- 배경: 멀티플레이어 뉴스피드 그리드 개편 — 화면이 경기 결과(game_result)와 기록성
-- 이벤트(player_feat/player_streak/win_streak/trade)를 별도 쿼리로 나눠 조회한다
-- (한 쿼리로 최신순만 뽑으면 시즌당 1,230건인 game_result가 거의 전부를 차지해
-- 기록 그리드가 굶는 문제). 기존 league_events_room_idx(room_id, created_at DESC)는
-- type 필터를 선택적으로 못 태운다.
-- [적용] 2026-09-01 Supabase MCP로 반영
-- ============================================================

CREATE INDEX IF NOT EXISTS league_events_room_type_idx
    ON public.league_events (room_id, type, created_at DESC);
