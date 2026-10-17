-- [2026-10-17] Draft rollback left picked players in league_teams.roster, so re-picking the same
-- player appended a duplicate roster entry (Kelel Ware x2 on NYK).
-- 1) rollback_draft_picks(): deletes picks >= target AND removes those players from the owning team's roster, atomically.
-- 2) submit_draft_pick_v2 (both overloads): never append a player id that is already in the roster.

CREATE OR REPLACE FUNCTION public.rollback_draft_picks(p_room_id uuid, p_target integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_pick RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR v_pick IN
        SELECT team_id, player_id::text AS player_id
        FROM draft_picks
        WHERE room_id = p_room_id AND pick_index >= p_target
    LOOP
        UPDATE league_teams
        SET roster = COALESCE((
            SELECT jsonb_agg(e) FROM jsonb_array_elements(COALESCE(roster, '[]'::jsonb)) e
            WHERE e <> to_jsonb(v_pick.player_id)
        ), '[]'::jsonb)
        WHERE room_id = p_room_id AND team_slug = v_pick.team_id;
    END LOOP;

    DELETE FROM draft_picks WHERE room_id = p_room_id AND pick_index >= p_target;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.rollback_draft_picks(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_draft_picks(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.submit_draft_pick_v2(p_room_id uuid, p_player_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id     UUID := COALESCE(p_user_id, auth.uid());
    v_config      JSONB;
    v_cursor      JSONB;
    v_league_id   UUID;
    v_cur_idx     INTEGER;
    v_total       INTEGER;
    v_order_entry JSONB;
    v_round       INTEGER;
    v_slot        INTEGER;
    v_team_count  INTEGER;
    v_team_id     TEXT;
    v_new_cursor  JSONB;
    v_player_name TEXT;
    v_position    TEXT;
    v_ovr         INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT name,
           position,
           COALESCE((base_attributes->>'ovr')::integer, 0)
    INTO   v_player_name, v_position, v_ovr
    FROM   meta_players
    WHERE  id = p_player_id;

    IF v_player_name IS NULL THEN
        RAISE EXCEPTION 'player_not_found';
    END IF;

    SELECT draft_config, draft_cursor, league_id
    INTO   v_config, v_cursor, v_league_id
    FROM   rooms
    WHERE  id = p_room_id
    FOR UPDATE;

    IF v_config IS NULL OR v_cursor IS NULL THEN
        RAISE EXCEPTION 'draft_not_active: no config/cursor';
    END IF;

    IF v_cursor->>'status' != 'active' THEN
        RAISE EXCEPTION 'draft_not_active';
    END IF;

    v_cur_idx    := (v_cursor->>'currentPickIndex')::integer;
    v_team_count := (v_config->>'teamCount')::integer;
    v_total      := jsonb_array_length(v_config->'pickOrder');

    IF v_cur_idx >= v_total THEN
        RAISE EXCEPTION 'draft_not_active: all picks done';
    END IF;

    v_order_entry := v_config->'pickOrder'->v_cur_idx;
    IF (v_order_entry->>'userId') IS DISTINCT FROM v_user_id::text THEN
        RAISE EXCEPTION 'not_your_turn';
    END IF;

    v_team_id := v_order_entry->>'teamId';

    IF EXISTS (
        SELECT 1 FROM draft_picks
        WHERE room_id = p_room_id AND player_id = p_player_id
    ) THEN
        RAISE EXCEPTION 'already_drafted';
    END IF;

    v_round := v_cur_idx / v_team_count + 1;
    IF (v_config->>'format' = 'snake') AND (v_round % 2 = 0) THEN
        v_slot := v_team_count - (v_cur_idx % v_team_count);
    ELSE
        v_slot := v_cur_idx % v_team_count + 1;
    END IF;

    INSERT INTO draft_picks
        (room_id, pick_index, round, slot, team_id, user_id, player_id, player_name, position, ovr)
    VALUES
        (p_room_id, v_cur_idx, v_round, v_slot, v_team_id, v_user_id,
         p_player_id, v_player_name, v_position, v_ovr);

    -- never append a player id that is already on the roster
    UPDATE league_teams
    SET    roster = CASE
                WHEN COALESCE(roster, '[]'::jsonb) @> to_jsonb(p_player_id::text) THEN COALESCE(roster, '[]'::jsonb)
                ELSE COALESCE(roster, '[]'::jsonb) || to_jsonb(p_player_id::text)
            END
    WHERE  room_id = p_room_id AND team_slug = v_team_id;

    IF v_cur_idx + 1 >= v_total THEN
        v_new_cursor := jsonb_build_object(
            'status',               'completed',
            'currentPickIndex',     v_total,
            'currentPickStartedAt', NULL
        );
        UPDATE rooms SET draft_cursor = v_new_cursor WHERE id = p_room_id;
    ELSE
        v_new_cursor := jsonb_build_object(
            'status',               'active',
            'currentPickIndex',     v_cur_idx + 1,
            'currentPickStartedAt', now()
        );
        UPDATE rooms SET draft_cursor = v_new_cursor WHERE id = p_room_id;
    END IF;

    RETURN v_new_cursor;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_draft_pick_v2(p_room_id uuid, p_player_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_is_ai boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id     UUID := COALESCE(p_user_id, auth.uid());
    v_config      JSONB;
    v_cursor      JSONB;
    v_league_id   UUID;
    v_cur_idx     INTEGER;
    v_total       INTEGER;
    v_order_entry JSONB;
    v_round       INTEGER;
    v_slot        INTEGER;
    v_team_count  INTEGER;
    v_team_id     TEXT;
    v_new_cursor  JSONB;
    v_player_name TEXT;
    v_position    TEXT;
    v_ovr         INTEGER;
    v_team_name   TEXT;
    v_gm_email    TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT name, position, COALESCE((base_attributes->>'ovr')::integer, 0)
    INTO   v_player_name, v_position, v_ovr
    FROM   meta_players
    WHERE  id = p_player_id;

    IF v_player_name IS NULL THEN
        RAISE EXCEPTION 'player_not_found';
    END IF;

    SELECT draft_config, draft_cursor, league_id
    INTO   v_config, v_cursor, v_league_id
    FROM   rooms
    WHERE  id = p_room_id
    FOR UPDATE;

    IF v_config IS NULL OR v_cursor IS NULL THEN
        RAISE EXCEPTION 'draft_not_active: no config/cursor';
    END IF;

    IF v_cursor->>'status' != 'active' THEN
        RAISE EXCEPTION 'draft_not_active';
    END IF;

    v_cur_idx    := (v_cursor->>'currentPickIndex')::integer;
    v_team_count := (v_config->>'teamCount')::integer;
    v_total      := jsonb_array_length(v_config->'pickOrder');

    IF v_cur_idx >= v_total THEN
        RAISE EXCEPTION 'draft_not_active: all picks done';
    END IF;

    v_order_entry := v_config->'pickOrder'->v_cur_idx;
    IF (v_order_entry->>'userId') IS DISTINCT FROM v_user_id::text THEN
        RAISE EXCEPTION 'not_your_turn';
    END IF;

    v_team_id := v_order_entry->>'teamId';

    IF EXISTS (
        SELECT 1 FROM draft_picks
        WHERE room_id = p_room_id AND player_id = p_player_id
    ) THEN
        RAISE EXCEPTION 'already_drafted';
    END IF;

    v_round := v_cur_idx / v_team_count + 1;
    IF (v_config->>'format' = 'snake') AND (v_round % 2 = 0) THEN
        v_slot := v_team_count - (v_cur_idx % v_team_count);
    ELSE
        v_slot := v_cur_idx % v_team_count + 1;
    END IF;

    SELECT team_name INTO v_team_name
    FROM   league_teams
    WHERE  room_id = p_room_id AND team_slug = v_team_id;

    IF NOT p_is_ai THEN
        SELECT email INTO v_gm_email
        FROM   auth.users
        WHERE  id = v_user_id;
    END IF;

    INSERT INTO draft_picks
        (room_id, pick_index, round, slot,
         team_id, user_id, player_id, player_name, position, ovr,
         league_id, team_name, is_ai, gm_email)
    VALUES
        (p_room_id, v_cur_idx, v_round, v_slot,
         v_team_id, v_user_id, p_player_id, v_player_name, v_position, v_ovr,
         v_league_id, v_team_name, p_is_ai, v_gm_email);

    -- never append a player id that is already on the roster
    UPDATE league_teams
    SET    roster = CASE
                WHEN COALESCE(roster, '[]'::jsonb) @> to_jsonb(p_player_id::text) THEN COALESCE(roster, '[]'::jsonb)
                ELSE COALESCE(roster, '[]'::jsonb) || to_jsonb(p_player_id::text)
            END
    WHERE  room_id = p_room_id AND team_slug = v_team_id;

    IF v_cur_idx + 1 >= v_total THEN
        v_new_cursor := jsonb_build_object(
            'status',               'completed',
            'currentPickIndex',     v_total,
            'currentPickStartedAt', NULL
        );
        UPDATE rooms SET draft_cursor = v_new_cursor WHERE id = p_room_id;
    ELSE
        v_new_cursor := jsonb_build_object(
            'status',               'active',
            'currentPickIndex',     v_cur_idx + 1,
            'currentPickStartedAt', now()
        );
        UPDATE rooms SET draft_cursor = v_new_cursor WHERE id = p_room_id;
    END IF;

    RETURN v_new_cursor;
END;
$function$;
