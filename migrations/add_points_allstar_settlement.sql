-- ============================================================
-- BP 올스타 정산 표식 — league_events.points_settled_at
--
-- 계획: docs/plan/points-system-plan.md "올스타 보상". 서버: server/src/pointsAllStar.ts
-- 올스타 관련 이벤트(allstar_vote_result / allstar_rising_stars / allstar_game_result / allstar_rising_stars_result /
-- allstar_three_point_contest(_result) / allstar_dunk_contest(_result))를 처리한 뒤 이 시각을 적는다.
-- null 인 행만 매 tick 조회하므로 재처리·재스캔이 없다.
--
-- 기존 이벤트: NBA Active 만 null 로 남겨 소급(2026-11-08 결정), 나머지 방은 now() 로 채워 소급하지 않는다.
-- ============================================================

alter table public.league_events add column if not exists points_settled_at timestamptz;

create index if not exists league_events_points_pending_idx
  on public.league_events (room_id, created_at)
  where points_settled_at is null and type like 'allstar_%';

update public.league_events e
   set points_settled_at = now()
 where e.points_settled_at is null
   and e.type like 'allstar_%'
   and e.league_id not in (select id from public.leagues where name = 'NBA Active');

-- ROLLBACK: drop index if exists league_events_points_pending_idx; alter table public.league_events drop column points_settled_at;
