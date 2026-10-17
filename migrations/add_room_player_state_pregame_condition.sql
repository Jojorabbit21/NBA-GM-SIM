-- ============================================================
-- 경기 전 체력 스냅샷 — room_player_state.pregame_condition (docs/plan/multiplayer-fatigue.md 5장)
--
-- 서버(simRunner)는 경기를 시뮬하는 즉시(리플레이 공개 전) condition을 경기 후 값으로 덮어쓴다.
-- 공개 전까지 클라이언트가 "이전 체력"을 보여줄 수 있도록, 같은 upsert에서 그 경기를 시작할 때의
-- 체력(따라잡기 회복 반영 후 엔진 입력값)을 이 칼럼에 함께 기록한다. 공개 전 경기가 없으면 쓰지 않는 값이며
-- 자정 회복(apply_fatigue_recovery)은 건드리지 않는다.
--
-- 순수 추가 — 구버전 서버/클라이언트는 이 칼럼을 모르고 지나간다.
-- ============================================================

ALTER TABLE public.room_player_state
    ADD COLUMN IF NOT EXISTS pregame_condition numeric;
