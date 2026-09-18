-- [2026-09-18] 멀티 리그 설정: CBA 규정 기본 켜짐 + Two-Way 계약 사용 여부(two_way_enabled) 스위치.
-- 꺼지면 투웨이 슬롯 UI가 사라지고, sign_free_agent_negotiated()가 type='two_way' 계약을 거부한다(two_way_disabled).
-- 기존 리그의 cba_rules_enabled 값은 건드리지 않는다(기본값만 변경). DB 적용 완료 — 함수 본문은 DB의
-- sign_free_agent_negotiated 원본에 (1) two_way_enabled 조회/가드, (2) 트랜잭션 sim_date를 current_virtual_date()로 교체만 추가.

alter table public.leagues alter column cba_rules_enabled set default true;
alter table public.leagues add column if not exists two_way_enabled boolean not null default true;

-- sign_free_agent_negotiated(): 위 두 변경만 반영해 재생성(전문은 Supabase 마이그레이션 이력 참조).
