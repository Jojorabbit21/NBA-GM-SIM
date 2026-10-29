-- ============================================================
-- 트레이닝 세션: 전역 어드민 테스트용 시간대 우회 [2026-10-29] — ⚠️ 정식 오픈 전 되돌릴 것(아래 롤백)
--
-- 배경: 훈련은 "진행 중인 가상 하루의 19:00~자정"에만 가능해서, 리그 일정 사이(낮 시간)에는 E2E를 돌릴 수 없다.
-- 변경: practice_status / apply_practice_result에 p_ignore_window(기본 false) 추가 — true면 가상 자정 제한만 건너뛴다.
--       (경기일 판정 · 하루 3회 제한은 그대로. "오늘" = 마지막으로 시작된 가상 날짜)
--       get_my_practice_status는 호출자가 is_global_admin()이면 true로 부른다. 서버(practiceRunner)는 isGlobalAdmin(userId)로 넘긴다.
-- 시그니처가 바뀌므로 DROP 후 재생성(같은 트랜잭션). 기존 호출(인자 2개/4개)은 기본값으로 그대로 동작한다.
--
-- 롤백: migrations/add_practice_games.sql의 세 함수 정의로 되돌리기(DROP 새 시그니처 → 원본 CREATE·GRANT 재실행)
--   + server/src/practiceRunner.ts의 ignoreWindow 전달 제거
-- ============================================================

DROP FUNCTION IF EXISTS public.apply_practice_result(uuid, text, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.practice_status(uuid, text);

CREATE OR REPLACE FUNCTION public.practice_status(p_room_id uuid, p_team_id text, p_ignore_window boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_limit  constant integer := 3;
    d        record;
    v_used   integer;
    v_game   boolean;
    v_next   timestamptz;
    v_closed boolean;
BEGIN
    SELECT * INTO d
      FROM league_virtual_days
     WHERE room_id = p_room_id AND real_start_at <= now()
     ORDER BY real_start_at DESC
     LIMIT 1;

    SELECT v.real_start_at INTO v_next
      FROM league_virtual_days v
     WHERE v.room_id = p_room_id AND v.real_start_at > now()
       AND NOT EXISTS (
           SELECT 1 FROM games g
            WHERE g.room_id = p_room_id AND g.game_date = v.virtual_date AND NOT g.is_allstar
              AND (g.home_team_id = p_team_id OR g.away_team_id = p_team_id))
     ORDER BY v.real_start_at
     LIMIT 1;

    IF d IS NULL THEN
        RETURN jsonb_build_object('available', false, 'reason', 'no_timeline', 'limit', v_limit, 'used', 0, 'next_start', v_next);
    END IF;

    SELECT count(*) INTO v_used
      FROM practice_games
     WHERE room_id = p_room_id AND team_id = p_team_id AND virtual_date = d.virtual_date;

    v_game := EXISTS (
        SELECT 1 FROM games g
         WHERE g.room_id = p_room_id AND g.game_date = d.virtual_date AND NOT g.is_allstar
           AND (g.home_team_id = p_team_id OR g.away_team_id = p_team_id));
    v_closed := now() >= d.real_midnight_at AND NOT p_ignore_window;

    RETURN jsonb_build_object(
        'virtual_date', d.virtual_date,
        'day_kind',     d.kind,
        'window_end',   d.real_midnight_at,
        'next_start',   v_next,
        'limit',        v_limit,
        'used',         v_used,
        'window_bypass', p_ignore_window,
        'available',    (NOT v_closed AND NOT v_game AND v_used < v_limit),
        'reason',       CASE
                            WHEN v_game            THEN 'game_day'
                            WHEN v_closed          THEN 'window_closed'
                            WHEN v_used >= v_limit THEN 'limit'
                            ELSE NULL
                        END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.practice_status(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.practice_status(uuid, text, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_practice_status(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_team text;
BEGIN
    SELECT team_id INTO v_team
      FROM room_members
     WHERE room_id = p_room_id AND user_id = auth.uid();
    IF v_team IS NULL THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    RETURN practice_status(p_room_id, v_team, coalesce(is_global_admin(), false));
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_practice_result(p_room_id uuid, p_team_id text, p_row jsonb, p_drains jsonb, p_ignore_window boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_status jsonb;
    v_date   date;
    v_slot   integer;
    v_id     uuid;
BEGIN
    v_status := practice_status(p_room_id, p_team_id, p_ignore_window);
    IF NOT coalesce((v_status->>'available')::boolean, false) THEN
        RAISE EXCEPTION 'practice unavailable: %', coalesce(v_status->>'reason', 'unknown') USING ERRCODE = 'P0001';
    END IF;
    v_date := (v_status->>'virtual_date')::date;
    v_slot := (v_status->>'used')::integer + 1;

    INSERT INTO practice_games (
        room_id, team_id, season_number, virtual_date, slot,
        opponent_team_id, offense_preset, defense_preset, is_playoff,
        my_score, opp_score, my_stats, result
    ) VALUES (
        p_room_id, p_team_id, (p_row->>'season_number')::integer, v_date, v_slot,
        p_row->>'opponent_team_id', p_row->>'offense_preset', p_row->>'defense_preset',
        coalesce(v_status->>'day_kind', '') = 'playoff',
        (p_row->>'my_score')::integer, (p_row->>'opp_score')::integer,
        coalesce(p_row->'my_stats', '{}'::jsonb), p_row->'result'
    )
    RETURNING id INTO v_id;

    INSERT INTO room_player_state AS s (room_id, player_id, condition, condition_recovered_through, updated_at)
    SELECT p_room_id, x.player_id, round(greatest(0, 100 - x.drain), 1), v_date - 1, now()
      FROM jsonb_to_recordset(p_drains) AS x(player_id text, drain numeric)
     WHERE x.drain > 0
    ON CONFLICT (room_id, player_id) DO UPDATE
       SET condition = round(greatest(0, coalesce(s.condition, 100) - (100 - excluded.condition)), 1),
           condition_recovered_through = coalesce(s.condition_recovered_through, v_date - 1),
           updated_at = now();

    RETURN jsonb_build_object('id', v_id, 'slot', v_slot, 'virtual_date', v_date);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_practice_result(uuid, text, jsonb, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_practice_result(uuid, text, jsonb, jsonb, boolean) TO service_role;
