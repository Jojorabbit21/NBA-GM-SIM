-- ============================================================
-- add_allstar_schedule_to_leagues.sql — 올스타 서브 이벤트(발표/라이징스타/컨테스트/본경기)
-- 각각의 실제(압축된) 발동 시각을 시즌 생성 시점에 미리 계산해 저장
--
-- 배경: 올스타 브레이크 기간은 leagueScheduleCompressor.ts의 압축 로직상 정규 날짜 전환과
-- 동일한 10분짜리 간격만 차지해서, 실제 시간상 폭이 0에 가까웠다. 그 결과 scheduler.ts가
-- current_virtual_date()(games 테이블에 실제 존재하는 날짜만 반환)로 브레이크 안의 개별
-- 날짜(발표일/라이징스타일/컨테스트일/본경기일)를 구분하려 해도, 그 날짜들 자체가 어떤
-- 게임의 game_date도 아니라서(브레이크 전체가 캘린더에서 제외됨) 전부 같은 순간에 몰려서
-- 발동했다(dev-log.md 2026-09-15 "올스타 이벤트 미발동" 항목 참고).
--
-- 해결: games 테이블을 앵커로 쓰는 대신, leagueScheduleCompressor.ts가 압축 계산 시점에
-- 브레이크 경계에서 4개 서브 이벤트 각각에 압축된 실제 하루치 시간을 예약하고, 그 결과
-- 나온 4개의 실제(real) 타임스탬프를 이 컬럼에 저장한다. scheduler.ts는 더 이상
-- current_virtual_date()/getAllStarKeyDates() 비교가 아니라 이 컬럼의 실제 시각과 now()를
-- 직접 비교한다 — games 테이블에 placeholder 행을 심을 필요가 없어 순위표/시즌스탯 등
-- 기존 games 소비처를 전혀 건드리지 않는다.
--
-- 값 형태: { announceAt, risingStarsAt, contestsAt, mainGameAt } (전부 ISO 문자열)
-- ============================================================

ALTER TABLE public.leagues
    ADD COLUMN IF NOT EXISTS allstar_schedule jsonb;
