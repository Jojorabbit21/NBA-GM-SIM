-- [2026-10-28] 트레이드 서신(league_events 'trade') payload에 체결 시점 스냅샷 저장.
-- 배경: 서신이 열 때마다 현재 계약/시즌 스탯을 조회해 발송 후에도 값이 바뀌었다(대체 샐러리 리그에선 DB 원본 연봉 노출).
-- 변경: aOut/bOut 원소에 salary / contractYears / stats{g,pts,reb,ast} 추가. 나머지 함수 본문은 live DB 정의 그대로.
-- 기준 정의: 2026-10-28 live pg_get_functiondef(respond_trade_offer) — v4 파일과 다르니 이 파일이 최신.
-- 롤백: 아래 respond_trade_offer를 aOut/bOut 부분만 'id','name' 2필드 버전으로 되돌려 재적용(helper는 남겨도 무해).

CREATE OR REPLACE FUNCTION public.trade_letter_players(p_room_id uuid, p_ids jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'salary', public.player_current_salary(p_room_id, p.id::text),
        'contractYears', CASE WHEN jsonb_typeof(c.contract->'years') = 'array'
                              THEN jsonb_array_length(c.contract->'years') - coalesce((c.contract->>'currentYear')::int, 0)
                         END,
        'stats', jsonb_build_object(
            'g',   coalesce(s.g, 0),
            'pts', coalesce(s.pts, 0),
            'reb', coalesce(s.reb, 0),
            'ast', coalesce(s.ast, 0)
        )
    )), '[]'::jsonb)
    FROM meta_players p
    LEFT JOIN room_player_state rps ON rps.room_id = p_room_id AND rps.player_id = p.id::text
    CROSS JOIN LATERAL (SELECT coalesce(rps.contract, p.base_attributes->'contract') AS contract) c
    LEFT JOIN public.get_player_season_stats_batch(
        p_room_id,
        ARRAY(SELECT (jsonb_array_elements_text(p_ids))::uuid)
    ) s ON s.player_id = p.id
    WHERE p.id::text IN (SELECT jsonb_array_elements_text(p_ids));
$function$;

CREATE OR REPLACE FUNCTION public.respond_trade_offer(p_offer_id uuid, p_action text, p_reason text DEFAULT NULL::text)
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
    v_reason     text;
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

    -- [2026-10-20] 거절 사유 정규화/검증
    v_reason := nullif(btrim(coalesce(p_reason, '')), '');
    IF v_reason IS NOT NULL AND char_length(v_reason) > 100 THEN
        RAISE EXCEPTION 'reason_too_long';
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
        -- 투웨이 계약 제외, 계약 없는 선수는 정규로 취급. 성사 후 어느 한쪽이라도 정원을 넘으면 거부. 관리자 바이패스 없음.
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

        -- 뎁스차트/전술 stale 참조 방지 — 양팀 전술에서 "나간 선수 ID만" 제거(슬라이더 등은 보존, 빈 자리는 엔진 폴백)
        UPDATE room_members SET
            tactics     = public.strip_players_from_tactics(tactics,     ARRAY(SELECT jsonb_array_elements_text(v_out))),
            depth_chart = public.strip_players_from_depth_chart(depth_chart, ARRAY(SELECT jsonb_array_elements_text(v_out)))
        WHERE room_id = v_o.room_id AND team_id = v_a.team_slug;
        UPDATE room_members SET
            tactics     = public.strip_players_from_tactics(tactics,     ARRAY(SELECT jsonb_array_elements_text(v_in))),
            depth_chart = public.strip_players_from_depth_chart(depth_chart, ARRAY(SELECT jsonb_array_elements_text(v_in)))
        WHERE room_id = v_o.room_id AND team_id = v_b.team_slug;

        -- 리그 소식(League Headlines) — 유저간 트레이드 체결 기록.
        -- [2026-10-28 v5] aOut/bOut에 체결 시점 salary/contractYears/stats 스냅샷 포함(trade_letter_players).
        -- 주의: 로스터 이동 UPDATE 이후에 호출되지만 계약·스탯은 팀 소속과 무관해 체결 시점 값 그대로다.
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
                'aOut', public.trade_letter_players(v_o.room_id, v_out),
                'bOut', public.trade_letter_players(v_o.room_id, v_in)
            ),
            current_virtual_date(v_o.room_id)
        );
    END IF;

    UPDATE league_trade_offers
    SET status = v_new_status, resolved_at = now(), resolved_by = v_uid, resolved_as_admin = v_admin,
        -- [2026-10-20] 거절 사유: 관리자가 수신 팀 대신 거절(개입)하면 고정 문구, 그 외엔 입력값(없으면 NULL)
        reject_reason = CASE
            WHEN p_action <> 'reject' THEN NULL
            WHEN v_admin AND v_b.user_id IS DISTINCT FROM v_uid THEN '관리자에 의해 트레이드가 거절되었습니다.'
            ELSE v_reason
        END
    WHERE id = v_o.id;

    RETURN jsonb_build_object('ok', true, 'status', v_new_status);
END;
$function$;
