-- ============================================================
-- 멀티플레이어 트레이드 CBA 샐러리 매칭 (캡/에이프런 구간별 제약)
--
-- 배경: create_trade_offer()/respond_trade_offer()에는 지금까지 샐러리 매칭 검증이 전혀
-- 없었다(로스터 소유권/트레이드 블록/데드라인만 검사). 싱글플레이어 CPU 엔진
-- (services/tradeEngine/salaryRules.ts)에 매칭 로직이 있긴 하지만, 실제 CBA 원문과
-- 대조해보니 그건 2017 CBA 기준(택스 라인에서 110%/125% 분기)이고, 2023 CBA부터는
-- 택스 여부와 무관하게 "송신 연봉 크기" 기준 3단계 스케일로 바뀌었다. 게다가 그 파일은
-- 멀티 리그별로 다른 leagues.salary_cap_amount 대신 싱글 전용 전역 상수를 참조해서
-- 그대로 재사용할 수도 없다. 이번에 현행 CBA를 다시 검증해서 아래 규칙으로 새로 구현한다.
--
-- 매칭 규칙 (검증된 현행 2023 CBA):
--   1. 팀 페이롤 < 캡              → 매칭 불필요, 잔여 캡 스페이스만큼 자유롭게 수신
--   2. 캡 ≤ 페이롤 < 1차 에이프런  → 송신액 기준 3단계 (택스 여부 무관):
--        송신 ≤ $7.5M   → 수신 한도 = 송신×2 + $250K
--        $7.5M~$29M     → 수신 한도 = 송신 + $7.5M
--        송신 > $29M    → 수신 한도 = 송신×1.25 + $250K
--   3. 1차 에이프런 ≤ 페이롤 < 2차 에이프런 → 100% 매칭(수신 ≤ 송신, $250K 여유 없음).
--        여러 선수를 합쳐서(aggregation) 매칭하는 건 이 구간에서는 허용됨.
--   4. 페이롤 ≥ 2차 에이프런        → 100% 매칭 + aggregation 금지. "여러 명 내보내
--        합쳐서 큰 계약 하나를 받는" 것만 금지되고 "한 명 내보내고 여러 명 받는" 건
--        허용되므로, 기준은 sum(outgoing)이 아니라 max(outgoing) — 내보내는 선수 중
--        가장 큰 연봉 한 명.
--
-- 범위: 이번 단계는 매칭 티어 + 에이프런 100% 규칙만. 하드캡 상태 영속화(이 시즌 내내
-- 유지되는 효과), Trade Player Exception 뱅킹, 사인앤트레이드, 트레이드 내 현금은
-- 멀티에 그 개념 자체가 없어서 제외.
--
-- 토글: leagues.cap_enabled(숫자 임계값 집행 마스터 스위치)와는 별개 축인
-- trade_salary_matching_enabled 신설(trade_deadline_enabled와 동일한 "on/off + 이미
-- 있는 금액 컬럼 재사용" 패턴) — 캡 금액은 추적하되 트레이드 매칭까진 원치 않는
-- 캐주얼 리그를 지원. RPC는 cap_enabled && trade_salary_matching_enabled 둘 다
-- true일 때만 강제. apron1_enabled/apron2_enabled가 꺼진 리그는 해당 구간을 건너뛰고
-- 다음 낮은 구간 규칙을 적용(기존 renderCapSummaryFooter의 "각 *_enabled로 행 자체
-- 생략" 패턴과 동일).
--
-- 검증 시점: create_trade_offer()가 아니라 respond_trade_offer()의 accept 분기에서만
-- 검사한다 — 트레이드 데드라인도 accept 시점에만 검사하는 기존 비대칭 구조와 동일한
-- 이유(제안 생성 후 수락 전에 다른 트레이드/FA로 로스터·연봉이 바뀔 수 있어 생성 시점
-- 검사는 의미가 약함). 관리자(admin)는 기존 트레이드 블록 검증과 동일하게 이 체크도
-- 바이패스(테스트/강제 조정 목적).
--
-- 클라이언트 매핑: services/multi/tradeService.ts의 mapTradeOfferError()에
-- 'salary_match_failed' 케이스 추가 필요(같은 커밋에서 처리).
-- [적용] 2026-09-29 Supabase MCP로 반영
-- ============================================================

ALTER TABLE public.leagues
    ADD COLUMN IF NOT EXISTS trade_salary_matching_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.leagues.trade_salary_matching_enabled IS
    'CBA 샐러리 매칭(캡/에이프런 구간별 트레이드 제약) 강제 여부. cap_enabled와는 별개 축 —
     캡 금액은 추적하되 트레이드 매칭까진 원치 않는 캐주얼 리그를 지원. 기본 true.';

-- ── 헬퍼 1: 선수 1명의 현재 시즌 연봉 (release_player()의 기존 관용구 재사용) ──────────

CREATE OR REPLACE FUNCTION public.player_current_salary(p_room_id uuid, p_player_id text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_contract jsonb;
    v_current_year int;
BEGIN
    SELECT coalesce(rps.contract, mp.base_attributes->'contract')
    INTO v_contract
    FROM meta_players mp
    LEFT JOIN room_player_state rps ON rps.room_id = p_room_id AND rps.player_id = p_player_id
    WHERE mp.id::text = p_player_id;

    IF v_contract IS NULL THEN
        RETURN 0;
    END IF;

    v_current_year := coalesce((v_contract->>'currentYear')::int, 0);
    RETURN coalesce((v_contract->'years'->>v_current_year)::numeric, 0);
END;
$function$;

-- ── 헬퍼 2: 팀의 현재 시즌 총 페이롤 (calcTeamPayroll()과 동일 규칙 — two_way 제외 +
--    해당 시즌 데드캡 합산). getTeamDeadMoney(teamFinances, teamSlug, season)의
--    시즌 필터와 동일 규칙. ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.team_current_payroll(p_room_id uuid, p_team_id uuid, p_season text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_team league_teams%ROWTYPE;
    v_roster_total numeric;
    v_dead_total numeric;
BEGIN
    SELECT * INTO v_team FROM league_teams WHERE id = p_team_id AND room_id = p_room_id;
    IF v_team.id IS NULL THEN
        RETURN 0;
    END IF;

    SELECT coalesce(sum(public.player_current_salary(p_room_id, pid)), 0)
    INTO v_roster_total
    FROM jsonb_array_elements_text(v_team.roster) AS pid
    WHERE NOT EXISTS (
        SELECT 1 FROM room_player_state rps
        WHERE rps.room_id = p_room_id AND rps.player_id = pid
          AND rps.contract->>'type' = 'two_way'
    );

    SELECT coalesce(sum((e->>'amount')::numeric), 0)
    INTO v_dead_total
    FROM jsonb_array_elements(
        coalesce(
            (SELECT team_finances FROM rooms WHERE id = p_room_id) #> array[v_team.team_slug, 'deadMoney'],
            '[]'::jsonb
        )
    ) e
    WHERE e->>'season' = p_season;

    RETURN v_roster_total + v_dead_total;
END;
$function$;

-- ── 헬퍼 3: 구간별 매칭 판정 (위 4단계 규칙 그대로) ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_trade_salary_match(
    p_team_payroll   numeric,
    p_outgoing_total numeric,
    p_incoming_total numeric,
    p_outgoing_salaries numeric[],
    p_cap            numeric,
    p_apron1         numeric,
    p_apron1_enabled boolean,
    p_apron2         numeric,
    p_apron2_enabled boolean
) RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    v_max_out numeric;
    v_limit   numeric;
BEGIN
    IF p_team_payroll < p_cap THEN
        RETURN p_incoming_total <= p_outgoing_total + (p_cap - p_team_payroll);
    END IF;

    IF p_apron2_enabled AND p_team_payroll >= p_apron2 THEN
        SELECT coalesce(max(x), 0) INTO v_max_out FROM unnest(p_outgoing_salaries) x;
        RETURN p_incoming_total <= v_max_out;
    END IF;

    IF p_apron1_enabled AND p_team_payroll >= p_apron1 THEN
        RETURN p_incoming_total <= p_outgoing_total;
    END IF;

    IF p_outgoing_total <= 7500000 THEN
        v_limit := p_outgoing_total * 2.0 + 250000;
    ELSIF p_outgoing_total <= 29000000 THEN
        v_limit := p_outgoing_total + 7500000;
    ELSE
        v_limit := p_outgoing_total * 1.25 + 250000;
    END IF;
    RETURN p_incoming_total <= v_limit;
END;
$function$;

-- ── respond_trade_offer() 재정의 — add_leagues_trade_deadline_enabled.sql의 최신본을
--    베이스로, accept 분기의 로스터 스왑 UPDATE 이전에 두 팀 각각 샐러리 매칭 검사
--    추가. create_trade_offer()는 건드리지 않음(트레이드 데드라인과 동일하게 accept
--    시점에만 검사). ────────────────────────────────────────────────────────────────

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
               apron2_amount, coalesce(apron2_enabled, true)
        INTO v_deadline, v_deadline_enabled,
             v_cap_enabled, v_matching_enabled,
             v_cap_amount, v_apron1_amount, v_apron1_enabled,
             v_apron2_amount, v_apron2_enabled
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
            v_a_in_total  := coalesce((SELECT sum(x) FROM unnest(v_b_out_salaries) x), 0);
            v_b_out_total := v_a_in_total;
            v_b_in_total  := v_a_out_total;

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
