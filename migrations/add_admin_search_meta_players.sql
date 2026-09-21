-- ============================================================================
-- 어드민 카드 관리 탭 선수 검색 RPC — 이름 외에 소속 팀 / 포지션 / 커리어 연도 범위 / 능력치 범위 필터
-- 사용자 요청 (2026-09-21): "카드 관리 탭에서 이름 검색 외에도 옵션들을 제공해줘. 소속 팀, 포지션 필터 …
-- 선수의 커리어년도 범위 … 능력치 필터도 추가해줘."
--
-- 커리어 연도: meta_players.career_history[].season('2005-06' 등)의 앞 4자리가 [from, to]에 하나라도 걸리면 매치.
-- 능력치: p_attr_filters = [{ "key": "threeTop", "min": 80, "max": 99 }, ...] — base_attributes->>key 를 numeric 비교(AND).
-- 팀: base_team_id 일치, '__none__' 이면 소속 없음(NULL). SECURITY INVOKER — meta_players는 공개 읽기 RLS.
-- 반환 컬럼은 클라이언트 MetaPlayerRow(services/admin/playerAdminService.ts)와 동일(career_history 등 무거운 컬럼 제외).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_search_meta_players(
    p_query        text    DEFAULT NULL,
    p_team         text    DEFAULT NULL,
    p_position     text    DEFAULT NULL,
    p_career_from  integer DEFAULT NULL,
    p_career_to    integer DEFAULT NULL,
    p_attr_filters jsonb   DEFAULT '[]'::jsonb,
    p_limit        integer DEFAULT 300
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
            (p_career_from IS NULL AND p_career_to IS NULL)
         OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(COALESCE(m.career_history, '[]'::jsonb)) r
                WHERE (r->>'season') ~ '^\d{4}'
                  AND substring(r->>'season' from 1 for 4)::integer BETWEEN COALESCE(p_career_from, 0) AND COALESCE(p_career_to, 9999)
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

GRANT EXECUTE ON FUNCTION public.admin_search_meta_players(text, text, text, integer, integer, jsonb, integer) TO authenticated;

-- 롤백: DROP FUNCTION public.admin_search_meta_players(text, text, text, integer, integer, jsonb, integer);

-- [적용] 2026-09-21 Supabase MCP로 반영
