-- ============================================================================
-- 개인 팩 드래프트 "시즌 카드" 콘텐츠 테이블 (안 A)
-- 사용자 요청: "한 명의 선수에게서 여러 시즌 카드를 뽑아낼 수 있어야 한다"
-- (예: A선수의 2000-01 시즌 카드와 2003-04 시즌 카드가 서로 다른 능력치를 가짐).
--
-- meta_players는 절대 건드리지 않는다(하드 제약) — 일반 리그/기존 공유풀 드래프트는
-- 지금처럼 meta_players를 그대로 쓴다. 카드는 완전히 별도 테이블에, 카드 1장 = row 1개로
-- 저장한다(JSONB 오버라이드 delta 방식이 아니라 meta_players와 동일한 shape의 독립 row —
-- 그래야 mapRawPlayerToRuntimePlayer 등 기존 하이드레이션 코드를 그대로 재사용할 수 있다).
--
-- source_player_id는 "이 카드가 어느 실제 선수의 변형인지"만 가리킨다(카드 자체의 능력치
-- 조회에는 쓰이지 않음 — 카드 row 자신의 base_attributes가 이미 완전한 데이터). 나중에
-- 개인 팩 드래프트가 카드를 소비하게 될 때(room_player_instances.source_player_id를
-- meta_player_cards.id로 재지정하는 안 A), "같은 실제 선수의 카드 중복 픽 방지"는 이
-- source_player_id로 그룹핑해서 판정한다 — 아직 그 배선은 하지 않음(이번 마이그레이션은
-- 콘텐츠 저장소 + 어드민 작성 도구만).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.meta_player_cards (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- "실제 선수" 식별자 — meta_players 삭제 시 그 선수의 카드도 함께 정리.
    source_player_id  uuid        NOT NULL REFERENCES public.meta_players(id) ON DELETE CASCADE,
    -- 시즌 라벨. meta_players.career_history의 season 문자열(예: '2000-01')을 그대로 쓰는 걸
    -- 권장하지만 자유 텍스트도 허용(career_history에 없는 시즌/가상 구간도 만들 수 있게).
    season            text        NOT NULL,
    -- 카드 자체 데이터 — meta_players와 동일한 shape(카드 1장 = 완전히 독립된 row).
    name              text        NOT NULL,
    position          text        NOT NULL,
    height            numeric,
    weight            numeric,
    base_team_id      text,
    base_attributes   jsonb       NOT NULL,
    tendencies        jsonb,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    -- 한 선수당 같은 시즌 라벨의 카드는 하나만(실수로 중복 생성 방지). 필요해지면 나중에 완화.
    UNIQUE (source_player_id, season)
);

CREATE INDEX IF NOT EXISTS idx_meta_player_cards_source ON public.meta_player_cards(source_player_id);

ALTER TABLE public.meta_player_cards ENABLE ROW LEVEL SECURITY;

-- meta_players와 동일한 RLS 패턴: 읽기는 전체 공개, 쓰기는 고정 어드민 계정만
-- (project_admin_account.md — admin@mail.com, 별도 권한 시스템 구현 전까지 고정).
CREATE POLICY "Enable read access for all users" ON public.meta_player_cards
    FOR SELECT USING (true);

CREATE POLICY "admin_insert_meta_player_cards" ON public.meta_player_cards
    FOR INSERT WITH CHECK (auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid);

CREATE POLICY "admin_update_meta_player_cards" ON public.meta_player_cards
    FOR UPDATE
    USING (auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid)
    WITH CHECK (auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid);

CREATE POLICY "admin_delete_meta_player_cards" ON public.meta_player_cards
    FOR DELETE USING (auth.uid() = 'd2f6a469-9182-4dac-a098-278e6e758c79'::uuid);

-- [적용] 2026-09-18 Supabase MCP로 반영
