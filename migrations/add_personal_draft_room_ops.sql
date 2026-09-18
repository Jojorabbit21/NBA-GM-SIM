-- ============================================================================
-- 토너먼트 개인 팩 드래프트 Phase 7 — 룸 단위 운영 함수 2종
-- docs/plan/tournament-personal-pack-draft-plan.md
--
-- 1) personal_draft_force_complete_room(p_room_id)   [service_role 전용]
--    토너먼트 시작 시각(tournament_start_at)에 서버 스케줄러가 호출. 룸의 모든 league_teams에
--    대해 진행 행이 없으면 만들고(미참가/AI 팀 포함), 남은 라운드를 전부 "팩 내 최고 OVR"
--    자동 지명으로 채워 status='completed'로 만든다. 타이머 만료 자동 지명과 같은 규칙
--    (personal_draft_apply_pick 재사용)이라 로스터 크기/인스턴스 발급 방식이 동일하다.
--
-- 2) personal_draft_cleanup_room(p_room_id)          [service_role 또는 리그 어드민]
--    토너먼트 아카이빙 완료 직후(simRunner) / 어드민 리셋(resetTournament) 시 룸의
--    room_player_state(인스턴스 id 행) → room_player_instances → personal_draft_progress 삭제.
--    아카이브 테이블(tournament_game_player_stats)은 이름/포지션을 비정규화 저장하므로 영향 없음.
--    개인 드래프트가 아닌 룸에서 호출하면 아무것도 지우지 않고 0을 돌려준다(무해).
-- ============================================================================

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
        -- 진행 행이 없는 팀(미참가/AI/참가만 하고 시작 안 한 팀): 1라운드 팩까지 만들어 둔다.
        INSERT INTO personal_draft_progress
            (room_id, team_id, current_round, picks_remaining, status, offered_pool, pack_started_at)
        VALUES
            (p_room_id, v_team.id, 1, (v_round1->>'picks')::integer, 'in_progress',
             personal_draft_sample_pack(v_format, 1), now())
        ON CONFLICT (room_id, team_id) DO NOTHING;

        v_guard := 0;
        LOOP
            SELECT * INTO v_progress FROM personal_draft_progress
            WHERE room_id = p_room_id AND team_id = v_team.id
            FOR UPDATE;
            EXIT WHEN v_progress.status = 'completed';

            -- 방어: in_progress인데 팩이 비어 있으면(정상 경로에선 발생하지 않음) 현재 라운드 팩을 새로 뽑는다.
            IF v_progress.offered_pool IS NULL OR jsonb_array_length(v_progress.offered_pool) = 0 THEN
                UPDATE personal_draft_progress
                SET offered_pool = personal_draft_sample_pack(v_format, v_progress.current_round),
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

-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.personal_draft_cleanup_room(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_admin      uuid;
    v_caller     uuid    := auth.uid();
    v_is_service boolean := (auth.jwt()->>'role') = 'service_role';
    v_states     integer := 0;
    v_instances  integer := 0;
    v_progress   integer := 0;
BEGIN
    SELECT l.admin_user_id INTO v_admin
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = p_room_id;
    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'room_not_found';
    END IF;
    -- 파괴적 작업이라 다른 RPC와 달리 p_user_id 우회 인자를 두지 않는다 — 서비스 키 또는 실제 세션의 어드민만.
    IF NOT v_is_service AND (v_caller IS NULL OR v_caller <> v_admin) THEN
        RAISE EXCEPTION 'not_league_admin';
    END IF;

    WITH del AS (
        DELETE FROM room_player_state s
        WHERE s.room_id = p_room_id
          AND EXISTS (
              SELECT 1 FROM room_player_instances i
              WHERE i.room_id = p_room_id AND i.instance_id::text = s.player_id
          )
        RETURNING 1
    ) SELECT count(*) INTO v_states FROM del;

    WITH del AS (
        DELETE FROM room_player_instances WHERE room_id = p_room_id RETURNING 1
    ) SELECT count(*) INTO v_instances FROM del;

    WITH del AS (
        DELETE FROM personal_draft_progress WHERE room_id = p_room_id RETURNING 1
    ) SELECT count(*) INTO v_progress FROM del;

    RETURN jsonb_build_object('playerStates', v_states, 'instances', v_instances, 'progress', v_progress);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.personal_draft_cleanup_room(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.personal_draft_cleanup_room(uuid) TO authenticated;

-- [적용] 2026-09-18 Supabase MCP로 반영
