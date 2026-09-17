-- ============================================================
-- leagues: 초기 드래프트 풀 "신인 포함 상한 연도" 컬럼 추가
-- 실행: 이미 Supabase MCP(apply_migration)로 적용 완료. 이 파일은 리포지토리 기록용.
-- 의존: leagues 테이블 존재
-- 배경: 기존엔 draft_pool에 'rookies' 토큰을 별도 풀 타입으로 두고 체크박스로 on/off
--       했는데, 이 별도 브랜치가 standard/alltime 브랜치와 계속 따로 관리되면서 필터가
--       어긋나는 버그(base_team_id, alltime draft_year null 배제 등)가 반복됐다. draft_year로
--       이미 "신인 여부"를 판별할 수 있으므로, 별도 풀 타입 대신 standard/alltime 쿼리의
--       연도 상한 하나로 통합한다(docs/history/dev-log.md 2026-09-16 참조).
-- ============================================================

ALTER TABLE leagues
    ADD COLUMN IF NOT EXISTS draft_year_max INTEGER NOT NULL DEFAULT 2025;

COMMENT ON COLUMN leagues.draft_year_max IS
    '리그 최초 드래프트 풀에 포함할 최신 드래프트 연도 상한. 기본값 2025 = 2026 신인 클래스 미포함(기존 "rookies 체크박스 해제" 기본 동작과 동일). 2026으로 올리면 2026 신인이 standard/alltime 풀에 자연스럽게 합류(별도 rookies 풀 타입 폐지, draft_year로 판별).';
