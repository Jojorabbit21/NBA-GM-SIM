-- ============================================================
-- [적용] 2026-10-05 Supabase MCP로 3회 반영(part1 테이블/트리거, part2 어드민 RPC+백필 7건, 트랜잭션 로그 선수이름 추가)
-- 리그 세션 감사 로그 (league_action_logs) — 어드민 전용 열람, 트리거 자동 기록
--
-- 배경(2026-10-05 사용자 요청): 세션별로 사용자가 내린 결정(영입/방출/트레이드/드래프트/설정 변경)을 리그 어드민만
-- 볼 수 있는 로그로 남기고 세션 설정 화면에 "로그" 탭을 둔다. 기존 league_transactions(fa_sign/waive, 멤버 전원 열람)와
-- league_trade_offers/league_events는 행위자·종류·열람 통제가 제각각이라 전용 표를 신설.
-- 범위(사용자 결정): 로스터 변동 + 트레이드 제안/블록/요구사항 + 드래프트 픽 + 리그 설정 변경 + 어드민 조작.
-- 전술/뎁스차트 변경은 기록하지 않음(추적 불필요). 추정 용량 시즌당 ~2MB.
--
-- 기록 방식: 기존 테이블에 AFTER 트리거(SECURITY DEFINER → RLS 우회해 insert) — RPC/클라이언트는 손대지 않음.
--   league_transactions INSERT          → fa_sign / waive
--   league_trade_offers INSERT(지연 제약 트리거, 커밋 시점이라 선수 행이 존재) → trade_offer_create
--   league_trade_offers UPDATE OF status → trade_offer_accept / reject / cancel / expire / invalidate
--   league_trade_blocks INSERT/DELETE    → trade_block_set / unset (트레이드 성사로 팀을 떠난 선수의 정리 삭제는 제외)
--   league_teams UPDATE                  → trade_request_update(요구사항 4컬럼) / team_reassign(user_id)
--   draft_picks INSERT                   → draft_pick
--   leagues UPDATE                       → league_settings_update(설정 컬럼만, 바뀐 컬럼의 전후 값)
--   execute_admin_trade 내부             → admin_trade (RPC 재정의)
--   admin_time_jump 내부                 → admin_time_jump (RPC 재정의)
-- 행위자: auth.uid() (SECURITY DEFINER RPC 안에서도 호출자 uid). Fly 서버(service role)는 null → 'system'.
-- 표시용 이메일/닉네임은 기록 시점에 profiles에서 복사(profiles는 본인만 읽을 수 있어 어드민이 나중에 조회 불가).
-- 열람: 해당 리그 admin_user_id 또는 is_global_admin(). 클라이언트 insert/update/delete 정책 없음.
-- [적용] 2026-10-05 Supabase MCP로 반영
-- ============================================================

CREATE TABLE IF NOT EXISTS public.league_action_logs (
    id               bigserial PRIMARY KEY,
    room_id          uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    league_id        uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
    actor_user_id    uuid,
    actor_role       text NOT NULL CHECK (actor_role IN ('user','league_admin','global_admin','system')),
    actor_email      text,
    actor_nickname   text,
    team_id          uuid,
    action           text NOT NULL,
    target_player_ids text[] NOT NULL DEFAULT '{}',
    target_team_ids  uuid[] NOT NULL DEFAULT '{}',
    details          jsonb NOT NULL DEFAULT '{}'::jsonb,
    sim_date         date,
    created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS league_action_logs_room_created_idx ON public.league_action_logs (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS league_action_logs_room_action_idx  ON public.league_action_logs (room_id, action);
CREATE INDEX IF NOT EXISTS league_action_logs_room_actor_idx   ON public.league_action_logs (room_id, actor_user_id);

ALTER TABLE public.league_action_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lal_admin_select ON public.league_action_logs;
CREATE POLICY lal_admin_select ON public.league_action_logs FOR SELECT
    USING (public.is_global_admin() OR EXISTS (SELECT 1 FROM public.leagues l WHERE l.id = league_action_logs.league_id AND l.admin_user_id = auth.uid()));

-- ── 공용 기록 함수 ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.league_action_log_write(
    p_room_id uuid, p_team_id uuid, p_action text,
    p_player_ids text[] DEFAULT '{}', p_team_ids uuid[] DEFAULT '{}', p_details jsonb DEFAULT '{}'::jsonb,
    p_actor uuid DEFAULT NULL, p_force_system boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
    v_league uuid; v_admin uuid; v_actor uuid; v_role text; v_email text; v_nick text; v_sim date;
BEGIN
    SELECT r.league_id, l.admin_user_id INTO v_league, v_admin FROM rooms r JOIN leagues l ON l.id = r.league_id WHERE r.id = p_room_id;
    IF v_league IS NULL THEN RETURN; END IF;
    v_actor := CASE WHEN p_force_system THEN NULL ELSE coalesce(auth.uid(), p_actor) END;
    IF v_actor IS NULL THEN v_role := 'system';
    ELSIF v_actor = v_admin THEN v_role := 'league_admin';
    ELSIF EXISTS (SELECT 1 FROM profiles WHERE id = v_actor AND is_admin) THEN v_role := 'global_admin';
    ELSE v_role := 'user'; END IF;
    IF v_actor IS NOT NULL THEN SELECT email, nickname INTO v_email, v_nick FROM profiles WHERE id = v_actor; END IF;
    BEGIN v_sim := public.current_virtual_date(p_room_id); EXCEPTION WHEN OTHERS THEN v_sim := NULL; END;
    INSERT INTO league_action_logs (room_id, league_id, actor_user_id, actor_role, actor_email, actor_nickname, team_id, action,
                                    target_player_ids, target_team_ids, details, sim_date)
    VALUES (p_room_id, v_league, v_actor, v_role, v_email, v_nick, p_team_id, p_action,
            coalesce(p_player_ids, '{}'), coalesce(p_team_ids, '{}'), coalesce(p_details, '{}'::jsonb), v_sim);
EXCEPTION WHEN OTHERS THEN
    -- 로그 실패가 본 작업을 막으면 안 된다
    RAISE WARNING '[league_action_log_write] % (%)', SQLERRM, p_action;
END;
$function$;

-- ── 1. league_transactions → fa_sign / waive ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_lal_transactions() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_name text;
BEGIN
    SELECT name INTO v_name FROM meta_players WHERE id::text = NEW.player_id;
    PERFORM public.league_action_log_write(NEW.room_id, NEW.team_id, NEW.type, ARRAY[NEW.player_id], ARRAY[NEW.team_id],
        coalesce(NEW.details, '{}'::jsonb) || jsonb_build_object('resolved_as_admin', NEW.resolved_as_admin,
            'player', jsonb_build_object('id', NEW.player_id, 'name', v_name)), NEW.acted_by);
    RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS lal_transactions_ai ON public.league_transactions;
CREATE TRIGGER lal_transactions_ai AFTER INSERT ON public.league_transactions FOR EACH ROW EXECUTE FUNCTION public.trg_lal_transactions();

-- ── 2. league_trade_offers → 생성(지연) / 상태 변화 ─────────────────────────────
CREATE OR REPLACE FUNCTION public.lal_offer_details(p_offer_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
    SELECT jsonb_build_object(
        'offer_id', o.id, 'message', o.message,
        'from_team', jsonb_build_object('id', fa.id, 'slug', fa.team_slug, 'name', fa.team_name),
        'to_team',   jsonb_build_object('id', tb.id, 'slug', tb.team_slug, 'name', tb.team_name),
        'players_from', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.player_id, 'name', mp.name)) FROM league_trade_offer_players p LEFT JOIN meta_players mp ON mp.id::text = p.player_id WHERE p.offer_id = o.id AND p.from_team_id = o.from_team_id), '[]'::jsonb),
        'players_to',   coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.player_id, 'name', mp.name)) FROM league_trade_offer_players p LEFT JOIN meta_players mp ON mp.id::text = p.player_id WHERE p.offer_id = o.id AND p.from_team_id = o.to_team_id), '[]'::jsonb),
        'resolved_as_admin', o.resolved_as_admin)
    FROM league_trade_offers o LEFT JOIN league_teams fa ON fa.id = o.from_team_id LEFT JOIN league_teams tb ON tb.id = o.to_team_id
    WHERE o.id = p_offer_id;
$function$;

CREATE OR REPLACE FUNCTION public.trg_lal_offer_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_players text[];
BEGIN
    SELECT array_agg(player_id) INTO v_players FROM league_trade_offer_players WHERE offer_id = NEW.id;
    PERFORM public.league_action_log_write(NEW.room_id, NEW.from_team_id, 'trade_offer_create', coalesce(v_players, '{}'),
        ARRAY[NEW.from_team_id, NEW.to_team_id], public.lal_offer_details(NEW.id), NEW.created_by);
    RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS lal_offer_ai ON public.league_trade_offers;
CREATE CONSTRAINT TRIGGER lal_offer_ai AFTER INSERT ON public.league_trade_offers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.trg_lal_offer_insert();

CREATE OR REPLACE FUNCTION public.trg_lal_offer_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_action text; v_team uuid; v_players text[]; v_actor uuid; v_system boolean := false;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    v_action := CASE NEW.status
        WHEN 'accepted' THEN 'trade_offer_accept' WHEN 'rejected' THEN 'trade_offer_reject' WHEN 'cancelled' THEN 'trade_offer_cancel'
        WHEN 'expired' THEN 'trade_offer_expire' WHEN 'invalidated' THEN 'trade_offer_invalidate' ELSE NULL END;
    IF v_action IS NULL THEN RETURN NEW; END IF;
    v_team := CASE WHEN NEW.status IN ('accepted','rejected') THEN NEW.to_team_id ELSE NEW.from_team_id END;
    v_actor := NEW.resolved_by;
    IF NEW.status IN ('expired','invalidated') THEN v_system := (auth.uid() IS NULL); END IF;
    SELECT array_agg(player_id) INTO v_players FROM league_trade_offer_players WHERE offer_id = NEW.id;
    PERFORM public.league_action_log_write(NEW.room_id, v_team, v_action, coalesce(v_players, '{}'),
        ARRAY[NEW.from_team_id, NEW.to_team_id], public.lal_offer_details(NEW.id), v_actor, v_system);
    RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS lal_offer_au ON public.league_trade_offers;
CREATE TRIGGER lal_offer_au AFTER UPDATE OF status ON public.league_trade_offers FOR EACH ROW EXECUTE FUNCTION public.trg_lal_offer_status();

-- ── 3. league_trade_blocks → set / unset ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_lal_blocks() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_name text; v_on_roster boolean;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT name INTO v_name FROM meta_players WHERE id::text = NEW.player_id;
        PERFORM public.league_action_log_write(NEW.room_id, NEW.team_id, 'trade_block_set', ARRAY[NEW.player_id], ARRAY[NEW.team_id],
            jsonb_build_object('player', jsonb_build_object('id', NEW.player_id, 'name', v_name)));
        RETURN NEW;
    ELSE
        -- 트레이드 성사/어드민 트레이드가 이동 선수의 블록을 정리하는 DELETE는 사용자 결정이 아니므로 제외
        SELECT (roster ? OLD.player_id) INTO v_on_roster FROM league_teams WHERE id = OLD.team_id;
        IF coalesce(v_on_roster, false) THEN
            SELECT name INTO v_name FROM meta_players WHERE id::text = OLD.player_id;
            PERFORM public.league_action_log_write(OLD.room_id, OLD.team_id, 'trade_block_unset', ARRAY[OLD.player_id], ARRAY[OLD.team_id],
                jsonb_build_object('player', jsonb_build_object('id', OLD.player_id, 'name', v_name)));
        END IF;
        RETURN OLD;
    END IF;
END; $function$;
DROP TRIGGER IF EXISTS lal_blocks_aiud ON public.league_trade_blocks;
CREATE TRIGGER lal_blocks_aiud AFTER INSERT OR DELETE ON public.league_trade_blocks FOR EACH ROW EXECUTE FUNCTION public.trg_lal_blocks();

-- ── 4. league_teams → 요구사항 변경 / 팀 담당자 재배정 ───────────────────────────
CREATE OR REPLACE FUNCTION public.trg_lal_teams() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_changed jsonb := '{}'::jsonb;
BEGIN
    IF NEW.trade_request_note IS DISTINCT FROM OLD.trade_request_note THEN
        v_changed := v_changed || jsonb_build_object('note', jsonb_build_object('before', OLD.trade_request_note, 'after', NEW.trade_request_note)); END IF;
    IF NEW.trade_request_positions IS DISTINCT FROM OLD.trade_request_positions THEN
        v_changed := v_changed || jsonb_build_object('positions', jsonb_build_object('before', to_jsonb(OLD.trade_request_positions), 'after', to_jsonb(NEW.trade_request_positions))); END IF;
    IF NEW.trade_request_player_ids IS DISTINCT FROM OLD.trade_request_player_ids THEN
        v_changed := v_changed || jsonb_build_object('player_ids', jsonb_build_object('before', to_jsonb(OLD.trade_request_player_ids), 'after', to_jsonb(NEW.trade_request_player_ids))); END IF;
    IF NEW.trade_request_archetypes IS DISTINCT FROM OLD.trade_request_archetypes THEN
        v_changed := v_changed || jsonb_build_object('archetypes', jsonb_build_object('before', to_jsonb(OLD.trade_request_archetypes), 'after', to_jsonb(NEW.trade_request_archetypes))); END IF;
    IF v_changed <> '{}'::jsonb THEN
        PERFORM public.league_action_log_write(NEW.room_id, NEW.id, 'trade_request_update', '{}', ARRAY[NEW.id], jsonb_build_object('changed', v_changed));
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        PERFORM public.league_action_log_write(NEW.room_id, NEW.id, 'team_reassign', '{}', ARRAY[NEW.id],
            jsonb_build_object('team', jsonb_build_object('id', NEW.id, 'slug', NEW.team_slug, 'name', NEW.team_name), 'before_user_id', OLD.user_id, 'after_user_id', NEW.user_id, 'is_ai', NEW.is_ai));
    END IF;
    RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS lal_teams_au ON public.league_teams;
CREATE TRIGGER lal_teams_au AFTER UPDATE ON public.league_teams FOR EACH ROW EXECUTE FUNCTION public.trg_lal_teams();

-- ── 5. draft_picks → draft_pick ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_lal_draft_picks() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_team uuid;
BEGIN
    SELECT id INTO v_team FROM league_teams WHERE room_id = NEW.room_id AND (id::text = NEW.team_id OR team_slug = NEW.team_id) LIMIT 1;
    PERFORM public.league_action_log_write(NEW.room_id, v_team, 'draft_pick', ARRAY[NEW.player_id::text], CASE WHEN v_team IS NULL THEN '{}'::uuid[] ELSE ARRAY[v_team] END,
        jsonb_build_object('round', NEW.round, 'slot', NEW.slot, 'pick_index', NEW.pick_index, 'player', jsonb_build_object('id', NEW.player_id, 'name', NEW.player_name, 'position', NEW.position, 'ovr', NEW.ovr),
                           'team_name', NEW.team_name, 'is_ai', NEW.is_ai),
        NEW.user_id, coalesce(NEW.is_ai, false));
    RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS lal_draft_picks_ai ON public.draft_picks;
CREATE TRIGGER lal_draft_picks_ai AFTER INSERT ON public.draft_picks FOR EACH ROW EXECUTE FUNCTION public.trg_lal_draft_picks();

-- ── 6. leagues 설정 변경 ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_lal_league_settings() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
    v_cols text[] := ARRAY['name','max_teams','cap_enabled','finance_enabled','trade_enabled','fa_enabled','rookie_draft_enabled','coaching_enabled',
        'training_enabled','start_draft_enabled','draft_pool','draft_format','draft_pool_strategy','draft_pick_duration_sec','rookie_pool_inclusion',
        'draft_scheduled_at','tournament_format','match_format','season_start_date','real_time_pace','draft_total_rounds','season_end_date',
        'draft_ovr_min','draft_ovr_max','finals_match_format','tournament_start_at','games_per_real_day','sim_real_start_at','draft_auto_pick_after_misses',
        'duration_weeks','daily_window_start_min','daily_window_end_min','playoff_team_count','virtual_season_year','play_in_enabled',
        'salary_cap_amount','luxury_tax_enabled','luxury_tax_amount','apron1_enabled','apron1_amount','apron2_enabled','apron2_amount',
        'salary_floor_enabled','salary_floor_amount','cba_rules_enabled','draft_year_max','draft_year_min','cap_growth_rate',
        'trade_deadline_date','trade_deadline_enabled','max_roster_size','two_way_deadline_date','two_way_slots','use_custom_overrides',
        'day_length_min','playoff_game_interval_days','replay_minutes','personal_draft_format','two_way_enabled','draft_deadline_at',
        'contract_mode','draft_salary_scale','trade_salary_matching_enabled'];
    v_old jsonb := to_jsonb(OLD); v_new jsonb := to_jsonb(NEW); v_changed jsonb := '{}'::jsonb; c text; v_room uuid;
BEGIN
    FOREACH c IN ARRAY v_cols LOOP
        IF v_old -> c IS DISTINCT FROM v_new -> c THEN
            v_changed := v_changed || jsonb_build_object(c, jsonb_build_object('before', v_old -> c, 'after', v_new -> c));
        END IF;
    END LOOP;
    IF v_changed = '{}'::jsonb THEN RETURN NEW; END IF;
    SELECT id INTO v_room FROM rooms WHERE league_id = NEW.id ORDER BY created_at DESC LIMIT 1;
    IF v_room IS NULL THEN RETURN NEW; END IF;
    PERFORM public.league_action_log_write(v_room, NULL, 'league_settings_update', '{}', '{}', jsonb_build_object('changed', v_changed));
    RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS lal_league_settings_au ON public.leagues;
CREATE TRIGGER lal_league_settings_au AFTER UPDATE ON public.leagues FOR EACH ROW EXECUTE FUNCTION public.trg_lal_league_settings();

-- ── 7. 어드민 RPC 내부 기록 — execute_admin_trade (본문은 기존과 동일, 마지막에 로그 1줄) ─────
CREATE OR REPLACE FUNCTION public.execute_admin_trade(p_room_id uuid, p_admin_user_id uuid, p_team_a_id uuid, p_team_b_id uuid, p_players_a_to_b jsonb, p_players_b_to_a jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
    v_admin_id uuid; v_team_a league_teams%ROWTYPE; v_team_b league_teams%ROWTYPE; v_id text; v_moved text[];
BEGIN
    IF p_team_a_id = p_team_b_id THEN RAISE EXCEPTION 'same_team'; END IF;
    SELECT l.admin_user_id INTO v_admin_id FROM rooms r JOIN leagues l ON l.id = r.league_id WHERE r.id = p_room_id;
    IF v_admin_id IS NULL OR v_admin_id != p_admin_user_id THEN RAISE EXCEPTION 'not_admin'; END IF;
    PERFORM 1 FROM league_teams WHERE id IN (p_team_a_id, p_team_b_id) ORDER BY id FOR UPDATE;
    SELECT * INTO v_team_a FROM league_teams WHERE id = p_team_a_id AND room_id = p_room_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'team_a_not_found'; END IF;
    SELECT * INTO v_team_b FROM league_teams WHERE id = p_team_b_id AND room_id = p_room_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'team_b_not_found'; END IF;
    FOR v_id IN SELECT jsonb_array_elements_text(p_players_a_to_b) LOOP
        IF NOT (v_team_a.roster ? v_id) THEN RAISE EXCEPTION 'player_not_on_team_a: %', v_id; END IF;
    END LOOP;
    FOR v_id IN SELECT jsonb_array_elements_text(p_players_b_to_a) LOOP
        IF NOT (v_team_b.roster ? v_id) THEN RAISE EXCEPTION 'player_not_on_team_b: %', v_id; END IF;
    END LOOP;
    UPDATE league_teams SET roster = (SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements_text(league_teams.roster) e WHERE e NOT IN (SELECT jsonb_array_elements_text(p_players_a_to_b))) || p_players_b_to_a WHERE id = p_team_a_id;
    UPDATE league_teams SET roster = (SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements_text(league_teams.roster) e WHERE e NOT IN (SELECT jsonb_array_elements_text(p_players_b_to_a))) || p_players_a_to_b WHERE id = p_team_b_id;
    SELECT array_agg(e) INTO v_moved FROM (SELECT jsonb_array_elements_text(p_players_a_to_b) e UNION ALL SELECT jsonb_array_elements_text(p_players_b_to_a)) s;
    IF v_moved IS NOT NULL THEN
        UPDATE league_trade_offers o SET status = 'invalidated', resolved_at = now()
        WHERE o.status = 'pending' AND o.room_id = p_room_id AND EXISTS (SELECT 1 FROM league_trade_offer_players ip WHERE ip.offer_id = o.id AND ip.player_id = ANY(v_moved));
        DELETE FROM league_trade_blocks WHERE player_id = ANY(v_moved) AND team_id IN (p_team_a_id, p_team_b_id);
    END IF;
    -- [2026-10-05] 감사 로그
    PERFORM public.league_action_log_write(p_room_id, NULL, 'admin_trade', coalesce(v_moved, '{}'), ARRAY[p_team_a_id, p_team_b_id],
        jsonb_build_object(
            'team_a', jsonb_build_object('id', v_team_a.id, 'slug', v_team_a.team_slug, 'name', v_team_a.team_name),
            'team_b', jsonb_build_object('id', v_team_b.id, 'slug', v_team_b.team_slug, 'name', v_team_b.team_name),
            'players_a_to_b', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', e, 'name', mp.name)), '[]'::jsonb) FROM jsonb_array_elements_text(p_players_a_to_b) e LEFT JOIN meta_players mp ON mp.id::text = e),
            'players_b_to_a', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', e, 'name', mp.name)), '[]'::jsonb) FROM jsonb_array_elements_text(p_players_b_to_a) e LEFT JOIN meta_players mp ON mp.id::text = e)),
        p_admin_user_id);
    RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ── 8. admin_time_jump — 기존 본문 끝에 로그 1줄 (leagues.time_jump_log는 그대로 유지) ─────
-- 본문이 길어 여기엔 변경 지점만 적는다: `update leagues ... time_jump_log ...` 직후에
--   PERFORM public.league_action_log_write(v_room, NULL, 'admin_time_jump', '{}', '{}',
--       jsonb_build_object('through', p_through_virtual_date, 'delta_seconds', extract(epoch from v_delta), 'note', p_note,
--                          'rows_shifted', v_rows_shifted, 'games_shifted', v_games_shifted, 'games_relaid', v_games_relaid), v_uid);
-- 를 추가해 CREATE OR REPLACE 했다(전체 본문은 DB의 pg_get_functiondef('admin_time_jump') 참고).

-- ── 9. 백필 — 기존 league_transactions / league_trade_offers 이력 ───────────────
INSERT INTO public.league_action_logs (room_id, league_id, actor_user_id, actor_role, actor_email, actor_nickname, team_id, action, target_player_ids, target_team_ids, details, sim_date, created_at)
SELECT t.room_id, r.league_id, t.acted_by,
       CASE WHEN t.acted_by IS NULL THEN 'system' WHEN t.acted_by = l.admin_user_id THEN 'league_admin' ELSE 'user' END,
       p.email, p.nickname, t.team_id, t.type, ARRAY[t.player_id], ARRAY[t.team_id],
       coalesce(t.details, '{}'::jsonb) || jsonb_build_object('resolved_as_admin', t.resolved_as_admin, 'backfilled', true,
           'player', jsonb_build_object('id', t.player_id, 'name', mp.name)), t.sim_date, t.created_at
FROM league_transactions t JOIN rooms r ON r.id = t.room_id JOIN leagues l ON l.id = r.league_id LEFT JOIN profiles p ON p.id = t.acted_by LEFT JOIN meta_players mp ON mp.id::text = t.player_id
WHERE NOT EXISTS (SELECT 1 FROM league_action_logs x WHERE x.room_id = t.room_id AND x.action = t.type AND x.created_at = t.created_at);

INSERT INTO public.league_action_logs (room_id, league_id, actor_user_id, actor_role, actor_email, actor_nickname, team_id, action, target_player_ids, target_team_ids, details, sim_date, created_at)
SELECT o.room_id, o.league_id, o.created_by,
       CASE WHEN o.created_by = l.admin_user_id THEN 'league_admin' ELSE 'user' END, p.email, p.nickname,
       o.from_team_id, 'trade_offer_create',
       coalesce((SELECT array_agg(player_id) FROM league_trade_offer_players WHERE offer_id = o.id), '{}'),
       ARRAY[o.from_team_id, o.to_team_id], public.lal_offer_details(o.id) || jsonb_build_object('backfilled', true), o.sim_date_at_creation, o.created_at
FROM league_trade_offers o JOIN leagues l ON l.id = o.league_id LEFT JOIN profiles p ON p.id = o.created_by
WHERE NOT EXISTS (SELECT 1 FROM league_action_logs x WHERE x.action = 'trade_offer_create' AND x.details->>'offer_id' = o.id::text);

INSERT INTO public.league_action_logs (room_id, league_id, actor_user_id, actor_role, actor_email, actor_nickname, team_id, action, target_player_ids, target_team_ids, details, sim_date, created_at)
SELECT o.room_id, o.league_id, o.resolved_by,
       CASE WHEN o.resolved_by IS NULL THEN 'system' WHEN o.resolved_by = l.admin_user_id THEN 'league_admin' ELSE 'user' END, p.email, p.nickname,
       CASE WHEN o.status IN ('accepted','rejected') THEN o.to_team_id ELSE o.from_team_id END,
       CASE o.status WHEN 'accepted' THEN 'trade_offer_accept' WHEN 'rejected' THEN 'trade_offer_reject' WHEN 'cancelled' THEN 'trade_offer_cancel' WHEN 'expired' THEN 'trade_offer_expire' ELSE 'trade_offer_invalidate' END,
       coalesce((SELECT array_agg(player_id) FROM league_trade_offer_players WHERE offer_id = o.id), '{}'),
       ARRAY[o.from_team_id, o.to_team_id], public.lal_offer_details(o.id) || jsonb_build_object('backfilled', true), o.sim_date_at_creation, coalesce(o.resolved_at, o.created_at)
FROM league_trade_offers o JOIN leagues l ON l.id = o.league_id LEFT JOIN profiles p ON p.id = o.resolved_by
WHERE o.status IN ('accepted','rejected','cancelled','expired','invalidated')
  AND NOT EXISTS (SELECT 1 FROM league_action_logs x WHERE x.action LIKE 'trade_offer_%' AND x.action <> 'trade_offer_create' AND x.details->>'offer_id' = o.id::text);
