-- ============================================================================
-- 카드 전용 팀별 컬러(meta_card_team_colors)
-- 사용자 요청 "카드 컬렉션의 팀별 컬러를 선택할 수 있게 개조해줘."
--
-- 팀 컬러 원본(data/teamData.ts TEAM_COLORS)은 코드 상수라 어드민이 못 바꾼다. 카드 시스템
-- (카드 컬렉션 배경 'team' 타입, 이미지 배경 아래 폴백, 개인 팩 드래프트 카드)에 한해서만
-- 팀별 그라디언트를 DB로 덮어쓸 수 있게 한다. 행이 없는 팀은 지금처럼 TEAM_COLORS 폴백.
-- 리그/플레이오프 등 카드 밖에서 쓰는 팀 컬러는 이 테이블을 읽지 않는다(범위 밖).
--
-- 컬렉션 단위가 아니라 전역(카드 시스템 공용) — 같은 팀은 어느 컬렉션에서든 같은 컬러.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.meta_card_team_colors (
    team_id        text PRIMARY KEY,                  -- TEAM_DATA 키(소문자, 예: 'gs', 'lam')
    gradient_from  text NOT NULL,                     -- '#RRGGBB'
    gradient_to    text NOT NULL,
    gradient_angle integer NOT NULL DEFAULT 165 CHECK (gradient_angle BETWEEN 0 AND 360),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_card_team_colors ENABLE ROW LEVEL SECURITY;

-- meta_player_cards와 동일한 RLS 패턴: 읽기는 전체 공개(카드는 모든 참가자가 봄),
-- 쓰기는 고정 어드민 계정만(project_admin_account.md).
DROP POLICY IF EXISTS "Enable read access for all users" ON public.meta_card_team_colors;
CREATE POLICY "Enable read access for all users" ON public.meta_card_team_colors
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_insert_meta_card_team_colors" ON public.meta_card_team_colors;
CREATE POLICY "admin_insert_meta_card_team_colors" ON public.meta_card_team_colors
    FOR INSERT WITH CHECK (auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid);

DROP POLICY IF EXISTS "admin_update_meta_card_team_colors" ON public.meta_card_team_colors;
CREATE POLICY "admin_update_meta_card_team_colors" ON public.meta_card_team_colors
    FOR UPDATE
    USING (auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid)
    WITH CHECK (auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid);

DROP POLICY IF EXISTS "admin_delete_meta_card_team_colors" ON public.meta_card_team_colors;
CREATE POLICY "admin_delete_meta_card_team_colors" ON public.meta_card_team_colors
    FOR DELETE USING (auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid);

-- 롤백: DROP TABLE public.meta_card_team_colors; (클라이언트는 행이 없으면 TEAM_COLORS 폴백이라 안전)

-- [적용] 2026-09-20 Supabase MCP로 반영
