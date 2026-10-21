-- ============================================================
-- 리그 채팅 검수(세션 설정 "채팅 검수" 탭) — 신고 내역 + 메시지 검색 + 앞뒤 보기
--
-- 계획: docs/plan/league-chat-plan.md "DM 2차 확정안" 3-b / 3-e
-- 선행: migrations/league_chat_messages.sql, migrations/league_chat_dm.sql
-- 적용: 2026-10-21, Supabase MCP apply_migration `league_chat_review_rpcs` + `league_chat_review_search_pagination`
--   (두 번째에서 search_chat_messages를 id 커서 → offset 페이지네이션 + total_count로 교체. 이 파일은 최종 상태)
--
-- 열람 범위:
--   - 호출자: 전역 어드민 또는 세션 오너(leagues.admin_user_id). 그 밖은 'forbidden'.
--   - 전체 채팅(퍼블릭): 둘 다 전부.
--   - DM: 전역 어드민은 전부, 세션 오너는 "신고가 1건 이상 접수된 대화(conv_key)"만 — 오너가 참가자이기도 해서
--     남의 협상 DM을 열람하는 이해충돌을 막는다.
-- 검색은 body ILIKE(부분 일치). 방당 메시지 수가 수만 건 수준이라 인덱스 없이 room_id 범위 스캔으로 충분(커지면 pg_trgm 검토).
-- ============================================================

create or replace function public.can_review_chat(p_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_global_admin() or public.is_room_owner(p_room_id)
$$;
revoke execute on function public.can_review_chat(uuid) from public, anon;
grant execute on function public.can_review_chat(uuid) to authenticated;

-- 방 안에서의 표시용 팀 이름(league_teams 우선, 없으면 room_members)
create or replace function public.chat_team_label(p_room_id uuid, p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select l.team_name from league_teams l where l.room_id = p_room_id and l.user_id = p_user_id limit 1),
    (select rm.team_name from room_members rm where rm.room_id = p_room_id and rm.user_id = p_user_id)
  )
$$;
revoke execute on function public.chat_team_label(uuid, uuid) from public, anon;
grant execute on function public.chat_team_label(uuid, uuid) to authenticated;

-- 1. 신고 내역(최신순, id 커서) ------------------------------------------------------
create or replace function public.list_chat_reports(p_room_id uuid, p_before_id bigint default null, p_limit int default 50)
returns table (
  report_id bigint, reported_at timestamptz, reasons text[],
  reporter_id uuid, reporter_name text, reporter_team text,
  message_id bigint, message_at timestamptz, body text,
  author_id uuid, author_name text, author_team text,
  recipient_id uuid, recipient_name text, recipient_team text, conv_key text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_review_chat(p_room_id) then raise exception 'forbidden'; end if;
  return query
  select r.id, r.created_at, r.reasons,
         r.reporter_id, coalesce(nullif(btrim(rp.nickname), ''), '이름 없음'), public.chat_team_label(p_room_id, r.reporter_id),
         m.id, m.created_at, m.body,
         m.user_id, m.author, m.team_name,
         m.recipient_id,
         case when m.recipient_id is null then null else coalesce(nullif(btrim(pp.nickname), ''), '이름 없음') end,
         case when m.recipient_id is null then null else public.chat_team_label(p_room_id, m.recipient_id) end,
         m.conv_key
    from league_chat_reports r
    join league_chat_messages m on m.id = r.message_id
    left join profiles rp on rp.id = r.reporter_id
    left join profiles pp on pp.id = m.recipient_id
   where r.room_id = p_room_id
     and (p_before_id is null or r.id < p_before_id)
   order by r.id desc
   limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;
revoke execute on function public.list_chat_reports(uuid, bigint, int) from public, anon;
grant execute on function public.list_chat_reports(uuid, bigint, int) to authenticated;

-- 2. 메시지 검색 / 앞뒤 보기 ---------------------------------------------------------
-- p_around_id가 있으면 그 메시지와 같은 채널(퍼블릭 또는 같은 DM 대화)에서 앞 30건 + 뒤 30건(다른 필터 무시).
-- 없으면 필터 검색: p_channel 'all'|'public'|'dm', p_query 부분 일치, p_user_id(보낸 사람 또는 받는 사람), p_conv_key,
-- 최신순 limit/offset 페이지. total_count = 필터에 맞는 전체 건수(count(*) over(), 모든 행에 같은 값).
create or replace function public.search_chat_messages(
  p_room_id uuid,
  p_query text default null,
  p_channel text default 'all',
  p_user_id uuid default null,
  p_conv_key text default null,
  p_around_id bigint default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id bigint, created_at timestamptz, body text,
  author_id uuid, author_name text, author_team text,
  recipient_id uuid, recipient_name text, recipient_team text,
  conv_key text, reported boolean, total_count bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_admin   boolean;
  v_q       text := nullif(btrim(coalesce(p_query, '')), '');
  v_pattern text;
  v_conv    text;
  v_found   boolean;
  v_limit   int := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset  int := greatest(coalesce(p_offset, 0), 0);
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_review_chat(p_room_id) then raise exception 'forbidden'; end if;
  v_admin := public.is_global_admin();

  if p_around_id is not null then
    select m.conv_key, true into v_conv, v_found from league_chat_messages m where m.id = p_around_id and m.room_id = p_room_id;
    if not coalesce(v_found, false) then raise exception 'not_found'; end if;
    -- 세션 오너는 신고된 DM 대화만
    if v_conv is not null and not v_admin and not exists (
      select 1 from league_chat_reports r join league_chat_messages m2 on m2.id = r.message_id
       where r.room_id = p_room_id and m2.conv_key = v_conv
    ) then
      raise exception 'not_found';
    end if;
    return query
    select x.id, x.created_at, x.body, x.user_id, x.author, x.team_name, x.recipient_id,
           case when x.recipient_id is null then null else coalesce(nullif(btrim(pp.nickname), ''), '이름 없음') end,
           case when x.recipient_id is null then null else public.chat_team_label(p_room_id, x.recipient_id) end,
           x.conv_key, x.reported, count(*) over ()
      from (
        (select m.* from league_chat_messages m
          where m.room_id = p_room_id and m.conv_key is not distinct from v_conv and m.id <= p_around_id
          order by m.id desc limit 31)
        union all
        (select m.* from league_chat_messages m
          where m.room_id = p_room_id and m.conv_key is not distinct from v_conv and m.id > p_around_id
          order by m.id asc limit 30)
      ) x
      left join profiles pp on pp.id = x.recipient_id
     order by x.id asc;
    return;
  end if;

  if v_q is not null then
    -- LIKE 특수문자(\ % _)를 글자 그대로 찾도록 이스케이프(기본 ESCAPE 문자 = 역슬래시)
    v_pattern := '%' || replace(replace(replace(v_q, chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%';
  end if;

  return query
  select m.id, m.created_at, m.body, m.user_id, m.author, m.team_name, m.recipient_id,
         case when m.recipient_id is null then null else coalesce(nullif(btrim(pp.nickname), ''), '이름 없음') end,
         case when m.recipient_id is null then null else public.chat_team_label(p_room_id, m.recipient_id) end,
         m.conv_key, m.reported, count(*) over ()
    from league_chat_messages m
    left join profiles pp on pp.id = m.recipient_id
   where m.room_id = p_room_id
     and (case coalesce(p_channel, 'all')
            when 'public' then m.recipient_id is null
            when 'dm'     then m.recipient_id is not null
            else true end)
     and (m.recipient_id is null or v_admin or m.conv_key in (
            select m2.conv_key from league_chat_reports r join league_chat_messages m2 on m2.id = r.message_id
             where r.room_id = p_room_id and m2.conv_key is not null))
     and (v_pattern is null or m.body ilike v_pattern)
     and (p_user_id is null or m.user_id = p_user_id or m.recipient_id = p_user_id)
     and (p_conv_key is null or m.conv_key = p_conv_key)
   order by m.id desc
   limit v_limit offset v_offset;
end;
$$;
revoke execute on function public.search_chat_messages(uuid, text, text, uuid, text, bigint, int, int) from public, anon;
grant execute on function public.search_chat_messages(uuid, text, text, uuid, text, bigint, int, int) to authenticated;

-- ============================================================
-- 롤백:
--   drop function public.search_chat_messages(uuid, text, text, uuid, text, bigint, int, int);
--   drop function public.list_chat_reports(uuid, bigint, int);
--   drop function public.chat_team_label(uuid, uuid);
--   drop function public.can_review_chat(uuid);
-- ============================================================
