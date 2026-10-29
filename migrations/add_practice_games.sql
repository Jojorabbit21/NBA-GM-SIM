-- ============================================================
-- 트레이닝 세션(휴식일 연습 경기) — practice_games 테이블 + 상태 조회 + 결과 반영 [2026-10-29]
-- 설계: docs/plan/practice-scrimmage-plan.md (2절 휴식일 판정, 5절 체력, 6-2절 테이블)
--
-- practice_status(room, team)       : 서버/내부용 — 오늘(가상) 훈련 가능 여부·사용 횟수. service_role만 실행
-- get_my_practice_status(room)      : 클라이언트용 — 호출자의 팀으로 practice_status. authenticated 실행
-- apply_practice_result(...)        : 서버(Fly) 전용 — 가능 여부 재확인 → 기록 insert(슬롯 = 사용 횟수+1) → 체력 감소량 반영을 한 트랜잭션으로
--
-- 휴식일 = 지금 진행 중인 가상 하루(league_virtual_days 중 real_start_at ≤ now 의 마지막 행)에 우리 팀 경기(올스타 제외)가 없음.
-- 훈련 시간대 = 그 하루의 real_start_at ~ real_midnight_at(가상 19:00~자정). 자정 이후·하루 사이 공백은 불가.
-- 하루 3회(이월 없음). 체력은 감소량(drain)으로만 반영 — 자정 회복 RPC(apply_fatigue_recovery)와 경합해도 값 유실 없음.
--
-- 롤백:
--   DROP FUNCTION IF EXISTS public.apply_practice_result(uuid, text, jsonb, jsonb);
--   DROP FUNCTION IF EXISTS public.get_my_practice_status(uuid);
--   DROP FUNCTION IF EXISTS public.practice_status(uuid, text);
--   DROP TABLE IF EXISTS public.practice_games;
-- ============================================================

CREATE TABLE IF NOT EXISTS public.practice_games (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id          uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    team_id          text NOT NULL,
    season_number    integer,
    virtual_date     date NOT NULL,
    slot             smallint NOT NULL CHECK (slot BETWEEN 1 AND 3),
    opponent_team_id text NOT NULL,
    offense_preset   text NOT NULL,
    defense_preset   text NOT NULL,
    is_playoff       boolean NOT NULL DEFAULT false,
    my_score         integer NOT NULL,
    opp_score        integer NOT NULL,
    my_stats         jsonb NOT NULL DEFAULT '{}'::jsonb,   -- 우리 팀 박스 합계(기록 표용)
    result           jsonb NOT NULL,                        -- 박스·PBP·샷·로테이션(결과 화면용)
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (room_id, team_id, virtual_date, slot)
);

CREATE INDEX IF NOT EXISTS practice_games_room_team_created_idx
    ON public.practice_games (room_id, team_id, created_at DESC);

ALTER TABLE public.practice_games ENABLE ROW LEVEL SECURITY;

-- 본인 팀 기록만 읽기(관전·다른 유저 불가 — 전술 유추 방지). 쓰기는 service_role(RLS 우회)만.
DROP POLICY IF EXISTS pg_owner_select ON public.practice_games;
CREATE POLICY pg_owner_select ON public.practice_games
    FOR SELECT TO authenticated
    USING (
        coalesce(public.is_global_admin(), false)
        OR EXISTS (
            SELECT 1 FROM public.room_members m
             WHERE m.room_id = practice_games.room_id
               AND m.team_id = practice_games.team_id
               AND m.user_id = (SELECT auth.uid())
        )
    );

-- ── 상태 조회 ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.practice_status(p_room_id uuid, p_team_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_limit constant integer := 3;
    d       record;
    v_used  integer;
    v_game  boolean;
    v_next  timestamptz;
BEGIN
    SELECT * INTO d
      FROM league_virtual_days
     WHERE room_id = p_room_id AND real_start_at <= now()
     ORDER BY real_start_at DESC
     LIMIT 1;

    -- 다음 휴식일 시작 시각(안내용) — 지금 이후 시작하는 날 중 우리 팀 경기가 없는 첫 날
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

    RETURN jsonb_build_object(
        'virtual_date', d.virtual_date,
        'day_kind',     d.kind,
        'window_end',   d.real_midnight_at,
        'next_start',   v_next,
        'limit',        v_limit,
        'used',         v_used,
        'available',    (now() < d.real_midnight_at AND NOT v_game AND v_used < v_limit),
        'reason',       CASE
                            WHEN v_game                      THEN 'game_day'
                            WHEN now() >= d.real_midnight_at THEN 'window_closed'
                            WHEN v_used >= v_limit           THEN 'limit'
                            ELSE NULL
                        END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.practice_status(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.practice_status(uuid, text) TO service_role;

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
    RETURN practice_status(p_room_id, v_team);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_practice_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_practice_status(uuid) TO authenticated, service_role;

-- ── 결과 반영(서버 전용) ─────────────────────────────────────
-- p_row   : {season_number, opponent_team_id, offense_preset, defense_preset, my_score, opp_score, my_stats, result}
-- p_drains: [{player_id, drain}] — 출전 선수만(drain = 20 × 출전 분 / 48, 서버 계산)
CREATE OR REPLACE FUNCTION public.apply_practice_result(p_room_id uuid, p_team_id text, p_row jsonb, p_drains jsonb)
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
    v_status := practice_status(p_room_id, p_team_id);
    IF NOT coalesce((v_status->>'available')::boolean, false) THEN
        RAISE EXCEPTION 'practice unavailable: %', coalesce(v_status->>'reason', 'unknown') USING ERRCODE = 'P0001';
    END IF;
    v_date := (v_status->>'virtual_date')::date;
    v_slot := (v_status->>'used')::integer + 1;

    -- 동시 요청은 UNIQUE(room, team, date, slot)에서 한쪽만 성공
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

    -- 체력: 감소량만 반영. 회복 기준일이 비어 있으면 전날로 채운다(비어 있으면 회복 로직이 100으로 리셋하므로).
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

REVOKE ALL ON FUNCTION public.apply_practice_result(uuid, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_practice_result(uuid, text, jsonb, jsonb) TO service_role;
