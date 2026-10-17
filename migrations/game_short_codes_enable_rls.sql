-- ============================================================
-- game_short_codes — RLS 활성화 + 최소 권한
--
-- 배경(2026-10-18): Supabase 보안 어드바이저 rls_disabled_in_public(ERROR). RLS가 꺼져 있고 anon/authenticated에게
-- 전체 권한(TRUNCATE 포함)이 열려 있어, anon 키만 있으면 전체 행(당시 15,158행)을 읽고 수정·삭제할 수 있었다.
-- 적용: Supabase MCP apply_migration `game_short_codes_enable_rls` (프로젝트 buummihpewiaeltywdff, 2026-10-18)
--
-- 접근 모델(활성화 전에 호출 지점 3곳을 코드로 확인):
--   조회  : 해당 방의 멤버 + 전역 어드민     ← hooks/useGameShortCodes.ts, views/multi/season/MultiGamePbpView.tsx(짧은 코드 역조회)
--   삭제  : 해당 리그의 어드민 + 전역 어드민  ← services/multi/leagueService.ts resetTournament
--   쓰기  : 서버 전용(service_role은 RLS 우회)  ← server/src/finalize.ts(insert), server/src/simRunner.ts(prune delete)
-- 정책 없이 RLS만 켜면 클라이언트 3곳이 "오류 없이 빈 결과/0행 삭제"가 되어 짧은 코드 URL이 깨지고 토너먼트 초기화 뒤
-- UNIQUE 충돌로 숏코드 insert가 조용히 실패하는 옛 버그가 되살아난다 — 그래서 정책과 함께 적용.
-- ============================================================

alter table public.game_short_codes enable row level security;

-- RLS는 TRUNCATE/TRIGGER/REFERENCES에 적용되지 않으므로 포괄 권한을 회수하고 클라이언트가 쓰는 조회·삭제만 남긴다
revoke all on table public.game_short_codes from anon;
revoke all on table public.game_short_codes from authenticated;
grant select, delete on table public.game_short_codes to authenticated;

-- is_chat_member(room_id)는 채팅용으로 만든 "room_members에 내가 있는가" 판정 함수(security definer)를 재사용한 것
create policy gsc_member_select on public.game_short_codes
  for select to authenticated
  using (public.is_chat_member(room_id) or public.is_global_admin());

create policy gsc_admin_delete on public.game_short_codes
  for delete to authenticated
  using (
    public.is_global_admin()
    or exists (
      select 1 from public.rooms r
      join public.leagues l on l.id = r.league_id
      where r.id = game_short_codes.room_id and l.admin_user_id = auth.uid()
    )
  );

-- ============================================================
-- 롤백:
--   drop policy gsc_admin_delete on public.game_short_codes;
--   drop policy gsc_member_select on public.game_short_codes;
--   alter table public.game_short_codes disable row level security;
--   grant all on table public.game_short_codes to anon, authenticated;   -- 원래 상태(권장하지 않음)
-- ============================================================
