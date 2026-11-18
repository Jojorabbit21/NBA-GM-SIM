-- ============================================================
-- fix_admin_delete_league_timeout.sql — 리그 삭제가 8초에 끊기던 문제 (2026-11-18)
--
-- 증상: 시즌을 돌린 리그를 지우면 "처리 시간이 초과되었습니다". 로그상 요청 도착 → "canceling statement due to statement timeout" 까지 8초.
-- 원인: 함수 본문의 `SET LOCAL statement_timeout = '60s'` 는 효과가 없다. 제한 시간 타이머는 문장이 시작될 때(=RPC 호출 시점)
--       이미 역할 기본값 8초로 맞춰지고, 실행 도중 값을 바꿔도 돌아가는 타이머에 반영되지 않는다.
-- 수정: 제한 시간을 함수 설정으로 옮긴다. PostgREST 는 함수에 걸린 statement_timeout 을 트랜잭션 시작 때 먼저 적용(hoist)하므로
--       호출 시점부터 120초가 적용된다. 함수 본문은 건드리지 않는다(베이스: 라이브 정의 2026-11-18 — ALTER 만 하므로 본문 그대로).
--       본문에 남은 SET LOCAL 60s 는 무해한 죽은 줄(다음에 본문을 고칠 때 함께 정리).
-- 롤백: alter function public.admin_delete_league(uuid) reset statement_timeout; notify pgrst, 'reload schema';
-- ============================================================

alter function public.admin_delete_league(uuid) set statement_timeout = '120s';
notify pgrst, 'reload schema';
