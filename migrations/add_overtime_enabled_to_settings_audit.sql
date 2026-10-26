-- [2026-10-26] 리그 설정 감사 로그(trg_lal_league_settings)에 연장전 스위치 추가 — 세션 설정 "엔진" 탭 토글(leagues.overtime_enabled).
-- 트리거는 기록할 칼럼을 고정 배열(v_cols)로 들고 있어 새 설정은 여기에 추가해야 로그 탭에 남는다(project_league_action_logs 메모).
DO $$
DECLARE
    v_def text;
    v_old constant text := '''trade_salary_matching_enabled''];';
BEGIN
    SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'trg_lal_league_settings';
    IF position('''overtime_enabled''' IN v_def) > 0 THEN RETURN; END IF;   -- 이미 반영
    IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'trg_lal_league_settings column list pattern missing'; END IF;
    EXECUTE replace(v_def, v_old, '''trade_salary_matching_enabled'',''overtime_enabled''];');
END $$;
