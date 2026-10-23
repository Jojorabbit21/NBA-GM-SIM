-- add_league_season_calendar.sql — 리그별 시즌 달력(정규시즌 시작·종료 + 올스타 브레이크) 저장
--
-- [2026-10-23] 일정 생성기 v2(docs/plan/schedule-generator-v2.md §4). 지금까지 올스타 날짜(2/13~18)와
-- 정규시즌 범위(10/21~4/13)는 virtual_season_year만으로 계산하는 고정값이었다. v2는 요일 규칙
-- (개막=10/18 이후 첫 화요일, 종료=개막+173일, 올스타 본경기=2/14 이후 첫 일요일)으로 바뀌는데,
-- 진행 중 리그와 새 리그의 virtual_season_year가 같아 연도만으로는 구·신 규칙을 구분할 수 없다.
-- 그래서 finalize.ts가 리그 생성 시 달력을 계산해 여기에 저장하고, 모든 소비처
-- (getAllStarKeyDates / isAllStarWindowActive / postseasonVirtualAnchor)가 이 값을 읽는다.
--
-- 형태: {"version":2,"regularStart":"YYYY-MM-DD","regularEnd":"YYYY-MM-DD",
--        "allStarStart":"YYYY-MM-DD","allStarEnd":"YYYY-MM-DD"}
-- NULL = 이 변경 이전에 만든 리그 → 코드가 기존 고정 달력(utils/seasonCalendar.ts legacySeasonCalendar)으로 계산.

ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS season_calendar jsonb;

COMMENT ON COLUMN public.leagues.season_calendar IS
    '리그 시즌 달력(정규시즌 시작·종료, 올스타 브레이크 시작·종료). NULL이면 기존 고정 달력(10/21~4/13, 2/13~18). utils/seasonCalendar.ts 참고.';
