-- [2026-09-18] 고정 길이 가상 하루 구조 2단계 — 리플레이(결과 공개 지연) 길이 리그 설정화.
--
-- 1) leagues.replay_minutes (기본 10, 1~30). 선택지는 UI에서 5/8/10/12로 제한.
-- 2) room_replay_interval(p_room_id): 방 → 리그의 replay_minutes를 interval로 돌려주는 헬퍼(SECURITY DEFINER,
--    RLS 재귀 없이 rooms/leagues를 읽음). 리그가 없거나 값이 없으면 10분.
-- 3) `gp.game_start_time + interval '10 minutes' <= now()`를 쓰던 함수 7개(시즌 스탯/어워드/슛 이벤트/팀 존/팀
--    고급 스탯)를 pg_get_functiondef로 읽어 헬퍼 호출로 치환해 재생성한다(본문은 그대로, 조건만 교체).
-- 4) game_pbp / league_events SELECT 정책의 '00:10:00'::interval도 헬퍼로 교체.
-- 5) apply_league_reschedule()의 p_settings에 replay_minutes 지원.
--
-- 이 값과 같은 규칙을 쓰는 곳(미러): 클라이언트 views/multi/season/multiGameReveal.ts(getReplayDurationMs),
-- 서버 server/src/liveGameView.ts(+ replayConfig.ts), 타임라인 클램프(leagueTimeline.assignRealTimes).

alter table public.leagues
    add column if not exists replay_minutes integer not null default 10;
alter table public.leagues drop constraint if exists leagues_replay_minutes_range;
alter table public.leagues add constraint leagues_replay_minutes_range check (replay_minutes between 1 and 30);

create or replace function public.room_replay_interval(p_room_id uuid)
returns interval
language sql
stable
security definer
set search_path = public
as $$
    select make_interval(mins => coalesce(
        (select l.replay_minutes from rooms r join leagues l on l.id = r.league_id where r.id = p_room_id),
        10));
$$;
revoke all on function public.room_replay_interval(uuid) from public;
grant execute on function public.room_replay_interval(uuid) to authenticated, anon, service_role;

-- 3) 함수 7개 일괄 치환 — 원본 정의를 그대로 읽어 조건식만 바꿔 재생성한다.
do $$
declare
    r record;
    src text;
    n_before integer := 0;
    n_after integer := 0;
begin
    for r in
        select p.oid, p.proname
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prokind = 'f'
           and pg_get_functiondef(p.oid) like '%gp.game_start_time + interval ''10 minutes'' <= now()%'
    loop
        n_before := n_before + 1;
        src := pg_get_functiondef(r.oid);
        src := replace(src,
            'gp.game_start_time + interval ''10 minutes'' <= now()',
            'gp.game_start_time + public.room_replay_interval(p_room_id) <= now()');
        execute src;
        raise notice 'replay_minutes: rewrote %', r.proname;
    end loop;

    select count(*) into n_after
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and pg_get_functiondef(p.oid) like '%10 minutes%';
    if n_after > 0 then
        raise exception 'replay_minutes migration: % function(s) still reference "10 minutes"', n_after;
    end if;
    raise notice 'replay_minutes: % function(s) rewritten', n_before;
end $$;

-- 4) 정책 2개
alter policy "room members can read game_pbp" on public.game_pbp
    using (
        exists (select 1 from room_members where room_members.room_id = game_pbp.room_id and room_members.user_id = (select auth.uid()))
        and (game_start_time + public.room_replay_interval(room_id)) <= now()
    );

alter policy "le_member_select" on public.league_events
    using (
        room_id in (select my_room_ids())
        and (
            game_id is null
            or exists (
                select 1 from game_pbp gp
                 where gp.room_id = league_events.room_id and gp.game_id = league_events.game_id
                   and (gp.game_start_time + public.room_replay_interval(gp.room_id)) <= now()
            )
        )
    );

-- 5) apply_league_reschedule: replay_minutes 설정 지원
create or replace function public.apply_league_reschedule(
    p_league_id uuid,
    p_from_virtual_date date,
    p_days jsonb,
    p_games jsonb,
    p_settings jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid    uuid := auth.uid();
    v_admin  uuid;
    v_room   uuid;
    v_days   integer;
    v_games  integer;
begin
    if v_uid is null then raise exception 'not_authenticated'; end if;
    if p_days is null or jsonb_typeof(p_days) <> 'array' then raise exception 'invalid_days'; end if;
    if p_games is null or jsonb_typeof(p_games) <> 'array' then raise exception 'invalid_games'; end if;

    select l.admin_user_id, r.id into v_admin, v_room
      from leagues l join rooms r on r.league_id = l.id
     where l.id = p_league_id;
    if v_admin is null then raise exception 'league_not_found'; end if;
    if v_admin <> v_uid then raise exception 'not_league_admin'; end if;

    delete from league_virtual_days
     where league_id = p_league_id and virtual_date >= p_from_virtual_date;

    insert into league_virtual_days (league_id, room_id, virtual_date, day_index, kind, real_start_at, real_midnight_at, real_end_at)
    select p_league_id, v_room, d.virtual_date, d.day_index, d.kind, d.real_start_at, d.real_midnight_at, d.real_end_at
      from jsonb_to_recordset(p_days) as d(virtual_date date, day_index integer, kind text,
                                          real_start_at timestamptz, real_midnight_at timestamptz, real_end_at timestamptz);
    get diagnostics v_days = row_count;

    update games g
       set scheduled_at = i.scheduled_at,
           game_seq     = coalesce(i.game_seq, g.game_seq),
           updated_at   = now()
      from jsonb_to_recordset(p_games) as i(game_id text, scheduled_at timestamptz, game_seq integer)
     where g.room_id = v_room and g.game_id = i.game_id and g.played = false and i.scheduled_at is not null;
    get diagnostics v_games = row_count;

    update leagues set
        day_length_min         = coalesce((p_settings->>'day_length_min')::integer, day_length_min),
        real_end_date          = coalesce((p_settings->>'real_end_date')::date, real_end_date),
        daily_window_start_min = coalesce((p_settings->>'daily_window_start_min')::integer, daily_window_start_min),
        daily_window_end_min   = coalesce((p_settings->>'daily_window_end_min')::integer, daily_window_end_min),
        replay_minutes         = coalesce((p_settings->>'replay_minutes')::integer, replay_minutes),
        allstar_schedule       = case when p_settings ? 'allstar_schedule' then p_settings->'allstar_schedule' else allstar_schedule end
     where id = p_league_id;

    return jsonb_build_object('days', v_days, 'games', v_games);
end;
$$;
