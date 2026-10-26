-- [2026-10-26] 연장전 P3 — 연장이 있었던 경기만 연장 길이만큼 결과를 늦게 공개 (docs/plan/overtime-system.md 2-6)
--
-- 공개 시각 = 시작 + 리플레이 × (2880 + 300 × 연장 수) / 2880  — 정규시간 재생 속도는 모든 경기 동일, 연장도 같은 속도.
-- 연장 수(ot_periods)는 서버가 경기 시뮬 시점(시작 시각)에 game_pbp·games에 함께 기록한다. 기본 0 → 이 마이그레이션만
-- 적용된 상태(서버 미배포)에선 모든 판정이 기존과 완전히 같다(먼저 적용해도 안전).
-- games.ot_periods는 점수와 같은 행이라 노출 수준이 기존과 같다(games는 RLS 지연이 없고 스포일러 차단은 클라이언트 담당).

ALTER TABLE public.game_pbp ADD COLUMN IF NOT EXISTS ot_periods smallint NOT NULL DEFAULT 0;
ALTER TABLE public.games    ADD COLUMN IF NOT EXISTS ot_periods smallint NOT NULL DEFAULT 0;

-- 경기별 공개 시각 — room_replay_interval()(리그 replay_minutes)을 그대로 쓰고 연장 비율만 곱한다.
CREATE OR REPLACE FUNCTION public.game_reveal_at(p_room_id uuid, p_start timestamptz, p_ot_periods smallint)
RETURNS timestamptz
LANGUAGE sql STABLE
SET search_path = public
AS $$
    SELECT p_start + public.room_replay_interval(p_room_id)
           * ((2880 + 300 * greatest(coalesce(p_ot_periods, 0), 0))::double precision / 2880);
$$;
REVOKE ALL ON FUNCTION public.game_reveal_at(uuid, timestamptz, smallint) FROM public;
GRANT EXECUTE ON FUNCTION public.game_reveal_at(uuid, timestamptz, smallint) TO authenticated, anon, service_role;

-- 시즌 스탯·어워드·슛 이벤트·팀 존/어드밴스드 RPC 7개: gp.game_start_time + room_replay_interval(p_room_id) → game_reveal_at(...)
DO $$
DECLARE
    r record;
    v_def text;
    v_old constant text := 'gp.game_start_time + public.room_replay_interval(p_room_id)';
    v_new constant text := 'public.game_reveal_at(p_room_id, gp.game_start_time, gp.ot_periods)';
BEGIN
    FOR r IN
        SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname IN (
            'get_player_shot_events', 'get_player_season_stats_full', 'get_team_opponent_zone_stats',
            'get_team_season_advanced_stats', 'get_player_season_stats_batch', 'get_league_season_awards_stats',
            'get_player_season_stats_league')
    LOOP
        v_def := pg_get_functiondef(r.oid);
        IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'reveal pattern missing in %', r.proname; END IF;
        EXECUTE replace(v_def, v_old, v_new);
    END LOOP;

    -- admin_time_jump: "아직 중계 중" 창을 연장 최대 2회 길이까지 — 연장 경기가 점프 대상에서 빠지지 않게.
    -- (연장 없이 이미 공개된 경기가 이 창에 들어와 함께 당겨져도 공개 상태는 그대로라 무해)
    SELECT p.oid INTO r FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'admin_time_jump';
    v_def := pg_get_functiondef(r.oid);
    IF position('v_replay := room_replay_interval(v_room);' IN v_def) = 0 THEN RAISE EXCEPTION 'admin_time_jump pattern missing'; END IF;
    EXECUTE replace(v_def, 'v_replay := room_replay_interval(v_room);',
        'v_replay := room_replay_interval(v_room) * ((2880 + 300 * 2)::double precision / 2880);  -- [2026-10-26] 연장 최대 2회 포함');
END $$;

-- RLS 4개 (game_pbp 멤버·관전, league_events 멤버·관전). team_playtype_stats는 game_pbp EXISTS로 자동 상속.
ALTER POLICY "room members can read game_pbp" ON public.game_pbp
    USING ((EXISTS (SELECT 1 FROM room_members
                     WHERE room_members.room_id = game_pbp.room_id AND room_members.user_id = (SELECT auth.uid())))
           AND public.game_reveal_at(room_id, game_start_time, ot_periods) <= now());

ALTER POLICY "game_pbp_spectator_select" ON public.game_pbp
    USING ((room_id IN (SELECT spectatable_room_ids()))
           AND public.game_reveal_at(room_id, game_start_time, ot_periods) <= now());

ALTER POLICY "le_member_select" ON public.league_events
    USING ((room_id IN (SELECT my_room_ids()))
           AND (game_id IS NULL OR EXISTS (SELECT 1 FROM game_pbp gp
                 WHERE gp.room_id = league_events.room_id AND gp.game_id = league_events.game_id
                   AND public.game_reveal_at(gp.room_id, gp.game_start_time, gp.ot_periods) <= now())));

ALTER POLICY "le_spectator_select" ON public.league_events
    USING ((room_id IN (SELECT spectatable_room_ids()))
           AND (game_id IS NULL OR EXISTS (SELECT 1 FROM game_pbp gp
                 WHERE gp.room_id = league_events.room_id AND gp.game_id = league_events.game_id
                   AND public.game_reveal_at(gp.room_id, gp.game_start_time, gp.ot_periods) <= now())));
