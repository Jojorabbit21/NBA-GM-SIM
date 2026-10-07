-- ============================================================
-- [적용] 2026-10-06 Supabase MCP로 반영
-- admin_save_member_tactics — 리그 어드민이 다른 참가자의 전술/뎁스차트를 저장 + 감사 로그(admin_tactics_update)
--
-- 배경(2026-10-06 사용자 결정): 세션 설정 "팀 전술" 탭에서 어드민이 참가자의 뎁스차트/전술값을 직접 조정할 수 있게 한다.
--   1) 동시 편집 충돌은 허용 — 마지막 저장이 이김(낙관적 잠금 없음).
--   2) 어드민이 이 탭에서 저장한 변경만 league_action_logs에 'admin_tactics_update'로 남긴다. 유저 본인의 전술 화면
--      저장(saveMemberTactics → room_members 직접 UPDATE)은 기존대로 기록하지 않는다.
-- 트리거 대신 RPC로 한 이유: room_members UPDATE 트리거로는 "어드민 탭에서의 저장"과 "어드민이 자기 팀 전술 화면에서
-- 한 저장"을 구분할 수 없음(둘 다 auth.uid() = 어드민). 이 RPC는 어드민 탭만 호출한다.
--
-- details 구조(변경된 것만 담음, 없으면 로그 자체를 남기지 않음):
--   { team: {id, slug, name}, member_user_id, created: bool(전술이 없던 참가자에게 처음 생성),
--     sliders: {key: {before, after}}, starters: {POS: {before, after}}, stopper: {before, after},
--     depth_chart: {before, after}, rotation_changed: [player_id], minutes_limits: {id: {before, after}},
--     player_tactics: {id: {before, after}}, player_names: {id: name} }
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_save_member_tactics(
    p_room_id uuid, p_member_user_id uuid, p_tactics jsonb, p_depth_chart jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
    v_uid uuid := auth.uid();
    v_league uuid; v_admin uuid;
    v_old_t jsonb; v_old_d jsonb; v_team_key text; v_team league_teams%ROWTYPE;
    v_changed jsonb := '{}'::jsonb; v_tmp jsonb; v_ids text[] := '{}'; v_names jsonb;
    v_o jsonb; v_n jsonb;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
    SELECT r.league_id, l.admin_user_id INTO v_league, v_admin FROM rooms r JOIN leagues l ON l.id = r.league_id WHERE r.id = p_room_id;
    IF v_league IS NULL THEN RAISE EXCEPTION 'room_not_found'; END IF;
    IF v_admin <> v_uid AND NOT public.is_global_admin() THEN RAISE EXCEPTION 'not_league_admin'; END IF;

    SELECT tactics, depth_chart, team_id INTO v_old_t, v_old_d, v_team_key
      FROM room_members WHERE room_id = p_room_id AND user_id = p_member_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'member_not_found'; END IF;

    UPDATE room_members SET tactics = p_tactics, depth_chart = p_depth_chart
     WHERE room_id = p_room_id AND user_id = p_member_user_id;

    -- room_members.team_id는 league_teams.team_slug(옛 데이터는 id일 수도 있어 둘 다 허용)
    SELECT * INTO v_team FROM league_teams WHERE room_id = p_room_id AND (team_slug = v_team_key OR id::text = v_team_key) LIMIT 1;

    -- ── diff ──
    v_o := coalesce(v_old_t -> 'sliders', '{}'::jsonb); v_n := coalesce(p_tactics -> 'sliders', '{}'::jsonb);
    SELECT jsonb_object_agg(k, jsonb_build_object('before', v_o -> k, 'after', v_n -> k)) INTO v_tmp
      FROM (SELECT jsonb_object_keys(v_o || v_n) k) s WHERE v_o -> k IS DISTINCT FROM v_n -> k;
    IF v_tmp IS NOT NULL THEN v_changed := v_changed || jsonb_build_object('sliders', v_tmp); END IF;

    v_o := coalesce(v_old_t -> 'starters', '{}'::jsonb); v_n := coalesce(p_tactics -> 'starters', '{}'::jsonb);
    SELECT jsonb_object_agg(k, jsonb_build_object('before', v_o -> k, 'after', v_n -> k)) INTO v_tmp
      FROM (SELECT jsonb_object_keys(v_o || v_n) k) s WHERE v_o -> k IS DISTINCT FROM v_n -> k;
    IF v_tmp IS NOT NULL THEN
        v_changed := v_changed || jsonb_build_object('starters', v_tmp);
        SELECT v_ids || array_agg(DISTINCT x) INTO v_ids FROM (SELECT jsonb_array_elements_text(jsonb_path_query_array(v_tmp, '$.*.*')) x) q WHERE x IS NOT NULL;
    END IF;

    IF v_old_t -> 'stopperId' IS DISTINCT FROM p_tactics -> 'stopperId' THEN
        v_changed := v_changed || jsonb_build_object('stopper', jsonb_build_object('before', v_old_t -> 'stopperId', 'after', p_tactics -> 'stopperId'));
    END IF;

    IF v_old_d IS DISTINCT FROM p_depth_chart THEN
        v_changed := v_changed || jsonb_build_object('depth_chart', jsonb_build_object('before', v_old_d, 'after', p_depth_chart));
    END IF;

    v_o := coalesce(v_old_t -> 'rotationMap', '{}'::jsonb); v_n := coalesce(p_tactics -> 'rotationMap', '{}'::jsonb);
    SELECT jsonb_agg(k) INTO v_tmp FROM (SELECT jsonb_object_keys(v_o || v_n) k) s WHERE v_o -> k IS DISTINCT FROM v_n -> k;
    IF v_tmp IS NOT NULL THEN
        v_changed := v_changed || jsonb_build_object('rotation_changed', v_tmp);
        SELECT v_ids || array_agg(x) INTO v_ids FROM jsonb_array_elements_text(v_tmp) x;
    END IF;

    v_o := coalesce(v_old_t -> 'minutesLimits', '{}'::jsonb); v_n := coalesce(p_tactics -> 'minutesLimits', '{}'::jsonb);
    SELECT jsonb_object_agg(k, jsonb_build_object('before', v_o -> k, 'after', v_n -> k)) INTO v_tmp
      FROM (SELECT jsonb_object_keys(v_o || v_n) k) s WHERE v_o -> k IS DISTINCT FROM v_n -> k;
    IF v_tmp IS NOT NULL THEN
        v_changed := v_changed || jsonb_build_object('minutes_limits', v_tmp);
        SELECT v_ids || array_agg(x) INTO v_ids FROM jsonb_object_keys(v_tmp) x;
    END IF;

    v_o := coalesce(v_old_t -> 'playerTactics', '{}'::jsonb); v_n := coalesce(p_tactics -> 'playerTactics', '{}'::jsonb);
    SELECT jsonb_object_agg(k, jsonb_build_object('before', v_o -> k, 'after', v_n -> k)) INTO v_tmp
      FROM (SELECT jsonb_object_keys(v_o || v_n) k) s WHERE v_o -> k IS DISTINCT FROM v_n -> k;
    IF v_tmp IS NOT NULL THEN
        v_changed := v_changed || jsonb_build_object('player_tactics', v_tmp);
        SELECT v_ids || array_agg(x) INTO v_ids FROM jsonb_object_keys(v_tmp) x;
    END IF;

    IF v_changed = '{}'::jsonb THEN
        RETURN jsonb_build_object('ok', true, 'changed', false);
    END IF;

    SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(v_ids) x WHERE x IS NOT NULL;
    SELECT jsonb_object_agg(mp.id::text, mp.name) INTO v_names FROM meta_players mp WHERE mp.id::text = ANY(coalesce(v_ids, '{}'));

    PERFORM public.league_action_log_write(p_room_id, v_team.id, 'admin_tactics_update', coalesce(v_ids, '{}'),
        CASE WHEN v_team.id IS NULL THEN '{}'::uuid[] ELSE ARRAY[v_team.id] END,
        v_changed || jsonb_build_object(
            'team', jsonb_build_object('id', v_team.id, 'slug', v_team.team_slug, 'name', v_team.team_name),
            'member_user_id', p_member_user_id, 'created', (v_old_t IS NULL),
            'player_names', coalesce(v_names, '{}'::jsonb)),
        v_uid);
    RETURN jsonb_build_object('ok', true, 'changed', true, 'keys', (SELECT jsonb_agg(k) FROM jsonb_object_keys(v_changed) k));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_save_member_tactics(uuid, uuid, jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_save_member_tactics(uuid, uuid, jsonb, jsonb) TO authenticated;
