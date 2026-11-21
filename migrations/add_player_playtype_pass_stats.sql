-- [2026-11-21] 선수별 플레이타입 패스 집계 + 리그 평균(선수 집계 기준)
-- 베이스: 라이브 정의(2026-11-21, pg_get_functiondef('public.get_player_playtype_stats(uuid,text,integer,boolean)'))
--
-- 엔진(statsMappers.recordPlayTypeStat / passCreation, client·server 미러):
--   po   = 이 선수가 자기 플레이를 패스로 끝낸 횟수(킥아웃·블리츠 패스아웃·헬프 킥아웃·드라이브킥 킥·롤/팝 피드 → 슛·슈팅 파울로 이어진 것)
--   ast  = 그중 어시스트가 인정된 횟수
--   past = 어시스트된 야투 득점(앤드원 자유투 제외)
--   play_type 'Kickout' = 남이 만든 플레이에서 빼준 공을 받아 끝낸 플레이(선수 집계 전용, 팀 집계는 원래 플레이 그대로)
-- 기존 행은 0으로 채워진다(소급 불가 — 경기마다 패서를 저장하지 않았음).
-- get_player_playtype_stats는 반환 칼럼이 늘어 DROP 후 재생성(본문은 라이브 정의 + 합계 3개).
-- get_league_player_playtype_stats는 신규 — 선수 프로필 PPP 리그 평균을 선수 집계 기준으로(Kickout 분리 후 팀 집계와 기준이 달라짐).

alter table public.player_playtype_stats
    add column if not exists po   integer not null default 0,
    add column if not exists ast  integer not null default 0,
    add column if not exists past integer not null default 0;

drop function if exists public.get_player_playtype_stats(uuid, text, integer, boolean);
create function public.get_player_playtype_stats(p_room_id uuid, p_player_id text, p_season_number integer DEFAULT NULL::integer, p_is_playoff boolean DEFAULT false)
 RETURNS TABLE(play_type text, poss bigint, pts bigint, fga bigint, fgm bigint, fta bigint, tov bigint, estimated_games bigint, po bigint, ast bigint, past bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    select t.play_type,
           sum(t.poss), sum(t.pts), sum(t.fga), sum(t.fgm), sum(t.fta), sum(t.tov),
           count(distinct t.game_id) filter (where t.is_estimated),
           sum(t.po), sum(t.ast), sum(t.past)
    from player_playtype_stats t
    where t.room_id = p_room_id
      and t.player_id = p_player_id
      and t.season_number is not distinct from coalesce(p_season_number, (select r.season_number from rooms r where r.id = p_room_id))
      and t.is_playoff = p_is_playoff
    group by t.play_type
$function$;
grant execute on function public.get_player_playtype_stats(uuid, text, integer, boolean) to anon, authenticated, service_role;

create or replace function public.get_league_player_playtype_stats(p_room_id uuid, p_season_number integer DEFAULT NULL::integer, p_is_playoff boolean DEFAULT false)
 RETURNS TABLE(play_type text, poss bigint, pts bigint, po bigint, ast bigint, past bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    select t.play_type, sum(t.poss), sum(t.pts), sum(t.po), sum(t.ast), sum(t.past)
    from player_playtype_stats t
    where t.room_id = p_room_id
      and t.season_number is not distinct from coalesce(p_season_number, (select r.season_number from rooms r where r.id = p_room_id))
      and t.is_playoff = p_is_playoff
    group by t.play_type
$function$;
grant execute on function public.get_league_player_playtype_stats(uuid, integer, boolean) to anon, authenticated, service_role;

-- 롤백:
--   drop function if exists public.get_league_player_playtype_stats(uuid, integer, boolean);
--   drop function if exists public.get_player_playtype_stats(uuid, text, integer, boolean);
--   → migrations/add_player_playtype_stats.sql의 get_player_playtype_stats 정의(= 2026-11-21 라이브 정의, 반환 칼럼 8개)로 재생성
--   alter table public.player_playtype_stats drop column po, drop column ast, drop column past;
--   (칼럼 삭제 전에 서버 simRunner 5-2가 po/ast/past를 넣지 않도록 먼저 되돌릴 것)
