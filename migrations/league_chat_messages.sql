-- ============================================================
-- league_chat_messages + send_chat_message RPC + Realtime Authorization
--
-- 계획: docs/plan/league-chat-plan.md (리그 세션 채팅, 우측 하단 FAB → 위젯)
-- 적용: 2026-10-17, Supabase MCP apply_migration 2건 + 2026-10-18 보안 점검 반영 1건(league_chat_sanitize_body_and_serialize_send)
--   (1) league_chat_messages_and_send_rpc  (2) league_chat_send_rpc_team_from_league_teams  (3) league_chat_sanitize_body_and_serialize_send
--   이 파일은 두 건을 합친 "최종 상태"다. 새 DB에 재적용할 때 이 파일 하나만 실행하면 된다.
--
-- 구조:
--   - 저장: league_chat_messages. 쓰기는 RPC send_chat_message 단일 경로(직접 INSERT 권한 없음).
--   - 실시간: 비공개 Broadcast 채널 'league-chat:{room_id}' — RPC 안의 realtime.send()가 내보냄.
--   - 권한: realtime.messages RLS — 멤버만 수신, 클라이언트는 presence 발행만 가능(broadcast 발행 불가 = 위조 방지).
--   - recipient_id / conv_key 는 훗날 DM 확장용 예약 컬럼(현재는 항상 null, RPC가 recipient 지정을 거부).
--   - 레이트 리밋: 유저당 10초 구간 10건 초과 시 'rate_limited' (detail = 남은 초).
-- ============================================================

create table public.league_chat_messages (
  id           bigint generated always as identity primary key,
  room_id      uuid not null references public.rooms(id) on delete cascade,
  user_id      uuid not null,
  team_id      text,
  team_abbr    text,
  team_name    text,
  author       text not null,
  body         text not null check (char_length(body) between 1 and 500),
  recipient_id uuid,
  conv_key     text,
  created_at   timestamptz not null default now()
);

create index league_chat_messages_room_idx on public.league_chat_messages (room_id, id desc);
create index league_chat_messages_rate_idx on public.league_chat_messages (room_id, user_id, created_at desc);

alter table public.league_chat_messages enable row level security;
revoke all on table public.league_chat_messages from anon, authenticated;
grant select on table public.league_chat_messages to authenticated;

-- 엄격한 멤버십 판정. accessible_room_ids()는 recruiting/drafting 방까지 전원에게 열어 주므로 채팅엔 쓰지 않는다.
create or replace function public.is_chat_member(p_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from room_members rm where rm.room_id = p_room_id and rm.user_id = auth.uid())
$$;

create or replace function public.is_chat_topic_member(p_topic text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from room_members rm
    where rm.user_id = auth.uid() and p_topic = 'league-chat:' || rm.room_id::text
  )
$$;

revoke execute on function public.is_chat_member(uuid) from public, anon;
revoke execute on function public.is_chat_topic_member(text) from public, anon;
grant execute on function public.is_chat_member(uuid) to authenticated;
grant execute on function public.is_chat_topic_member(text) to authenticated;

create policy lcm_member_select on public.league_chat_messages
  for select to authenticated
  using (public.is_chat_member(room_id) or public.is_global_admin());

-- [2026-10-18 보안 점검 반영] 본문 정리: 보이지 않는 문자·텍스트 방향 제어 문자 제거, CRLF 정규화, 줄바꿈 연속은 하나로,
-- 앞뒤 공백·줄바꿈 제거, **줄바꿈은 최대 1번**(두 번째부터는 공백 → 최대 2줄). 클라이언트 미러: services/multi/chatService.ts sanitizeChatBody
create or replace function public.sanitize_chat_body(p_body text)
returns text
language sql
immutable
set search_path = public
as $$
  with s as (
    select btrim(
      regexp_replace(
        regexp_replace(
          replace(replace(coalesce(p_body, ''), E'\r\n', E'\n'), E'\r', E'\n'),
          '[\u0001-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]', '', 'g'),
        '\s*\n\s*', E'\n', 'g'),
      E' \n\t') as t
  )
  select case
           when position(E'\n' in t) > 0
             then substr(t, 1, position(E'\n' in t)) || replace(substr(t, position(E'\n' in t) + 1), E'\n', ' ')
           else t
         end
  from s
$$;

revoke execute on function public.sanitize_chat_body(text) from public, anon;
grant execute on function public.sanitize_chat_body(text) to authenticated;

-- room_members.team_name/team_abbr 는 실데이터에서 null이다. 실제 팀 표시(방 안에서 바꾼 팀명 포함)는 league_teams.
-- [2026-10-18] 본문 정리를 길이 검사 앞에 적용, 같은 (유저, 방)의 동시 전송을 advisory lock으로 직렬화(세고-저장하기 경합 방지)
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
  v_row       public.league_chat_messages;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_recipient_id is not null then raise exception 'dm_not_supported'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 500 then raise exception 'invalid_body'; end if;

  select rm.team_id into v_team_id from room_members rm where rm.room_id = p_room_id and rm.user_id = v_uid;
  if not found then raise exception 'not_a_member'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_room_id::text, 0));

  select lt.team_slug, lt.team_abbr, lt.team_name into v_team_id, v_team_abbr, v_team_name
    from league_teams lt where lt.room_id = p_room_id and lt.user_id = v_uid limit 1;
  if not found then
    select rm.team_id, rm.team_abbr, rm.team_name into v_team_id, v_team_abbr, v_team_name
      from room_members rm where rm.room_id = p_room_id and rm.user_id = v_uid;
  end if;

  select count(*), min(created_at) into v_recent, v_oldest
    from league_chat_messages
   where room_id = p_room_id and user_id = v_uid and created_at > now() - interval '10 seconds';
  if v_recent >= 10 then
    v_wait := greatest(1, ceil(extract(epoch from (v_oldest + interval '10 seconds' - now())))::int);
    raise exception 'rate_limited' using detail = v_wait::text;
  end if;

  select coalesce(nullif(btrim(nickname), ''), '이름 없음') into v_author from profiles where id = v_uid;
  v_author := coalesce(v_author, '이름 없음');

  insert into league_chat_messages (room_id, user_id, team_id, team_abbr, team_name, author, body)
  values (p_room_id, v_uid, v_team_id, v_team_abbr, v_team_name, v_author, v_body)
  returning * into v_row;

  -- 브로드캐스트 실패가 전송 자체를 실패시키면 안 된다(메시지는 이미 저장됨, 클라이언트는 재연결 시 재조회).
  begin
    perform realtime.send(
      jsonb_build_object(
        'id', v_row.id, 'room_id', v_row.room_id, 'user_id', v_row.user_id,
        'team_id', v_row.team_id, 'team_abbr', v_row.team_abbr, 'team_name', v_row.team_name,
        'author', v_row.author, 'body', v_row.body, 'created_at', v_row.created_at
      ),
      'message',
      'league-chat:' || p_room_id::text,
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

-- Realtime Authorization (비공개 채널 'league-chat:{room_id}')
create policy league_chat_receive on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.is_chat_topic_member((select realtime.topic()))
  );

create policy league_chat_presence_track on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and public.is_chat_topic_member((select realtime.topic()))
  );

-- ============================================================
-- 롤백 (역순):
--   drop policy league_chat_presence_track on realtime.messages;
--   drop policy league_chat_receive on realtime.messages;
--   drop function public.send_chat_message(uuid, text, uuid);
--   drop function public.sanitize_chat_body(text);
--   drop table public.league_chat_messages;   -- 정책·인덱스 함께 삭제됨
--   drop function public.is_chat_topic_member(text);
--   drop function public.is_chat_member(uuid);
-- ============================================================
