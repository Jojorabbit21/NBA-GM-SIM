-- [2026-10-20] 트레이드 역제안(카운터 오퍼)
--  * league_trade_offers.counter_of_offer_id : 이 제안이 응답한 이전 제안(스레드 체인). 원본은 NULL.
--  * status 'countered' 추가 : 역제안이 전송되면 원래 제안이 이 상태로 닫힌다(거절 통계와 분리).
--  * create_trade_offer(..., p_counter_of uuid DEFAULT NULL) : 원본 검증 + 새 제안 생성 + 원본 닫기를 한 트랜잭션으로.
--      - 원본은 pending, 같은 방, 만료 전, 그리고 "내 팀이 수신 / 상대 팀이 발신" 이어야 한다.
--      - 위반 시 'counter_original_invalid'.
--  * trg_lal_offer_status : 'countered' → 감사 로그 'trade_offer_counter' (행위자 = 수신 팀 = 역제안을 보낸 쪽)
--  * get_trade_offer_thread(p_offer_id) : 해당 제안의 이전 제안 체인(루트→직전 순), SECURITY INVOKER(RLS 그대로 적용)
-- 롤백: DROP FUNCTION create_trade_offer(uuid,uuid,uuid,jsonb,jsonb,text,uuid); DROP FUNCTION get_trade_offer_thread(uuid);
--       이전 6인자 create_trade_offer 정의 재실행; UPDATE ... SET status='rejected' WHERE status='countered';
--       status 체크를 원래 값 목록으로 복원; trg_lal_offer_status 이전 정의 복원; ALTER TABLE ... DROP COLUMN counter_of_offer_id.

ALTER TABLE public.league_trade_offers
    ADD COLUMN IF NOT EXISTS counter_of_offer_id uuid REFERENCES public.league_trade_offers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS league_trade_offers_counter_of_idx ON public.league_trade_offers (counter_of_offer_id)
    WHERE counter_of_offer_id IS NOT NULL;

ALTER TABLE public.league_trade_offers DROP CONSTRAINT IF EXISTS league_trade_offers_status_check;
ALTER TABLE public.league_trade_offers ADD CONSTRAINT league_trade_offers_status_check
    CHECK (status = ANY (ARRAY['pending','accepted','rejected','cancelled','expired','invalidated','countered']));

DROP FUNCTION IF EXISTS public.create_trade_offer(uuid, uuid, uuid, jsonb, jsonb, text);

CREATE OR REPLACE FUNCTION public.create_trade_offer(
    p_room_id uuid, p_from_team_id uuid, p_to_team_id uuid, p_players_from jsonb, p_players_to jsonb,
    p_message text DEFAULT NULL::text, p_counter_of uuid DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid     uuid := auth.uid();
    v_league  uuid;
    v_enabled boolean;
    v_deadline date;
    v_deadline_enabled boolean;
    v_sim_date date;
    v_a       league_teams%ROWTYPE;
    v_b       league_teams%ROWTYPE;
    v_id      text;
    v_offer   uuid;
    v_is_admin boolean;
    v_orig    league_trade_offers%ROWTYPE;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;
    IF p_from_team_id = p_to_team_id THEN
        RAISE EXCEPTION 'same_team';
    END IF;
    IF coalesce(jsonb_array_length(p_players_from), 0) + coalesce(jsonb_array_length(p_players_to), 0) = 0 THEN
        RAISE EXCEPTION 'empty_offer';
    END IF;
    IF length(coalesce(p_message, '')) > 300 THEN
        RAISE EXCEPTION 'message_too_long';
    END IF;

    SELECT l.id, l.trade_enabled, l.trade_deadline_date, l.trade_deadline_enabled
    INTO v_league, v_enabled, v_deadline, v_deadline_enabled
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = p_room_id;
    IF v_league IS NULL THEN
        RAISE EXCEPTION 'room_not_found';
    END IF;
    IF v_enabled IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'trade_disabled';
    END IF;
    v_sim_date := current_virtual_date(p_room_id);
    IF v_deadline_enabled IS DISTINCT FROM false AND v_deadline IS NOT NULL AND v_sim_date > v_deadline THEN
        RAISE EXCEPTION 'trade_deadline_passed';
    END IF;

    SELECT * INTO v_a FROM league_teams WHERE id = p_from_team_id AND room_id = p_room_id;
    SELECT * INTO v_b FROM league_teams WHERE id = p_to_team_id   AND room_id = p_room_id;
    IF v_a.id IS NULL OR v_b.id IS NULL THEN
        RAISE EXCEPTION 'team_not_found';
    END IF;
    IF v_a.user_id IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'not_team_owner';
    END IF;

    SELECT EXISTS (SELECT 1 FROM leagues WHERE id = v_league AND admin_user_id = v_uid) INTO v_is_admin;

    IF v_b.user_id IS NULL OR v_b.is_ai THEN
        IF NOT v_is_admin THEN
            RAISE EXCEPTION 'target_not_human';
        END IF;
    END IF;

    FOR v_id IN SELECT jsonb_array_elements_text(p_players_from) LOOP
        IF NOT (v_a.roster ? v_id) THEN
            RAISE EXCEPTION 'player_not_on_team: %', v_id;
        END IF;
    END LOOP;
    FOR v_id IN SELECT jsonb_array_elements_text(p_players_to) LOOP
        IF NOT (v_b.roster ? v_id) THEN
            RAISE EXCEPTION 'player_not_on_team: %', v_id;
        END IF;
    END LOOP;

    -- [2026-10-20] 역제안: 원본을 잠그고 검증 (내 팀=원본 수신, 상대 팀=원본 발신, 대기 중, 같은 방, 만료 전)
    IF p_counter_of IS NOT NULL THEN
        SELECT * INTO v_orig FROM league_trade_offers WHERE id = p_counter_of FOR UPDATE;
        IF v_orig.id IS NULL
           OR v_orig.room_id <> p_room_id
           OR v_orig.status <> 'pending'
           OR v_orig.expires_at <= now()
           OR v_orig.to_team_id <> p_from_team_id
           OR v_orig.from_team_id <> p_to_team_id THEN
            RAISE EXCEPTION 'counter_original_invalid';
        END IF;
    END IF;

    INSERT INTO league_trade_offers (room_id, league_id, from_team_id, to_team_id, created_by, message, sim_date_at_creation, counter_of_offer_id)
    VALUES (p_room_id, v_league, p_from_team_id, p_to_team_id, v_uid, nullif(btrim(p_message), ''), v_sim_date, p_counter_of)
    RETURNING id INTO v_offer;

    INSERT INTO league_trade_offer_players (offer_id, player_id, from_team_id, to_team_id)
    SELECT v_offer, e, p_from_team_id, p_to_team_id FROM jsonb_array_elements_text(p_players_from) e
    UNION ALL
    SELECT v_offer, e, p_to_team_id, p_from_team_id FROM jsonb_array_elements_text(p_players_to) e;

    IF p_counter_of IS NOT NULL THEN
        UPDATE league_trade_offers
        SET status = 'countered', resolved_at = now(), resolved_by = v_uid, resolved_as_admin = v_is_admin,
            sim_date_at_resolution = v_sim_date
        WHERE id = p_counter_of;
    END IF;

    RETURN v_offer;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_lal_offer_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_action text; v_team uuid; v_players text[]; v_actor uuid; v_system boolean := false;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    v_action := CASE NEW.status
        WHEN 'accepted' THEN 'trade_offer_accept' WHEN 'rejected' THEN 'trade_offer_reject' WHEN 'cancelled' THEN 'trade_offer_cancel'
        WHEN 'expired' THEN 'trade_offer_expire' WHEN 'invalidated' THEN 'trade_offer_invalidate'
        WHEN 'countered' THEN 'trade_offer_counter' ELSE NULL END;
    IF v_action IS NULL THEN RETURN NEW; END IF;
    v_team := CASE WHEN NEW.status IN ('accepted','rejected','countered') THEN NEW.to_team_id ELSE NEW.from_team_id END;
    v_actor := NEW.resolved_by;
    IF NEW.status IN ('expired','invalidated') THEN v_system := (auth.uid() IS NULL); END IF;
    SELECT array_agg(player_id) INTO v_players FROM league_trade_offer_players WHERE offer_id = NEW.id;
    PERFORM public.league_action_log_write(NEW.room_id, v_team, v_action, coalesce(v_players, '{}'),
        ARRAY[NEW.from_team_id, NEW.to_team_id], public.lal_offer_details(NEW.id), v_actor, v_system);
    RETURN NEW;
END; $function$;

-- 이전 제안 체인(루트 → 직전 순). 자기 자신은 제외. 순환 방지를 위해 깊이 20으로 제한.
CREATE OR REPLACE FUNCTION public.get_trade_offer_thread(p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
    WITH RECURSIVE chain AS (
        SELECT o.id, o.counter_of_offer_id, 1 AS depth
        FROM league_trade_offers o
        WHERE o.id = (SELECT counter_of_offer_id FROM league_trade_offers WHERE id = p_offer_id)
        UNION ALL
        SELECT o.id, o.counter_of_offer_id, c.depth + 1
        FROM league_trade_offers o JOIN chain c ON o.id = c.counter_of_offer_id
        WHERE c.depth < 20
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'from_team_id', o.from_team_id, 'to_team_id', o.to_team_id, 'message', o.message,
        'status', o.status, 'reject_reason', o.reject_reason,
        'sim_date_at_creation', o.sim_date_at_creation, 'created_at', o.created_at,
        'players', coalesce((SELECT jsonb_agg(jsonb_build_object('player_id', p.player_id, 'from_team_id', p.from_team_id))
                             FROM league_trade_offer_players p WHERE p.offer_id = o.id), '[]'::jsonb)
    ) ORDER BY c.depth DESC), '[]'::jsonb)
    FROM chain c JOIN league_trade_offers o ON o.id = c.id;
$function$;
