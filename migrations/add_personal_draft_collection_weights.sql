-- ============================================================================
-- 개인 팩 드래프트: 카드 컬렉션 등장 비율(가중치) 샘플링
-- 사용자 요청 "토너먼트를 만들때, 어떤 카드 컬렉션이 등장할지와 카드 컬렉션이 얼마만큼의 비율로
-- 나와야할지 설정할 수 있는 옵션" (2026-09-20)
--
-- 포맷(leagues.personal_draft_format)에 아래가 추가된다(services/multi/personalDraftFormat.ts):
--   format.collectionWeights        = { "<collectionId>": <weight>, ... }   (0보다 큰 것만 등장)
--   rounds[].eligibleByCollection   = { "<collectionId>": ["<cardId>", ...], ... }  (라운드 OVR 범위 안 카드)
--   rounds[].eligiblePlayerIds      = 위 목록의 합집합(중복 제거) — 폴백/하위호환
--
-- 샘플러: 팩의 각 슬롯마다 "아직 뽑을 카드가 남은 컬렉션" 중에서 가중치 비례로 컬렉션을 고르고
-- (Efraimidis–Spirakis: -ln(random())/w 최소값), 그 컬렉션의 남은 카드 중 무작위 1장을 넣는다.
-- 같은 카드가 여러 컬렉션에 속해도 팩엔 한 번만 들어간다. 이미 지명한 카드/같은 실제 선수의 카드는
-- 제외(personal_draft_card_excluded). collectionWeights/eligibleByCollection이 없는 옛 포맷은
-- 기존 균등 샘플링 경로를 그대로 탄다.
-- ============================================================================

-- ── 제외 판정: 이 팀이 이미 지명한 카드 자체 또는 같은 실제 선수의 다른 시즌 카드 ──
CREATE OR REPLACE FUNCTION public.personal_draft_card_excluded(
    p_room_id uuid,
    p_team_id uuid,
    p_card_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM room_player_instances i
        LEFT JOIN meta_player_cards owned ON owned.id = i.source_player_id
        LEFT JOIN meta_player_cards cand  ON cand.id::text = p_card_id
        WHERE i.room_id = p_room_id
          AND i.team_id = p_team_id
          AND (
                i.source_player_id::text = p_card_id
             OR (owned.source_player_id IS NOT NULL AND owned.source_player_id = cand.source_player_id)
          )
    );
$function$;
REVOKE EXECUTE ON FUNCTION public.personal_draft_card_excluded(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- ── 샘플러 ──────────────────────────────────────────────────────────────────
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
    v_pack      jsonb := '[]'::jsonb;
    v_count     integer := 0;
    v_weights   jsonb;
    v_by_col    jsonb;
    v_col       text;
    v_card      text;
    v_i         integer;
BEGIN
    v_round_cfg := p_format->'rounds'->(p_round - 1);
    IF v_round_cfg IS NULL THEN
        RAISE EXCEPTION 'invalid_round_config: round=%', p_round;
    END IF;
    v_pool_size := (v_round_cfg->>'poolSize')::integer;
    v_picks     := COALESCE((v_round_cfg->>'picks')::integer, 1);
    v_weights   := p_format->'collectionWeights';
    v_by_col    := v_round_cfg->'eligibleByCollection';

    IF v_weights IS NOT NULL AND jsonb_typeof(v_weights) = 'object' AND v_by_col IS NOT NULL THEN
        -- 가중치 샘플링: 슬롯마다 컬렉션(가중치 비례) → 그 컬렉션의 남은 카드 1장
        FOR v_i IN 1..v_pool_size LOOP
            SELECT c.col INTO v_col
            FROM (
                SELECT k.key AS col, (k.value)::numeric AS w,
                       (SELECT count(*)
                          FROM jsonb_array_elements_text(COALESCE(v_by_col->k.key, '[]'::jsonb)) e
                         WHERE NOT (v_pack ? e.value)
                           AND NOT personal_draft_card_excluded(p_room_id, p_team_id, e.value)) AS remaining
                FROM jsonb_each_text(v_weights) k
                WHERE (k.value)::numeric > 0
            ) c
            WHERE c.remaining > 0
            ORDER BY -ln(random()) / c.w
            LIMIT 1;
            EXIT WHEN v_col IS NULL;

            SELECT e.value INTO v_card
            FROM jsonb_array_elements_text(v_by_col->v_col) e
            WHERE NOT (v_pack ? e.value)
              AND NOT personal_draft_card_excluded(p_room_id, p_team_id, e.value)
            ORDER BY random()
            LIMIT 1;
            EXIT WHEN v_card IS NULL;

            v_pack  := v_pack || to_jsonb(v_card);
            v_count := v_count + 1;
        END LOOP;
    ELSE
        -- 옛 포맷/가중치 없음: 합집합에서 균등 샘플링(제외 규칙 동일)
        SELECT COALESCE(jsonb_agg(v), '[]'::jsonb), count(*) INTO v_pack, v_count
        FROM (
            SELECT e.value AS v
            FROM jsonb_array_elements_text(v_round_cfg->'eligiblePlayerIds') e
            WHERE NOT personal_draft_card_excluded(p_room_id, p_team_id, e.value)
            ORDER BY random()
            LIMIT v_pool_size
        ) s;
    END IF;

    -- 폴백: 제외하고 나니 이번 라운드 픽 수도 못 채우면 드래프트가 멈추므로 제외 없이 합집합에서 추출
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

-- 롤백: wire_personal_draft_cards.sql 의 personal_draft_sample_pack 본문으로 재정의, personal_draft_card_excluded DROP.

-- [적용] 2026-09-20 Supabase MCP로 반영
