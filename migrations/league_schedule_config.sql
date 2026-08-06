-- ============================================================
-- league_schedule_config.sql — 메인리그(main_league) 스케줄 압축 설정
--
-- 배경: 메인리그는 실제 NBA 방식 82경기(30팀, 1230경기) 스케줄을 관리자가
-- 정한 1~4주 실제 기간으로 압축해서 진행한다. 그 압축에 필요한 설정값들.
-- 상세: docs/history/dev-log.md 메인리그 스케줄 생성 항목 참조.
-- ============================================================

ALTER TABLE public.leagues
    ADD COLUMN IF NOT EXISTS duration_weeks         integer,
    ADD COLUMN IF NOT EXISTS daily_window_start_min  integer,
    ADD COLUMN IF NOT EXISTS daily_window_end_min    integer,
    ADD COLUMN IF NOT EXISTS playoff_team_count      integer DEFAULT 8;
