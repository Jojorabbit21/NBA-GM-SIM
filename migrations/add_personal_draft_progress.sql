-- ============================================================
-- personal_draft_progress 테이블: 개인 팩 드래프트 진행 상태 (팀당 1행)
--
-- 배경: 개인 팩 드래프트는 참가자마다 완전히 독립적으로 진행되므로(다른 유저와
-- 동기화 없음), 팀별로 "지금 몇 라운드인지 / 이번 라운드에 몇 장 더 뽑아야
-- 하는지 / 지금 노출된 팩이 무엇인지"를 서버가 들고 있어야 한다.
--
-- offered_pool을 저장해두는 이유: 라운드 화면을 새로고침하거나 재접속해도
-- "다시 조회했더니 팩이 바뀌는" 혼란/부정행위를 막기 위해 — 팩은 서버가 한 번
-- 생성하면(get_or_generate_round_pack) 그 라운드 동안 고정된다.
--
-- picks_remaining으로 라운드당 픽 수(leagues.personal_draft_format.rounds[].picks,
-- 라운드별 가변)를 처리한다: 한 라운드에서 여러 장을 고를 때 offered_pool은 그대로
-- 두고(같은 팩에서 계속 선택) picks_remaining만 감소, 0이 되면 다음 라운드로 진행하며
-- 새 팩을 생성한다. 총 로스터 사이즈는 이 picks 값들의 합으로 자동 결정된다
-- (docs/plan/tournament-personal-pack-draft-plan.md 참고).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.personal_draft_progress (
    room_id         uuid        NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    team_id         uuid        NOT NULL REFERENCES public.league_teams(id) ON DELETE CASCADE,

    current_round   integer     NOT NULL DEFAULT 1,
    picks_remaining integer     NOT NULL,
    status          text        NOT NULL DEFAULT 'in_progress'
                                 CHECK (status IN ('in_progress', 'completed')),
    offered_pool    jsonb,      -- 현재 라운드에 노출된 후보 meta_player_id 배열(재접속해도 유지)

    updated_at      timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (room_id, team_id)
);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.personal_draft_progress ENABLE ROW LEVEL SECURITY;

-- 읽기: 방 멤버만 (room_player_state.rps_member_select와 동일 패턴).
CREATE POLICY "pdp_member_select" ON public.personal_draft_progress
    FOR SELECT USING (room_id IN (SELECT my_room_ids()));

-- 서버(Bun/fly.io, service_role) 전권 — start_personal_draft/get_or_generate_round_pack/
-- submit_personal_draft_pick RPC가 이 경로로 읽고 쓴다.
CREATE POLICY "pdp_service_write" ON public.personal_draft_progress
    FOR ALL USING (auth.role() = 'service_role')
          WITH CHECK (auth.role() = 'service_role');

-- ── updated_at 자동 갱신 (room_player_state와 동일 패턴) ────
CREATE OR REPLACE FUNCTION public.personal_draft_progress_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS personal_draft_progress_touch ON public.personal_draft_progress;
CREATE TRIGGER personal_draft_progress_touch BEFORE UPDATE ON public.personal_draft_progress
    FOR EACH ROW EXECUTE FUNCTION public.personal_draft_progress_touch_updated_at();

-- [적용] 2026-09-18 Supabase MCP로 반영
