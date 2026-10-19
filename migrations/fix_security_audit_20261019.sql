-- 2026-10-19 보안 점검(1차) 후속 수정. 배경·재현 결과는 docs/history/dev-log.md 같은 날짜 항목 참고.
--
--  1) league_teams  : 소유자가 자기 팀 roster/is_ai/draft_order 등을 직접 UPDATE 가능 → 보호 컬럼 트리거
--  2) league_teams  : INSERT 정책이 모든 사용자(anon 포함)에게 열림 → 삭제, 리그 어드민 전용으로 교체
--  3) room_members  : 본인 행의 is_ai / ai_gm_* 직접 변경·is_ai 행 직접 INSERT → 보호 트리거
--  4) meta_schedule : ALL true 정책(누구나 수정/삭제) → 삭제 (읽기 정책 2개는 유지)
--  5) tournament_*  : 'Service role can insert' 인데 실제로는 모든 사용자 INSERT 허용 → 4개 삭제 (서버는 service_role 이라 RLS 우회)
--  6) league_action_log_write : anon/authenticated 가 감사 로그 위조 가능 → EXECUTE 회수 (내부 definer 호출은 소유자 권한이라 영향 없음)
--  7) COALESCE(p_user_id, auth.uid()) 6종 : 호출자가 넘긴 id 가 우선 → 맨 앞에 assert_caller_is(v_user_id) 삽입
--
-- "직접 UPDATE/INSERT" 판별: current_user IN ('authenticated','anon').
--   PostgREST 직접 요청은 이 역할로 실행되고, SECURITY DEFINER 함수 내부·service_role·postgres 는 다른 역할이라 통과한다.
--
-- 롤백은 파일 맨 아래 참고.

-- ── 공용 헬퍼: 호출자가 그 방의 리그 어드민/전역 어드민/service_role 인가 ────────────────

CREATE OR REPLACE FUNCTION public.caller_is_room_admin(p_room_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT coalesce(auth.role(), '') = 'service_role'
        OR coalesce(is_global_admin(), false)
        OR (auth.uid() IS NOT NULL AND EXISTS (
            SELECT 1 FROM rooms r JOIN leagues l ON l.id = r.league_id
            WHERE r.id = p_room_id AND l.admin_user_id = auth.uid()
        ))
$$;

-- ── 1) league_teams 보호 컬럼 ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_league_teams_protect_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
    IF public.caller_is_room_admin(OLD.room_id) THEN RETURN NEW; END IF;
    IF NEW.id           IS DISTINCT FROM OLD.id
    OR NEW.room_id      IS DISTINCT FROM OLD.room_id
    OR NEW.team_slug    IS DISTINCT FROM OLD.team_slug
    OR NEW.conference   IS DISTINCT FROM OLD.conference
    OR NEW.user_id      IS DISTINCT FROM OLD.user_id
    OR NEW.is_ai        IS DISTINCT FROM OLD.is_ai
    OR NEW.draft_order  IS DISTINCT FROM OLD.draft_order
    OR NEW.roster       IS DISTINCT FROM OLD.roster
    THEN
        RAISE EXCEPTION 'forbidden_column_update' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS league_teams_protect_columns ON public.league_teams;
CREATE TRIGGER league_teams_protect_columns
    BEFORE UPDATE ON public.league_teams
    FOR EACH ROW EXECUTE FUNCTION public.trg_league_teams_protect_columns();

-- ── 2) league_teams INSERT ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS league_teams_insert_all ON public.league_teams;
CREATE POLICY league_teams_insert_admin ON public.league_teams
    FOR INSERT TO authenticated
    WITH CHECK (public.caller_is_room_admin(room_id));

-- ── 3) room_members 보호 ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_room_members_protect_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
    IF public.caller_is_room_admin(NEW.room_id) THEN RETURN NEW; END IF;
    IF TG_OP = 'INSERT' THEN
        IF coalesce(NEW.is_ai, false) OR NEW.ai_gm_personality IS NOT NULL OR NEW.ai_gm_sliders IS NOT NULL THEN
            RAISE EXCEPTION 'forbidden_column_update' USING ERRCODE = '42501';
        END IF;
    ELSE
        IF NEW.room_id           IS DISTINCT FROM OLD.room_id
        OR NEW.user_id           IS DISTINCT FROM OLD.user_id
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

DROP TRIGGER IF EXISTS room_members_protect_columns ON public.room_members;
CREATE TRIGGER room_members_protect_columns
    BEFORE INSERT OR UPDATE ON public.room_members
    FOR EACH ROW EXECUTE FUNCTION public.trg_room_members_protect_columns();

-- ── 4) meta_schedule / 5) tournament_* ────────────────────────────────────────────────

DROP POLICY IF EXISTS "Enable insert/update for all users" ON public.meta_schedule;

DROP POLICY IF EXISTS "Service role can insert tournament archives"          ON public.tournament_archives;
DROP POLICY IF EXISTS "Service role can insert tournament game log"          ON public.tournament_game_log;
DROP POLICY IF EXISTS "Service role can insert tournament game player stats" ON public.tournament_game_player_stats;
DROP POLICY IF EXISTS "Service role can insert tournament team records"      ON public.tournament_team_records;

-- ── 6) 감사 로그 위조 차단 ────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.league_action_log_write(uuid, uuid, text, text[], uuid[], jsonb, uuid, boolean)
    FROM PUBLIC, anon, authenticated;

-- ── 7) COALESCE(p_user_id, auth.uid()) 함수 6종: 선언부 직후 호출자 검증 삽입 ───────────
-- 본문을 옮겨 적지 않고 현행 정의에서 첫 "BEGIN" 바로 뒤에 한 줄만 끼워 재정의한다(이미 있으면 건너뜀).

DO $patch$
DECLARE
    r       record;
    v_def   text;
    v_new   text;
    v_marker text := E'\nBEGIN\n';
BEGIN
    FOR r IN
        SELECT p.oid, p.proname
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname IN ('get_or_generate_round_pack', 'start_personal_draft', 'submit_draft_pick_v2',
                            'submit_personal_draft_pick', 'submit_personal_draft_picks')
    LOOP
        v_def := pg_get_functiondef(r.oid);
        IF v_def LIKE '%assert_caller_is(v_user_id)%' THEN CONTINUE; END IF;
        IF position(v_marker in v_def) = 0 OR v_def NOT LIKE '%v_user_id%COALESCE(p_user_id, auth.uid())%' THEN
            RAISE EXCEPTION 'unexpected definition shape: %', r.proname;
        END IF;
        v_new := overlay(v_def placing E'\nBEGIN\n    PERFORM public.assert_caller_is(v_user_id);\n'
                         from position(v_marker in v_def) for length(v_marker));
        EXECUTE v_new;
    END LOOP;
END
$patch$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK
--   DROP TRIGGER IF EXISTS league_teams_protect_columns ON public.league_teams;
--   DROP TRIGGER IF EXISTS room_members_protect_columns ON public.room_members;
--   DROP FUNCTION IF EXISTS public.trg_league_teams_protect_columns();
--   DROP FUNCTION IF EXISTS public.trg_room_members_protect_columns();
--   DROP POLICY IF EXISTS league_teams_insert_admin ON public.league_teams;
--   CREATE POLICY league_teams_insert_all ON public.league_teams FOR INSERT WITH CHECK (true);   -- 원복(비권장)
--   CREATE POLICY "Enable insert/update for all users" ON public.meta_schedule FOR ALL USING (true) WITH CHECK (true);  -- 원복(비권장)
--   (tournament_* 4개 정책은 FOR INSERT WITH CHECK (true) 로 원복 가능 — 비권장)
--   GRANT EXECUTE ON FUNCTION public.league_action_log_write(uuid, uuid, text, text[], uuid[], jsonb, uuid, boolean) TO PUBLIC;
--   7)번 6개 함수는 각 함수의 직전 migrations 정의로 CREATE OR REPLACE (add_personal_draft_rpcs.sql / submit_draft_pick_v2 정의 파일)
--   DROP FUNCTION IF EXISTS public.caller_is_room_admin(uuid);
