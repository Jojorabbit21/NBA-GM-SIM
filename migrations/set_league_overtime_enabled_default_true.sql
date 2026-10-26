-- [2026-10-26] 연장전 P3(연장 경기만 늦게 공개 — game_reveal_at, add_overtime_reveal_delay.sql) 완료 → 사용자 결정대로
-- 리그 스위치 기본값을 on으로. 칼럼 기본값만 바꾸므로 새로 만드는 리그부터 적용되고, 기존 리그 행은 그대로(false).
-- 주의: 서버(Fly)가 연장전 P1~P3 코드로 배포되기 전에는 이 값을 읽는 코드가 없어 새 리그도 기존 방식으로 진행된다.
ALTER TABLE public.leagues ALTER COLUMN overtime_enabled SET DEFAULT true;

COMMENT ON COLUMN public.leagues.overtime_enabled IS
    '연장전(5분×최대 2회+결승 공격, 점프볼). 기본 true(2026-10-26 P3 완료 후) — 이전에 만든 리그는 false로 남아 있음';
