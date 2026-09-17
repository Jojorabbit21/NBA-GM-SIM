-- ============================================================
-- leagues: 리그 생성 시 custom_overrides(선수 피크시즌 스탯 오버라이드) 적용 여부 옵션
-- 실행: Supabase MCP(apply_migration)로 적용.
-- 의존: leagues 테이블 존재
-- 배경: 예전엔 draft_pool 문자열에 'alltime' 토큰이 포함되는지로 이 여부를 판단했는데,
--       2026-09-16에 draft_pool의 standard/alltime 풀 타입 구분(체크박스) 자체가 폐지되면서
--       draft_pool이 항상 DB 기본값 'standard'로 고정돼 custom_overrides를 켤 수 있는 UI가
--       사라지는 회귀가 생겼다. 풀 자격 판정(draft_year 범위)과 완전히 별개의 축이므로
--       독립된 컬럼으로 분리한다(cba_rules_enabled/trade_deadline_enabled와 동일한
--       "마스터 스위치 분리" 패턴). 기본값 false = 기존 표준 리그와 동일 동작(변경 없음).
-- ============================================================

ALTER TABLE leagues
    ADD COLUMN IF NOT EXISTS use_custom_overrides BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN leagues.use_custom_overrides IS
    '이 리그가 meta_players.base_attributes.custom_overrides(선수 피크시즌 스탯 오버라이드)를 적용해서 능력치/OVR을 계산할지. false(기본)면 원본 base_attributes만 사용. 리그 생성 시 설정하고 이후에도 리그 설정 화면에서 변경 가능 — 로스터/트레이드/드래프트/올스타/시뮬레이션 전체가 이 값 하나를 기준으로 일관되게 판단해야 함(utils/leagueOverrides.ts의 shouldUseCustomOverrides() 및 server/src/shared/leagueOverrides.ts 미러 참조).';
