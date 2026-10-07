-- ============================================================
-- 멀티플레이어 트레이드 — 로스터 정원(정규 계약 슬롯) 서버 강제 (docs/plan/multi-trade-cba-gaps.md 8번)
--
-- 배경: 정원 초과 검사가 클라이언트(MultiFrontOfficeView tradeSendErrors)에만 있어 옛 빌드나 직접 RPC 호출로
-- max_roster_size를 넘는 트레이드가 성사될 수 있었다. sign_free_agent()의 roster_full 검사(fix_roster_full_check_
-- exclude_two_way.sql)와 같은 "정규 계약 = 투웨이 제외, 계약 없는 선수는 정규" 기준을 트레이드 수락에도 적용한다.
--
-- 헬퍼 team_regular_contract_count(room, roster jsonb): 로스터 id 배열 중 계약 type이 'two_way'가 아닌 선수 수.
-- 계약은 player_current_salary()와 같은 관용구(coalesce(room_player_state.contract, meta_players.base_attributes->'contract'))
-- 로 조회 — FA RPC는 room_player_state만 보지만, standard 모드에서 실제 계약을 그대로 쓰는 선수는 room_player_state 행이
-- 없어 meta 계약까지 봐야 투웨이를 제대로 제외한다(클라이언트는 poolById에 오버라이드가 병합된 Player.contract를 본다).
--
-- respond_trade_offer(): accept 분기에서 샐러리 매칭 검증 뒤·로스터 스왑 UPDATE 앞에 양 팀 "성사 후 정규 계약 수"를
-- 계산해 max_roster_size(없으면 15)를 넘으면 'roster_overflow: <team_slug>'. 관리자 바이패스 없음.
-- 클라이언트: services/multi/tradeService.ts mapTradeOfferError()에 'roster_overflow' 매핑 추가(같은 커밋).
-- [적용] 2026-10-02 Supabase MCP로 반영
-- ============================================================

CREATE OR REPLACE FUNCTION public.team_regular_contract_count(p_room_id uuid, p_roster jsonb)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT count(*)::int
    FROM jsonb_array_elements_text(coalesce(p_roster, '[]'::jsonb)) AS pid
    LEFT JOIN meta_players mp ON mp.id::text = pid
    LEFT JOIN room_player_state rps ON rps.room_id = p_room_id AND rps.player_id = pid
    WHERE coalesce(rps.contract, mp.base_attributes->'contract')->>'type' IS DISTINCT FROM 'two_way';
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
    v_deadline   date;
    v_deadline_enabled boolean;
    v_out        jsonb;
    v_in         jsonb;
    v_id         text;
    v_moved      text[];
    v_new_status text;
    -- 샐러리 매칭 검증용
    v_season               text;
    v_cap_enabled          boolean;
    v_matching_enabled     boolean;
    v_cap_amount           numeric;
    v_apron1_amount        numeric;
    v_apron1_enabled       boolean;
    v_apron2_amount        numeric;
    v_apron2_enabled       boolean;
    v_a_payroll            numeric;
    v_b_payroll            numeric;
    v_a_out_salaries       numeric[];
    v_b_out_salaries       numeric[];
    v_a_out_total          numeric;
    v_a_in_total           numeric;
    v_b_out_total          numeric;
    v_b_in_total           numeric;
    -- [2026-10-02] 로스터 정원(정규 계약 슬롯) 검증용
    v_max_roster           integer;
    v_a_regular            integer;
    v_b_regular            integer;
    v_a_out_regular        integer;
    v_b_out_regular        integer;
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

    IF p_action = 'accept' THEN
        SELECT trade_deadline_date, trade_deadline_enabled,
               coalesce(cap_enabled, false), coalesce(trade_salary_matching_enabled, true),
               salary_cap_amount, apron1_amount, coalesce(apron1_enabled, true),
               apron2_amount, coalesce(apron2_enabled, true),
               coalesce(max_roster_size, 15)
        INTO v_deadline, v_deadline_enabled,
             v_cap_enabled, v_matching_enabled,
             v_cap_amount, v_apron1_amount, v_apron1_enabled,
             v_apron2_amount, v_apron2_enabled,
             v_max_roster
        FROM leagues WHERE id = v_o.league_id;
        IF v_deadline_enabled IS DISTINCT FROM false AND v_deadline IS NOT NULL AND current_virtual_date(v_o.room_id) > v_deadline THEN
            RAISE EXCEPTION 'trade_deadline_passed';
        END IF;
        SELECT season INTO v_season FROM rooms WHERE id = v_o.room_id;
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

        -- CBA 샐러리 매칭 검증 (admin은 바이패스 — 기존 트레이드 블록 검증과 동일 관례)
        IF NOT v_admin AND v_cap_enabled AND v_matching_enabled THEN
            SELECT array_agg(public.player_current_salary(v_o.room_id, pid))
            INTO v_a_out_salaries
            FROM jsonb_array_elements_text(v_out) pid;

            SELECT array_agg(public.player_current_salary(v_o.room_id, pid))
            INTO v_b_out_salaries
            FROM jsonb_array_elements_text(v_in) pid;

            v_a_out_total := coalesce((SELECT sum(x) FROM unnest(v_a_out_salaries) x), 0);
            v_b_out_total := coalesce((SELECT sum(x) FROM unnest(v_b_out_salaries) x), 0);

            -- [2026-10-01] 최저연봉 예외 — 받는 쪽 "매칭 대상" 합계에서 최저연봉 계약 선수를 뺀다.
            -- (내보내는 쪽 합계/배열은 그대로 — 2차 에이프런 aggregation 판정은 송신 기준.)
            -- 클라이언트 sumMatchableIncoming()과 동일 규칙.
            SELECT coalesce(sum(public.player_current_salary(v_o.room_id, pid)), 0)
            INTO v_a_in_total
            FROM jsonb_array_elements_text(v_in) pid
            WHERE NOT public.player_is_minimum_contract(v_o.room_id, pid, v_cap_amount);

            SELECT coalesce(sum(public.player_current_salary(v_o.room_id, pid)), 0)
            INTO v_b_in_total
            FROM jsonb_array_elements_text(v_out) pid
            WHERE NOT public.player_is_minimum_contract(v_o.room_id, pid, v_cap_amount);

            v_a_payroll := public.team_current_payroll(v_o.room_id, v_a.id, v_season);
            v_b_payroll := public.team_current_payroll(v_o.room_id, v_b.id, v_season);

            IF NOT public.check_trade_salary_match(
                v_a_payroll, v_a_out_total, v_a_in_total, coalesce(v_a_out_salaries, ARRAY[]::numeric[]),
                v_cap_amount, v_apron1_amount, v_apron1_enabled, v_apron2_amount, v_apron2_enabled
            ) THEN
                RAISE EXCEPTION 'salary_match_failed: %', v_a.team_slug;
            END IF;

            IF NOT public.check_trade_salary_match(
                v_b_payroll, v_b_out_total, v_b_in_total, coalesce(v_b_out_salaries, ARRAY[]::numeric[]),
                v_cap_amount, v_apron1_amount, v_apron1_enabled, v_apron2_amount, v_apron2_enabled
            ) THEN
                RAISE EXCEPTION 'salary_match_failed: %', v_b.team_slug;
            END IF;
        END IF;

        -- [2026-10-02] 로스터 정원(정규 계약 슬롯, leagues.max_roster_size) 검증 — 클라이언트 tradeSendErrors와 동일 기준:
        -- 투웨이 계약 제외, 계약 없는 선수는 정규로 취급. 성사 후 어느 한쪽이라도 정원을 넘으면 거부(이미 넘어 있는 팀이
        -- 그대로 또는 더 넘는 경우 포함). 관리자 바이패스 없음 — 정원 초과는 로스터 불변식 위반이라 테스트 목적으로도 허용 안 함.
        v_a_regular     := public.team_regular_contract_count(v_o.room_id, v_a.roster);
        v_b_regular     := public.team_regular_contract_count(v_o.room_id, v_b.roster);
        v_a_out_regular := public.team_regular_contract_count(v_o.room_id, v_out);
        v_b_out_regular := public.team_regular_contract_count(v_o.room_id, v_in);
        IF v_a_regular - v_a_out_regular + v_b_out_regular > v_max_roster THEN
            RAISE EXCEPTION 'roster_overflow: %', v_a.team_slug;
        END IF;
        IF v_b_regular - v_b_out_regular + v_a_out_regular > v_max_roster THEN
            RAISE EXCEPTION 'roster_overflow: %', v_b.team_slug;
        END IF;

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
