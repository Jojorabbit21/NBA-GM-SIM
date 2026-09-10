-- ============================================================
-- league_player_awards에 시즌 라벨(season, 예: '2026-27') 컬럼 추가
--
-- 배경: 기존 컬럼은 season_number(정수)뿐이라, 클라이언트가 이 행을 다시 읽어 화면에
-- 표시하려 할 때 "이 시즌이 몇-몇 시즌인지"(예: 3시즌째 → "2028-29") 알 방법이 없었다
-- (leagues.virtual_season_year는 "현재" 시즌 기준 값이라 과거 season_number의 연도를
-- 역산할 수 없음 — 시즌이 바뀔 때마다 갱신되는 값이기 때문). 지금까지는 MVP/DPOY/올-NBA/
-- 올-디펜시브 어워드를 client가 이 테이블에서 읽어온 적이 없어(전부 client-side
-- runAwardVoting() 즉석 재계산으로만 표시) 이 문제가 드러나지 않았을 뿐이다.
--
-- 올스타 선정 결과(신규 'ALL_STAR' award_type, server/src/postAllStarVoteNews.ts)는
-- client-side 재계산이 불가능한 게 원천적 제약(투표/선발 전체 알고리즘을 매 시즌마다
-- 다시 돌려야 하고, 과거 시즌 로스터/투표 데이터도 없음) — DB에 저장된 값을 그대로
-- 읽어 배지로 표시해야 해서, insert 시점에 계산된 시즌 라벨 문자열을 함께 저장해둔다.
-- 기존 MVP/DPOY 등 행은 이 컬럼이 비어 있어도 무방(현재 아무도 안 읽음).
-- ============================================================
ALTER TABLE public.league_player_awards
    ADD COLUMN IF NOT EXISTS season text;
