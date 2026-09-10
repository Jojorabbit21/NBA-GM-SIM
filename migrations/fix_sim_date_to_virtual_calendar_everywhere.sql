-- ============================================================
-- FA서명/방출/트레이드응답의 "인게임 날짜"를 전부 current_virtual_date()로 통일
--
-- 배경: 사용자 리포트 — 선수 이동 내역 위젯에서 웨이브/FA서명 날짜가 트레이드와 달리
-- 현실 날짜(오늘)로 찍힘. 조사 결과 두 가지가 겹쳐 있었음:
--
-- (1) 리그레션 — trade_virtual_sim_date_fix.sql(2026-09-02 10:35)이 create_trade_offer()/
--     respond_trade_offer() 둘 다 rooms.sim_date(실제 KST 방송 시각 — server/src/scheduler.ts의
--     advanceSimDates가 kstDateFromMs(scheduled_at)로 채움, 가상 NBA 캘린더 날짜가 아님) 대신
--     current_virtual_date(room_id)(games.game_date 기반, 진짜 가상 캘린더 날짜)를 쓰도록
--     고쳤었는데, 46분 뒤 add_sim_date_resolution_to_trade_offers.sql(11:21)이
--     sim_date_at_resolution 컬럼을 추가하며 respond_trade_offer()를 다시 CREATE OR REPLACE
--     하면서 v_sim_date 계산 부분을 예전 방식(rooms.sim_date 직접 읽기)으로 실수로 되돌렸음.
--     create_trade_offer()만 신버전으로 남아 있었던 이유가 이것 — respond만 리그레션.
--
-- (2) sign_free_agent()/release_player()(add_league_transactions_log.sql, 오늘 오전 구현)는
--     애초에 current_virtual_date()의 존재를 모르고 옛 방식(rooms.sim_date 직접 읽기)으로
--     짰음 — 트레이드처럼 처음부터 고쳐야 했던 부분.
--
-- current_virtual_date()는 trade_virtual_sim_date_fix.sql에서 이미 정의됨(수정 불필요,
-- 재정의 없음) — "지금(now)과 scheduled_at이 가장 가까운 경기"의 game_date를 반환, 경기가
-- 없으면 rooms.sim_date::date로 폴백.
-- [적용] 2026-09-04 Supabase MCP로 반영
-- ============================================================

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
    v_sim_date   date;
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

    v_sim_date := current_virtual_date(v_o.room_id);

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
        UPDATE league_trade_offers o SET status = 'invalidated', resolved_at = now(), sim_date_at_resolution = v_sim_date
        WHERE o.status = 'pending' AND o.id <> v_o.id AND o.room_id = v_o.room_id
          AND EXISTS (
              SELECT 1 FROM league_trade_offer_players ip
              WHERE ip.offer_id = o.id AND ip.player_id = ANY(v_moved)
          );

        -- 뎁스차트/전술 stale 참조 방지 — 양팀 전술 리셋(다음 접속 시 자동 재생성 폴백)
        UPDATE room_members SET tactics = NULL, depth_chart = NULL
        WHERE room_id = v_o.room_id
          AND team_id IN (v_a.team_slug, v_b.team_slug);

        -- 리그 소식(League Headlines) — 유저간 트레이드 체결 기록. 실패해도 트레이드
        -- 자체를 막으면 안 되지만, 같은 트랜잭션 안이라 여기서 예외가 나면 전체가
        -- 롤백된다 — league_events insert는 room_id/league_id FK만 걸려 있어 실패
        -- 가능성이 사실상 없으므로 별도 예외 처리 없이 그대로 둔다.
        -- [2026-09-01] payload 구조화 — teamA/teamB 슬러그 + 이동 선수 이름(aOut/bOut)을
        -- meta_players에서 인라인 조회해 붙임(뉴스피드 카드가 헤드라인 파싱 없이 렌더링).
        -- [2026-09-01 v3] sim_date 추가 — 뉴스피드 날짜 범위 필터용 인게임 날짜 스냅샷.
        -- [2026-09-02 v4] rooms.sim_date(text) → league_events.sim_date(date) 캐스트 버그 수정.
        -- [2026-09-04 v6] v_sim_date 소스를 rooms.sim_date(실제 KST 방송 시각) → current_virtual_date()
        -- (진짜 가상 캘린더 날짜)로 교정 — v5(add_sim_date_resolution_to_trade_offers.sql)가
        -- create_trade_offer()만 신버전이던 상태에서 respond_trade_offer()를 구버전으로 되돌렸던
        -- 리그레션 복구.
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
            v_sim_date
        );
    END IF;

    UPDATE league_trade_offers
    SET status = v_new_status, resolved_at = now(), resolved_by = v_uid, resolved_as_admin = v_admin, sim_date_at_resolution = v_sim_date
    WHERE id = v_o.id;

    RETURN jsonb_build_object('ok', true, 'status', v_new_status);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sign_free_agent(p_team_id uuid, p_player_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid        uuid := auth.uid();
    v_team       league_teams%ROWTYPE;
    v_admin      boolean;
    v_fa_enabled boolean;
    v_sim_date   date;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO v_team FROM league_teams WHERE id = p_team_id FOR UPDATE;
    IF v_team.id IS NULL THEN
        RAISE EXCEPTION 'team_not_found';
    END IF;

    SELECT l.admin_user_id = v_uid, coalesce(l.fa_enabled, true)
    INTO v_admin, v_fa_enabled
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = v_team.room_id;

    IF NOT v_fa_enabled THEN
        RAISE EXCEPTION 'fa_disabled';
    END IF;
    IF NOT v_admin AND v_team.user_id IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'not_team_owner';
    END IF;
    IF v_team.roster ? p_player_id THEN
        RAISE EXCEPTION 'already_on_roster';
    END IF;
    IF EXISTS (
        SELECT 1 FROM league_teams
        WHERE room_id = v_team.room_id AND id <> v_team.id AND roster ? p_player_id
    ) THEN
        RAISE EXCEPTION 'player_already_signed';
    END IF;

    UPDATE league_teams SET roster = roster || to_jsonb(p_player_id) WHERE id = v_team.id;

    v_sim_date := current_virtual_date(v_team.room_id);

    INSERT INTO league_transactions (room_id, type, team_id, player_id, sim_date, acted_by, resolved_as_admin)
    VALUES (v_team.room_id, 'fa_sign', v_team.id, p_player_id, v_sim_date, v_uid, v_admin);

    RETURN jsonb_build_object('ok', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.release_player(p_team_id uuid, p_player_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid      uuid := auth.uid();
    v_team     league_teams%ROWTYPE;
    v_admin    boolean;
    v_sim_date date;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO v_team FROM league_teams WHERE id = p_team_id FOR UPDATE;
    IF v_team.id IS NULL THEN
        RAISE EXCEPTION 'team_not_found';
    END IF;

    SELECT l.admin_user_id = v_uid INTO v_admin
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = v_team.room_id;

    IF NOT v_admin AND v_team.user_id IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'not_team_owner';
    END IF;
    IF NOT (v_team.roster ? p_player_id) THEN
        RAISE EXCEPTION 'player_not_on_roster';
    END IF;

    UPDATE league_teams SET roster = (
        SELECT coalesce(jsonb_agg(e), '[]'::jsonb)
        FROM jsonb_array_elements_text(roster) e
        WHERE e <> p_player_id
    ) WHERE id = v_team.id;

    DELETE FROM league_trade_blocks WHERE team_id = v_team.id AND player_id = p_player_id;

    UPDATE room_members SET tactics = NULL, depth_chart = NULL
    WHERE room_id = v_team.room_id AND team_id = v_team.team_slug;

    v_sim_date := current_virtual_date(v_team.room_id);

    INSERT INTO league_transactions (room_id, type, team_id, player_id, sim_date, acted_by, resolved_as_admin)
    VALUES (v_team.room_id, 'waive', v_team.id, p_player_id, v_sim_date, v_uid, v_admin);

    RETURN jsonb_build_object('ok', true);
END;
$function$
;
