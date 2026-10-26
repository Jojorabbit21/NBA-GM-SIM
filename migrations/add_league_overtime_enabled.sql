-- [2026-10-26] 연장전 리그 스위치 (docs/plan/overtime-system.md)
-- false(기본) = 기존 방식(4쿼터 동점이면 버저비터 1포제션으로 승부). true = 5분 연장 최대 2회 + 결승 공격,
-- 팁오프·연장 점프볼. 서버 simRunner/postAllStarGame이 읽어 엔진 simSettings.overtimeEnabled로 넘긴다.
-- 연장전 P3(연장 경기만 늦게 공개 — game_reveal_at) 완료 전에는 켜지 말 것: 결과 공개 시각·중계 시각 매핑이
-- 아직 48분 고정이라 연장 경기 결과가 다른 화면에 먼저 보인다. P3 완료 후 기본값을 true로 바꿀 예정.
ALTER TABLE public.leagues
    ADD COLUMN IF NOT EXISTS overtime_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.leagues.overtime_enabled IS
    '연장전(5분×최대 2회+결승 공격, 점프볼). 기본 false — 연장전 P3(경기별 공개 시각) 완료 후 기본 true로 전환 예정';
