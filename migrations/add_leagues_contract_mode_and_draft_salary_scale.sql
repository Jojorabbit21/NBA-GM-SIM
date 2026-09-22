-- ============================================================
-- leagues.contract_mode + leagues.draft_salary_scale — 드래프트 계약 생성 규칙(리그 단위)
--
-- 배경: 올타임 레전드가 섞인 판타지 리그는 실제 연봉이 없거나(은퇴 선수) 시대가 달라 그대로 못 쓴다.
-- 2026-09-22 합의: 계약은 "드래프트 라운드"가 정한다 — 스네이크 드래프트라 팀 초기 페이롤이 표의
-- 합계로 정확히 정규화되고, 어느 라운드에 누굴 태우느냐(오버/언더페이)가 GM의 전략이 된다.
--
-- contract_mode
--   'standard'    : 실제 계약을 그대로 쓴다. 드래프트 풀은 "룸 시즌을 포함하는 유효 계약이 있는 선수
--                   + 당해 드래프트 클래스 신인"으로 제한되고(services/contracts/draftSalaryScale.ts의
--                   isEligibleForStandardPool), 신인만 실제 NBA 픽 순번의 루키 스케일로 생성한다.
--                   기본값 — 기존 리그는 전부 이 모드로 해석되며 동작 변화 없음.
--   'alternative' : 드래프트된 전원에게 라운드 스케일로 1년 계약을 새로 만든다(실제 계약 무시).
--
-- draft_salary_scale (jsonb, null = 기본 프리셋 DEFAULT_DRAFT_SALARY_SCALE)
--   { "r1FirstPct": 30, "r1LastPct": 25, "roundsPct": [18, 12, 9, 7.5, 6.5, 6, 5.5, 5.2, 5, 1, 1, 1, 1, 1] }
--   R1은 슬롯(팀 고정 드래프트 순번) 기준 첫 픽→마지막 픽 선형 감소, R2~는 라운드 균일(index 0 = R2),
--   배열을 넘는 라운드는 마지막 값. 값은 캡 대비 %(리그 캡이 달라도 비율 유지). 리그 생성/설정 UI에서
--   어드민이 조정하며 드래프트 시작 후엔 읽기 전용.
--
-- 생성 실행: server/src/finalize.ts finalizeDraft()가 draft_picks(round, slot)를 읽어 room_player_state
-- .contract에 INSERT(meta_players 무변경). 미드래프트 선수는 계약을 만들지 않음(FA 협상 엔진 담당).
-- ============================================================

ALTER TABLE public.leagues
    ADD COLUMN IF NOT EXISTS contract_mode text NOT NULL DEFAULT 'standard';

ALTER TABLE public.leagues
    DROP CONSTRAINT IF EXISTS leagues_contract_mode_check;
ALTER TABLE public.leagues
    ADD CONSTRAINT leagues_contract_mode_check CHECK (contract_mode IN ('standard', 'alternative'));

ALTER TABLE public.leagues
    ADD COLUMN IF NOT EXISTS draft_salary_scale jsonb NULL;

-- [적용] 2026-09-22 Supabase MCP로 반영
