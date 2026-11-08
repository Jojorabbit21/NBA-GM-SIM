-- ============================================================
-- BP 일일 정산 워터마크 — rooms.points_settled_through
--
-- 계획: docs/plan/points-system-plan.md "① 일일 정산". 서버: server/src/pointsSettlement.ts
-- 매 tick 정규시즌 공개 경기를 scheduled_at 순으로 정산하고, 마지막으로 정산한 경기의 scheduled_at 을 여기 적는다.
-- 다음 tick 은 scheduled_at >= 워터마크 인 경기만 읽는다(같은 시각 경기 재조회는 원장 멱등 키가 걸러냄).
--
-- 기존 방은 now() 로 채워 **소급 지급하지 않는다**(NBA Active·Pro Basketball League 는 정규시즌 1,230경기가 이미 끝남).
-- 소급이 필요하면 해당 방의 값을 null(처음부터) 또는 원하는 시각으로 되돌리면 다음 tick 부터 정산된다.
-- 새 방은 null → 첫 경기부터.
-- ============================================================

alter table public.rooms add column if not exists points_settled_through timestamptz;

update public.rooms set points_settled_through = now() where points_settled_through is null;

-- ROLLBACK: alter table public.rooms drop column points_settled_through;
