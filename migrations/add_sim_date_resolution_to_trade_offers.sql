-- ============================================================
-- league_trade_offers.sim_date_at_resolution 컬럼 추가 + respond_trade_offer() 갱신 (v5)
--
-- 배경: 트레이드 히스토리 탭을 카드→테이블로 개편하면서 "수락한 날짜(시뮬레이션 날짜)"
-- 컬럼이 필요해졌다. sim_date_at_creation(제안 생성 시점 인게임 날짜 스냅샷, 2026-08-31
-- 추가)과 대칭으로, 오퍼가 처리(accept/reject/cancel)된 시점의 rooms.sim_date를 스냅샷
-- 저장한다. resolved_at(실제 시각)만으로는 리그마다 다른 압축 스케줄 때문에 인게임
-- 날짜를 알 수 없다는 문제도 sim_date_at_creation과 동일.
--
-- 변경 내용 (respond_trade_offer_league_event_v4.sql 대비):
-- (1) league_trade_offers.sim_date_at_resolution date 컬럼 추가
-- (2) v_sim_date 변수 추가, 함수 시작부에서 rooms.sim_date 조회 후 아래 두 곳에 반영
--     - accept 시 "같은 선수가 걸린 다른 대기 중 제안 무효화" UPDATE에도 스냅샷
--     - 함수 마지막 UPDATE league_trade_offers(상태 반영)에 스냅샷
--     - league_events INSERT의 sim_date는 기존처럼 v_sim_date로 대체(동일 값, 중복 서브쿼리 제거)
-- 그 외 검증/트레이드 실행 로직은 전혀 바뀌지 않음.
-- 기존에 이미 처리된 오퍼는 이 컬럼이 NULL — 클라이언트에서 NULL이면 "-"로 표시.
-- [적용 완료] 2026-09-02 Supabase MCP로 반영
-- ============================================================

ALTER TABLE public.league_trade_offers
    ADD COLUMN IF NOT EXISTS sim_date_at_resolution date;

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

    SELECT sim_date::date INTO v_sim_date FROM rooms WHERE id = v_o.room_id;

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
        -- [2026-09-02 v5] v_sim_date 변수 재사용(중복 서브쿼리 제거) — 값은 v4와 동일.
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
