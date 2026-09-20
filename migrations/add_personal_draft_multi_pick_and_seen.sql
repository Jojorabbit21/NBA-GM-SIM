-- ============================================================================
-- 개인 팩 드래프트: (1) 다중 픽 라운드 동시 지명 RPC  (2) 한 번 노출된 카드 재등장 방지
-- 사용자 요청 (2026-09-20): "1라운드에서 2개 이상의 카드를 뽑게하면 … 1개 지명 후 1개 지명하는 식으로
-- 되는데, 이것을 동시지명으로 바꿔줘. 그리고 한번 라운드에 등장한 카드는 중복으로 등장하지 않게 해줘."
--
-- (1) submit_personal_draft_picks(room, team, card_ids[]): 현재 팩에서 picks_remaining 장을 한 번에 지명.
--     각 카드가 팩 안에 있는지, 서로/이미 지명한 카드와 같은 실제 선수가 아닌지 검사한 뒤
--     personal_draft_apply_pick 을 순서대로 적용(마지막 픽에서 라운드 진행 + 다음 팩 생성).
--     기존 단일 픽 RPC(submit_personal_draft_pick)는 그대로 둔다.
-- (2) personal_draft_progress.seen_pool: 이 팀에게 지금까지 노출된 카드 id 누적. 샘플러가 노출 이력을
--     제외하고, 한 팩 안에서는 같은 실제 선수의 카드가 두 장 들어가지 않게 한다(동시 지명 시 규칙 위반 방지).
--     후보가 픽 수에 못 미치면 노출 이력 제외 → 지명 제외만 → 제외 없음 순으로 완화(WARNING).
--     팩 생성은 personal_draft_new_pack() 한 곳으로 모아 seen_pool 갱신을 빠뜨리지 않게 한다.
-- ============================================================================

ALTER TABLE public.personal_draft_progress
    ADD COLUMN IF NOT EXISTS seen_pool jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── 1회 샘플링 시도 (p_mode 0: 노출+지명 제외 / 1: 지명 제외만 / 2: 제외 없음) ──
CREATE OR REPLACE FUNCTION public.personal_draft_sample_try(
    p_format    jsonb,
    p_round_cfg jsonb,
    p_room_id   uuid,
    p_team_id   uuid,
    p_seen      jsonb,
    p_mode      integer
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    v_pool_size integer := (p_round_cfg->>'poolSize')::integer;
    v_weights   jsonb   := p_format->'collectionWeights';
    v_by_col    jsonb   := p_round_cfg->'eligibleByCollection';
    v_pack      jsonb   := '[]'::jsonb;
    v_players   text[]  := '{}';
    v_col       text;
    v_card      text;
    v_player    text;
    v_i         integer;
BEGIN
    IF v_weights IS NOT NULL AND jsonb_typeof(v_weights) = 'object' AND v_by_col IS NOT NULL THEN
        -- 가중치 모드: 슬롯마다 컬렉션(가중치 비례) → 그 컬렉션의 남은 카드 1장
        FOR v_i IN 1..v_pool_size LOOP
            SELECT c.col INTO v_col
            FROM (
                SELECT k.key AS col, (k.value)::numeric AS w,
                       (SELECT count(*)
                          FROM jsonb_array_elements_text(COALESCE(v_by_col->k.key, '[]'::jsonb)) e
                          LEFT JOIN meta_player_cards cand ON cand.id::text = e.value
                         WHERE NOT (v_pack ? e.value)
                           AND NOT (COALESCE(cand.source_player_id::text, e.value) = ANY(v_players))
                           AND (p_mode >= 1 OR NOT (p_seen ? e.value))
                           AND (p_mode >= 2 OR NOT personal_draft_card_excluded(p_room_id, p_team_id, e.value))) AS remaining
                FROM jsonb_each_text(v_weights) k
                WHERE (k.value)::numeric > 0
            ) c
            WHERE c.remaining > 0
            ORDER BY -ln(random()) / c.w
            LIMIT 1;
            EXIT WHEN v_col IS NULL;

            SELECT e.value, COALESCE(cand.source_player_id::text, e.value) INTO v_card, v_player
            FROM jsonb_array_elements_text(v_by_col->v_col) e
            LEFT JOIN meta_player_cards cand ON cand.id::text = e.value
            WHERE NOT (v_pack ? e.value)
              AND NOT (COALESCE(cand.source_player_id::text, e.value) = ANY(v_players))
              AND (p_mode >= 1 OR NOT (p_seen ? e.value))
              AND (p_mode >= 2 OR NOT personal_draft_card_excluded(p_room_id, p_team_id, e.value))
            ORDER BY random()
            LIMIT 1;
            EXIT WHEN v_card IS NULL;

            v_pack    := v_pack || to_jsonb(v_card);
            v_players := v_players || v_player;
        END LOOP;
    ELSE
        -- 균등 모드: 합집합에서 무작위, 같은 실제 선수는 1장만
        SELECT COALESCE(jsonb_agg(v), '[]'::jsonb) INTO v_pack
        FROM (
            SELECT v FROM (
                SELECT DISTINCT ON (pk) v, pk, r
                FROM (
                    SELECT e.value AS v, COALESCE(cand.source_player_id::text, e.value) AS pk, random() AS r
                    FROM jsonb_array_elements_text(p_round_cfg->'eligiblePlayerIds') e
                    LEFT JOIN meta_player_cards cand ON cand.id::text = e.value
                    WHERE (p_mode >= 1 OR NOT (p_seen ? e.value))
                      AND (p_mode >= 2 OR NOT personal_draft_card_excluded(p_room_id, p_team_id, e.value))
                ) x
                ORDER BY pk, r
            ) y
            ORDER BY r
            LIMIT v_pool_size
        ) z;
    END IF;
    RETURN v_pack;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.personal_draft_sample_try(jsonb, jsonb, uuid, uuid, jsonb, integer) FROM PUBLIC, anon, authenticated;

-- ── 샘플러: 노출 이력 제외 → 부족하면 단계적 완화 ──
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
    RETURN v_pack;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.personal_draft_sample_pack(jsonb, integer, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 팩 생성 + 노출 이력 기록 (progress 행 존재 전제) ──
CREATE OR REPLACE FUNCTION public.personal_draft_new_pack(
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
    v_pack jsonb;
BEGIN
    v_pack := personal_draft_sample_pack(p_format, p_round, p_room_id, p_team_id);
    UPDATE personal_draft_progress
    SET seen_pool = COALESCE(seen_pool, '[]'::jsonb) || v_pack
    WHERE room_id = p_room_id AND team_id = p_team_id;
    RETURN v_pack;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.personal_draft_new_pack(jsonb, integer, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 픽 적용: 다음 팩 생성을 new_pack 으로 (본문은 fix_personal_draft_pack_exclude_drafted.sql 과 동일) ──
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
        v_new_started := v_progress.pack_started_at;
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
            v_new_offered   := personal_draft_new_pack(p_format, v_new_round, p_room_id, p_team_id);
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
REVOKE EXECUTE ON FUNCTION public.personal_draft_apply_pick(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- ── 팩 조회/생성: NULL 팩 생성을 new_pack 으로 ──
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
    v_pack      jsonb;
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
        v_pack := personal_draft_new_pack(v_format, v_progress.current_round, p_room_id, p_team_id);
        UPDATE personal_draft_progress
        SET offered_pool = v_pack,
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

-- ── 강제 완료: 진행 행을 팩 없이 만든 뒤 루프에서 new_pack 으로 생성 ──
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

-- ── 동시 지명 RPC ──
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
        -- 이미 지명한 카드/같은 실제 선수(직전 루프에서 지명한 것 포함)
        IF personal_draft_card_excluded(p_room_id, p_team_id, v_id::text) THEN
            RAISE EXCEPTION 'duplicate_player: %', v_id;
        END IF;
        v_result := personal_draft_apply_pick(p_room_id, p_team_id, v_id, v_format);
    END LOOP;

    RETURN v_result || jsonb_build_object('expired', false, 'autoPicked', 0, 'draftedCardIds', to_jsonb(p_card_ids));
END;
$function$;

-- 롤백: seen_pool 컬럼 DROP, sample_try/new_pack/submit_personal_draft_picks DROP,
--       sample_pack/apply_pick/get_or_generate/force_complete 을 add_personal_draft_collection_weights.sql /
--       wire_personal_draft_cards.sql 본문으로 재정의.

-- [적용] 2026-09-20 Supabase MCP로 반영
