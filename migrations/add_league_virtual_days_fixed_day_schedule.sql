-- [2026-09-18] 고정 길이 가상 하루(Fixed-Day) 스케줄 구조 — 1단계 (docs/plan/fixed-day-schedule-plan.md)
--
-- 1) leagues: 하루 길이(day_length_min), 실제 시작/종료일, 플레이오프 경기 간격 컬럼 추가.
--    duration_weeks / daily_window_end_min 은 이제 파생값(호환용으로만 유지).
-- 2) league_virtual_days: 가상 캘린더 날짜 ↔ 실제 시각 표(리그 생성 시 전 기간 명시 저장).
-- 3) current_virtual_date(): 표 기반 판정으로 교체(표가 없는 구 리그는 기존 "가장 가까운 경기" 폴백).
-- 4) apply_league_reschedule(): 세션 설정 "일정" 탭의 남은 날짜 재배치를 한 트랜잭션으로 적용.
--    (어제 만든 reschedule_league_games()는 이 RPC가 대체 — 제거)

alter table public.leagues
    add column if not exists day_length_min integer,
    add column if not exists real_start_date date,
    add column if not exists real_end_date date,
    add column if not exists playoff_game_interval_days integer not null default 1;

create table if not exists public.league_virtual_days (
    league_id        uuid        not null references public.leagues(id) on delete cascade,
    room_id          uuid        not null references public.rooms(id)   on delete cascade,
    virtual_date     date        not null,
    day_index        integer     not null,
    kind             text        not null,
    real_start_at    timestamptz not null,
    real_midnight_at timestamptz not null,
    real_end_at      timestamptz not null,
    primary key (league_id, virtual_date)
);
create index if not exists league_virtual_days_room_start_idx on public.league_virtual_days (room_id, real_start_at);

alter table public.league_virtual_days enable row level security;

drop policy if exists "lvd_member_select" on public.league_virtual_days;
create policy "lvd_member_select" on public.league_virtual_days
    for select using (room_id in (select my_room_ids()));

drop policy if exists "lvd_admin_write" on public.league_virtual_days;
create policy "lvd_admin_write" on public.league_virtual_days
    for all using (league_id in (select id from public.leagues where admin_user_id = (select auth.uid())))
    with check (league_id in (select id from public.leagues where admin_user_id = (select auth.uid())));

drop policy if exists "lvd_service_write" on public.league_virtual_days;
create policy "lvd_service_write" on public.league_virtual_days
    for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── current_virtual_date: 타임라인 표 기반 ──────────────────────────────────────────────
-- 규칙(클라이언트 utils/leagueTimeline.ts resolveVirtualDate()와 동일해야 함):
--   row = real_start_at <= now() 인 마지막 행
--   row 없음(시즌 시작 전)      → 첫 행의 virtual_date
--   now() < row.real_midnight_at → row.virtual_date
--   그 외                        → row.virtual_date + 1일
-- 표가 비어 있으면(이 구조 이전 리그·토너먼트) 기존 "가장 가까운 경기의 game_date" → rooms.sim_date 폴백.
create or replace function public.current_virtual_date(p_room_id uuid)
 returns date
 language sql
 stable
 set search_path to 'public'
as $function$
    select coalesce(
        (select case when now() < d.real_midnight_at then d.virtual_date else d.virtual_date + 1 end
           from league_virtual_days d
          where d.room_id = p_room_id and d.real_start_at <= now()
          order by d.real_start_at desc
          limit 1),
        (select d.virtual_date
           from league_virtual_days d
          where d.room_id = p_room_id
          order by d.real_start_at asc
          limit 1),
        (select g.game_date
           from games g
          where g.room_id = p_room_id and g.scheduled_at is not null
          order by abs(extract(epoch from (g.scheduled_at - now())))
          limit 1),
        (select r.sim_date::date from rooms r where r.id = p_room_id)
    );
$function$;

-- ── apply_league_reschedule: 남은 가상 날짜 재배치(어드민) ───────────────────────────────
-- p_from_virtual_date 이상인 타임라인 행을 p_days로 교체하고, p_games의 (game_id, scheduled_at,
-- game_seq)를 played=false 경기에 반영하며, p_settings(day_length_min / real_end_date /
-- daily_window_start_min / daily_window_end_min / allstar_schedule 중 존재하는 키만)를 leagues에 저장.
drop function if exists public.reschedule_league_games(uuid, jsonb);

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
        allstar_schedule       = case when p_settings ? 'allstar_schedule' then p_settings->'allstar_schedule' else allstar_schedule end
     where id = p_league_id;

    return jsonb_build_object('days', v_days, 'games', v_games);
end;
$$;

revoke all on function public.apply_league_reschedule(uuid, date, jsonb, jsonb, jsonb) from public;
grant execute on function public.apply_league_reschedule(uuid, date, jsonb, jsonb, jsonb) to authenticated;
