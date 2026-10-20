
-- ============================================================
-- get_player_season_stats_league: p_is_playoff가 NULL이면 "정규시즌+플레이오프 합산"
--
-- 배경(2026-10-20): get_player_season_stats_full / _batch는 games JOIN에 is_allstar=false만 있고 is_playoff 구분이
-- 없어 "올스타 제외 전 경기 누적"이다. 이 둘을 league 쿼리의 방 단위 공유 캐시로 통합하려면(클라이언트
-- usePlayerSeasonStatsFull/Batch) league RPC도 같은 의미(전 경기 합산)를 낼 수 있어야 한다 — 세 RPC가 같은
-- game_pbp 전 경기 스캔을 각자 반복해 임시 파일 약 5GB/100분을 쓰던 것을 줄이려는 작업(docs/history/dev-log.md).
--
-- 변경: games JOIN 조건
--   AND g.is_playoff = p_is_playoff
-- →
--   AND (p_is_playoff IS NULL OR g.is_playoff = p_is_playoff)
-- 시그니처(uuid, uuid[], boolean) 불변 — 기존 호출(true/false/생략)은 결과가 동일. 함수 본문 나머지는 건드리지 않도록
-- 현재 정의(pg_get_functiondef)에서 해당 조건 한 곳만 치환해 재생성한다(전체 본문 재입력 시 오타 방지).
--
-- 롤백: 아래 DO 블록의 from/to를 뒤집어 실행(NULL 지원 조건 → 원래 조건).
--   v_from := 'AND (p_is_playoff IS NULL OR g.is_playoff = p_is_playoff)';
--   v_to   := 'AND g.is_playoff = p_is_playoff';
-- ============================================================

DO $mig$
DECLARE
    v_oid  oid;
    v_def  text;
    v_from text := 'AND g.is_allstar = false AND g.is_playoff = p_is_playoff';
    v_to   text := 'AND g.is_allstar = false AND (p_is_playoff IS NULL OR g.is_playoff = p_is_playoff)';
BEGIN
    SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_player_season_stats_league';
    IF v_oid IS NULL THEN RAISE EXCEPTION 'get_player_season_stats_league not found'; END IF;

    v_def := pg_get_functiondef(v_oid);
    IF position(v_to IN v_def) > 0 THEN
        RAISE NOTICE 'already applied — skip';
        RETURN;
    END IF;
    IF position(v_from IN v_def) = 0 THEN
        RAISE EXCEPTION 'expected JOIN condition not found — function definition changed, review manually';
    END IF;

    EXECUTE replace(v_def, v_from, v_to);
END
$mig$;
