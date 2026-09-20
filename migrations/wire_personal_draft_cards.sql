-- ============================================================================
-- 개인 팩 드래프트 ↔ 시즌 카드 배선 (안 A) — docs/plan/tournament-personal-pack-draft-plan.md
-- 사용자 요청 "배선 구현해줘" (2026-09-20)
--
-- 1) room_player_instances.source_player_id 가 meta_players.id 가 아니라 meta_player_cards.id 를
--    가리킨다. 기존 FK(meta_players) 제거 → meta_player_cards FK. (적용 시점 인스턴스 행 0개.)
-- 2) 팩 샘플러: "같은 실제 선수"의 다른 시즌 카드는 한 팀이 두 장 가질 수 없다 —
--    이미 지명한 카드들의 meta_player_cards.source_player_id(실제 선수)와 겹치는 후보를 제외.
-- 3) 자동 지명(만료/강제 완료) OVR 정렬: 포맷에 저장된 cardOvrById(클라이언트가 calculateOvr로
--    계산한 값, manual_ovr 반영) → manual_ovr → base_attributes.ovr → 0 순.
-- 포맷(leagues.personal_draft_format)의 rounds[].eligiblePlayerIds 는 이제 meta_player_cards.id 목록이며,
-- 포맷 최상위에 source='cards', cardOvrById={cardId: ovr} 가 추가된다(services/multi/personalDraftFormat.ts).
-- 옛 포맷(meta_players id)으로 저장된 리그는 픽 시점에 FK 위반이 나므로 세션 설정에서 포맷을 다시 저장해야 한다.
-- ============================================================================

ALTER TABLE public.room_player_instances
    DROP CONSTRAINT IF EXISTS room_player_instances_source_player_id_fkey;
ALTER TABLE public.room_player_instances
    ADD CONSTRAINT room_player_instances_source_player_id_fkey
    FOREIGN KEY (source_player_id) REFERENCES public.meta_player_cards(id);

-- ── 샘플러: 같은 실제 선수 중복 방지(카드 기준) ─────────────────────────────
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

    -- 제외 대상: (a) 이 팀이 이미 지명한 카드 자체, (b) 그 카드와 같은 실제 선수의 다른 시즌 카드
    SELECT COALESCE(jsonb_agg(v), '[]'::jsonb), count(*) INTO v_pack, v_count
    FROM (
        SELECT e.value AS v
        FROM jsonb_array_elements_text(v_round_cfg->'eligiblePlayerIds') e
        LEFT JOIN meta_player_cards cand ON cand.id::text = e.value
        WHERE NOT EXISTS (
            SELECT 1
            FROM room_player_instances i
            LEFT JOIN meta_player_cards owned ON owned.id = i.source_player_id
            WHERE i.room_id = p_room_id
              AND i.team_id = p_team_id
              AND (
                    i.source_player_id::text = e.value
                 OR (owned.source_player_id IS NOT NULL AND owned.source_player_id = cand.source_player_id)
              )
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

-- ── 카드 OVR 조회(자동 지명 정렬용): 포맷 cardOvrById → manual_ovr → base_attributes.ovr → 0 ──
CREATE OR REPLACE FUNCTION public.personal_draft_card_ovr(p_format jsonb, p_card_id text)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
    SELECT COALESCE(
        (p_format->'cardOvrById'->>p_card_id)::integer,
        (SELECT COALESCE(c.manual_ovr, (c.base_attributes->>'ovr')::integer)
           FROM meta_player_cards c WHERE c.id::text = p_card_id),
        0
    );
$function$;
REVOKE EXECUTE ON FUNCTION public.personal_draft_card_ovr(jsonb, text) FROM PUBLIC, anon, authenticated;

-- ── 만료 자동 지명 (본문은 add_personal_draft_timer.sql과 동일, OVR 정렬만 카드 기준) ──
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
        ORDER BY personal_draft_card_ovr(p_format, elem) DESC, random()
        LIMIT 1;
        EXIT WHEN v_pick IS NULL;

        PERFORM personal_draft_apply_pick(p_room_id, p_team_id, v_pick, p_format);
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.personal_draft_autopick_expired(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- ── 강제 완료(토너먼트 시작 시 미완료 팀/AI 팀) — OVR 정렬만 카드 기준 ──
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
            ORDER BY personal_draft_card_ovr(v_format, elem) DESC, random()
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

-- 롤백: FK를 meta_players로 되돌리고(인스턴스 행 정리 후) fix_personal_draft_pack_exclude_drafted.sql /
--       add_personal_draft_timer.sql 의 세 함수 본문으로 재정의, personal_draft_card_ovr DROP.

-- [적용] 2026-09-20 Supabase MCP로 반영
