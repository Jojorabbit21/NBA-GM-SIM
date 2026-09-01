-- ============================================================
-- league_trade_offers REPLICA IDENTITY FULL 설정
--
-- 배경: 사이드바(components/MultiSidebar.tsx)의 트레이드 배지가 Supabase Realtime
-- postgres_changes 구독(filter: to_team_id=eq.<내 팀>)으로 갱신되는데, INSERT(새 오퍼
-- 도착)는 배지가 잘 반영됐지만 UPDATE(mark_trade_offer_read()로 to_team_read_at만 바뀌는
-- 경우)는 반영되지 않음을 확인. 원인은 이 테이블의 REPLICA IDENTITY가 기본값(DEFAULT,
-- 기본키만 포함)이라 Realtime이 UPDATE 이벤트에 대해 필터링에 쓸 컬럼(to_team_id)을
-- 안정적으로 담지 못하는 Supabase Realtime의 잘 알려진 제약 — 이미 이 프로젝트에서도
-- league_teams 테이블은 REPLICA IDENTITY FULL로 설정돼 있어 동일 realtime 구독 패턴을
-- 정상적으로 지원하고 있었음(league_trade_offers만 누락돼 있었음).
--
-- 이 변경은 데이터/스키마를 건드리지 않는 순수 replication 설정이라 되돌리기도 쉽고
-- (DEFAULT로 재설정), 다른 기능에 부작용 없음.
--
-- [적용 완료] 2026-08-31 Supabase MCP로 반영
-- ============================================================

ALTER TABLE public.league_trade_offers REPLICA IDENTITY FULL;
