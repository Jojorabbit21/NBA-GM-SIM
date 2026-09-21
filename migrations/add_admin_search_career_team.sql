-- ============================================================================
-- 어드민 선수 검색: 커리어 기록 내 소속팀 필터 + 커리어 팀 코드 목록 RPC
-- 사용자 요청 (2026-09-21): "현재 소속팀 검색 필터 외에도 커리어 기록 내 소속팀을 검색하는 기능도 추가해줘."
--
-- career_history[].team 은 basketball-reference 식 3글자 코드(LAL, GSW, SEA, NJN …)이며 '2TM'(시즌 중
-- 2팀 합산 행), 'Did not play - …', 'Non' 같은 비팀 값도 섞여 있다. 목록 RPC는 3글자 대문자 코드만 돌려주고
-- '2TM'/'3TM'은 제외한다. 검색 RPC는 코드 정확 일치. 커리어 연도 범위와 함께 주면 **같은 시즌 행**이 둘 다 만족해야 한다
-- (그 팀에서 그 연도에 뛴 선수).
-- 기존 7-인자 admin_search_meta_players 는 시그니처가 바뀌므로 DROP 후 재생성(오버로드 잔존 방지).
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_search_meta_players(text, text, text, integer, integer, jsonb, integer);

CREATE OR REPLACE FUNCTION public.admin_search_meta_players(
    p_query        text    DEFAULT NULL,
    p_team         text    DEFAULT NULL,
    p_position     text    DEFAULT NULL,
    p_career_from  integer DEFAULT NULL,
    p_career_to    integer DEFAULT NULL,
    p_attr_filters jsonb   DEFAULT '[]'::jsonb,
    p_limit        integer DEFAULT 300,
    p_career_team  text    DEFAULT NULL
)
RETURNS TABLE (
    id              uuid,
    name            text,
    "position"      text,
    base_team_id    text,
    base_attributes jsonb,
    tendencies      jsonb,
    include_alltime boolean,
    in_multi_pool   boolean,
    draft_year      numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
    SELECT m.id::uuid, m.name::text, m.position::text, m.base_team_id::text,
           m.base_attributes::jsonb, m.tendencies::jsonb,
           m.include_alltime::boolean, m.in_multi_pool::boolean, m.draft_year::numeric
    FROM meta_players m
    WHERE (p_query IS NULL OR btrim(p_query) = '' OR m.name ILIKE '%' || btrim(p_query) || '%')
      AND (p_team IS NULL OR p_team = ''
           OR (p_team = '__none__' AND m.base_team_id IS NULL)
           OR m.base_team_id = p_team)
      AND (p_position IS NULL OR p_position = '' OR m.position = p_position)
      AND (
            (p_career_from IS NULL AND p_career_to IS NULL AND (p_career_team IS NULL OR p_career_team = ''))
         OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(COALESCE(m.career_history, '[]'::jsonb)) r
                WHERE (
                        (p_career_from IS NULL AND p_career_to IS NULL)
                     OR ((r->>'season') ~ '^\d{4}'
                         AND substring(r->>'season' from 1 for 4)::integer BETWEEN COALESCE(p_career_from, 0) AND COALESCE(p_career_to, 9999))
                      )
                  AND (p_career_team IS NULL OR p_career_team = '' OR upper(r->>'team') = upper(p_career_team))
            )
      )
      AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(p_attr_filters, '[]'::jsonb)) f
            WHERE (f->>'key') IS NOT NULL
              AND (
                    (m.base_attributes->>(f->>'key')) IS NULL
                 OR (m.base_attributes->>(f->>'key')) !~ '^-?\d+(\.\d+)?$'
                 OR ((f->>'min') IS NOT NULL AND (m.base_attributes->>(f->>'key'))::numeric < (f->>'min')::numeric)
                 OR ((f->>'max') IS NOT NULL AND (m.base_attributes->>(f->>'key'))::numeric > (f->>'max')::numeric)
              )
      )
    ORDER BY m.name
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 300), 1000));
$function$;
GRANT EXECUTE ON FUNCTION public.admin_search_meta_players(text, text, text, integer, integer, jsonb, integer, text) TO authenticated;

-- 커리어 팀 코드 목록(코드, 선수 수) — 드롭다운용. 3글자 대문자 코드만, 합산 행 제외.
CREATE OR REPLACE FUNCTION public.admin_career_team_codes()
RETURNS TABLE (code text, players integer)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
    SELECT (r->>'team')::text AS code, count(DISTINCT m.id)::integer AS players
    FROM meta_players m, jsonb_array_elements(COALESCE(m.career_history, '[]'::jsonb)) r
    WHERE (r->>'team') ~ '^[A-Z]{3}$' AND (r->>'team') NOT IN ('2TM', '3TM')
    GROUP BY 1
    ORDER BY 1;
$function$;
GRANT EXECUTE ON FUNCTION public.admin_career_team_codes() TO authenticated;

-- 롤백: 두 함수 DROP 후 add_admin_search_meta_players.sql 의 7-인자 버전 재생성.

-- [적용] 2026-09-21 Supabase MCP로 반영
