-- ============================================================
-- league_trade_offers.sim_date_at_creation 컬럼 추가 + create_trade_offer() 갱신
--
-- 배경: 트레이드 "인박스" 리스트에 오퍼가 생성된 날짜를 보여줄 때, 실제(wall-clock) 날짜는
-- 리그마다 압축 스케줄로 진행되는 인게임 날짜(rooms.sim_date)와 완전히 다르다(예: 실제
-- 2026-08-31에 어떤 방은 인게임 2026-08-14). league_trade_offers에는 created_at(실제 시각)만
-- 있고 생성 시점의 인게임 날짜를 기록해두지 않아서, 생성 시점 rooms.sim_date를 스냅샷으로
-- 저장하는 컬럼을 추가한다.
--
-- 이 파일은 기존 함수 정의(Supabase MCP로 조회) 전체를 CREATE OR REPLACE하며,
-- (1) rooms.sim_date를 함께 조회하도록 v_sim_date 변수/SELECT 추가
-- (2) INSERT INTO league_trade_offers에 sim_date_at_creation 컬럼 추가
-- 두 곳만 바뀌었고 그 외 검증/예외 로직은 전혀 바뀌지 않았다.
-- 기존에 이미 생성된 오퍼는 이 컬럼이 NULL — 클라이언트에서 NULL이면 "-"로 표시.
-- [적용 완료] 2026-08-31 Supabase MCP로 반영
-- ============================================================

ALTER TABLE public.league_trade_offers
    ADD COLUMN IF NOT EXISTS sim_date_at_creation date;

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
    v_sim_date date;
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

    SELECT l.id, l.trade_enabled, r.sim_date INTO v_league, v_enabled, v_sim_date
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

    INSERT INTO league_trade_offers (room_id, league_id, from_team_id, to_team_id, created_by, message, sim_date_at_creation)
    VALUES (p_room_id, v_league, p_from_team_id, p_to_team_id, v_uid, nullif(btrim(p_message), ''), v_sim_date)
    RETURNING id INTO v_offer;

    INSERT INTO league_trade_offer_players (offer_id, player_id, from_team_id, to_team_id)
    SELECT v_offer, e, p_from_team_id, p_to_team_id FROM jsonb_array_elements_text(p_players_from) e
    UNION ALL
    SELECT v_offer, e, p_to_team_id, p_from_team_id FROM jsonb_array_elements_text(p_players_to) e;

    RETURN v_offer;
END;
$function$;
