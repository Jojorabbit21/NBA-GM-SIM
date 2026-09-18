-- ============================================================
-- 개인 팩 드래프트 RPC 3종 (docs/plan/tournament-personal-pack-draft-plan.md Phase 3)
--
-- start_personal_draft   — 팀 확정 직후 1회 호출. personal_draft_progress row 생성 +
--                           1라운드 팩까지 바로 생성해 반환(get_or_generate_round_pack 위임).
-- get_or_generate_round_pack — offered_pool이 이미 있으면 그대로 반환(멱등, 재접속 대비),
--                           없으면 leagues.personal_draft_format.rounds[current_round].eligiblePlayerIds
--                           (세션 생성 시 이미 확정된 목록)에서 poolSize만큼 무작위 샘플.
--                           meta_players를 재쿼리하지 않는다 — "라운드 풀 고갈"이 런타임에
--                           발생할 수 없는 이유.
-- submit_personal_draft_pick — offered_pool에 속한 선수인지 검증 → room_player_instances에
--                           새 instance_id 발급 → league_teams.roster에 그 instance_id를
--                           append(meta_players.id 아님) → picks_remaining 차감, 0이 되면
--                           다음 라운드로(또는 totalRounds 초과 시 completed).
--
-- 컨벤션은 submit_draft_pick_v2/claim_team을 따른다: p_user_id uuid DEFAULT NULL +
-- COALESCE(p_user_id, auth.uid()), SECURITY DEFINER, SET search_path, FOR UPDATE 행 락,
-- RAISE EXCEPTION '에러코드' 스타일.
--
-- 기존 DraftRoom.ts/submit_draft_pick_v2(방 전체 공유 풀·턴제)와 달리 팀별로 완전히
-- 독립적으로 진행되므로 room 전체 락이 필요 없고, personal_draft_progress 행 단위
-- FOR UPDATE로 충분하다(같은 팀의 동시 중복 제출만 막으면 됨).
-- ============================================================

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
    v_user_id    uuid := COALESCE(p_user_id, auth.uid());
    v_team       league_teams%ROWTYPE;
    v_progress   personal_draft_progress%ROWTYPE;
    v_format     jsonb;
    v_round_cfg  jsonb;
    v_pool_size  integer;
    v_eligible   jsonb;
    v_pack       jsonb;
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

    SELECT * INTO v_progress
    FROM personal_draft_progress
    WHERE room_id = p_room_id AND team_id = p_team_id
    FOR UPDATE;

    IF v_progress.room_id IS NULL THEN
        RAISE EXCEPTION 'draft_not_started';
    END IF;

    IF v_progress.status = 'completed' THEN
        RETURN jsonb_build_object(
            'status', 'completed',
            'currentRound', v_progress.current_round,
            'picksRemaining', 0,
            'offeredPool', NULL
        );
    END IF;

    -- 이미 생성된 팩이 있으면 그대로 반환 — 재접속/새로고침해도 같은 팩이 유지된다.
    IF v_progress.offered_pool IS NOT NULL THEN
        RETURN jsonb_build_object(
            'status', v_progress.status,
            'currentRound', v_progress.current_round,
            'picksRemaining', v_progress.picks_remaining,
            'offeredPool', v_progress.offered_pool
        );
    END IF;

    SELECT l.personal_draft_format INTO v_format
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = p_room_id;

    IF v_format IS NULL THEN
        RAISE EXCEPTION 'not_personal_draft_league';
    END IF;

    v_round_cfg := v_format->'rounds'->(v_progress.current_round - 1);
    IF v_round_cfg IS NULL THEN
        RAISE EXCEPTION 'invalid_round_config: round=%', v_progress.current_round;
    END IF;

    v_pool_size := (v_round_cfg->>'poolSize')::integer;
    v_eligible  := v_round_cfg->'eligiblePlayerIds';

    SELECT COALESCE(jsonb_agg(v), '[]'::jsonb) INTO v_pack
    FROM (
        SELECT value AS v
        FROM jsonb_array_elements_text(v_eligible)
        ORDER BY random()
        LIMIT v_pool_size
    ) s;

    UPDATE personal_draft_progress
    SET offered_pool = v_pack
    WHERE room_id = p_room_id AND team_id = p_team_id;

    RETURN jsonb_build_object(
        'status', v_progress.status,
        'currentRound', v_progress.current_round,
        'picksRemaining', v_progress.picks_remaining,
        'offeredPool', v_pack
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_personal_draft(
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
    v_user_id  uuid := COALESCE(p_user_id, auth.uid());
    v_team     league_teams%ROWTYPE;
    v_format   jsonb;
    v_round1   jsonb;
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

    v_round1 := v_format->'rounds'->0;
    IF v_round1 IS NULL THEN
        RAISE EXCEPTION 'invalid_format: no rounds';
    END IF;

    -- 이미 시작돼 있으면 그대로 둔다(멱등) — 재참가/재클릭 대비.
    INSERT INTO personal_draft_progress (room_id, team_id, current_round, picks_remaining, status)
    VALUES (p_room_id, p_team_id, 1, (v_round1->>'picks')::integer, 'in_progress')
    ON CONFLICT (room_id, team_id) DO NOTHING;

    RETURN public.get_or_generate_round_pack(p_room_id, p_team_id, v_user_id);
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
    v_user_id        uuid := COALESCE(p_user_id, auth.uid());
    v_team           league_teams%ROWTYPE;
    v_progress       personal_draft_progress%ROWTYPE;
    v_format         jsonb;
    v_total_rounds   integer;
    v_next_round_cfg jsonb;
    v_instance_id    uuid;
    v_remaining_pool jsonb;
    v_new_round      integer;
    v_new_picks_rem  integer;
    v_new_status     text;
    v_new_offered    jsonb;
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

    SELECT * INTO v_progress
    FROM personal_draft_progress
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
    IF NOT (v_progress.offered_pool ? p_source_player_id::text) THEN
        RAISE EXCEPTION 'player_not_in_pack: %', p_source_player_id;
    END IF;

    SELECT l.personal_draft_format INTO v_format
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = p_room_id;
    IF v_format IS NULL THEN
        RAISE EXCEPTION 'not_personal_draft_league';
    END IF;
    v_total_rounds := (v_format->>'totalRounds')::integer;

    -- 인스턴스 발급 — 이 팀 전용 카드. meta_players는 건드리지 않고 참조만 한다.
    INSERT INTO room_player_instances (room_id, team_id, source_player_id, drafted_round)
    VALUES (p_room_id, p_team_id, p_source_player_id, v_progress.current_round)
    RETURNING instance_id INTO v_instance_id;

    -- 로스터엔 meta_players.id가 아니라 instance_id를 넣는다 — room_player_state/
    -- 실시간 리더보드가 팀별로 자동 분리되는 근거(설계 문서 "핵심 설계" 참고).
    UPDATE league_teams
    SET roster = COALESCE(roster, '[]'::jsonb) || to_jsonb(v_instance_id::text)
    WHERE id = p_team_id;

    -- 이번 라운드 팩에서 방금 뽑은 카드 제거(같은 라운드 내 중복 픽 방지).
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO v_remaining_pool
    FROM jsonb_array_elements_text(v_progress.offered_pool) elem
    WHERE elem <> p_source_player_id::text;

    v_new_picks_rem := v_progress.picks_remaining - 1;

    IF v_new_picks_rem > 0 THEN
        -- 같은 라운드에서 더 뽑아야 함 — 팩은 유지(남은 카드에서 계속 선택).
        v_new_round   := v_progress.current_round;
        v_new_status  := 'in_progress';
        v_new_offered := v_remaining_pool;
    ELSE
        -- 이번 라운드 완료 — 다음 라운드로.
        v_new_round := v_progress.current_round + 1;
        IF v_new_round > v_total_rounds THEN
            v_new_status    := 'completed';
            v_new_round     := v_progress.current_round; -- 마지막 라운드 번호 유지(표시용)
            v_new_picks_rem := 0;
            v_new_offered   := NULL;
        ELSE
            v_next_round_cfg := v_format->'rounds'->(v_new_round - 1);
            IF v_next_round_cfg IS NULL THEN
                RAISE EXCEPTION 'invalid_round_config: round=%', v_new_round;
            END IF;
            v_new_status    := 'in_progress';
            v_new_picks_rem := (v_next_round_cfg->>'picks')::integer;
            v_new_offered   := NULL; -- 다음 get_or_generate_round_pack 호출 시 생성
        END IF;
    END IF;

    UPDATE personal_draft_progress
    SET current_round   = v_new_round,
        picks_remaining = v_new_picks_rem,
        status          = v_new_status,
        offered_pool    = v_new_offered
    WHERE room_id = p_room_id AND team_id = p_team_id;

    RETURN jsonb_build_object(
        'draftedInstanceId', v_instance_id,
        'draftedSourcePlayerId', p_source_player_id,
        'status', v_new_status,
        'currentRound', v_new_round,
        'picksRemaining', v_new_picks_rem,
        'offeredPool', v_new_offered
    );
END;
$function$;

-- [적용 대기]
