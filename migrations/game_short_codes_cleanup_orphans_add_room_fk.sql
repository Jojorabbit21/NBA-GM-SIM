-- ============================================================
-- game_short_codes — 고아 행 정리 + rooms FK(ON DELETE CASCADE) 추가
--
-- 배경(2026-10-18): game_short_codes에는 rooms로의 FK가 없어 방/리그가 삭제돼도 행이 남았다.
-- 15,158행 중 12,602행(83%, 이미 없는 17개 방분)이 고아였다. room_id 컬럼이 있는 다른 26개 테이블은 모두 ON DELETE CASCADE.
-- 적용: Supabase MCP apply_migration `game_short_codes_cleanup_orphans_add_room_fk` (프로젝트 buummihpewiaeltywdff, 2026-10-18, 한 트랜잭션)
-- 결과: 2,556행 보존(895d10da…=1326, aeb5794a…=1230), 12,602행 삭제 → 백업 테이블에 보관.
-- ============================================================

-- 1) 롤백용 백업 (RLS on + anon/authenticated 권한 없음 → API로 노출되지 않음)
create table public.backup_game_short_codes_orphans_20261018 as
  select g.* from public.game_short_codes g
  where not exists (select 1 from public.rooms r where r.id = g.room_id);
alter table public.backup_game_short_codes_orphans_20261018 enable row level security;
revoke all on table public.backup_game_short_codes_orphans_20261018 from anon, authenticated;

-- 2) 고아 행 삭제
delete from public.game_short_codes g
 where not exists (select 1 from public.rooms r where r.id = g.room_id);

-- 3) FK 추가 (UNIQUE (room_id, game_id)가 room_id를 앞에서 인덱싱하므로 CASCADE 조회도 가볍다)
alter table public.game_short_codes
  add constraint game_short_codes_room_id_fkey
  foreign key (room_id) references public.rooms(id) on delete cascade;

-- ============================================================
-- 롤백:
--   alter table public.game_short_codes drop constraint game_short_codes_room_id_fkey;
--   insert into public.game_short_codes select * from public.backup_game_short_codes_orphans_20261018;
--   -- (되돌린 뒤에는 다시 고아가 쌓이는 상태가 됨. 되돌릴 이유가 없으면 백업 테이블은 안정화 후 drop)
-- 백업 테이블 정리(필요 없어졌을 때): drop table public.backup_game_short_codes_orphans_20261018;
-- ============================================================
