-- ============================================================
-- player_shot_events_rpc.sql — 선수별 개별 슛 좌표를 서버에서 걸러서 반환하는 RPC
--
-- 배경: 선수 프로필 "샷 차트" 탭에서 한 선수의 슛 이벤트(x/y 좌표)만 필요한데,
-- game_pbp.shot_events는 경기당 JSONB 배열이라 클라이언트에서 room 전체 게임을
-- 불러와 필터링하면(RAW_PBP_COLS에 shot_events 추가) 시즌 전체 슛 데이터를 통째로
-- 전송하게 됨 — DIVISION 2 방(1,329경기) 기준 실측 약 80MB, 서버측 조회만 13초.
-- 이 함수는 Postgres 안에서 jsonb_array_elements로 unnest한 뒤 player_id로 걸러
-- 결과(선수 1명분, 보통 수백 건)만 클라이언트로 보낸다.
--
-- isFinal 게이팅(리빌 로직, views/multi/season/multiGameReveal.ts의 REPLAY_DURATION_MS
-- =10분)도 이 함수 안에서 동일하게 적용 — game_start_time + 10분이 지나지 않은
-- (아직 "방송 전"인) 경기의 슛은 반환하지 않는다.
--
-- [적용 완료] 2026-08-28 Supabase MCP로 실제 DB에 반영 완료(apply_migration).
-- search_path는 get_advisors의 function_search_path_mutable 권고에 따라
-- SET search_path = public으로 고정(search_path 인젝션 방지).
-- ============================================================

create or replace function get_player_shot_events(p_room_id uuid, p_player_id text)
returns setof jsonb
language sql
stable
set search_path = public
as $$
  select elem
  from game_pbp gp,
       jsonb_array_elements(gp.shot_events) as elem
  where gp.room_id = p_room_id
    and gp.shot_events is not null
    and gp.game_start_time is not null
    and gp.game_start_time + interval '10 minutes' <= now()
    and elem->>'playerId' = p_player_id;
$$;

grant execute on function get_player_shot_events(uuid, text) to anon, authenticated;
