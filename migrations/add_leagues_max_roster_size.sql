-- 멀티리그 팀당 최대 로스터 인원 설정(views/multi/league/LeagueSettingsView.tsx "로스터" 탭).
-- 기본값 15(NBA 실제 정원)이며 어드민이 15~20명 사이에서 조정 가능. sign_free_agent()/
-- sign_free_agent_negotiated() RPC(아래 두 파일)가 계약 체결 시 이 값을 기준으로 로스터
-- 슬롯이 가득 찼는지 검증한다.
ALTER TABLE leagues
    ADD COLUMN IF NOT EXISTS max_roster_size integer NOT NULL DEFAULT 15;

ALTER TABLE leagues
    ADD CONSTRAINT leagues_max_roster_size_range CHECK (max_roster_size BETWEEN 15 AND 20);
