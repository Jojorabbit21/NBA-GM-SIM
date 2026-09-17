-- Two-Way 계약 시스템 1단계 — 세션 설정에 필요한 두 컬럼만 우선 추가.
-- (views/multi/league/LeagueSettingsView.tsx "샐러리캡"/"로스터" 탭)
--
-- two_way_deadline_date: Two-Way 계약을 정규 계약으로 전환해야 하는 데드라인(가상 시즌
-- 캘린더 날짜). 트레이드 데드라인과 달리 실제 NBA 규정의 정확한 산출 공식이 검증되지
-- 않아 자동 기본값을 계산하지 않음 — null이면 데드라인 없음, 관리자가 직접 날짜를 고른다.
--
-- two_way_slots: 팀당 Two-Way 계약 슬롯 수. max_roster_size(정규 계약, 15~20)와는 별개
-- 슬롯이라 새 컬럼으로 분리했다. 실제 NBA는 팀당 2명 고정이지만 이 리그는 1~5명 범위에서
-- 관리자가 자유롭게 조정 가능(기본 3).
ALTER TABLE leagues
    ADD COLUMN IF NOT EXISTS two_way_deadline_date date NULL,
    ADD COLUMN IF NOT EXISTS two_way_slots integer NOT NULL DEFAULT 3;

ALTER TABLE leagues
    ADD CONSTRAINT leagues_two_way_slots_range CHECK (two_way_slots BETWEEN 1 AND 5);
