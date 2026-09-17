-- 멀티리그 샐러리캡 연간 증가율(%) 설정. UI 기본값 2.5%, 0~5% 범위로 클램프됨(views/multi/league/LeagueSettingsView.tsx CAP_DEFAULTS/CAP_GROWTH_RATE_MIN/MAX).
-- NULL = DB에 저장된 적 없음(UI 로드 시 기본값 2.5%로 대체). 0보다 큰 값이면 설정 화면에서
-- 향후 10년 캡/플로어/사치세/1차·2차 에이프런 전망 + YOS별 미니멈 샐러리 테이블을 보여주는 데만 쓰인다.
-- 시즌 진행에 따라 실제 금액을 자동으로 갱신하는 로직은 아직 없음(수동 조정 필요).
ALTER TABLE leagues
    ADD COLUMN IF NOT EXISTS cap_growth_rate numeric NULL;
