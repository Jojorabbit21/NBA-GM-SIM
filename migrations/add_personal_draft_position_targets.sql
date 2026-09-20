-- ============================================================================
-- 개인 팩 드래프트: 포지션 분배(가드/포워드/센터 목표 장수)
-- 사용자 요청 (2026-09-20): "개인 팩 드래프트에도 포지션 분배에 대한 내용을 추가해줘야함. 적어도
-- 가드/포워드/센터의 비율이 맞게끔 드래프트할 수 있어야함." (필수 그룹 강조 표시는 하지 않음)
--
-- 그룹: G = PG/SG, F = SF/PF, C = C. 목표는 포맷 format.positionTargets = {G,F,C}(장수, 합 = 총 로스터).
-- 없으면 총 로스터 N 기준 기본값: C = max(2, round(N*0.2)), G = round(N*0.4), F = N - G - C.
--
-- 규칙(모두 personal_draft_group_state 하나로 판정):
--   deficit(g) = max(0, target(g) - count(g)),  remaining = N - 지명 수
--   "필수" = 부족분 합계 >= remaining 이면 부족한 그룹 전부(남은 픽을 전부 부족 그룹에 써야 목표 달성 가능)
--   1) AI 자동 지명(만료/강제 완료): 필수 그룹 카드 우선 → 목표 미달 그룹 우선 → OVR 내림차순
--   2) 팩 보장: 필수 그룹이 있으면 그 그룹 카드가 팩에 최소 min(이번 라운드 픽 수, 부족분)장 들어가도록
--      비필수 카드를 교체(노출 이력·지명 제외·같은 선수 1장 규칙 유지, 컬렉션 비율은 보장 슬롯에 한해 무시)
--   3) 동시 지명 검증: 제출 후에도 부족분 합계 <= 남은 픽이어야 함(position_target_unreachable)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.personal_draft_pos_group(p_pos text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
    SELECT CASE upper(trim(COALESCE(p_pos, '')))
        WHEN 'PG' THEN 'G' WHEN 'SG' THEN 'G' WHEN 'G' THEN 'G'
        WHEN 'C'  THEN 'C'
        ELSE 'F' END;
$function$;

-- 팀의 포지션 분배 상태. p_extra_cards 는 "이 카드들을 추가로 지명했다고 가정"(동시 지명 검증용).
CREATE OR REPLACE FUNCTION public.personal_draft_group_state(
    p_format      jsonb,
    p_room_id     uuid,
    p_team_id     uuid,
    p_extra_cards text[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
    v_total     integer;
    v_targets   jsonb;
    v_tg int; v_tf int; v_tc int;
    v_cg int := 0; v_cf int := 0; v_cc int := 0;
    v_drafted   integer;
    v_remaining integer;
    v_dg int; v_df int; v_dc int; v_total_def int;
    v_required  jsonb := '[]'::jsonb;
BEGIN
    SELECT COALESCE(sum((r->>'picks')::integer), 0) INTO v_total
    FROM jsonb_array_elements(p_format->'rounds') r;

    v_targets := p_format->'positionTargets';
    IF v_targets IS NOT NULL AND jsonb_typeof(v_targets) = 'object' THEN
        v_tg := COALESCE((v_targets->>'G')::integer, 0);
        v_tf := COALESCE((v_targets->>'F')::integer, 0);
        v_tc := COALESCE((v_targets->>'C')::integer, 0);
    ELSE
        v_tc := GREATEST(LEAST(2, v_total), round(v_total * 0.2)::integer);
        v_tg := round(v_total * 0.4)::integer;
        v_tf := GREATEST(0, v_total - v_tg - v_tc);
    END IF;

    SELECT
        count(*) FILTER (WHERE personal_draft_pos_group(c.position) = 'G'),
        count(*) FILTER (WHERE personal_draft_pos_group(c.position) = 'F'),
        count(*) FILTER (WHERE personal_draft_pos_group(c.position) = 'C'),
        count(*)
    INTO v_cg, v_cf, v_cc, v_drafted
    FROM (
        SELECT i.source_player_id AS card_id FROM room_player_instances i WHERE i.room_id = p_room_id AND i.team_id = p_team_id
        UNION ALL
        SELECT x::uuid FROM unnest(p_extra_cards) x
    ) d
    LEFT JOIN meta_player_cards c ON c.id = d.card_id;

    v_remaining := GREATEST(0, v_total - v_drafted);
    v_dg := GREATEST(0, v_tg - v_cg);
    v_df := GREATEST(0, v_tf - v_cf);
    v_dc := GREATEST(0, v_tc - v_cc);
    v_total_def := v_dg + v_df + v_dc;

    IF v_total_def >= v_remaining AND v_total_def > 0 THEN
        IF v_dg > 0 THEN v_required := v_required || '"G"'::jsonb; END IF;
        IF v_df > 0 THEN v_required := v_required || '"F"'::jsonb; END IF;
        IF v_dc > 0 THEN v_required := v_required || '"C"'::jsonb; END IF;
    END IF;

    RETURN jsonb_build_object(
        'counts',   jsonb_build_object('G', v_cg, 'F', v_cf, 'C', v_cc),
        'targets',  jsonb_build_object('G', v_tg, 'F', v_tf, 'C', v_tc),
        'deficits', jsonb_build_object('G', v_dg, 'F', v_df, 'C', v_dc),
        'remaining', v_remaining,
        'totalDeficit', v_total_def,
        'required', v_required
    );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.personal_draft_group_state(jsonb, uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;

-- ── 샘플러: 기존 3단계 샘플링 뒤 필수 그룹 보장 슬롯 후처리 ──
CREATE OR REPLACE FUNCTION public.personal_draft_sample_pack(
    p_format  jsonb,
    p_round   integer,
    p_room_id uuid,
    p_team_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    v_round_cfg jsonb;
    v_picks     integer;
    v_seen      jsonb;
    v_pack      jsonb;
    v_state     jsonb;
    v_group     text;
    v_want      integer;
    v_have      integer;
    v_cand      text;
    v_drop      text;
    v_guard     integer;
BEGIN
    v_round_cfg := p_format->'rounds'->(p_round - 1);
    IF v_round_cfg IS NULL THEN
        RAISE EXCEPTION 'invalid_round_config: round=%', p_round;
    END IF;
    v_picks := COALESCE((v_round_cfg->>'picks')::integer, 1);
    SELECT COALESCE(seen_pool, '[]'::jsonb) INTO v_seen
    FROM personal_draft_progress WHERE room_id = p_room_id AND team_id = p_team_id;
    v_seen := COALESCE(v_seen, '[]'::jsonb);

    v_pack := personal_draft_sample_try(p_format, v_round_cfg, p_room_id, p_team_id, v_seen, 0);
    IF jsonb_array_length(v_pack) < v_picks THEN
        RAISE WARNING 'personal_draft_sample_pack: round % team % — only % unseen candidates (picks=%), relaxing seen exclusion',
            p_round, p_team_id, jsonb_array_length(v_pack), v_picks;
        v_pack := personal_draft_sample_try(p_format, v_round_cfg, p_room_id, p_team_id, v_seen, 1);
    END IF;
    IF jsonb_array_length(v_pack) < v_picks THEN
        RAISE WARNING 'personal_draft_sample_pack: round % team % — only % undrafted candidates (picks=%), sampling without exclusion',
            p_round, p_team_id, jsonb_array_length(v_pack), v_picks;
        v_pack := personal_draft_sample_try(p_format, v_round_cfg, p_room_id, p_team_id, v_seen, 2);
    END IF;

    -- 필수 그룹 보장: 부족분이 큰 그룹부터, 팩에 min(picks, 부족분)장은 반드시 들어가게
    v_state := personal_draft_group_state(p_format, p_room_id, p_team_id);
    FOR v_group IN
        SELECT g FROM jsonb_array_elements_text(v_state->'required') g
        ORDER BY (v_state->'deficits'->>g)::integer DESC
    LOOP
        v_want := LEAST(v_picks, (v_state->'deficits'->>v_group)::integer);
        v_guard := 0;
        LOOP
            SELECT count(*) INTO v_have
            FROM jsonb_array_elements_text(v_pack) e
            JOIN meta_player_cards c ON c.id::text = e.value
            WHERE personal_draft_pos_group(c.position) = v_group;
            EXIT WHEN v_have >= v_want;
            v_guard := v_guard + 1;
            EXIT WHEN v_guard > 30;

            -- 후보: 이 라운드 합집합에서 해당 그룹, 팩에 없고, 노출 이력·지명 제외·같은 선수 1장
            SELECT e.value INTO v_cand
            FROM jsonb_array_elements_text(v_round_cfg->'eligiblePlayerIds') e
            JOIN meta_player_cards c ON c.id::text = e.value
            WHERE personal_draft_pos_group(c.position) = v_group
              AND NOT (v_pack ? e.value)
              AND NOT (v_seen ? e.value)
              AND NOT personal_draft_card_excluded(p_room_id, p_team_id, e.value)
              AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_pack) pe JOIN meta_player_cards pc ON pc.id::text = pe.value
                              WHERE pc.source_player_id = c.source_player_id)
            ORDER BY random() LIMIT 1;
            IF v_cand IS NULL THEN
                -- 노출 이력 무시하고 한 번 더
                SELECT e.value INTO v_cand
                FROM jsonb_array_elements_text(v_round_cfg->'eligiblePlayerIds') e
                JOIN meta_player_cards c ON c.id::text = e.value
                WHERE personal_draft_pos_group(c.position) = v_group
                  AND NOT (v_pack ? e.value)
                  AND NOT personal_draft_card_excluded(p_room_id, p_team_id, e.value)
                  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_pack) pe JOIN meta_player_cards pc ON pc.id::text = pe.value
                                  WHERE pc.source_player_id = c.source_player_id)
                ORDER BY random() LIMIT 1;
            END IF;
            EXIT WHEN v_cand IS NULL;

            -- 교체 대상: 필수 그룹이 아닌 카드 우선, 없으면 이미 want 를 넘긴 다른 필수 그룹 카드
            SELECT e.value INTO v_drop
            FROM jsonb_array_elements_text(v_pack) e
            LEFT JOIN meta_player_cards c ON c.id::text = e.value
            WHERE NOT (v_state->'required' ? personal_draft_pos_group(c.position))
            ORDER BY random() LIMIT 1;
            IF v_drop IS NULL THEN
                SELECT e.value INTO v_drop
                FROM jsonb_array_elements_text(v_pack) e
                JOIN meta_player_cards c ON c.id::text = e.value
                WHERE personal_draft_pos_group(c.position) <> v_group
                  AND (SELECT count(*) FROM jsonb_array_elements_text(v_pack) e2 JOIN meta_player_cards c2 ON c2.id::text = e2.value
                        WHERE personal_draft_pos_group(c2.position) = personal_draft_pos_group(c.position))
                      > LEAST(v_picks, (v_state->'deficits'->>personal_draft_pos_group(c.position))::integer)
                ORDER BY random() LIMIT 1;
            END IF;
            EXIT WHEN v_drop IS NULL;

            v_pack := (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements(v_pack) x WHERE x #>> '{}' <> v_drop) || to_jsonb(v_cand);
        END LOOP;
    END LOOP;

    RETURN v_pack;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.personal_draft_sample_pack(jsonb, integer, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── AI 자동 지명 정렬(만료) ──
CREATE OR REPLACE FUNCTION public.personal_draft_autopick_expired(
    p_room_id uuid,
    p_team_id uuid,
    p_format jsonb
)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    v_progress personal_draft_progress%ROWTYPE;
    v_state    jsonb;
    v_pick     uuid;
    v_count    integer := 0;
BEGIN
    LOOP
        SELECT * INTO v_progress FROM personal_draft_progress
        WHERE room_id = p_room_id AND team_id = p_team_id;
        EXIT WHEN NOT personal_draft_is_expired(v_progress, p_format);

        v_state := personal_draft_group_state(p_format, p_room_id, p_team_id);
        SELECT (elem)::uuid INTO v_pick
        FROM jsonb_array_elements_text(v_progress.offered_pool) elem
        LEFT JOIN meta_player_cards c ON c.id::text = elem
        ORDER BY
            CASE WHEN jsonb_array_length(v_state->'required') > 0
                  AND NOT (v_state->'required' ? personal_draft_pos_group(c.position)) THEN 1 ELSE 0 END,
            CASE WHEN (v_state->'counts'->>personal_draft_pos_group(c.position))::integer
                   >= (v_state->'targets'->>personal_draft_pos_group(c.position))::integer THEN 1 ELSE 0 END,
            personal_draft_card_ovr(p_format, elem) DESC,
            random()
        LIMIT 1;
        EXIT WHEN v_pick IS NULL;

        PERFORM personal_draft_apply_pick(p_room_id, p_team_id, v_pick, p_format);
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.personal_draft_autopick_expired(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- ── AI 자동 지명 정렬(강제 완료) ──
CREATE OR REPLACE FUNCTION public.personal_draft_force_complete_room(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_format   jsonb;
    v_round1   jsonb;
    v_team     record;
    v_progress personal_draft_progress%ROWTYPE;
    v_state    jsonb;
    v_pack     jsonb;
    v_pick     uuid;
    v_teams    integer := 0;
    v_picks    integer := 0;
    v_guard    integer;
BEGIN
    IF (auth.jwt()->>'role') IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role_only';
    END IF;

    SELECT l.personal_draft_format INTO v_format
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = p_room_id;
    IF v_format IS NULL THEN
        RAISE EXCEPTION 'not_personal_draft_league';
    END IF;
    v_round1 := v_format->'rounds'->0;
    IF v_round1 IS NULL THEN
        RAISE EXCEPTION 'invalid_format: no rounds';
    END IF;

    FOR v_team IN SELECT id FROM league_teams WHERE room_id = p_room_id ORDER BY id LOOP
        INSERT INTO personal_draft_progress
            (room_id, team_id, current_round, picks_remaining, status, offered_pool, pack_started_at)
        VALUES
            (p_room_id, v_team.id, 1, (v_round1->>'picks')::integer, 'in_progress', NULL, now())
        ON CONFLICT (room_id, team_id) DO NOTHING;

        v_guard := 0;
        LOOP
            SELECT * INTO v_progress FROM personal_draft_progress
            WHERE room_id = p_room_id AND team_id = v_team.id
            FOR UPDATE;
            EXIT WHEN v_progress.status = 'completed';

            IF v_progress.offered_pool IS NULL OR jsonb_array_length(v_progress.offered_pool) = 0 THEN
                v_pack := personal_draft_new_pack(v_format, v_progress.current_round, p_room_id, v_team.id);
                UPDATE personal_draft_progress
                SET offered_pool = v_pack,
                    pack_started_at = now()
                WHERE room_id = p_room_id AND team_id = v_team.id;
                v_guard := v_guard + 1;
                IF v_guard > 500 THEN RAISE EXCEPTION 'loop_guard team=%', v_team.id; END IF;
                CONTINUE;
            END IF;

            v_state := personal_draft_group_state(v_format, p_room_id, v_team.id);
            SELECT (elem)::uuid INTO v_pick
            FROM jsonb_array_elements_text(v_progress.offered_pool) elem
            LEFT JOIN meta_player_cards c ON c.id::text = elem
            ORDER BY
                CASE WHEN jsonb_array_length(v_state->'required') > 0
                      AND NOT (v_state->'required' ? personal_draft_pos_group(c.position)) THEN 1 ELSE 0 END,
                CASE WHEN (v_state->'counts'->>personal_draft_pos_group(c.position))::integer
                       >= (v_state->'targets'->>personal_draft_pos_group(c.position))::integer THEN 1 ELSE 0 END,
                personal_draft_card_ovr(v_format, elem) DESC,
                random()
            LIMIT 1;
            IF v_pick IS NULL THEN
                RAISE EXCEPTION 'empty_pack team=%', v_team.id;
            END IF;

            PERFORM personal_draft_apply_pick(p_room_id, v_team.id, v_pick, v_format);
            v_picks := v_picks + 1;
            v_guard := v_guard + 1;
            IF v_guard > 500 THEN RAISE EXCEPTION 'loop_guard team=%', v_team.id; END IF;
        END LOOP;
        v_teams := v_teams + 1;
    END LOOP;

    RETURN jsonb_build_object('teams', v_teams, 'autoPicks', v_picks);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.personal_draft_force_complete_room(uuid) FROM PUBLIC, anon, authenticated;

-- ── 동시 지명: 제출 후 목표 달성 가능성 검증 추가 ──
CREATE OR REPLACE FUNCTION public.submit_personal_draft_picks(
    p_room_id uuid,
    p_team_id uuid,
    p_card_ids uuid[],
    p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id    uuid := COALESCE(p_user_id, auth.uid());
    v_team       league_teams%ROWTYPE;
    v_progress   personal_draft_progress%ROWTYPE;
    v_format     jsonb;
    v_result     jsonb;
    v_state      jsonb;
    v_autopicked integer;
    v_n          integer := COALESCE(array_length(p_card_ids, 1), 0);
    v_id         uuid;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO v_team FROM league_teams WHERE id = p_team_id AND room_id = p_room_id;
    IF v_team.id IS NULL THEN
        RAISE EXCEPTION 'team_not_found';
    END IF;
    IF v_team.user_id IS DISTINCT FROM v_user_id THEN
        RAISE EXCEPTION 'not_team_owner';
    END IF;

    SELECT l.personal_draft_format INTO v_format
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = p_room_id;
    IF v_format IS NULL THEN
        RAISE EXCEPTION 'not_personal_draft_league';
    END IF;

    SELECT * INTO v_progress FROM personal_draft_progress
    WHERE room_id = p_room_id AND team_id = p_team_id
    FOR UPDATE;
    IF v_progress.room_id IS NULL THEN
        RAISE EXCEPTION 'draft_not_started';
    END IF;
    IF v_progress.status <> 'in_progress' THEN
        RAISE EXCEPTION 'draft_already_completed';
    END IF;
    IF v_progress.offered_pool IS NULL THEN
        RAISE EXCEPTION 'pack_not_generated';
    END IF;

    IF personal_draft_is_expired(v_progress, v_format) THEN
        v_autopicked := personal_draft_autopick_expired(p_room_id, p_team_id, v_format);
        SELECT * INTO v_progress FROM personal_draft_progress
        WHERE room_id = p_room_id AND team_id = p_team_id;
        RETURN jsonb_build_object(
            'expired', true,
            'autoPicked', v_autopicked,
            'status', v_progress.status,
            'currentRound', v_progress.current_round,
            'picksRemaining', v_progress.picks_remaining,
            'offeredPool', v_progress.offered_pool,
            'packStartedAt', v_progress.pack_started_at,
            'pickTimerSec', (v_format->>'pickTimerSec')::integer,
            'serverNow', now()
        );
    END IF;

    IF v_n <> v_progress.picks_remaining THEN
        RAISE EXCEPTION 'pick_count_mismatch: expected % got %', v_progress.picks_remaining, v_n;
    END IF;
    IF (SELECT count(DISTINCT c) FROM unnest(p_card_ids) c) <> v_n THEN
        RAISE EXCEPTION 'duplicate_card';
    END IF;

    FOREACH v_id IN ARRAY p_card_ids LOOP
        IF NOT (v_progress.offered_pool ? v_id::text) THEN
            RAISE EXCEPTION 'player_not_in_pack: %', v_id;
        END IF;
    END LOOP;

    -- 포지션 목표 달성 가능성: 이 픽들을 더한 뒤에도 부족분 합계 <= 남은 픽
    v_state := personal_draft_group_state(v_format, p_room_id, p_team_id, (SELECT array_agg(x::text) FROM unnest(p_card_ids) x));
    IF (v_state->>'totalDeficit')::integer > (v_state->>'remaining')::integer THEN
        RAISE EXCEPTION 'position_target_unreachable: deficits=% remaining=%', v_state->'deficits', v_state->>'remaining';
    END IF;

    FOREACH v_id IN ARRAY p_card_ids LOOP
        IF personal_draft_card_excluded(p_room_id, p_team_id, v_id::text) THEN
            RAISE EXCEPTION 'duplicate_player: %', v_id;
        END IF;
        v_result := personal_draft_apply_pick(p_room_id, p_team_id, v_id, v_format);
    END LOOP;

    RETURN v_result || jsonb_build_object('expired', false, 'autoPicked', 0, 'draftedCardIds', to_jsonb(p_card_ids));
END;
$function$;

-- 롤백: pos_group/group_state DROP, sample_pack/autopick_expired/force_complete/submit_picks 를
--       add_personal_draft_multi_pick_and_seen.sql 본문으로 재정의. 포맷의 positionTargets 키는 무시되므로 데이터 이관 불필요.

-- [적용] 2026-09-20 Supabase MCP로 반영
