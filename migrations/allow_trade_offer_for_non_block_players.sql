-- [2026-10-16] 트레이드 블록에 올라오지 않은 선수에게도 트레이드 제안 가능하게 변경.
-- 기존: create_trade_offer는 수신 팀 선수가 league_trade_blocks에 있어야만 허용(관리자+AI팀 예외 TEMP),
--       respond_trade_offer(accept)도 비관리자는 수신 팀 선수가 블록에 있어야만 허용.
-- 변경: 두 RPC에서 블록 등록 검사(player_not_tradeable)를 제거. 로스터 소속 검사는 유지.
--
-- 되돌리는 법: create_trade_offer의 p_players_to 루프 안에
--   IF NOT EXISTS (SELECT 1 FROM league_trade_blocks WHERE team_id = p_to_team_id AND player_id = v_id) THEN
--       IF NOT (v_is_admin AND v_b.is_ai) THEN RAISE EXCEPTION 'player_not_tradeable: %', v_id; END IF;
--   END IF;
-- respond_trade_offer의 v_in 루프 안에
--   IF NOT v_admin AND NOT EXISTS (SELECT 1 FROM league_trade_blocks WHERE team_id = v_b.id AND player_id = v_id) THEN
--       RAISE EXCEPTION 'player_not_tradeable: %', v_id;
--   END IF;
-- 를 복원 (이전 전체 정의는 add_leagues_trade_deadline_enabled.sql + add_trade_salary_matching/roster_limit/min_salary 참고).
--
-- 현재 라이브 정의에서 해당 블록만 문자열 치환해 재생성 — 다른 로직(샐러리 매칭/로스터 정원 등)은 건드리지 않는다.

DO $mig$
DECLARE
    v_def text;
    v_new text;
BEGIN
    -- create_trade_offer
    SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
    WHERE p.proname = 'create_trade_offer' AND p.pronamespace = 'public'::regnamespace;
    v_new := replace(v_def,
$old$        IF NOT EXISTS (SELECT 1 FROM league_trade_blocks WHERE team_id = p_to_team_id AND player_id = v_id) THEN
            IF NOT (v_is_admin AND v_b.is_ai) THEN
                RAISE EXCEPTION 'player_not_tradeable: %', v_id;
            END IF;
        END IF;
$old$, '');
    IF v_new = v_def THEN RAISE EXCEPTION 'create_trade_offer: block check not found (already applied or definition drifted)'; END IF;
    EXECUTE v_new;

    -- respond_trade_offer
    SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
    WHERE p.proname = 'respond_trade_offer' AND p.pronamespace = 'public'::regnamespace;
    v_new := replace(v_def,
$old$            IF NOT v_admin AND NOT EXISTS (
                SELECT 1 FROM league_trade_blocks WHERE team_id = v_b.id AND player_id = v_id
            ) THEN
                RAISE EXCEPTION 'player_not_tradeable: %', v_id;
            END IF;
$old$, '');
    IF v_new = v_def THEN RAISE EXCEPTION 'respond_trade_offer: block check not found (already applied or definition drifted)'; END IF;
    EXECUTE v_new;
END
$mig$;
