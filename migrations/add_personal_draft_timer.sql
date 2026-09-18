-- ============================================================
-- 개인 팩 드래프트 픽 타이머 (docs/plan/tournament-personal-pack-draft-plan.md Phase 3.5)
--
-- - personal_draft_progress.pack_started_at: 팩 생성 시각 = 타이머 시작점
-- - leagues.personal_draft_format->>'pickTimerSec': 라운드당 제한시간(초). NULL이면 타이머 없음.
-- - 만료 시 자동 지명: offered_pool에서 meta_players.base_attributes->>'ovr'(submit_draft_pick_v2가
--   draft_picks.ovr에 쓰는 것과 같은 값)이 가장 높은 카드를 뽑아 다음 라운드로 진행.
-- - 집행: 서버 스케줄러가 personal_draft_sweep_expired()를 주기 호출 + 각 RPC 진입 시 방어적으로 동일 처리.
--
-- 구조: 픽 적용 로직을 personal_draft_apply_pick()(내부 함수, 락 보유 전제)으로 뽑아
-- submit/autopick이 공유한다. 라운드가 넘어가면 다음 팩을 즉시 생성해 pack_started_at을 새로
-- 찍으므로 in_progress 상태에서 offered_pool이 NULL인 구간이 없다(스윕 판정 단순화).
-- ============================================================

ALTER TABLE public.personal_draft_progress
    ADD COLUMN IF NOT EXISTS pack_started_at timestamptz;

-- ── 내부: 현재 라운드 팩 샘플링 (락 보유 전제) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.personal_draft_sample_pack(p_format jsonb, p_round integer)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    v_round_cfg jsonb;
    v_pool_size integer;
    v_pack      jsonb;
BEGIN
    v_round_cfg := p_format->'rounds'->(p_round - 1);
    IF v_round_cfg IS NULL THEN
        RAISE EXCEPTION 'invalid_round_config: round=%', p_round;
    END IF;
    v_pool_size := (v_round_cfg->>'poolSize')::integer;
    SELECT COALESCE(jsonb_agg(v), '[]'::jsonb) INTO v_pack
    FROM (
        SELECT value AS v
        FROM jsonb_array_elements_text(v_round_cfg->'eligiblePlayerIds')
        ORDER BY random()
        LIMIT v_pool_size
    ) s;
    RETURN v_pack;
END;
$function$;

-- ── 내부: 픽 적용 (락 보유 전제, 인증/소속 검증은 호출자 책임) ─────────────
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
            v_new_offered   := personal_draft_sample_pack(p_format, v_new_round);  -- 다음 팩 즉시 생성
            v_new_started   := now();                                            -- 새 타이머
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

-- ── 내부: 만료 판정 ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.personal_draft_is_expired(p_progress personal_draft_progress, p_format jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
    SELECT p_progress.status = 'in_progress'
       AND p_progress.offered_pool IS NOT NULL
       AND p_progress.pack_started_at IS NOT NULL
       AND (p_format->>'pickTimerSec') IS NOT NULL
       AND p_progress.pack_started_at + make_interval(secs => (p_format->>'pickTimerSec')::integer) < now();
$function$;

-- ── 내부: 만료된 팩 자동 지명 (락 보유 전제). 남은 픽 수만큼 최고 OVR 순으로 뽑는다 ──
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
    v_pick     uuid;
    v_count    integer := 0;
BEGIN
    LOOP
        SELECT * INTO v_progress FROM personal_draft_progress
        WHERE room_id = p_room_id AND team_id = p_team_id;
        EXIT WHEN NOT personal_draft_is_expired(v_progress, p_format);

        SELECT (elem)::uuid INTO v_pick
        FROM jsonb_array_elements_text(v_progress.offered_pool) elem
        LEFT JOIN meta_players mp ON mp.id = (elem)::uuid
        ORDER BY COALESCE((mp.base_attributes->>'ovr')::integer, 0) DESC, random()
        LIMIT 1;
        EXIT WHEN v_pick IS NULL;

        PERFORM personal_draft_apply_pick(p_room_id, p_team_id, v_pick, p_format);
        v_count := v_count + 1;
        -- apply_pick이 라운드를 넘기면 새 팩에 now()가 찍혀 만료가 아니므로 루프가 끝난다.
    END LOOP;
    RETURN v_count;
END;
$function$;

-- ── 공개 RPC 재정의 ──────────────────────────────────────────────────────────

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

    -- 만료됐으면 스케줄러와 동일하게 자동 지명 후 최신 상태를 돌려준다.
    IF personal_draft_is_expired(v_progress, v_format) THEN
        v_autopicked := personal_draft_autopick_expired(p_room_id, p_team_id, v_format);
        SELECT * INTO v_progress FROM personal_draft_progress
        WHERE room_id = p_room_id AND team_id = p_team_id;
    END IF;

    IF v_progress.status = 'in_progress' AND v_progress.offered_pool IS NULL THEN
        UPDATE personal_draft_progress
        SET offered_pool = personal_draft_sample_pack(v_format, v_progress.current_round),
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

CREATE OR REPLACE FUNCTION public.submit_personal_draft_pick(
    p_room_id uuid,
    p_team_id uuid,
    p_source_player_id uuid,
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
    v_result    jsonb;
    v_autopicked integer;
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

    -- 만료된 팩에 대한 늦은 제출: 유저 선택은 무시하고 자동 지명 결과를 돌려준다(expired=true).
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

    IF NOT (v_progress.offered_pool ? p_source_player_id::text) THEN
        RAISE EXCEPTION 'player_not_in_pack: %', p_source_player_id;
    END IF;

    v_result := personal_draft_apply_pick(p_room_id, p_team_id, p_source_player_id, v_format);
    RETURN v_result || jsonb_build_object('expired', false, 'autoPicked', 0);
END;
$function$;

-- start_personal_draft는 변경 없음(get_or_generate_round_pack에 위임하므로 타이머도 자동 적용).

-- ── 스케줄러용 스윕: 만료된 진행 건 전부 자동 지명 ────────────────────────────
-- service_role 전용(서버 스케줄러가 supabaseAdmin으로 호출). SKIP LOCKED로 동시 실행/RPC와 충돌 방지.
CREATE OR REPLACE FUNCTION public.personal_draft_sweep_expired()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    r        record;
    v_total  integer := 0;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role_only';
    END IF;

    FOR r IN
        SELECT p.room_id, p.team_id, l.personal_draft_format AS fmt
        FROM personal_draft_progress p
        JOIN rooms rm ON rm.id = p.room_id
        JOIN leagues l ON l.id = rm.league_id
        WHERE p.status = 'in_progress'
          AND p.offered_pool IS NOT NULL
          AND p.pack_started_at IS NOT NULL
          AND (l.personal_draft_format->>'pickTimerSec') IS NOT NULL
          AND p.pack_started_at + make_interval(secs => (l.personal_draft_format->>'pickTimerSec')::integer) < now()
        FOR UPDATE OF p SKIP LOCKED
    LOOP
        v_total := v_total + personal_draft_autopick_expired(r.room_id, r.team_id, r.fmt);
    END LOOP;
    RETURN v_total;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.personal_draft_sample_pack(jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.personal_draft_apply_pick(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.personal_draft_autopick_expired(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.personal_draft_is_expired(personal_draft_progress, jsonb) FROM PUBLIC, anon, authenticated;

-- [적용] 2026-09-18 Supabase MCP로 반영
