-- 보안 점검 후속(낮은 위험 항목 2건).
--
--  A) 함수 18개 search_path 고정 — Supabase 어드바이저 function_search_path_mutable.
--     SECURITY DEFINER 함수는 호출자의 search_path 를 그대로 쓰면 같은 이름 객체로 가로채기 여지가 있다.
--     대상 18개 모두 확장(extensions) 함수 참조가 없음을 pg_get_functiondef 로 확인한 뒤 public 으로 고정.
--  B) room_members.team_id 직접 변경 차단 — UI 가 "내 팀" 표시에 쓰는 컬럼을 본인이 임의 slug 로 바꿀 수 있었다.
--     클라이언트의 직접 쓰기 경로(roomPersistence.assignMemberTeam: 호출처 없음, leagueService.setMemberTeam:
--     TeamSetupModal 이 항상 saveOverride(RPC)를 넘겨 미실행)는 죽은 코드. 정상 변경은 SECURITY DEFINER 함수
--     (claim_team / accept_league_invite / release_player / respond_trade_offer 등) 내부라 트리거를 통과한다.
--
-- 롤백: 맨 아래 참고.

-- ── A) search_path 고정 ───────────────────────────────────────────────────────────────

DO $fix$
DECLARE
    r record;
    n int := 0;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.prokind = 'f'
          AND p.proname IN (
              'assert_caller_is', 'check_room_capacity', 'check_trade_salary_match', 'claim_team',
              'games_touch_updated_at', 'handle_new_session', 'handle_new_user', 'initialize_league_teams',
              'log_user_login', 'personal_draft_pos_group', 'personal_draft_progress_touch_updated_at',
              'player_stat_streaks_touch_updated_at', 'release_team', 'room_player_state_touch_updated_at',
              'run_draft_lottery', 'server_now', 'submit_draft_pick', 'update_team_profile')
    LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
        n := n + 1;
    END LOOP;
    IF n <> 18 THEN RAISE EXCEPTION 'expected 18 functions, patched %', n; END IF;
END
$fix$;

-- ── B) room_members 보호 트리거에 team_id 추가 ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_room_members_protect_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
    IF public.caller_is_room_admin(NEW.room_id) THEN RETURN NEW; END IF;
    IF TG_OP = 'INSERT' THEN
        IF coalesce(NEW.is_ai, false) OR NEW.ai_gm_personality IS NOT NULL OR NEW.ai_gm_sliders IS NOT NULL
           OR NEW.team_id IS NOT NULL THEN
            RAISE EXCEPTION 'forbidden_column_update' USING ERRCODE = '42501';
        END IF;
    ELSE
        IF NEW.room_id           IS DISTINCT FROM OLD.room_id
        OR NEW.user_id           IS DISTINCT FROM OLD.user_id
        OR NEW.team_id           IS DISTINCT FROM OLD.team_id
        OR NEW.is_ai             IS DISTINCT FROM OLD.is_ai
        OR NEW.ai_gm_personality IS DISTINCT FROM OLD.ai_gm_personality
        OR NEW.ai_gm_sliders     IS DISTINCT FROM OLD.ai_gm_sliders
        THEN
            RAISE EXCEPTION 'forbidden_column_update' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK
--   A) 각 함수에 ALTER FUNCTION <시그니처> RESET search_path;
--   B) trg_room_members_protect_columns 를 fix_security_audit_20261019.sql 의 정의로 CREATE OR REPLACE
