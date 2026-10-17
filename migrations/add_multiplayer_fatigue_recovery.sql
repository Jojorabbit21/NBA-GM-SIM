-- ============================================================
-- 멀티플레이어 경기 간 체력 회복 — 구조 추가 (docs/plan/multiplayer-fatigue.md 3-1, 7장 5단계)
--
-- 순수 추가(additive) 마이그레이션 — 구버전 서버는 새 칼럼을 모르고 기존 칼럼만 upsert하므로
-- 배포 전에 먼저 적용해도 동작이 바뀌지 않는다. 체력 리셋(D1)은 별도 파일
-- reset_multiplayer_fatigue_condition.sql로 배포 시점에 실행한다.
--
-- room_player_state
--   condition_recovered_through — 이 condition에 가상 자정 회복이 반영된 마지막 날짜.
--                                 경기 종료 기록 시 game_date − 1 (그날 자정 회복은 아직 전)
--   last_game_date              — 마지막으로 실제 출전(mp > 0)한 가상 날짜 ("그날 뛰었나" 판정)
-- rooms
--   fatigue_recovered_through   — 스케줄러 자정 처리 완료 지점 (효율용, 정합성은 행 단위 칼럼이 보장)
--
-- apply_fatigue_recovery(p_room_id, p_rows) — 회복 결과 조건부 반영 (server/src/fatigueRecovery.ts)
--   읽었을 때의 condition/condition_recovered_through가 그대로인 행만 갱신하고 갱신 행 수를 돌려준다.
--   그 사이 경기 종료 기록(simRunner upsert)이 끼어들면 그 행은 건너뛰어 경기 결과를 덮어쓰지 않는다.
--   PostgREST 일괄 upsert는 행별 조건을 걸 수 없어 RPC로 둔다. service_role 전용.
-- ============================================================

ALTER TABLE public.room_player_state
    ADD COLUMN IF NOT EXISTS condition_recovered_through date,
    ADD COLUMN IF NOT EXISTS last_game_date date;

ALTER TABLE public.rooms
    ADD COLUMN IF NOT EXISTS fatigue_recovered_through date;

CREATE OR REPLACE FUNCTION public.apply_fatigue_recovery(p_room_id uuid, p_rows jsonb)
RETURNS integer
LANGUAGE sql
SET search_path TO 'public'
AS $function$
    WITH r AS (
        SELECT x.player_id, x.condition, x.recovered_through, x.expected_condition, x.expected_recovered_through
          FROM jsonb_to_recordset(p_rows) AS x(
              player_id text,
              condition numeric,
              recovered_through date,
              expected_condition numeric,
              expected_recovered_through date
          )
    ), u AS (
        UPDATE public.room_player_state s
           SET condition = r.condition,
               condition_recovered_through = r.recovered_through
          FROM r
         WHERE s.room_id = p_room_id
           AND s.player_id = r.player_id
           AND s.condition IS NOT DISTINCT FROM r.expected_condition
           AND s.condition_recovered_through IS NOT DISTINCT FROM r.expected_recovered_through
        RETURNING 1
    )
    SELECT count(*)::integer FROM u;
$function$;

-- Supabase 기본 권한은 새 함수에 anon/authenticated 실행권을 준다 — 서버(service_role) 전용으로 제한
REVOKE EXECUTE ON FUNCTION public.apply_fatigue_recovery(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_fatigue_recovery(uuid, jsonb) TO service_role;
