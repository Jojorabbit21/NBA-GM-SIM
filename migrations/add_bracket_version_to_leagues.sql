-- ============================================================
-- add_bracket_version_to_leagues.sql — 플레이오프 브라켓 낙관적 동시성 제어(CAS)용 버전 카운터
--
-- 배경: leagues.bracket_data(JSONB)는 리그 하나에 row 하나, 그 안에 모든 시리즈가
-- 배열 하나로 뭉쳐있는 구조다. simRunner.ts의 handleTournamentAdvance()가 경기 완료마다
-- 이 컬럼을 통째로 read-modify-write 하는데, 1라운드는 설계상 모든 매치업이 같은 슬롯에서
-- 동시에 시작되므로 같은 리그의 여러 시리즈가 동시에 끝나 서로 다른 워커 스레드가 동시에
-- 같은 row를 두고 경합한다 — 나중에 쓰는 쪽만 반영되고 다른 시리즈의 승수 증가분은 통째로
-- 유실된다(브라켓 화면에서 어떤 시리즈는 4-0인데 어떤 시리즈는 계속 0-0으로 보이는 버그).
-- 워커 스레드는 서로 메모리를 공유하지 않아 in-process 락으로는 못 막으므로, "내가 읽은
-- 버전 그대로일 때만 쓴다"는 낙관적 동시성 제어(compare-and-swap)로 막는다. 상세:
-- docs/history/dev-log.md 참조.
-- ============================================================

ALTER TABLE public.leagues
    ADD COLUMN IF NOT EXISTS bracket_version integer NOT NULL DEFAULT 0;
