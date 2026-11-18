-- ============================================================
-- add_league_list_stats.sql — 세션 목록용 공개 요약 (2026-11-18)
--
-- 홈 세션 목록의 "가상 날짜"와 "참가 인원"은 rooms / room_members 에서 나오는데, 이 두 테이블은
-- 참가자·모집 중 리그·(로그인한) 관전자만 읽을 수 있다. 그래서 로그인하지 않았거나 참가하지 않은 사람에게는 "—" 로 보였다.
-- 방 내용 전체를 열지 않고, 목록에 필요한 세 값(정원·참가 인원·가상 날짜)만 리그별로 돌려준다.
--   league_list_stats() → (league_id, max_players, member_count, virtual_date)
-- 목록에 나오는 상태(recruiting·drafting·in_progress·finished)의 활성 방만. 인원은 AI 제외(목록 화면의 기존 계산과 같다).
-- 날짜는 다른 화면과 같은 current_virtual_date(room_id). 누구나 호출 가능(anon 포함) — 리그 이름·상태가 이미 공개인 것과 같은 수준의 정보.
-- 롤백: drop function if exists public.league_list_stats();
-- ============================================================

create or replace function public.league_list_stats()
returns table (league_id uuid, max_players integer, member_count integer, virtual_date date)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select r.league_id,
         r.max_players,
         (select count(*)::integer from room_members m where m.room_id = r.id and m.is_ai = false),
         public.current_virtual_date(r.id)
  from rooms r
  join leagues l on l.id = r.league_id
  where r.status = 'active'
    and l.status in ('recruiting', 'drafting', 'in_progress', 'finished');
$function$;

revoke all on function public.league_list_stats() from public;
grant execute on function public.league_list_stats() to anon, authenticated;
