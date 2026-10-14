-- [2026-10-13] "부분 저장" 제거 — 한 번의 저장이 여러 독립 요청으로 나가던 두 곳을 RPC 하나(=트랜잭션 하나)로 묶는다.
-- 함수 안에서 RAISE가 나면 앞선 변경이 전부 롤백되므로 "전부 성공 아니면 전부 실패"만 남는다.
-- 둘 다 SECURITY INVOKER — 기존에 클라이언트가 직접 하던 테이블 쓰기와 같은 RLS로 동작(권한 모델 변경 없음).
-- 배경: docs/plan/ui-inline-notice.md 6장 ⑥·⑦, dev-log 2026-10-13.

-- ───────────────────────────────────────────────────────────────────────────────
-- 1) 트레이드 블록 일괄 저장: 선수별 upsert/delete + 팀 위시리스트 update를 한 트랜잭션에서
--    (예전: MyTradeBlockModal이 선수당 1요청 + 위시리스트 1요청을 Promise.all로 보내고 firstError만 봄)
-- ───────────────────────────────────────────────────────────────────────────────
create or replace function public.set_trade_block_batch(
    p_room_id    uuid,
    p_team_id    uuid,
    p_add        text[],
    p_remove     text[],
    p_note       text,
    p_positions  text[],
    p_player_ids text[],
    p_archetypes text[]
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
    -- 팀 존재를 먼저 확인 — FK 위반 대신 도메인 코드(team_not_found)로
    if not exists (select 1 from public.league_teams where id = p_team_id and room_id = p_room_id) then
        raise exception 'team_not_found';
    end if;

    if coalesce(array_length(p_add, 1), 0) > 0 then
        insert into public.league_trade_blocks (room_id, team_id, player_id)
        select p_room_id, p_team_id, unnest(p_add)
        on conflict (team_id, player_id) do nothing;
    end if;

    if coalesce(array_length(p_remove, 1), 0) > 0 then
        delete from public.league_trade_blocks
        where team_id = p_team_id and player_id = any(p_remove);
    end if;

    update public.league_teams
       set trade_request_note       = nullif(btrim(coalesce(p_note, '')), ''),
           trade_request_positions  = coalesce(p_positions,  '{}'),
           trade_request_player_ids = coalesce(p_player_ids, '{}'),
           trade_request_archetypes = coalesce(p_archetypes, '{}')
     where id = p_team_id and room_id = p_room_id;
    if not found then
        raise exception 'team_not_found';
    end if;
end;
$$;

grant execute on function public.set_trade_block_batch(uuid, uuid, text[], text[], text, text[], text[], text[]) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────────
-- 2) 리그 설정 일괄 저장: leagues 컬럼 갱신 + rooms.max_players/sim_settings + league_teams 증감을 한 트랜잭션에서
--    (예전: leagues UPDATE 성공 후 rooms/league_teams가 실패하면 앞부분만 반영된 채 "저장 실패")
--    - p_payload: {컬럼명: 값} — 키마다 information_schema로 leagues 컬럼 존재/타입을 확인하고 %I/%L로 인용해 동적 UPDATE
--    - 가상 팀 채우기(VIRTUAL_TEAMS)는 클라이언트가 계산해 p_teams_to_insert(jsonb 배열)로 넘기고, 서버는 삽입/삭제 + 최종 정원 검증만
-- ───────────────────────────────────────────────────────────────────────────────
create or replace function public.update_league_settings_atomic(
    p_league_id          uuid,
    p_payload            jsonb,
    p_room_id            uuid    default null,
    p_max_teams          integer default null,
    p_sim_settings       jsonb   default null,
    p_teams_to_insert    jsonb   default null,
    p_team_ids_to_delete uuid[]  default null
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
    k        text;
    t        text;
    v        jsonb;
    sets     text[] := '{}';
    n_rows   integer;
    n_teams  integer;
begin
    -- 1) leagues
    for k in select jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) loop
        if k in ('id', 'created_at', 'admin_user_id', 'status') then
            raise exception 'protected_column:%', k;
        end if;
        select case when udt_name like '\_%' then substr(udt_name, 2) || '[]' else udt_name end
          into t
          from information_schema.columns
         where table_schema = 'public' and table_name = 'leagues' and column_name = k;
        if t is null then
            raise exception 'unknown_column:%', k;
        end if;
        v := p_payload -> k;
        if v is null or jsonb_typeof(v) = 'null' then
            sets := sets || format('%I = NULL', k);
        elsif t like '%[]' and jsonb_typeof(v) = 'array' then
            sets := sets || format('%I = %L::%s', k, (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(v) x)::text, t);
        elsif jsonb_typeof(v) in ('object', 'array') then
            sets := sets || format('%I = %L::%s', k, v::text, t);
        else
            sets := sets || format('%I = %L::%s', k, v #>> '{}', t);
        end if;
    end loop;

    if coalesce(array_length(sets, 1), 0) > 0 then
        execute format('update public.leagues set %s where id = $1', array_to_string(sets, ', ')) using p_league_id;
        -- EXECUTE 뒤에는 FOUND가 갱신되지 않으므로 ROW_COUNT로 판정
        get diagnostics n_rows = row_count;
        if n_rows = 0 then
            raise exception 'league_not_found';
        end if;
    end if;

    -- 2) rooms
    if p_room_id is not null and p_max_teams is not null then
        update public.rooms set max_players = p_max_teams where id = p_room_id;
        if not found then raise exception 'room_not_found'; end if;
    end if;
    if p_room_id is not null and p_sim_settings is not null then
        update public.rooms set sim_settings = p_sim_settings where id = p_room_id;
        if not found then raise exception 'room_not_found'; end if;
    end if;

    -- 3) league_teams 증감 (선점된 팀은 절대 삭제하지 않음)
    if p_room_id is not null and coalesce(array_length(p_team_ids_to_delete, 1), 0) > 0 then
        if exists (select 1 from public.league_teams where room_id = p_room_id and id = any(p_team_ids_to_delete) and user_id is not null) then
            raise exception 'cannot_remove_claimed_team';
        end if;
        delete from public.league_teams where room_id = p_room_id and id = any(p_team_ids_to_delete);
    end if;
    if p_room_id is not null and p_teams_to_insert is not null and jsonb_array_length(p_teams_to_insert) > 0 then
        insert into public.league_teams
            (room_id, team_slug, team_name, team_abbr, color_primary, color_secondary, color_tertiary, color_text,
             court_background, court_paint, court_line, conference)
        select p_room_id, x.team_slug, x.team_name, x.team_abbr, x.color_primary, x.color_secondary, x.color_tertiary, x.color_text,
               x.court_background, x.court_paint, x.court_line, x.conference
          from jsonb_to_recordset(p_teams_to_insert) as x(
               team_slug text, team_name text, team_abbr text, color_primary text, color_secondary text,
               color_tertiary text, color_text text, court_background text, court_paint text, court_line text, conference text);
    end if;

    -- 4) 최종 정원 검증 — 어긋나면 전부 롤백
    if p_room_id is not null and p_max_teams is not null then
        select count(*) into n_teams from public.league_teams where room_id = p_room_id;
        if n_teams <> p_max_teams then
            raise exception 'team_count_mismatch:% vs %', n_teams, p_max_teams;
        end if;
    end if;
end;
$$;

grant execute on function public.update_league_settings_atomic(uuid, jsonb, uuid, integer, jsonb, jsonb, uuid[]) to authenticated;
