-- ============================================================
-- BP 시즌 어워드 정산 — league_events.points_settled_at 표식을 어워드 이벤트(mvp_award / dpoy_award / finals_mvp)에도 적용
--
-- 선행: migrations/add_points_allstar_settlement.sql. 서버: server/src/pointsAllStar.ts (같은 루프)
-- 부분 인덱스를 올스타 + 어워드 타입으로 넓힌다. 기존 어워드 이벤트는 NBA Active 만 null(소급, 2026-11-08 결정), 나머지는 now().
-- ============================================================

drop index if exists public.league_events_points_pending_idx;
create index league_events_points_pending_idx
  on public.league_events (room_id, created_at)
  where points_settled_at is null and (type like 'allstar_%' or type in ('mvp_award', 'dpoy_award', 'finals_mvp'));

update public.league_events e
   set points_settled_at = now()
 where e.points_settled_at is null
   and e.type in ('mvp_award', 'dpoy_award', 'finals_mvp')
   and e.league_id not in (select id from public.leagues where name = 'NBA Active');

-- ROLLBACK: 인덱스를 add_points_allstar_settlement.sql 정의로 되돌린다(컬럼은 유지).
