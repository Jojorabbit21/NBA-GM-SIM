-- [2026-09-18] Fixed-Day 3단계 — 어드민 강제 진행(시간 점프) RPC + 감사 로그.
--
-- 개념(docs/plan/fixed-day-schedule-plan.md §6): 결과 공개와 "오늘"이 모두 실제 시각으로 정해지므로, 경기를 미리
-- 계산하는 대신 대상 가상 날짜(p_through_virtual_date)의 실제 종료 시각이 "지금"이 되도록 그 이하 날짜의 행과
-- 경기 시각을 Δ만큼 과거로 옮긴다. 그러면 스케줄러가 평소 로직대로 예정 시각이 지난 경기를 순서대로 처리하고,
-- 시작+리플레이 ≤ 행 종료 ≤ now 이므로 결과는 곧바로 공개된다. 대상일 이후 행은 균일 이동하면 일일 시뮬 창
-- 밖(심야)으로 밀리므로, 클라이언트(utils/leagueTimeline.ts)가 지금+여유부터 창 격자에 다시 깐 행(p_days)과 그
-- 경기 시각(p_games)으로 교체한다 — 앞당기기(하루당 가상 일수 유지) / 종료일 유지(다시 계산) 모드 차이는 클라이언트
-- 계산에만 있고 RPC는 동일.
--
-- 되돌릴 수 없으므로 실행 전 미종료 행 전체를 leagues.time_jump_log에 스냅샷으로 남긴다(수동 복구 근거).

alter table public.leagues
    add column if not exists time_jump_log jsonb not null default '[]'::jsonb;

create or replace function public.admin_time_jump(
    p_league_id uuid,
    p_through_virtual_date date,
    p_days jsonb,
    p_games jsonb,
    p_note jsonb default '{}'::jsonb
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
    v_now    timestamptz := now();
    v_replay interval;
    v_target league_virtual_days%rowtype;
    v_delta  interval;
    v_rows_shifted int; v_rows_relaid int;
    v_games_shifted int; v_games_live_finalized int; v_games_relaid int;
    v_snapshot jsonb;
    v_allstar  jsonb;
    v_end      date;
begin
    if v_uid is null then raise exception 'not_authenticated'; end if;
    if p_days is null or jsonb_typeof(p_days) <> 'array' then raise exception 'invalid_days'; end if;
    if p_games is null or jsonb_typeof(p_games) <> 'array' then raise exception 'invalid_games'; end if;

    select l.admin_user_id, r.id into v_admin, v_room
      from leagues l join rooms r on r.league_id = l.id
     where l.id = p_league_id;
    if v_admin is null then raise exception 'league_not_found'; end if;
    if v_admin <> v_uid then raise exception 'not_league_admin'; end if;
    v_replay := room_replay_interval(v_room);

    select * into v_target from league_virtual_days
     where league_id = p_league_id and virtual_date = p_through_virtual_date;
    if not found then raise exception 'target_not_found'; end if;
    if v_target.real_end_at <= v_now then raise exception 'target_already_past'; end if;
    v_delta := v_target.real_end_at - v_now;

    -- 감사용 스냅샷: 아직 끝나지 않은 행 전체
    select coalesce(jsonb_agg(jsonb_build_object('d', virtual_date, 's', real_start_at, 'm', real_midnight_at, 'e', real_end_at) order by real_start_at), '[]'::jsonb)
      into v_snapshot
      from league_virtual_days where league_id = p_league_id and real_end_at > v_now;

    -- 1) 대상일 이하 & 아직 안 끝난 행 → Δ만큼 과거로 (대상일 종료 = now)
    update league_virtual_days
       set real_start_at = real_start_at - v_delta,
           real_midnight_at = real_midnight_at - v_delta,
           real_end_at = real_end_at - v_delta
     where league_id = p_league_id and virtual_date <= p_through_virtual_date and real_end_at > v_now;
    get diagnostics v_rows_shifted = row_count;

    -- 2) 대상일 이후 행 → 클라이언트가 다시 깐 행으로 교체
    delete from league_virtual_days where league_id = p_league_id and virtual_date > p_through_virtual_date;
    insert into league_virtual_days (league_id, room_id, virtual_date, day_index, kind, real_start_at, real_midnight_at, real_end_at)
    select p_league_id, v_room, d.virtual_date, d.day_index, d.kind, d.real_start_at, d.real_midnight_at, d.real_end_at
      from jsonb_to_recordset(p_days) as d(virtual_date date, day_index integer, kind text,
                                          real_start_at timestamptz, real_midnight_at timestamptz, real_end_at timestamptz);
    get diagnostics v_rows_relaid = row_count;

    -- 3) 대상일 이하 미실행 경기 → Δ만큼 과거로 (스케줄러가 예정 시각 순으로 처리, 결과 즉시 공개)
    update games
       set scheduled_at = scheduled_at - v_delta, updated_at = v_now
     where room_id = v_room and played = false and game_date <= p_through_virtual_date and scheduled_at is not null;
    get diagnostics v_games_shifted = row_count;

    -- 4) 대상일 이하 "이미 실행됐지만 아직 라이브(또는 선행 계산돼 시작 전)"인 경기 → 즉시 종료 공개
    update games
       set scheduled_at = scheduled_at - v_delta, updated_at = v_now
     where room_id = v_room and played = true and game_date <= p_through_virtual_date
       and scheduled_at is not null and scheduled_at > v_now - v_replay;
    get diagnostics v_games_live_finalized = row_count;
    update game_pbp p
       set game_start_time = p.game_start_time - v_delta
      from games g
     where g.room_id = p.room_id and g.game_id = p.game_id and g.room_id = v_room
       and g.game_date <= p_through_virtual_date and p.game_start_time > v_now - v_replay;

    -- 5) 대상일 이후 미실행 경기 → 새 시각/순번
    update games g
       set scheduled_at = i.scheduled_at,
           game_seq     = coalesce(i.game_seq, g.game_seq),
           updated_at   = v_now
      from jsonb_to_recordset(p_games) as i(game_id text, scheduled_at timestamptz, game_seq integer)
     where g.room_id = v_room and g.game_id = i.game_id and g.played = false and i.scheduled_at is not null;
    get diagnostics v_games_relaid = row_count;

    -- 6) 올스타 4종 실제 시각 재계산(4종이 모두 표에 있을 때만)
    select case when count(*) filter (where kind in ('allstar_announce','allstar_rising','allstar_contests','allstar_main')) = 4 then
                jsonb_build_object(
                    'announceAt',    min(real_start_at) filter (where kind = 'allstar_announce'),
                    'risingStarsAt', min(real_start_at) filter (where kind = 'allstar_rising'),
                    'contestsAt',    min(real_start_at) filter (where kind = 'allstar_contests'),
                    'mainGameAt',    min(real_start_at) filter (where kind = 'allstar_main'))
           end
      into v_allstar
      from league_virtual_days where league_id = p_league_id;

    -- 7) 실제 종료일 갱신 + 감사 로그
    select (max(real_end_at) at time zone 'Asia/Seoul')::date into v_end
      from league_virtual_days where league_id = p_league_id;

    update leagues
       set allstar_schedule = coalesce(v_allstar, allstar_schedule),
           real_end_date    = coalesce(v_end, real_end_date),
           time_jump_log    = time_jump_log || jsonb_build_array(jsonb_build_object(
               'at', v_now, 'by', v_uid, 'through', p_through_virtual_date,
               'delta_seconds', extract(epoch from v_delta),
               'rows_shifted', v_rows_shifted, 'rows_relaid', v_rows_relaid,
               'games_shifted', v_games_shifted, 'games_live_finalized', v_games_live_finalized, 'games_relaid', v_games_relaid,
               'note', p_note, 'snapshot', v_snapshot))
     where id = p_league_id;

    return jsonb_build_object(
        'delta_seconds', extract(epoch from v_delta),
        'rows_shifted', v_rows_shifted, 'rows_relaid', v_rows_relaid,
        'games_shifted', v_games_shifted, 'games_live_finalized', v_games_live_finalized, 'games_relaid', v_games_relaid,
        'real_end_date', v_end);
end;
$$;

revoke all on function public.admin_time_jump(uuid, date, jsonb, jsonb, jsonb) from public;
grant execute on function public.admin_time_jump(uuid, date, jsonb, jsonb, jsonb) to authenticated;
