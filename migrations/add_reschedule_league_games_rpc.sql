-- [2026-09-18] 세션 설정 "일정" 탭 — 남은 경기 일괄 재배치용 RPC.
-- 클라이언트(utils/leagueScheduleCompressor.ts)가 계산한 (game_id, scheduled_at) 목록을 한
-- 트랜잭션으로 games.scheduled_at에 반영한다. 리그 어드민(leagues.admin_user_id)만 호출 가능,
-- 이미 실행된 경기(played=true)는 절대 건드리지 않는다(updateGameScheduledAt의 단건 가드와 동일).
-- 반환값: 실제로 갱신된 행 수.
create or replace function public.reschedule_league_games(p_room_id uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid   uuid := auth.uid();
    v_admin uuid;
    v_count integer;
begin
    if v_uid is null then
        raise exception 'not_authenticated';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' then
        raise exception 'invalid_items';
    end if;

    select l.admin_user_id into v_admin
    from rooms r join leagues l on l.id = r.league_id
    where r.id = p_room_id;
    if v_admin is null then
        raise exception 'room_not_found';
    end if;
    if v_admin <> v_uid then
        raise exception 'not_league_admin';
    end if;

    update games g
       set scheduled_at = i.scheduled_at,
           updated_at   = now()
      from jsonb_to_recordset(p_items) as i(game_id text, scheduled_at timestamptz)
     where g.room_id = p_room_id
       and g.game_id = i.game_id
       and g.played = false
       and i.scheduled_at is not null;
    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

revoke all on function public.reschedule_league_games(uuid, jsonb) from public;
grant execute on function public.reschedule_league_games(uuid, jsonb) to authenticated;
