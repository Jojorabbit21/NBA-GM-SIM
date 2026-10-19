-- SECURITY DEFINER RPC 7종이 호출자가 인자로 넘긴 user_id 를 그대로 신뢰하던 문제 수정.
-- 배경: 이 함수들은 auth.uid() 를 보지 않아, 로그인한 누구든 (league_teams.user_id / leagues.admin_user_id 가
-- 공개 조회 가능하므로) 남의 id 를 넘겨 팀 반납·프로필 변조·어드민 트레이드 등을 호출할 수 있었다.
-- 방침: 함수 본문은 그대로 두고 맨 앞에 호출자 검증 한 줄만 추가한다. 시그니처 불변(CREATE OR REPLACE).
--
-- 허용 규칙
--   claim_team / update_team_profile / submit_draft_pick(v1)  : 호출자 == p_user_id
--   execute_admin_trade                                       : 호출자 == p_admin_user_id (이후 기존 'not_admin' 검사가 방 어드민 여부 확인)
--   release_team                                              : 호출자 == p_user_id(본인 탈퇴) OR 그 방 리그의 어드민(강퇴)
--   run_draft_lottery / initialize_league_teams               : 그 방 리그의 어드민
--   공통 예외: service_role(Fly 서버), 전역 어드민(is_global_admin())
--
-- 롤백: 아래 두 헬퍼 호출 줄(PERFORM public.assert_caller_*) 을 각 함수에서 제거해 재정의하거나,
--       이 파일 이전 정의(각 함수의 직전 migrations 파일)로 되돌릴 것.

-- ── 헬퍼 ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_caller_is(p_claimed uuid)
RETURNS void
LANGUAGE plpgsql STABLE
AS $$
BEGIN
    IF coalesce(auth.role(), '') = 'service_role' OR coalesce(is_global_admin(), false) THEN
        RETURN;
    END IF;
    IF auth.uid() IS NULL OR p_claimed IS NULL OR auth.uid() <> p_claimed THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_caller_is_room_admin(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF coalesce(auth.role(), '') = 'service_role' OR coalesce(is_global_admin(), false) THEN
        RETURN;
    END IF;
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM rooms r JOIN leagues l ON l.id = r.league_id
        WHERE r.id = p_room_id AND l.admin_user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
END;
$$;

-- ── claim_team (본문: migrations/add_personal_draft_prepared_at.sql 이후 현행 정의 + 검증 1줄) ──

CREATE OR REPLACE FUNCTION public.claim_team(p_room_id uuid, p_team_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_team         league_teams%ROWTYPE;
    v_lottery_done boolean;
    v_has_team     boolean;
    v_pdf          jsonb;
    v_deadline     timestamptz;
    v_start        timestamptz;
    v_prepared     timestamptz;
    v_cutoff       timestamptz;
BEGIN
    PERFORM public.assert_caller_is(p_user_id);

    SELECT l.personal_draft_format, l.draft_deadline_at, l.tournament_start_at, l.personal_draft_prepared_at
    INTO v_pdf, v_deadline, v_start, v_prepared
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = p_room_id;

    IF v_pdf IS NOT NULL THEN
        v_cutoff := COALESCE(v_deadline, v_start - interval '5 minutes');
        IF v_prepared IS NOT NULL OR (v_cutoff IS NOT NULL AND now() > v_cutoff) THEN
            RAISE EXCEPTION 'draft_deadline_passed';
        END IF;
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM league_teams
        WHERE room_id = p_room_id AND draft_order IS NOT NULL
        LIMIT 1
    ) INTO v_lottery_done;

    IF v_lottery_done THEN
        SELECT EXISTS(
            SELECT 1 FROM league_teams
            WHERE room_id = p_room_id AND user_id = p_user_id
        ) INTO v_has_team;

        IF v_has_team THEN
            RAISE EXCEPTION 'draft_already_ordered';
        END IF;
        RAISE EXCEPTION 'lottery_already_done';
    END IF;

    SELECT * INTO v_team
    FROM league_teams
    WHERE room_id = p_room_id AND id = p_team_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'team not found';
    END IF;

    IF v_team.user_id IS NOT NULL AND v_team.user_id != p_user_id THEN
        RAISE EXCEPTION 'team_already_claimed';
    END IF;

    UPDATE league_teams
    SET user_id = NULL
    WHERE room_id = p_room_id AND user_id = p_user_id AND id != p_team_id;

    UPDATE league_teams
    SET user_id = p_user_id
    WHERE id = p_team_id
    RETURNING * INTO v_team;

    UPDATE room_members
    SET team_id = v_team.team_slug
    WHERE room_id = p_room_id AND user_id = p_user_id;

    RETURN row_to_json(v_team)::jsonb;
END;
$function$;

-- ── release_team (본인 탈퇴 or 방 어드민 강퇴 or service_role) ──

CREATE OR REPLACE FUNCTION public.release_team(p_room_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_team_ids uuid[];
BEGIN
    IF auth.uid() IS DISTINCT FROM p_user_id THEN
        PERFORM public.assert_caller_is_room_admin(p_room_id);
    END IF;

    SELECT array_agg(id) INTO v_team_ids FROM league_teams WHERE room_id = p_room_id AND user_id = p_user_id;
    UPDATE league_teams SET user_id = NULL WHERE room_id = p_room_id AND user_id = p_user_id;
    IF v_team_ids IS NOT NULL THEN
        UPDATE league_trade_offers SET status = 'cancelled', resolved_at = now()
        WHERE status = 'pending' AND room_id = p_room_id
          AND (from_team_id = ANY(v_team_ids) OR to_team_id = ANY(v_team_ids));
    END IF;
    -- 팀 반환은 곧 리그 탈퇴를 의미함 (team_id만 NULL로 남기면
    -- room_members에 유령 참가자가 남아 인원 수 카운트가 부정확해짐)
    DELETE FROM room_members WHERE room_id = p_room_id AND user_id = p_user_id;
END;
$function$;

-- ── update_team_profile ──

CREATE OR REPLACE FUNCTION public.update_team_profile(p_team_id uuid, p_user_id uuid, p_team_name text, p_team_abbr text, p_color_primary text, p_color_secondary text, p_color_tertiary text, p_color_text text, p_court_background text, p_court_paint text, p_court_line text, p_court_show_logo boolean DEFAULT NULL::boolean, p_court_logo_scale integer DEFAULT NULL::integer, p_court_three text DEFAULT '__keep__'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
    v_team   league_teams%rowtype;
    v_status text;
    v_owned  boolean;
begin
    perform public.assert_caller_is(p_user_id);

    select exists(
        select 1 from league_teams where id = p_team_id and user_id = p_user_id
    ) into v_owned;

    if not v_owned then
        raise exception 'team not found or not owned by user';
    end if;

    select l.status into v_status
    from league_teams lt
    join rooms r on r.id = lt.room_id
    join leagues l on l.id = r.league_id
    where lt.id = p_team_id;

    if v_status = 'drafting' then
        raise exception 'cannot_edit_during_draft';
    end if;

    update league_teams
    set team_name        = p_team_name,
        team_abbr        = p_team_abbr,
        color_primary    = p_color_primary,
        color_secondary  = p_color_secondary,
        color_tertiary   = p_color_tertiary,
        color_text       = p_color_text,
        court_background = p_court_background,
        court_paint      = p_court_paint,
        court_line       = p_court_line,
        court_show_logo  = coalesce(p_court_show_logo, court_show_logo),
        court_logo_scale = least(200, greatest(50, coalesce(p_court_logo_scale, court_logo_scale))),
        -- '__keep__' = leave as is, NULL = follow default, otherwise the team's own color
        court_three      = case when p_court_three = '__keep__' then court_three else p_court_three end
    where id = p_team_id
    returning * into v_team;

    return row_to_json(v_team)::jsonb;
end;
$function$;

-- ── execute_admin_trade ──

CREATE OR REPLACE FUNCTION public.execute_admin_trade(p_room_id uuid, p_admin_user_id uuid, p_team_a_id uuid, p_team_b_id uuid, p_players_a_to_b jsonb, p_players_b_to_a jsonb, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_admin_id uuid; v_team_a league_teams%ROWTYPE; v_team_b league_teams%ROWTYPE; v_id text; v_moved text[];
BEGIN
    PERFORM public.assert_caller_is(p_admin_user_id);

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
    PERFORM public.league_action_log_write(p_room_id, NULL, 'admin_trade', coalesce(v_moved, '{}'), ARRAY[p_team_a_id, p_team_b_id],
        jsonb_build_object(
            'team_a', jsonb_build_object('id', v_team_a.id, 'slug', v_team_a.team_slug, 'name', v_team_a.team_name),
            'team_b', jsonb_build_object('id', v_team_b.id, 'slug', v_team_b.team_slug, 'name', v_team_b.team_name),
            'players_a_to_b', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', e, 'name', mp.name)), '[]'::jsonb) FROM jsonb_array_elements_text(p_players_a_to_b) e LEFT JOIN meta_players mp ON mp.id::text = e),
            'players_b_to_a', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', e, 'name', mp.name)), '[]'::jsonb) FROM jsonb_array_elements_text(p_players_b_to_a) e LEFT JOIN meta_players mp ON mp.id::text = e),
            'note', nullif(btrim(p_note), '')),
        p_admin_user_id);
    RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ── run_draft_lottery (인자 p_admin_id 는 기존대로 미사용 — 서버가 어드민을 따로 검증하고, DB 는 방 어드민/service_role 만 허용) ──

CREATE OR REPLACE FUNCTION public.run_draft_lottery(p_room_id uuid, p_admin_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_done boolean;
    v_row  league_teams%ROWTYPE;
    v_ord  int := 1;
BEGIN
    PERFORM public.assert_caller_is_room_admin(p_room_id);

    SELECT EXISTS(
        SELECT 1 FROM league_teams
        WHERE room_id = p_room_id AND draft_order IS NOT NULL
        LIMIT 1
    ) INTO v_done;

    IF v_done THEN
        RAISE EXCEPTION 'lottery_already_done';
    END IF;

    FOR v_row IN
        SELECT * FROM league_teams
        WHERE room_id = p_room_id
        ORDER BY random()
    LOOP
        UPDATE league_teams SET draft_order = v_ord WHERE id = v_row.id;
        v_ord := v_ord + 1;
    END LOOP;

    RETURN (
        SELECT jsonb_agg(row_to_json(t) ORDER BY t.draft_order)
        FROM league_teams t
        WHERE t.room_id = p_room_id
    );
END;
$function$;

-- ── initialize_league_teams ──

CREATE OR REPLACE FUNCTION public.initialize_league_teams(p_room_id uuid, p_teams jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    t JSONB;
BEGIN
    PERFORM public.assert_caller_is_room_admin(p_room_id);

    DELETE FROM league_teams WHERE room_id = p_room_id;

    FOR t IN SELECT * FROM jsonb_array_elements(p_teams)
    LOOP
        INSERT INTO league_teams (
            room_id, team_slug, team_name, team_abbr,
            color_primary, color_secondary, color_tertiary, color_text,
            court_background, court_paint, court_line, conference,
            is_ai, roster
        ) VALUES (
            p_room_id,
            t->>'team_slug',
            t->>'team_name',
            t->>'team_abbr',
            t->>'color_primary',
            t->>'color_secondary',
            COALESCE(t->>'color_tertiary', t->>'color_secondary'),
            t->>'color_text',
            COALESCE(t->>'court_background', '#DDC8AD'),
            COALESCE(t->>'court_paint', '#C3AC91'),
            COALESCE(t->>'court_line', '#4A3728'),
            t->>'conference',
            false,
            '[]'::jsonb
        );
    END LOOP;
END;
$function$;

-- ── submit_draft_pick (v1 — 현재 호출처 없음, v2 가 현행. 동일 구멍이라 같이 막는다) ──

CREATE OR REPLACE FUNCTION public.submit_draft_pick(p_room_id uuid, p_user_id uuid, p_player_id text, p_player_name text, p_position text, p_ovr integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_state      jsonb;
    v_status     text;
    v_cur_idx    int;
    v_pick_order jsonb;
    v_total      int;
    v_entry      jsonb;
    v_team_id    text;
    v_drafted    jsonb;
    v_picks      jsonb;
    v_team_count int;
    v_round      int;
    v_slot       int;
    v_new_pick   jsonb;
    v_now_iso    text;
BEGIN
    PERFORM public.assert_caller_is(p_user_id);

    SELECT draft_state INTO v_state
    FROM rooms WHERE id = p_room_id
    FOR UPDATE;

    IF v_state IS NULL THEN
        RAISE EXCEPTION 'draft_not_active';
    END IF;

    v_status := v_state->>'status';
    IF v_status != 'active' THEN
        RAISE EXCEPTION 'draft_not_active';
    END IF;

    v_cur_idx    := (v_state->>'currentPickIndex')::int;
    v_pick_order := v_state->'pickOrder';
    v_total      := jsonb_array_length(v_pick_order);

    IF v_cur_idx >= v_total THEN
        RAISE EXCEPTION 'draft_not_active';
    END IF;

    v_entry   := v_pick_order->v_cur_idx;
    v_team_id := v_entry->>'teamId';

    IF (v_entry->>'userId') != p_user_id::text THEN
        RAISE EXCEPTION 'not_your_turn';
    END IF;

    v_drafted := COALESCE(v_state->'draftedIds', '[]'::jsonb);
    IF v_drafted @> jsonb_build_array(p_player_id) THEN
        RAISE EXCEPTION 'already_drafted';
    END IF;

    v_team_count := (v_state->>'teamCount')::int;
    v_round      := (v_cur_idx / v_team_count) + 1;
    v_slot       := (v_cur_idx % v_team_count) + 1;
    v_now_iso    := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

    v_new_pick := jsonb_build_object(
        'pickIndex',  v_cur_idx,
        'round',      v_round,
        'slot',       v_slot,
        'userId',     p_user_id,
        'teamId',     v_team_id,
        'playerId',   p_player_id,
        'playerName', p_player_name,
        'position',   p_position,
        'ovr',        p_ovr,
        'pickedAt',   v_now_iso
    );

    v_picks   := COALESCE(v_state->'picks', '[]'::jsonb) || jsonb_build_array(v_new_pick);
    v_drafted := v_drafted || jsonb_build_array(p_player_id);

    UPDATE league_teams
    SET roster = roster || jsonb_build_array(p_player_id)
    WHERE room_id = p_room_id AND team_slug = v_team_id;

    v_cur_idx := v_cur_idx + 1;

    IF v_cur_idx >= v_total THEN
        v_state := v_state || jsonb_build_object(
            'status',               'completed',
            'currentPickIndex',     v_cur_idx,
            'currentPickStartedAt', to_jsonb(NULL::text),
            'picks',                v_picks,
            'draftedIds',           v_drafted
        );
        UPDATE leagues l SET status = 'in_progress'
        FROM rooms r
        WHERE r.id = p_room_id AND r.league_id = l.id;
    ELSE
        v_state := v_state || jsonb_build_object(
            'currentPickIndex',     v_cur_idx,
            'currentPickStartedAt', v_now_iso,
            'picks',                v_picks,
            'draftedIds',           v_drafted
        );
    END IF;

    UPDATE rooms SET draft_state = v_state WHERE id = p_room_id;

    RETURN v_state;
END;
$function$;
