
-- ============================================================
-- get_player_season_stats_league: 스크린 판정 결과(SCRN%) 합산 열 3개 추가
--
-- 배경(2026-10-28): 엔진이 판정된 스크린 결과를 스크리너 박스스코어에 scrClean/scrPartial/scrFail 로 기록하기 시작한다
-- (docs/plan/advanced-metrics-plan.md §8, dev-log 2026-10-28). 선수 시즌 스탯은 이 RPC 가 유일한 클라이언트 경로이므로
-- (usePlayerSeasonStatsLeague → Full/Batch 호환 훅이 공유) 여기에 합산 열만 추가한다. 별도 RPC/훅은 만들지 않는다.
--
-- 변경: RETURNS TABLE 끝에 scr_clean, scr_partial, scr_fail (numeric) 추가 + 해당 sum 3줄.
--   값이 없는 경기(이전 기록, 스크린을 안 세운 선수)는 coalesce(..., 0).
-- 반환 컬럼이 바뀌므로 CREATE OR REPLACE 불가 → DROP 후 재생성(같은 트랜잭션). 의존 객체 없음 확인(pg_depend 0건, 2026-10-28).
-- 시그니처(uuid, uuid[], boolean)·LANGUAGE sql·STABLE·search_path 불변. 현재 정의(pg_get_functiondef)에서 두 곳만 치환해 재생성한다
-- (전체 본문 재입력 시 오타 방지 — player_season_stats_league_null_playoff.sql 과 같은 방식).
--
-- 실측(2026-10-28, 1230경기 방 EXPLAIN ANALYZE): 변경 전 약 1.6초 / 임시 파일 약 46MB — 적용 전후 비교는 dev-log 참고.
--
-- 롤백: 아래 DO 블록 대신 이걸 실행(열 3개와 sum 3줄 제거 후 DROP/재생성)
--   v_def := pg_get_functiondef(oid); v_def := replace(v_def, ', scr_clean numeric, scr_partial numeric, scr_fail numeric)', ')');
--   v_def := regexp_replace(v_def, E',\s*coalesce\(sum\(\(elem->>''scrClean''\)::numeric\), 0\) AS scr_clean,.*AS scr_fail', '');
--   DROP FUNCTION ...; EXECUTE v_def;
-- ============================================================

DO $mig$
DECLARE
    v_oid     oid;
    v_def     text;
    v_ret_from text := 'zone_atb3_r_a numeric)';
    v_ret_to   text := 'zone_atb3_r_a numeric, scr_clean numeric, scr_partial numeric, scr_fail numeric)';
    v_sel_from text := 'AS zone_atb3_r_a';
    v_sel_to   text := E'AS zone_atb3_r_a,\n        coalesce(sum((elem->>''scrClean'')::numeric), 0)     AS scr_clean,\n        coalesce(sum((elem->>''scrPartial'')::numeric), 0)   AS scr_partial,\n        coalesce(sum((elem->>''scrFail'')::numeric), 0)      AS scr_fail';
BEGIN
    SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_player_season_stats_league';
    IF v_oid IS NULL THEN RAISE EXCEPTION 'get_player_season_stats_league not found'; END IF;

    v_def := pg_get_functiondef(v_oid);
    IF position('scr_clean' IN v_def) > 0 THEN
        RAISE NOTICE 'already applied — skip';
        RETURN;
    END IF;
    IF position(v_ret_from IN v_def) = 0 OR position(v_sel_from IN v_def) = 0 THEN
        RAISE EXCEPTION 'expected anchors not found — function definition changed, review manually';
    END IF;

    v_def := replace(v_def, v_ret_from, v_ret_to);
    v_def := replace(v_def, v_sel_from, v_sel_to);

    DROP FUNCTION public.get_player_season_stats_league(uuid, uuid[], boolean);
    EXECUTE v_def;
END
$mig$;
