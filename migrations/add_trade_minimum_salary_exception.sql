-- ============================================================
-- 멀티플레이어 트레이드 — 최저연봉 예외(Minimum Salary Exception) + 대체 모드 미니멈 계약 플래그 백필
--
-- 배경(docs/plan/multi-trade-cba-gaps.md 1번): 실제 CBA에서 최저연봉 계약(1~2년 미니멈) 선수는 받는
-- 팀의 페이롤 구간(캡 이하/캡 초과/1·2차 에이프런)과 무관하게 매칭 없이 받을 수 있다. 2026-09-29
-- 1단계 매칭 구현엔 이 예외가 없어서, 에이프런 초과 팀은 내보내는 선수 없이는 최저연봉 선수도
-- 못 받았다.
--
-- 판정 규칙(사용자 결정 2026-10-01): 둘 중 하나면 최저연봉 계약으로 본다.
--   ① 계약 signingType = 'minimum_exception' (FA 미니멈 서명 / 대체 모드 드래프트 스케일 미니멈급 계약)
--   ② 현재 연봉 ≤ 캡 × 2.35% (10+ YOS 최저연봉 = 최저연봉 표의 최댓값. 연차별 표를 그대로 쓰면
--      같은 라운드 선수라도 연차에 따라 판정이 갈려서 상한 하나로 통일 —
--      server/src/shared/contracts/draftSalaryScale.ts MINIMUM_CONTRACT_CAP_PCT_MAX와 같은 값)
--   ②는 플래그가 없을 수 있는 standard 모드 스크랩 계약 대비.
--
-- 적용: respond_trade_offer() accept 분기의 매칭 검증에서 "받는 쪽 합계"에서만 최저연봉 선수를 뺀다.
-- 내보내는 쪽 합계·배열은 그대로(2차 에이프런 aggregation 판정은 송신 기준). check_trade_salary_match()
-- 자체는 변경 없음.
--
-- 백필: 대체(alternative) 모드 리그의 기존 드래프트 스케일 계약(1년, free_agent/general, signingType 없음)
-- 중 캡 × 2.35% 이하인 것에 signingType 'minimum_exception'을 찍는다 — 이후 드래프트부터는
-- buildDraftScaleContract()가 생성 시점에 직접 붙인다(서버 재배포 필요). 적용 전 드라이런:
-- AS 2 리그 450건 중 150건($1,649,610 = 캡 1.0%), 바로 위 금액은 $6,598,440(4%)로 경계 명확.
--
-- 클라이언트 미러: services/multi/tradeSalaryMatching.ts isMinimumContractPlayer()/sumMatchableIncoming(),
-- MultiFrontOfficeView.tsx salaryMatchErrors(새 제안)/salaryMatchWarnings(메시지함).
-- [적용] 2026-10-01 Supabase MCP로 반영
-- ============================================================

-- ── 헬퍼: 최저연봉 계약 여부 ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.player_is_minimum_contract(p_room_id uuid, p_player_id text, p_cap numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_contract jsonb;
    v_salary numeric;
BEGIN
    SELECT coalesce(rps.contract, mp.base_attributes->'contract')
    INTO v_contract
    FROM meta_players mp
    LEFT JOIN room_player_state rps ON rps.room_id = p_room_id AND rps.player_id = p_player_id
    WHERE mp.id::text = p_player_id;

    IF v_contract IS NULL THEN
        RETURN false;
    END IF;
    IF v_contract->>'signingType' = 'minimum_exception' THEN
        RETURN true;
    END IF;
    v_salary := public.player_current_salary(p_room_id, p_player_id);
    RETURN v_salary > 0 AND p_cap IS NOT NULL AND v_salary <= p_cap * 0.0235;
END;
$function$;

-- ── respond_trade_offer: 받는 쪽 매칭 합계에서 최저연봉 선수 제외 ──────────────────────
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

-- ── 백필: 대체 모드 리그의 기존 드래프트 스케일 미니멈급 계약에 signingType 부여 ────────────
UPDATE public.room_player_state rps
SET contract = rps.contract || '{"signingType": "minimum_exception"}'::jsonb
FROM public.rooms r
JOIN public.leagues l ON l.id = r.league_id
WHERE rps.room_id = r.id
  AND l.contract_mode = 'alternative'
  AND rps.contract IS NOT NULL
  AND rps.contract->>'type' = 'free_agent'
  AND coalesce(rps.contract->>'contractDetail', 'general') = 'general'
  AND jsonb_array_length(rps.contract->'years') = 1
  AND NOT (rps.contract ? 'signingType')
  AND (rps.contract->'years'->>0)::numeric <= l.salary_cap_amount * 0.0235;
