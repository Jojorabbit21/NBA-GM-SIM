-- ============================================================
-- 멀티플레이어 체력 리셋 (D1) — docs/plan/multiplayer-fatigue.md 3-1, 7장 10단계
--
-- ⚠️ 실행 시점: 새 서버(Fly) 배포 직전, 가상 날짜 사이 틈(real_midnight_at 이후 ~ 다음 날 첫 경기 시뮬 전).
--    선행 조건: add_multiplayer_fatigue_recovery.sql 적용 완료.
--
-- - 경기 간 회복이 없던 기간(2026-09-03~)에 쌓인 체력은 버그 산물이므로 전부 버린다.
--   condition NULL = 엔진에서 100(완전 휴식)으로 간주 (simRunner §2.5는 condition != null일 때만 덮어씀).
-- - 부상(health/injury_type/return_date/injury_history)·계약(contract)·season_number는 건드리지 않는다.
-- - rooms.fatigue_recovered_through: 타임라인이 있는 방만 "현재 가상 날짜 − 1"로 초기화해 과거 날짜를
--   소급 처리하지 않게 한다. 타임라인이 없는 방(토너먼트·구 리그)은 NULL 유지(D7 — 따라잡기만 사용).
-- ============================================================

UPDATE public.room_player_state
   SET condition = NULL,
       condition_recovered_through = NULL,
       last_game_date = NULL
 WHERE condition IS NOT NULL
    OR condition_recovered_through IS NOT NULL
    OR last_game_date IS NOT NULL;

UPDATE public.rooms r
   SET fatigue_recovered_through = public.current_virtual_date(r.id) - 1
 WHERE EXISTS (SELECT 1 FROM public.league_virtual_days d WHERE d.room_id = r.id);
