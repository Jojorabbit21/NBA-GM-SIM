-- ============================================================
-- league_events.sim_date 컬럼 추가 + 기존 행 백필
--
-- 배경: 뉴스피드 헤더에 날짜 범위 필터 요청 — 여기서 "날짜"는 실제(wall-clock) created_at이
-- 아니라 리그가 압축 스케줄로 진행되는 인게임 날짜(games.game_date, rooms.sim_date와 같은
-- 축)를 의미한다. league_events엔 이 값이 없어서 새 컬럼으로 스냅샷한다 — 정확히
-- add_sim_date_to_trade_offers.sql(league_trade_offers.sim_date_at_creation, 2026-08-31
-- 적용)과 동일한 패턴.
--
-- 기존 행 1,614건은 전부 game_id가 있으므로(트레이드 이벤트는 현재 0건) games.game_date로
-- 100% 백필 가능. 이후 새로 생기는 이벤트는 삽입 지점(server/src/simRunner.ts,
-- respond_trade_offer RPC)에서 직접 채운다.
-- [적용] 2026-09-01 Supabase MCP로 반영
-- ============================================================

ALTER TABLE public.league_events
    ADD COLUMN IF NOT EXISTS sim_date date;

UPDATE public.league_events le
SET sim_date = g.game_date
FROM public.games g
WHERE le.game_id = g.game_id AND le.room_id = g.room_id AND le.sim_date IS NULL;

-- 날짜 범위 필터(.gte/.lte) 전용 인덱스.
CREATE INDEX IF NOT EXISTS league_events_room_simdate_idx
    ON public.league_events (room_id, sim_date);
