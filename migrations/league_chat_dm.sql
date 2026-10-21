-- ============================================================
-- 리그 채팅 DM(다이렉트 메시지) + 메시지 신고
--
-- 계획: docs/plan/league-chat-plan.md "DM 2차 확정안" / 목업 claude.ai/artifact/RQ3FA5zvPgE7zJtbArjZfK
-- 선행: migrations/league_chat_messages.sql (league_chat_messages, send_chat_message, Realtime 정책)
-- 적용: 2026-10-21, Supabase MCP apply_migration `league_chat_dm_and_reports`
--
-- 구조:
--   - DM은 별도 대화방 테이블 없이 league_chat_messages에 recipient_id + conv_key('dm:{작은uid}:{큰uid}')로 저장.
--   - 실시간: 받는 사람의 받은편지함 비공개 채널 'league-dm:{room_id}:{user_id}' 하나(대화마다 채널을 만들지 않음).
--     보낸 사람 화면은 RPC 반환값으로 갱신한다(1건당 Realtime 메시지 약 2).
--   - 대화별 읽음 위치·삭제 기준은 league_dm_state(연 적 있는 대화만 행 생성).
--     삭제 = "나에게서만": cleared_before_id 이하 메시지를 내 목록·화면에서 숨김. 상대 대화·DB 원본은 그대로.
--   - 신고: league_chat_reports(message_id unique = 메시지당 1회), 메시지에 reported 플래그(누가 신고했는지는 노출 안 함).
--   - 레이트 리밋: 기존 send_chat_message의 "유저당 10초 10건"이 전체 채팅 + DM을 합산해서 센다(같은 테이블·같은 room_id).
-- ============================================================

-- 1. 메시지 테이블 보강 ------------------------------------------------------
alter table public.league_chat_messages add column if not exists reported boolean not null default false;
alter table public.league_chat_messages
  add constraint lcm_dm_shape check ((recipient_id is null) = (conv_key is null));
create index if not exists league_chat_messages_conv_idx
  on public.league_chat_messages (room_id, conv_key, id desc) where conv_key is not null;

-- 2. 읽기 정책 교체 — 전체 채팅은 방 멤버, DM은 보낸 사람·받는 사람만(+ 전역 어드민) ---------
-- 이전: is_chat_member(room_id) or is_global_admin()  → DM을 넣는 순간 같은 방 멤버 누구나 남의 DM을 읽을 수 있었음
drop policy if exists lcm_member_select on public.league_chat_messages;
create policy lcm_member_select on public.league_chat_messages
  for select to authenticated
  using (
    (recipient_id is null and public.is_chat_member(room_id))
    or user_id = (select auth.uid())
    or recipient_id = (select auth.uid())
    or public.is_global_admin()
  );

-- 3. 대화 키 ------------------------------------------------------------------
create or replace function public.dm_conv_key(a uuid, b uuid)
returns text language sql immutable set search_path = public as $$
  select 'dm:' || least(a::text, b::text) || ':' || greatest(a::text, b::text)
$$;

-- conv_key의 두 참가자 중 하나가 p_uid인지
create or replace function public.dm_conv_has(p_conv_key text, p_uid uuid)
returns boolean language sql immutable set search_path = public as $$
  select p_conv_key like 'dm:%'
     and (split_part(p_conv_key, ':', 2) = p_uid::text or split_part(p_conv_key, ':', 3) = p_uid::text)
$$;

-- 4. 대화별 상태(읽음 위치·삭제 기준) -------------------------------------------
create table if not exists public.league_dm_state (
  room_id           uuid not null references public.rooms(id) on delete cascade,
  user_id           uuid not null,
  conv_key          text not null,
  last_read_id      bigint not null default 0,
  cleared_before_id bigint not null default 0,
  updated_at        timestamptz not null default now(),
  primary key (room_id, user_id, conv_key)
);
alter table public.league_dm_state enable row level security;
revoke all on table public.league_dm_state from anon, authenticated;
grant select on table public.league_dm_state to authenticated;
create policy lds_own_select on public.league_dm_state
  for select to authenticated using (user_id = (select auth.uid()));

-- 5. 신고 ----------------------------------------------------------------------
create table if not exists public.league_chat_reports (
  id          bigint generated always as identity primary key,
  message_id  bigint not null unique references public.league_chat_messages(id) on delete cascade,
  room_id     uuid not null references public.rooms(id) on delete cascade,
  reporter_id uuid not null,
  reasons     text[] not null check (
                cardinality(reasons) between 1 and 7
                and reasons <@ array['abuse','spam','gambling','promotion','money_request','obscene','other']::text[]),
  created_at  timestamptz not null default now()
);
create index if not exists league_chat_reports_room_idx on public.league_chat_reports (room_id, created_at desc);
alter table public.league_chat_reports enable row level security;
revoke all on table public.league_chat_reports from anon, authenticated;
grant select on table public.league_chat_reports to authenticated;

-- 세션 오너(leagues.admin_user_id) 판정 — 신고 열람·검수용
create or replace function public.is_room_owner(p_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rooms r join leagues l on l.id = r.league_id
    where r.id = p_room_id and l.admin_user_id = auth.uid()
  )
$$;
revoke execute on function public.is_room_owner(uuid) from public, anon;
grant execute on function public.is_room_owner(uuid) to authenticated;

create policy lcr_admin_select on public.league_chat_reports
  for select to authenticated using (public.is_global_admin() or public.is_room_owner(room_id));

-- 6. Realtime 토픽 권한 — 전체 채팅 채널 + 내 DM 받은편지함 -------------------------
create or replace function public.is_chat_topic_member(p_topic text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from room_members rm
    where rm.user_id = auth.uid()
      and (p_topic = 'league-chat:' || rm.room_id::text
           or p_topic = 'league-dm:' || rm.room_id::text || ':' || auth.uid()::text)
  )
$$;

-- 7. 전송 RPC — p_recipient_id가 있으면 DM ------------------------------------------
create or replace function public.send_chat_message(p_room_id uuid, p_body text, p_recipient_id uuid default null)
returns public.league_chat_messages
language plpgsql security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_body      text := public.sanitize_chat_body(p_body);
  v_team_id   text;
  v_team_abbr text;
  v_team_name text;
  v_author    text;
  v_recent    int;
  v_oldest    timestamptz;
  v_wait      int;
  v_conv      text;
  v_row       public.league_chat_messages;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 500 then raise exception 'invalid_body'; end if;

  select rm.team_id into v_team_id from room_members rm where rm.room_id = p_room_id and rm.user_id = v_uid;
  if not found then raise exception 'not_a_member'; end if;

  -- DM 대상: 같은 방의 사람 참가자(AI 팀·자기 자신 불가). 관전자는 room_members에 없어서 자동 제외.
  if p_recipient_id is not null then
    if p_recipient_id = v_uid or not exists (
      select 1 from room_members rm
      where rm.room_id = p_room_id and rm.user_id = p_recipient_id and not coalesce(rm.is_ai, false)
    ) then
      raise exception 'invalid_recipient';
    end if;
    v_conv := public.dm_conv_key(v_uid, p_recipient_id);
  end if;

  -- serialize this user's sends in this room so the count-then-insert rate limit below cannot be raced by parallel calls
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_room_id::text, 0));

  select lt.team_slug, lt.team_abbr, lt.team_name into v_team_id, v_team_abbr, v_team_name
    from league_teams lt where lt.room_id = p_room_id and lt.user_id = v_uid limit 1;
  if not found then
    select rm.team_id, rm.team_abbr, rm.team_name into v_team_id, v_team_abbr, v_team_name
      from room_members rm where rm.room_id = p_room_id and rm.user_id = v_uid;
  end if;

  -- 전체 채팅 + DM 합산(유저당 10초 10건)
  select count(*), min(created_at) into v_recent, v_oldest
    from league_chat_messages
   where room_id = p_room_id and user_id = v_uid and created_at > now() - interval '10 seconds';
  if v_recent >= 10 then
    v_wait := greatest(1, ceil(extract(epoch from (v_oldest + interval '10 seconds' - now())))::int);
    raise exception 'rate_limited' using detail = v_wait::text;
  end if;

  select coalesce(nullif(btrim(nickname), ''), '이름 없음') into v_author from profiles where id = v_uid;
  v_author := coalesce(v_author, '이름 없음');

  insert into league_chat_messages (room_id, user_id, team_id, team_abbr, team_name, author, body, recipient_id, conv_key)
  values (p_room_id, v_uid, v_team_id, v_team_abbr, v_team_name, v_author, v_body, p_recipient_id, v_conv)
  returning * into v_row;

  -- 브로드캐스트 실패가 전송 자체를 실패시키면 안 된다(메시지는 이미 저장됨, 클라이언트는 재연결 시 재조회).
  begin
    perform realtime.send(
      jsonb_build_object(
        'id', v_row.id, 'room_id', v_row.room_id, 'user_id', v_row.user_id,
        'team_id', v_row.team_id, 'team_abbr', v_row.team_abbr, 'team_name', v_row.team_name,
        'author', v_row.author, 'body', v_row.body, 'created_at', v_row.created_at,
        'recipient_id', v_row.recipient_id, 'conv_key', v_row.conv_key, 'reported', v_row.reported
      ),
      case when p_recipient_id is null then 'message' else 'dm' end,
      case when p_recipient_id is null
           then 'league-chat:' || p_room_id::text
           else 'league-dm:' || p_room_id::text || ':' || p_recipient_id::text end,
      true
    );
  exception when others then
    raise warning 'send_chat_message: realtime.send failed: %', sqlerrm;
  end;

  return v_row;
end;
$$;
revoke execute on function public.send_chat_message(uuid, text, uuid) from public, anon;
grant execute on function public.send_chat_message(uuid, text, uuid) to authenticated;

-- 8. DM 대화 목록 ---------------------------------------------------------------
create or replace function public.list_dm_conversations(p_room_id uuid)
returns table (
  conv_key text, peer_id uuid, peer_name text, peer_team_id text, peer_team_abbr text, peer_team_name text,
  last_id bigint, last_at timestamptz, unread int, cleared_before_id bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from room_members rm where rm.room_id = p_room_id and rm.user_id = v_uid) then
    raise exception 'not_a_member';
  end if;
  return query
  with convs as (
    select m.conv_key, max(m.id) as last_id, max(m.created_at) as last_at
      from league_chat_messages m
     where m.room_id = p_room_id and m.conv_key is not null
       and (m.user_id = v_uid or m.recipient_id = v_uid)
     group by m.conv_key
  ), withpeer as (
    select c.*,
           (case when split_part(c.conv_key, ':', 2) = v_uid::text
                 then split_part(c.conv_key, ':', 3) else split_part(c.conv_key, ':', 2) end)::uuid as peer,
           coalesce(s.last_read_id, 0) as read_id,
           coalesce(s.cleared_before_id, 0) as cleared_id
      from convs c
      left join league_dm_state s on s.room_id = p_room_id and s.user_id = v_uid and s.conv_key = c.conv_key
  )
  select w.conv_key, w.peer,
         coalesce(nullif(btrim(p.nickname), ''), '이름 없음'),
         coalesce(lt.team_slug, rm.team_id), coalesce(lt.team_abbr, rm.team_abbr), coalesce(lt.team_name, rm.team_name),
         w.last_id, w.last_at,
         (select count(*)::int from league_chat_messages m2
           where m2.room_id = p_room_id and m2.conv_key = w.conv_key
             and m2.id > greatest(w.read_id, w.cleared_id) and m2.user_id <> v_uid),
         w.cleared_id
    from withpeer w
    left join profiles p on p.id = w.peer
    left join lateral (select l.team_slug, l.team_abbr, l.team_name from league_teams l
                        where l.room_id = p_room_id and l.user_id = w.peer limit 1) lt on true
    left join room_members rm on rm.room_id = p_room_id and rm.user_id = w.peer
   where w.last_id > w.cleared_id
   order by w.last_id desc;
end;
$$;
revoke execute on function public.list_dm_conversations(uuid) from public, anon;
grant execute on function public.list_dm_conversations(uuid) to authenticated;

-- 9. 새 대화 상대 후보 — 같은 방의 사람 참가자(나·AI 제외) ------------------------------
create or replace function public.list_dm_candidates(p_room_id uuid)
returns table (user_id uuid, nickname text, team_id text, team_abbr text, team_name text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from room_members rm where rm.room_id = p_room_id and rm.user_id = v_uid) then
    raise exception 'not_a_member';
  end if;
  return query
  select rm.user_id,
         coalesce(nullif(btrim(p.nickname), ''), '이름 없음'),
         coalesce(lt.team_slug, rm.team_id), coalesce(lt.team_abbr, rm.team_abbr), coalesce(lt.team_name, rm.team_name)
    from room_members rm
    left join profiles p on p.id = rm.user_id
    left join lateral (select l.team_slug, l.team_abbr, l.team_name from league_teams l
                        where l.room_id = p_room_id and l.user_id = rm.user_id limit 1) lt on true
   where rm.room_id = p_room_id and rm.user_id <> v_uid and not coalesce(rm.is_ai, false)
   order by 2;
end;
$$;
revoke execute on function public.list_dm_candidates(uuid) from public, anon;
grant execute on function public.list_dm_candidates(uuid) to authenticated;

-- 10. 읽음 처리 / 대화 삭제(나에게서만) ------------------------------------------------
create or replace function public.mark_dm_read(p_room_id uuid, p_conv_key text, p_last_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.dm_conv_has(p_conv_key, v_uid) then raise exception 'invalid_conversation'; end if;
  insert into league_dm_state (room_id, user_id, conv_key, last_read_id)
  values (p_room_id, v_uid, p_conv_key, greatest(coalesce(p_last_id, 0), 0))
  on conflict (room_id, user_id, conv_key)
  do update set last_read_id = greatest(league_dm_state.last_read_id, excluded.last_read_id), updated_at = now();
end;
$$;
revoke execute on function public.mark_dm_read(uuid, text, bigint) from public, anon;
grant execute on function public.mark_dm_read(uuid, text, bigint) to authenticated;

create or replace function public.clear_dm_conversation(p_room_id uuid, p_conv_key text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_last bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.dm_conv_has(p_conv_key, v_uid) then raise exception 'invalid_conversation'; end if;
  select coalesce(max(id), 0) into v_last from league_chat_messages where room_id = p_room_id and conv_key = p_conv_key;
  insert into league_dm_state (room_id, user_id, conv_key, last_read_id, cleared_before_id)
  values (p_room_id, v_uid, p_conv_key, v_last, v_last)
  on conflict (room_id, user_id, conv_key)
  do update set last_read_id      = greatest(league_dm_state.last_read_id, excluded.last_read_id),
                cleared_before_id = greatest(league_dm_state.cleared_before_id, excluded.cleared_before_id),
                updated_at        = now();
end;
$$;
revoke execute on function public.clear_dm_conversation(uuid, text) from public, anon;
grant execute on function public.clear_dm_conversation(uuid, text) to authenticated;

-- 11. 메시지 신고 — 메시지당 1회, 사유 다중 선택, 처리는 없음(기록만) ---------------------------
create or replace function public.report_chat_message(p_message_id bigint, p_reasons text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_msg     public.league_chat_messages;
  v_reasons text[];
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_msg from league_chat_messages where id = p_message_id;
  if not found then raise exception 'not_found'; end if;
  if not exists (select 1 from room_members rm where rm.room_id = v_msg.room_id and rm.user_id = v_uid) then
    raise exception 'not_a_member';
  end if;
  -- DM은 당사자만 신고 가능(존재 여부도 숨김)
  if v_msg.recipient_id is not null and v_uid <> v_msg.user_id and v_uid <> v_msg.recipient_id then
    raise exception 'not_found';
  end if;
  if v_msg.user_id = v_uid then raise exception 'own_message'; end if;

  v_reasons := array(select distinct r from unnest(coalesce(p_reasons, '{}'::text[])) r order by r);
  if cardinality(v_reasons) = 0
     or not (v_reasons <@ array['abuse','spam','gambling','promotion','money_request','obscene','other']::text[]) then
    raise exception 'invalid_reasons';
  end if;

  insert into league_chat_reports (message_id, room_id, reporter_id, reasons)
  values (p_message_id, v_msg.room_id, v_uid, v_reasons)
  on conflict (message_id) do nothing;
  if not found then raise exception 'already_reported'; end if;

  update league_chat_messages set reported = true where id = p_message_id;
end;
$$;
revoke execute on function public.report_chat_message(bigint, text[]) from public, anon;
grant execute on function public.report_chat_message(bigint, text[]) to authenticated;

revoke execute on function public.dm_conv_key(uuid, uuid) from public, anon;
grant execute on function public.dm_conv_key(uuid, uuid) to authenticated;
revoke execute on function public.dm_conv_has(text, uuid) from public, anon;
grant execute on function public.dm_conv_has(text, uuid) to authenticated;

-- ============================================================
-- 롤백 (역순):
--   drop function public.report_chat_message(bigint, text[]);
--   drop function public.clear_dm_conversation(uuid, text);
--   drop function public.mark_dm_read(uuid, text, bigint);
--   drop function public.list_dm_candidates(uuid);
--   drop function public.list_dm_conversations(uuid);
--   send_chat_message: migrations/league_chat_messages.sql 의 정의로 재생성(p_recipient_id면 dm_not_supported)
--   is_chat_topic_member: 'league-chat:' 조건만 남긴 정의로 재생성(league_chat_messages.sql)
--   drop policy lcr_admin_select on public.league_chat_reports; drop table public.league_chat_reports;
--   drop function public.is_room_owner(uuid);
--   drop table public.league_dm_state;
--   drop function public.dm_conv_has(text, uuid); drop function public.dm_conv_key(uuid, uuid);
--   drop policy lcm_member_select on public.league_chat_messages;
--   create policy lcm_member_select on public.league_chat_messages for select to authenticated
--     using (public.is_chat_member(room_id) or public.is_global_admin());
--   drop index public.league_chat_messages_conv_idx;
--   alter table public.league_chat_messages drop constraint lcm_dm_shape;
--   alter table public.league_chat_messages drop column reported;
-- ============================================================
