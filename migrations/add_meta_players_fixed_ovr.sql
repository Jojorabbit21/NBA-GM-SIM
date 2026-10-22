-- [2026-10-22] 선수 OVR 고정값 전환 1단계 — 저장 컬럼 추가.
-- 지금까지 OVR은 능력치 + DB 아키타입 설정(archetypes 테이블)으로 매번 계산돼, 설정 로딩 시점/기기별
-- 캐시에 따라 같은 선수가 다른 값으로 보였다(예: 카멜로 앤서니 95 vs 92). 계산 대신 DB에 저장된 값을
-- 그대로 읽는 구조로 가기 위한 컬럼이며, 이 단계에서는 컬럼만 추가하고 값을 채운다
-- (매퍼/호출부는 아직 이 컬럼을 읽지 않음 → 이 마이그레이션만으로는 동작 변화 없음).
--   ovr_base   : base_attributes 그대로의 OVR (use_custom_overrides=false 리그)
--   ovr_custom : custom_overrides(피크시즌 능력치)를 적용한 OVR (use_custom_overrides=true 리그)
--                custom_overrides가 없는 선수는 ovr_base와 같은 값으로 채운다.
-- nullable: 값이 없는 행(신규 INSERT 등)은 매퍼가 기존처럼 계산으로 폴백하도록 2단계에서 처리.
-- 롤백: alter table meta_players drop column ovr_base, drop column ovr_custom;
alter table public.meta_players
    add column if not exists ovr_base smallint,
    add column if not exists ovr_custom smallint;

comment on column public.meta_players.ovr_base is '고정 OVR (base_attributes 기준). 직접 편집하는 값.';
comment on column public.meta_players.ovr_custom is '고정 OVR (custom_overrides 적용 기준). custom_overrides 없으면 ovr_base와 동일.';
