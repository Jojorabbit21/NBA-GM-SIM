-- [2026-11-21] 어시스트 네트워크 노드 팝업용 — 쌍별 패스(야투로 이어진 패스)·성공 칼럼 추가
-- 베이스: 라이브 정의(2026-11-21, pg_get_functiondef('public.get_team_assist_pairs(uuid,text,integer,boolean)'))
-- 엔진: statsMappers.recordPassPairs(client·server 미러) — 성공·실패 야투의 statPasser→슈터 1건(핸들러 본인 마무리 픽앤롤 제외), 성공이면 fgm +1.
-- get_team_assist_pairs는 반환 칼럼이 늘어 DROP 후 재생성(본문 = 라이브 정의 + 합계 2개).

alter table public.team_assist_pairs
    add column if not exists passes integer not null default 0,
    add column if not exists fgm    integer not null default 0;

drop function if exists public.get_team_assist_pairs(uuid, text, integer, boolean);
create function public.get_team_assist_pairs(p_room_id uuid, p_team_id text, p_season_number integer DEFAULT NULL::integer, p_is_playoff boolean DEFAULT false)
 RETURNS TABLE(passer_id text, receiver_id text, ast bigint, pts bigint, games bigint, passes bigint, fgm bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    select t.passer_id, t.receiver_id, sum(t.ast), sum(t.pts), count(distinct t.game_id), sum(t.passes), sum(t.fgm)
    from team_assist_pairs t
    where t.room_id = p_room_id
      and t.team_id = p_team_id
      and t.season_number is not distinct from coalesce(p_season_number, (select r.season_number from rooms r where r.id = p_room_id))
      and t.is_playoff = p_is_playoff
    group by t.passer_id, t.receiver_id
$function$;
grant execute on function public.get_team_assist_pairs(uuid, text, integer, boolean) to anon, authenticated, service_role;

-- 롤백:
--   drop function if exists public.get_team_assist_pairs(uuid, text, integer, boolean);
--   → 위 머리말의 라이브 정의(반환 칼럼 5개, migrations/add_team_assist_pairs.sql과 같음)로 재생성
--   alter table public.team_assist_pairs drop column passes, drop column fgm;   (서버 simRunner 5-3을 먼저 되돌릴 것)
