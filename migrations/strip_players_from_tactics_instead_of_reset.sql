-- [2026-10-16] 트레이드 성사 / 방출 시 전술 전체 초기화(tactics/depth_chart = NULL) 대신,
-- "나간 선수의 ID만" 전술 데이터에서 제거한다. 슬라이더와 다른 선수의 설정은 보존.
--   - 들어오는 선수는 전술 데이터에 아무것도 추가하지 않는다(로스터에만 존재, 미배치/0분).
--   - 빈 슬롯/시간대는 엔진 폴백(initializer.ts 선발 보정, rotationLogic.ts 분당 5명 보정)이 OVR순으로 채운다.
--   - sign_free_agent는 원래 초기화가 없었으므로 변경 없음(영입 선수는 미배치 상태로 로스터에만 추가).
--
-- 되돌리는 법: respond_trade_offer / release_player의 strip 호출 UPDATE를 각각 원래의
--   UPDATE room_members SET tactics = NULL, depth_chart = NULL
--   WHERE room_id = v_o.room_id AND team_id IN (v_a.team_slug, v_b.team_slug);     -- respond_trade_offer
--   UPDATE room_members SET tactics = NULL, depth_chart = NULL
--   WHERE room_id = v_team.room_id AND team_id = v_team.team_slug;                 -- release_player
-- 로 복원. 헬퍼 함수 2개는 남겨둬도 무해(DROP FUNCTION으로 제거 가능).

-- 1) 뎁스차트 jsonb({PG:[id|null x3], ...})에서 해당 선수 슬롯만 null로 — 인덱스(주전/벤치 순번) 보존
CREATE OR REPLACE FUNCTION public.strip_players_from_depth_chart(d jsonb, ids text[])
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $fn$
    SELECT CASE
        WHEN d IS NULL OR jsonb_typeof(d) <> 'object' THEN d
        ELSE (
            SELECT coalesce(jsonb_object_agg(t.k,
                CASE WHEN jsonb_typeof(t.v) = 'array' THEN (
                    SELECT coalesce(jsonb_agg(
                        CASE WHEN jsonb_typeof(x.e) = 'string' AND (x.e #>> '{}') = ANY(ids)
                             THEN 'null'::jsonb ELSE x.e END
                        ORDER BY x.ord), '[]'::jsonb)
                    FROM jsonb_array_elements(t.v) WITH ORDINALITY AS x(e, ord)
                ) ELSE t.v END
            ), '{}'::jsonb)
            FROM jsonb_each(d) AS t(k, v)
        )
    END
$fn$;

-- 2) GameTactics jsonb에서 해당 선수 ID 제거. sliders 등 선수 ID와 무관한 필드는 그대로.
--    starters: 해당 포지션을 ''로 / rotationMap·minutesLimits·playerTactics: 키 삭제 /
--    stopperId: 해당 선수면 키 삭제 / depthChart(전술 내부 사본): 위 함수로 null 처리
CREATE OR REPLACE FUNCTION public.strip_players_from_tactics(t jsonb, ids text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $fn$
DECLARE
    r jsonb := t;
    k text;
BEGIN
    IF r IS NULL OR jsonb_typeof(r) <> 'object' THEN
        RETURN r;
    END IF;

    IF jsonb_typeof(r->'starters') = 'object' THEN
        r := jsonb_set(r, '{starters}', (
            SELECT coalesce(jsonb_object_agg(s.k, to_jsonb(CASE WHEN s.v = ANY(ids) THEN '' ELSE s.v END)), '{}'::jsonb)
            FROM jsonb_each_text(r->'starters') AS s(k, v)
        ));
    END IF;

    FOREACH k IN ARRAY ARRAY['rotationMap', 'minutesLimits', 'playerTactics'] LOOP
        IF jsonb_typeof(r->k) = 'object' THEN
            r := jsonb_set(r, ARRAY[k], (r->k) - ids);
        END IF;
    END LOOP;

    IF (r->>'stopperId') = ANY(ids) THEN
        r := r - 'stopperId';
    END IF;

    IF r ? 'depthChart' THEN
        r := jsonb_set(r, '{depthChart}', public.strip_players_from_depth_chart(r->'depthChart', ids));
    END IF;

    RETURN r;
END;
$fn$;

-- 순수 함수라 해롭진 않지만 API로 노출할 이유가 없으므로 외부 실행 권한 회수
-- (SECURITY DEFINER RPC가 소유자 권한으로 호출)
REVOKE ALL ON FUNCTION public.strip_players_from_depth_chart(jsonb, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.strip_players_from_tactics(jsonb, text[]) FROM PUBLIC, anon, authenticated;

-- 3) respond_trade_offer / release_player — 현재 라이브 정의에서 초기화 UPDATE만 치환
DO $mig$
DECLARE
    v_def text;
    v_new text;
BEGIN
    -- respond_trade_offer: 팀 A는 v_out(내보내는 선수), 팀 B는 v_in(내보내는 선수)만 제거
    SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
    WHERE p.proname = 'respond_trade_offer' AND p.pronamespace = 'public'::regnamespace;
    v_new := replace(v_def,
$old$        UPDATE room_members SET tactics = NULL, depth_chart = NULL
        WHERE room_id = v_o.room_id
          AND team_id IN (v_a.team_slug, v_b.team_slug);
$old$,
$new$        UPDATE room_members SET
            tactics     = public.strip_players_from_tactics(tactics,     ARRAY(SELECT jsonb_array_elements_text(v_out))),
            depth_chart = public.strip_players_from_depth_chart(depth_chart, ARRAY(SELECT jsonb_array_elements_text(v_out)))
        WHERE room_id = v_o.room_id AND team_id = v_a.team_slug;
        UPDATE room_members SET
            tactics     = public.strip_players_from_tactics(tactics,     ARRAY(SELECT jsonb_array_elements_text(v_in))),
            depth_chart = public.strip_players_from_depth_chart(depth_chart, ARRAY(SELECT jsonb_array_elements_text(v_in)))
        WHERE room_id = v_o.room_id AND team_id = v_b.team_slug;
$new$);
    IF v_new = v_def THEN RAISE EXCEPTION 'respond_trade_offer: reset UPDATE not found (already applied or drifted)'; END IF;
    v_new := replace(v_new,
        '-- 뎁스차트/전술 stale 참조 방지 — 양팀 전술 리셋(다음 접속 시 자동 재생성 폴백)',
        '-- 뎁스차트/전술 stale 참조 방지 — 양팀 전술에서 "나간 선수 ID만" 제거(슬라이더 등은 보존, 빈 자리는 엔진 폴백)');
    EXECUTE v_new;

    -- release_player: 방출된 선수만 제거
    SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
    WHERE p.proname = 'release_player' AND p.pronamespace = 'public'::regnamespace;
    v_new := replace(v_def,
$old$    UPDATE room_members SET tactics = NULL, depth_chart = NULL
    WHERE room_id = v_team.room_id AND team_id = v_team.team_slug;
$old$,
$new$    UPDATE room_members SET
        tactics     = public.strip_players_from_tactics(tactics,     ARRAY[p_player_id]),
        depth_chart = public.strip_players_from_depth_chart(depth_chart, ARRAY[p_player_id])
    WHERE room_id = v_team.room_id AND team_id = v_team.team_slug;
$new$);
    IF v_new = v_def THEN RAISE EXCEPTION 'release_player: reset UPDATE not found (already applied or drifted)'; END IF;
    EXECUTE v_new;
END
$mig$;
