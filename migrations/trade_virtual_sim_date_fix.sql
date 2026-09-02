-- ============================================================
-- 트레이드 관련 "인게임 날짜" 소스를 rooms.sim_date → 가상 시즌 캘린더 날짜로 교정
--
-- 배경: create_trade_offer()의 sim_date_at_creation, respond_trade_offer()의
-- league_events.sim_date 둘 다 지금까지 rooms.sim_date를 그대로 썼다. 그런데
-- rooms.sim_date는 실제(wall-clock) KST 날짜다(server/src/scheduler.ts의
-- advanceSimDates가 kstDateFromMs(scheduled_at)로 채움) — 메인리그 압축 스케줄에서
-- "오늘"에 해당하는 가상 NBA 캘린더 날짜(games.game_date, 예: "2026-11-07")와는
-- 완전히 다른 값이다(views/multi/season/MultiNewsFeedView.tsx:60-66 기존 주석 참고).
-- 그 결과 트레이드 뉴스카드/오퍼 날짜 라벨이 전부 오늘 실제 날짜로 찍히는 버그가 있었음
-- (예: 2026-09-02에 실행한 트레이드가 실제로는 가상 시즌 2026-11-07 시점 딜인데
-- "2026-09-02"로 표시됨).
--
-- 클라이언트의 findCurrentVirtualGame()(multiScheduleUtils.ts)과 동일한 아이디어를
-- SQL로 재현한다: "지금(now)과 scheduled_at이 가장 가까운 경기"를 찾아 그 game_date를
-- 쓴다. games.scheduled_at은 스케줄 생성 시점에 이미 못박혀 저장되므로(resolveRealAt이
-- game.scheduledAt 있으면 그대로 반환) game_seq/sim_real_start_at 공식을 다시 계산할
-- 필요 없이 games 테이블만 조회하면 된다. 경기가 아예 없는 방(시즌 시작 전 등) 대비
-- rooms.sim_date::date로 폴백.
--
-- create_trade_offer/respond_trade_offer 양쪽에서 공유하도록 별도 헬퍼 함수로 뺐다.
-- [적용] 2026-09-02 Supabase MCP로 반영
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_virtual_date(p_room_id uuid)
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT coalesce(
        (SELECT g.game_date
         FROM games g
         WHERE g.room_id = p_room_id AND g.scheduled_at IS NOT NULL
         ORDER BY abs(extract(epoch FROM (g.scheduled_at - now())))
         LIMIT 1),
        (SELECT r.sim_date::date FROM rooms r WHERE r.id = p_room_id)
    );
$function$;

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

    SELECT l.id, l.trade_enabled INTO v_league, v_enabled
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = p_room_id;
    IF v_league IS NULL THEN
        RAISE EXCEPTION 'room_not_found';
    END IF;
    IF v_enabled IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'trade_disabled';
    END IF;
    v_sim_date := current_virtual_date(p_room_id);

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

CREATE OR REPLACE FUNCTION public.respond_trade_offer(p_offer_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid        uuid := auth.uid();
    v_o          league_trade_offers%ROWTYPE;
    v_a          league_teams%ROWTYPE;
    v_b          league_teams%ROWTYPE;
    v_admin      boolean;
    v_out        jsonb;
    v_in         jsonb;
    v_id         text;
    v_moved      text[];
    v_new_status text;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;
    IF p_action NOT IN ('accept', 'reject', 'cancel') THEN
        RAISE EXCEPTION 'bad_action';
    END IF;

    SELECT * INTO v_o FROM league_trade_offers WHERE id = p_offer_id FOR UPDATE;
    IF v_o.id IS NULL THEN
        RAISE EXCEPTION 'offer_not_found';
    END IF;
    IF v_o.status <> 'pending' THEN
        RAISE EXCEPTION 'offer_not_pending';
    END IF;
    IF v_o.expires_at <= now() THEN
        UPDATE league_trade_offers SET status = 'expired', resolved_at = now() WHERE id = v_o.id;
        RAISE EXCEPTION 'offer_expired';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM leagues WHERE id = v_o.league_id AND admin_user_id = v_uid
    ) INTO v_admin;

    -- 데드락 방지: 두 팀 행을 항상 id 오름차순으로 잠근다
    PERFORM 1 FROM league_teams WHERE id IN (v_o.from_team_id, v_o.to_team_id) ORDER BY id FOR UPDATE;
    SELECT * INTO v_a FROM league_teams WHERE id = v_o.from_team_id;
    SELECT * INTO v_b FROM league_teams WHERE id = v_o.to_team_id;
    IF v_a.id IS NULL OR v_b.id IS NULL THEN
        RAISE EXCEPTION 'team_not_found';
    END IF;

    IF p_action = 'cancel' THEN
        IF NOT v_admin AND v_a.user_id IS DISTINCT FROM v_uid THEN
            RAISE EXCEPTION 'not_sender';
        END IF;
        v_new_status := 'cancelled';
    ELSE
        IF NOT v_admin AND v_b.user_id IS DISTINCT FROM v_uid THEN
            RAISE EXCEPTION 'not_recipient';
        END IF;
        v_new_status := CASE p_action WHEN 'accept' THEN 'accepted' ELSE 'rejected' END;
    END IF;

    IF p_action = 'accept' THEN
        SELECT
            coalesce(jsonb_agg(player_id) FILTER (WHERE from_team_id = v_a.id), '[]'::jsonb),
            coalesce(jsonb_agg(player_id) FILTER (WHERE from_team_id = v_b.id), '[]'::jsonb),
            array_agg(player_id)
        INTO v_out, v_in, v_moved
        FROM league_trade_offer_players WHERE offer_id = v_o.id;

        FOR v_id IN SELECT jsonb_array_elements_text(v_out) LOOP
            IF NOT (v_a.roster ? v_id) THEN
                RAISE EXCEPTION 'stale_offer: %', v_id;
            END IF;
        END LOOP;
        FOR v_id IN SELECT jsonb_array_elements_text(v_in) LOOP
            IF NOT (v_b.roster ? v_id) THEN
                RAISE EXCEPTION 'stale_offer: %', v_id;
            END IF;
            IF NOT v_admin AND NOT EXISTS (
                SELECT 1 FROM league_trade_blocks WHERE team_id = v_b.id AND player_id = v_id
            ) THEN
                RAISE EXCEPTION 'player_not_tradeable: %', v_id;
            END IF;
        END LOOP;

        UPDATE league_teams SET roster = (
            SELECT coalesce(jsonb_agg(e), '[]'::jsonb)
            FROM jsonb_array_elements_text(league_teams.roster) e
            WHERE e NOT IN (SELECT jsonb_array_elements_text(v_out))
        ) || v_in WHERE id = v_a.id;

        UPDATE league_teams SET roster = (
            SELECT coalesce(jsonb_agg(e), '[]'::jsonb)
            FROM jsonb_array_elements_text(league_teams.roster) e
            WHERE e NOT IN (SELECT jsonb_array_elements_text(v_in))
        ) || v_out WHERE id = v_b.id;

        DELETE FROM league_trade_blocks
        WHERE player_id = ANY(v_moved) AND team_id IN (v_a.id, v_b.id);

        -- 같은 선수가 걸린 다른 대기 중 제안 무효화
        UPDATE league_trade_offers o SET status = 'invalidated', resolved_at = now()
        WHERE o.status = 'pending' AND o.id <> v_o.id AND o.room_id = v_o.room_id
          AND EXISTS (
              SELECT 1 FROM league_trade_offer_players ip
              WHERE ip.offer_id = o.id AND ip.player_id = ANY(v_moved)
          );

        -- 뎁스차트/전술 stale 참조 방지 — 양팀 전술 리셋(다음 접속 시 자동 재생성 폴백)
        UPDATE room_members SET tactics = NULL, depth_chart = NULL
        WHERE room_id = v_o.room_id
          AND team_id IN (v_a.team_slug, v_b.team_slug);

        -- 리그 소식(League Headlines) — 유저간 트레이드 체결 기록.
        -- [2026-09-02 v5] sim_date를 rooms.sim_date(wall-clock) 대신
        -- current_virtual_date()(가상 시즌 캘린더 날짜)로 교정.
        INSERT INTO league_events (room_id, league_id, type, season_number, team_ids, player_ids, score, payload, sim_date)
        VALUES (
            v_o.room_id, v_o.league_id, 'trade',
            (SELECT season_number FROM rooms WHERE id = v_o.room_id),
            ARRAY[v_a.team_slug, v_b.team_slug],
            coalesce(v_moved, ARRAY[]::text[]),
            20,
            jsonb_build_object(
                'v', 1,
                'headline', v_a.team_name || ' ↔ ' || v_b.team_name || ' 트레이드 성사',
                'teamA', jsonb_build_object('slug', v_a.team_slug),
                'teamB', jsonb_build_object('slug', v_b.team_slug),
                'aOut', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name)), '[]'::jsonb)
                         FROM meta_players p
                         WHERE p.id::text IN (SELECT jsonb_array_elements_text(v_out))),
                'bOut', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name)), '[]'::jsonb)
                         FROM meta_players p
                         WHERE p.id::text IN (SELECT jsonb_array_elements_text(v_in)))
            ),
            current_virtual_date(v_o.room_id)
        );
    END IF;

    UPDATE league_trade_offers
    SET status = v_new_status, resolved_at = now(), resolved_by = v_uid, resolved_as_admin = v_admin
    WHERE id = v_o.id;

    RETURN jsonb_build_object('ok', true, 'status', v_new_status);
END;
$function$;
