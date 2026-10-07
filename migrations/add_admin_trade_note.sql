-- ============================================================
-- [적용] 2026-10-06 Supabase MCP로 반영
-- execute_admin_trade에 p_note(사유) 추가 — 세션 로그 admin_trade 행의 details.note에 기록
--
-- 배경: 사용자 요청 — 어드민 트레이드 실행 시 사유를 함께 남긴다. 세션 설정 → 트레이드 탭 "어드민 트레이드" 블록의
-- 사유 입력란 → leagueService.executeAdminTrade({note}) → p_note. 실패 시에도 클라이언트가 admin_trade_failed 로그 details.note로 보낸다.
-- 옛 6인자 시그니처는 DROP(오버로드 모호성 방지). 본문은 migrations/add_league_action_logs.sql §7과 동일하고 note 1줄만 추가.
-- ============================================================
DROP FUNCTION IF EXISTS public.execute_admin_trade(uuid, uuid, uuid, uuid, jsonb, jsonb);
CREATE OR REPLACE FUNCTION public.execute_admin_trade(p_room_id uuid, p_admin_user_id uuid, p_team_a_id uuid, p_team_b_id uuid, p_players_a_to_b jsonb, p_players_b_to_a jsonb, p_note text DEFAULT NULL)
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
