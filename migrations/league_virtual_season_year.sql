-- ============================================================
-- league_virtual_season_year.sql — 메인리그 가상 시즌 연도
--
-- 배경: 메인리그(main_league)는 실제 실행 시각(scheduled_at, 관리자가 정한 1~4주
-- 압축 기간 안에서 진행)과 사용자에게 보여지는 가상 NBA 캘린더 날짜(game_date/
-- game_time, "2027년 10월 24일" 같은 형태)가 의도적으로 서로 다르다. 지금까지는
-- generateSeasonSchedule()이 항상 nowDate.getFullYear()를 가상 시즌 연도로 썼는데,
-- 관리자가 가상 시즌 연도를 직접 지정할 수 있어야 한다는 요구사항 반영.
-- 상세: docs/history/dev-log.md 참조.
-- ============================================================

ALTER TABLE public.leagues
    ADD COLUMN IF NOT EXISTS virtual_season_year integer;
