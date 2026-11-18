-- ============================================================
-- reset_team_courts_for_inventory.sql — 인벤토리 도입 시 모든 팀 코트 색 초기화 (2026-11-18, 사용자 지시)
--
-- 인벤토리 도입 후 코트 모습은 팀 주인의 장착 정보(user_court_loadout)에서만 정해지고,
-- 기본값은 하드 메이플 우드(다른 색 없음)다. 팀 행의 코트 색 4칸은 더 이상 그리는 데 쓰지 않으므로 비운다.
-- 로고 표시(court_show_logo)·로고 크기(court_logo_scale)는 색이 아니라 그대로 둔다.
--
-- [적용 시점] 인벤토리 화면이 들어간 클라이언트를 배포한 뒤에 실행한다.
--   그 전에 실행하면 구버전 화면이 비어 있는 색을 앱 설정 기본색으로 그려서 잠깐 다른 코트가 보인다.
-- [백업] 실행 전 값을 league_teams_court_backup_20261118 에 남긴다. 복구는 하단 ROLLBACK.
-- ============================================================

create table if not exists public.league_teams_court_backup_20261118 as
select id, court_background, court_paint, court_line, court_three, now() as backed_up_at
from public.league_teams
where court_background is not null or court_paint is not null or court_line is not null or court_three is not null;

alter table public.league_teams_court_backup_20261118 enable row level security;
revoke all on table public.league_teams_court_backup_20261118 from anon, authenticated;

update public.league_teams
set court_background = null, court_paint = null, court_line = null, court_three = null
where court_background is not null or court_paint is not null or court_line is not null or court_three is not null;

-- ROLLBACK
--   update public.league_teams t
--      set court_background = b.court_background, court_paint = b.court_paint,
--          court_line = b.court_line, court_three = b.court_three
--     from public.league_teams_court_backup_20261118 b
--    where b.id = t.id;
