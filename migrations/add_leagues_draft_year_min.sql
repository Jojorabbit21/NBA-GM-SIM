-- ============================================================
-- leagues: 초기 드래프트 풀 "신인 포함 상한 연도"에 이어 하한 연도도 추가
-- 실행: 이미 Supabase MCP(apply_migration)로 적용 완료. 이 파일은 리포지토리 기록용.
-- 의존: leagues 테이블, draft_year_max 컬럼(add_leagues_draft_year_max.sql) 존재
-- 배경: 'standard'/'alltime' 풀 타입 구분에 쓰던 include_alltime/base_team_id가 둘 다
--       신뢰할 수 없는 필드로 확인됨(2026-09-16) — Ed Macauley(1950년대 선수)가
--       include_alltime=false인데도 draft_year가 null이라 필터를 통과해 'standard'만
--       쓰는 리그의 FA 풀에 새어들어오는 등, 데이터 큐레이션이 들쭉날쭉했다. draft_year는
--       상대적으로 신뢰할 수 있는 필드이므로, 풀 자격을 draft_year_min~draft_year_max
--       범위 하나로 완전히 통일하고 include_alltime/base_team_id는 풀 필터에서 제외한다
--       (docs/history/dev-log.md 2026-09-16 참조).
-- ============================================================

ALTER TABLE leagues
    ADD COLUMN IF NOT EXISTS draft_year_min INTEGER NOT NULL DEFAULT 2001;

COMMENT ON COLUMN leagues.draft_year_min IS
    '리그 최초 드래프트 풀에 포함할 최초 드래프트 연도 하한. 기본값 2001 = 약 25년 경력 윈도우("현역만") 근사치. include_alltime/base_team_id는 신뢰할 수 없는 필드로 확인되어(2026-09-16, Ed Macauley/Mitch Richmond 등이 include_alltime=false인데도 은퇴 레전드) 풀 자격 판정에서 완전히 배제하고 draft_year 범위(draft_year_min~draft_year_max)만으로 통일. 레전드를 포함하려면 1946까지 낮추면 됨.';
