-- personal_draft_format — 토너먼트 전용 "개인 팩 드래프트" 포맷 설정.
--
-- 배경: 기존 공유풀 턴제 드래프트(DraftRoom.ts + submit_draft_pick_v2)와 별개로,
-- 참가자가 세션 참가 직후 혼자 라운드제 카드팩을 까며 로스터를 완성하는 새 드래프트
-- 방식을 토너먼트에 추가한다(docs/plan/tournament-personal-pack-draft-plan.md).
--
-- 글로벌 범위(연도/오버롤)는 새 컬럼 없이 기존 leagues.draft_year_min/max,
-- leagues.draft_ovr_min/max를 그대로 재사용한다 — 이 컬럼은 그 글로벌 범위 안에서의
-- "라운드별 하위범위 + 라운드별 픽 수/노출 카드 수 + 확정된 후보 ID 목록"만 담는다.
--
-- 이 컬럼이 NULL이면 해당 리그는 기존 공유풀 드래프트 경로를 그대로 쓴다(하위호환,
-- 리그 타입 분기 없이 "값이 있으면 개인 드래프트" 원칙).
--
-- rounds[].eligiblePlayerIds는 포맷 저장 시점(services/multi/leagueService.ts)에
-- 글로벌 필터 + 라운드 하위범위로 meta_players를 한 번 쿼리해 확정 저장한 결과다 —
-- 픽 시점엔 재쿼리하지 않으므로 토너먼트 진행 중 meta_players 데이터가 바뀌어도
-- (선수 평가 수정 등) 영향받지 않고, "라운드 풀 고갈"이 런타임에 발생할 수 없다.
--
-- 스키마 예시:
-- {
--   "totalRounds": 15,
--   "rounds": [
--     { "round": 1, "poolSize": 10, "picks": 1,
--       "ovrMin": 90, "ovrMax": 99, "draftYearMin": null, "draftYearMax": null,
--       "eligiblePlayerIds": ["<uuid>", ...] },
--     ...
--   ]
-- }
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS personal_draft_format jsonb DEFAULT NULL;
COMMENT ON COLUMN leagues.personal_draft_format IS
    '토너먼트 전용 개인 팩 드래프트 포맷(라운드별 poolSize/picks/ovrMin·Max/draftYearMin·Max/eligiblePlayerIds). NULL이면 기존 공유풀 턴제 드래프트를 그대로 사용.';

-- [적용] 2026-09-18 Supabase MCP로 반영
