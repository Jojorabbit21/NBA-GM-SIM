-- ============================================================================
-- 개인 팩 드래프트 버그 수정 — 이미 지명한 선수가 다음 라운드 팩에 다시 등장하던 문제
-- docs/plan/tournament-personal-pack-draft-plan.md / dev-log 2026-09-18
--
-- 원인: personal_draft_sample_pack(p_format, p_round)이 라운드 후보 목록(eligiblePlayerIds)에서만
--       무작위 추출하고, 해당 팀이 이미 뽑은 선수(room_player_instances.source_player_id)를 빼지 않았다.
--       라운드별 OVR 범위가 겹치는 포맷(하락 커브 프리셋 등)에선 같은 선수가 다시 나올 수 있었다.
-- 수정: 샘플러에 (room_id, team_id)를 넘겨 그 팀이 이미 지명한 source_player_id를 제외한다.
--       "같은 실제 선수가 여러 팀에 있을 수 있다"는 설계는 그대로(다른 팀 지명은 제외하지 않음).
--       제외 후 후보가 이번 라운드 픽 수보다 적으면(어드민 검증은 poolSize만 보장) 드래프트가 멈추지
--       않도록 제외 없이 추출하는 폴백을 두고 WARNING을 남긴다.
-- 호출부 3곳(personal_draft_apply_pick / get_or_generate_round_pack / personal_draft_force_complete_room)을
-- 새 시그니처로 재정의하고 옛 2-인자 샘플러는 삭제한다.
-- ============================================================================

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
    v_pool_size integer;
    v_picks     integer;
    v_pack      jsonb;
    v_count     integer;
BEGIN
    v_round_cfg := p_format->'rounds'->(p_round - 1);
    IF v_round_cfg IS NULL THEN
        RAISE EXCEPTION 'invalid_round_config: round=%', p_round;
    END IF;
    v_pool_size := (v_round_cfg->>'poolSize')::integer;
    v_picks     := COALESCE((v_round_cfg->>'picks')::integer, 1);

    -- 이 팀이 이미 지명한 선수는 제외
    SELECT COALESCE(jsonb_agg(v), '[]'::jsonb), count(*) INTO v_pack, v_count
    FROM (
        SELECT e.value AS v
        FROM jsonb_array_elements_text(v_round_cfg->'eligiblePlayerIds') e
        WHERE NOT EXISTS (
            SELECT 1 FROM room_player_instances i
            WHERE i.room_id = p_room_id
              AND i.team_id = p_team_id
              AND i.source_player_id::text = e.value
        )
        ORDER BY random()
        LIMIT v_pool_size
    ) s;

    -- 폴백: 제외하고 나니 이번 라운드 픽 수도 못 채우면 드래프트가 멈추므로 제외 없이 추출
    IF v_count < v_picks THEN
        RAISE WARNING 'personal_draft_sample_pack: round % has only % undrafted candidates for team % (picks=%) — sampling without exclusion',
            p_round, v_count, p_team_id, v_picks;
        SELECT COALESCE(jsonb_agg(v), '[]'::jsonb) INTO v_pack
        FROM (
            SELECT value AS v
            FROM jsonb_array_elements_text(v_round_cfg->'eligiblePlayerIds')
            ORDER BY random()
            LIMIT v_pool_size
        ) s;
    END IF;

    RETURN v_pack;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.personal_draft_sample_pack(jsonb, integer, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── personal_draft_apply_pick — 다음 팩 생성 시 새 샘플러 사용 (본문은 add_personal_draft_timer.sql과 동일) ──
CREATE OR REPLACE FUNCTION public.personal_draft_apply_pick(
    p_room_id uuid,
    p_team_id uuid,
    p_source_player_id uuid,
    p_format jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    v_progress       personal_draft_progress%ROWTYPE;
    v_total_rounds   integer := (p_format->>'totalRounds')::integer;
    v_instance_id    uuid;
    v_remaining_pool jsonb;
    v_new_round      integer;
    v_new_picks_rem  integer;
    v_new_status     text;
    v_new_offered    jsonb;
    v_new_started    timestamptz;
BEGIN
    SELECT * INTO v_progress FROM personal_draft_progress
    WHERE room_id = p_room_id AND team_id = p_team_id;

    INSERT INTO room_player_instances (room_id, team_id, source_player_id, drafted_round)
    VALUES (p_room_id, p_team_id, p_source_player_id, v_progress.current_round)
    RETURNING instance_id INTO v_instance_id;

    UPDATE league_teams
    SET roster = COALESCE(roster, '[]'::jsonb) || to_jsonb(v_instance_id::text)
    WHERE id = p_team_id;

    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO v_remaining_pool
    FROM jsonb_array_elements_text(v_progress.offered_pool) elem
    WHERE elem <> p_source_player_id::text;

    v_new_picks_rem := v_progress.picks_remaining - 1;

    IF v_new_picks_rem > 0 THEN
        v_new_round   := v_progress.current_round;
        v_new_status  := 'in_progress';
        v_new_offered := v_remaining_pool;
        v_new_started := v_progress.pack_started_at;   -- 같은 팩: 타이머 리셋 안 함
    ELSE
        v_new_round := v_progress.current_round + 1;
        IF v_new_round > v_total_rounds THEN
            v_new_status    := 'completed';
            v_new_round     := v_progress.current_round;
            v_new_picks_rem := 0;
            v_new_offered   := NULL;
            v_new_started   := NULL;
        ELSE
            v_new_status    := 'in_progress';
            v_new_picks_rem := (p_format->'rounds'->(v_new_round - 1)->>'picks')::integer;
            -- 방금 삽입한 인스턴스까지 포함해 이 팀의 지명 선수를 제외하고 다음 팩 즉시 생성
            v_new_offered   := personal_draft_sample_pack(p_format, v_new_round, p_room_id, p_team_id);
            v_new_started   := now();
        END IF;
    END IF;

    UPDATE personal_draft_progress
    SET current_round   = v_new_round,
        picks_remaining = v_new_picks_rem,
        status          = v_new_status,
        offered_pool    = v_new_offered,
        pack_started_at = v_new_started
    WHERE room_id = p_room_id AND team_id = p_team_id;

    RETURN jsonb_build_object(
        'draftedInstanceId', v_instance_id,
        'draftedSourcePlayerId', p_source_player_id,
        'status', v_new_status,
        'currentRound', v_new_round,
        'picksRemaining', v_new_picks_rem,
        'offeredPool', v_new_offered,
        'packStartedAt', v_new_started,
        'pickTimerSec', (p_format->>'pickTimerSec')::integer,
        'serverNow', now()
    );
END;
$function$;

-- ── get_or_generate_round_pack — 팩 없을 때 생성 시 새 샘플러 사용 (본문 동일) ──
CREATE OR REPLACE FUNCTION public.get_or_generate_round_pack(
    p_room_id uuid,
    p_team_id uuid,
    p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id   uuid := COALESCE(p_user_id, auth.uid());
    v_team      league_teams%ROWTYPE;
    v_progress  personal_draft_progress%ROWTYPE;
    v_format    jsonb;
    v_autopicked integer := 0;
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

    IF personal_draft_is_expired(v_progress, v_format) THEN
        v_autopicked := personal_draft_autopick_expired(p_room_id, p_team_id, v_format);
        SELECT * INTO v_progress FROM personal_draft_progress
        WHERE room_id = p_room_id AND team_id = p_team_id;
    END IF;

    IF v_progress.status = 'in_progress' AND v_progress.offered_pool IS NULL THEN
        UPDATE personal_draft_progress
        SET offered_pool = personal_draft_sample_pack(v_format, v_progress.current_round, p_room_id, p_team_id),
            pack_started_at = now()
        WHERE room_id = p_room_id AND team_id = p_team_id
        RETURNING * INTO v_progress;
    END IF;

    RETURN jsonb_build_object(
        'status', v_progress.status,
        'currentRound', v_progress.current_round,
        'picksRemaining', CASE WHEN v_progress.status = 'completed' THEN 0 ELSE v_progress.picks_remaining END,
        'offeredPool', v_progress.offered_pool,
        'packStartedAt', v_progress.pack_started_at,
        'pickTimerSec', (v_format->>'pickTimerSec')::integer,
        'serverNow', now(),
        'autoPicked', v_autopicked
    );
END;
$function$;

-- ── personal_draft_force_complete_room — 새 샘플러 사용 (본문은 add_personal_draft_room_ops.sql과 동일) ──
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
            (p_room_id, v_team.id, 1, (v_round1->>'picks')::integer, 'in_progress',
             personal_draft_sample_pack(v_format, 1, p_room_id, v_team.id), now())
        ON CONFLICT (room_id, team_id) DO NOTHING;

        v_guard := 0;
        LOOP
            SELECT * INTO v_progress FROM personal_draft_progress
            WHERE room_id = p_room_id AND team_id = v_team.id
            FOR UPDATE;
            EXIT WHEN v_progress.status = 'completed';

            IF v_progress.offered_pool IS NULL OR jsonb_array_length(v_progress.offered_pool) = 0 THEN
                UPDATE personal_draft_progress
                SET offered_pool = personal_draft_sample_pack(v_format, v_progress.current_round, p_room_id, v_team.id),
                    pack_started_at = now()
                WHERE room_id = p_room_id AND team_id = v_team.id;
                v_guard := v_guard + 1;
                IF v_guard > 500 THEN RAISE EXCEPTION 'loop_guard team=%', v_team.id; END IF;
                CONTINUE;
            END IF;

            SELECT (elem)::uuid INTO v_pick
            FROM jsonb_array_elements_text(v_progress.offered_pool) elem
            LEFT JOIN meta_players mp ON mp.id = (elem)::uuid
            ORDER BY COALESCE((mp.base_attributes->>'ovr')::integer, 0) DESC, random()
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

-- 옛 시그니처 제거 — 남아 있으면 실수로 다시 호출될 수 있다.
DROP FUNCTION IF EXISTS public.personal_draft_sample_pack(jsonb, integer);

-- [적용] 2026-09-18 Supabase MCP로 반영
