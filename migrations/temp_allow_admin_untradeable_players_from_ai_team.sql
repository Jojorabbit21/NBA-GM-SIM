-- [TEMP 테스트 기간 한정 2026-08-30] create_trade_offer RPC — 관리자가 AI 팀을 상대로 보내는
-- 제안은 트레이드 블록(league_trade_blocks) 등록 여부와 무관하게 어떤 선수든 요청 목록에
-- 넣을 수 있게 허용. AI 팀은 보통 블록에 아무 선수도 안 올라가 있어 정상 조건으론 애초에
-- 선택 자체가 불가능해서 완화함. (이 파일은 temp_allow_admin_trade_offer_to_ai_team.sql
-- 바로 다음 단계 — 그 마이그레이션이 "AI 팀을 대상으로 지정"하는 것 자체를 열어줬다면,
-- 이건 그 열린 문 안에서 "블록에 없는 선수도 고를 수 있게" 한 번 더 여는 것.)
--
-- respond_trade_offer의 수락 단계 player_not_tradeable 체크는 이미 admin bypass(v_admin)로
-- 걸려 있어서 별도 수정 불필요 — 관리자가 "받은 제안" 탭에서 직접 수락하는 흐름이라 그대로 통과됨.
--
-- 되돌릴 땐 아래 IF 블록을
--     IF NOT EXISTS (SELECT 1 FROM league_trade_blocks WHERE team_id = p_to_team_id AND player_id = v_id) THEN
--         RAISE EXCEPTION 'player_not_tradeable: %', v_id;
--     END IF;
-- 로 복원하면 됨(클라이언트 쪽은 views/multi/season/MultiFrontOfficeView.tsx의
-- isTestUnblockedTarget 변수와 그걸 참조하는 blocked prop 조건 제거).

CREATE OR REPLACE FUNCTION public.create_trade_offer(p_room_id uuid, p_from_team_id uuid, p_to_team_id uuid, p_players_from jsonb, p_players_to jsonb, p_message text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid     uuid := auth.uid();
    v_league  uuid;
    v_enabled boolean;
    v_a       league_teams%ROWTYPE;
    v_b       league_teams%ROWTYPE;
    v_id      text;
    v_offer   uuid;
    v_is_admin boolean;
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

    SELECT l.id, l.trade_enabled INTO v_league, v_enabled
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = p_room_id;
    IF v_league IS NULL THEN
        RAISE EXCEPTION 'room_not_found';
    END IF;
    IF v_enabled IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'trade_disabled';
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
        -- [TEMP 테스트 기간 한정 2026-08-30] 관리자 발신 건에 한해 AI 팀도 수신 허용.
        -- 되돌릴 땐 이 IF 블록을 원래대로 `RAISE EXCEPTION 'target_not_human';` 한 줄로 복원.
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
        IF NOT EXISTS (SELECT 1 FROM league_trade_blocks WHERE team_id = p_to_team_id AND player_id = v_id) THEN
            -- [TEMP 테스트 기간 한정 2026-08-30] 관리자가 AI 팀을 상대로 보내는 제안은
            -- 트레이드 블록 등록 여부와 무관하게 허용 — AI 팀은 보통 블록이 비어 있어
            -- 정상 조건으론 선택 자체가 불가능함. 되돌릴 땐 이 IF를 원래대로
            -- `RAISE EXCEPTION 'player_not_tradeable: %', v_id;` 한 줄로 복원.
            IF NOT (v_is_admin AND v_b.is_ai) THEN
                RAISE EXCEPTION 'player_not_tradeable: %', v_id;
            END IF;
        END IF;
    END LOOP;

    INSERT INTO league_trade_offers (room_id, league_id, from_team_id, to_team_id, created_by, message)
    VALUES (p_room_id, v_league, p_from_team_id, p_to_team_id, v_uid, nullif(btrim(p_message), ''))
    RETURNING id INTO v_offer;

    INSERT INTO league_trade_offer_players (offer_id, player_id, from_team_id, to_team_id)
    SELECT v_offer, e, p_from_team_id, p_to_team_id FROM jsonb_array_elements_text(p_players_from) e
    UNION ALL
    SELECT v_offer, e, p_to_team_id, p_from_team_id FROM jsonb_array_elements_text(p_players_to) e;

    RETURN v_offer;
END;
$function$;
