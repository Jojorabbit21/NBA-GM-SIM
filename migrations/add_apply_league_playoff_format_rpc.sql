-- add_apply_league_playoff_format_rpc.sql — 메인리그 플레이오프 형식 변경 + 타임라인 날짜 덧붙이기/줄이기
--
-- [2026-10-24] 리그 생성 시 타임라인(league_virtual_days)은 "그때 플레이오프 형식의 최악 일수"만 확보한다.
-- 진행 중에 형식(시리즈 길이·진출 팀 수·플레이인·경기 간격)을 바꾸면 날짜가 모자라 뒤 라운드 경기가
-- 실제 시각을 못 받거나(자동 시뮬 정지), 남는다. 세션 설정 "플레이오프" 탭이 utils/leagueTimeline.ts
-- planPlayoffTimelineChange()로 덧붙일 행/줄일 시작일/새 종료일을 계산해 이 함수로 한 번에 반영한다.
--
-- 규칙
--  - 메인리그만, 리그 관리자(또는 전역 어드민)만(assert_caller_is_room_admin).
--  - 플레이오프 대진표(bracket_data)가 생긴 뒤에는 거부(playoffs_started).
--  - 덧붙이는 행은 현재 마지막 가상 날짜 바로 다음 날부터 연속이어야 함(append_not_contiguous), kind는 'playoff' 고정.
--  - 줄이기는 이미 시작한(real_start_at <= now()) 날짜를 지우지 않음(trim_started_days).
--  - 타임라인이 아직 없는 리그(드래프트 전)는 설정만 저장 — finalize.ts가 그 설정으로 타임라인을 만든다.

CREATE OR REPLACE FUNCTION public.apply_league_playoff_format(
    p_league_id     uuid,
    p_settings      jsonb,
    p_append_days   jsonb DEFAULT '[]'::jsonb,
    p_trim_from     date  DEFAULT NULL,
    p_real_end_date date  DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_room     uuid;
    v_type     text;
    v_bracket  jsonb;
    v_admin    uuid;
    v_max      date;
    v_first    date;
    v_ins      integer := 0;
    v_del      integer := 0;
    v_fmt      text := p_settings->>'match_format';
    v_ffmt     text := p_settings->>'finals_match_format';
    v_teams    integer := (p_settings->>'playoff_team_count')::integer;
    v_interval integer := (p_settings->>'playoff_game_interval_days')::integer;
BEGIN
    SELECT l.type, l.bracket_data, l.admin_user_id, r.id
      INTO v_type, v_bracket, v_admin, v_room
      FROM leagues l LEFT JOIN rooms r ON r.league_id = l.id
     WHERE l.id = p_league_id
     FOR UPDATE OF l;
    IF NOT FOUND THEN RAISE EXCEPTION 'league_not_found'; END IF;

    IF v_room IS NOT NULL THEN
        PERFORM assert_caller_is_room_admin(v_room);
    ELSIF NOT (coalesce(auth.role(), '') = 'service_role' OR coalesce(is_global_admin(), false) OR auth.uid() = v_admin) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    IF v_type <> 'main_league' THEN RAISE EXCEPTION 'not_main_league'; END IF;
    IF v_bracket IS NOT NULL THEN RAISE EXCEPTION 'playoffs_started'; END IF;
    IF v_fmt IS NOT NULL AND v_fmt NOT IN ('best_of_1', 'best_of_3', 'best_of_5', 'best_of_7') THEN RAISE EXCEPTION 'invalid_match_format'; END IF;
    IF v_ffmt IS NOT NULL AND v_ffmt NOT IN ('best_of_1', 'best_of_3', 'best_of_5', 'best_of_7') THEN RAISE EXCEPTION 'invalid_match_format'; END IF;
    IF v_teams IS NOT NULL AND (v_teams < 2 OR v_teams > 16) THEN RAISE EXCEPTION 'invalid_playoff_team_count'; END IF;
    IF v_interval IS NOT NULL AND v_interval NOT IN (1, 2) THEN RAISE EXCEPTION 'invalid_interval'; END IF;

    IF p_trim_from IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM league_virtual_days
                    WHERE league_id = p_league_id AND kind = 'playoff' AND virtual_date >= p_trim_from AND real_start_at <= now()) THEN
            RAISE EXCEPTION 'trim_started_days';
        END IF;
        DELETE FROM league_virtual_days WHERE league_id = p_league_id AND kind = 'playoff' AND virtual_date >= p_trim_from;
        GET DIAGNOSTICS v_del = ROW_COUNT;
    END IF;

    IF jsonb_typeof(coalesce(p_append_days, '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'invalid_days'; END IF;
    IF jsonb_array_length(coalesce(p_append_days, '[]'::jsonb)) > 0 THEN
        IF v_room IS NULL THEN RAISE EXCEPTION 'room_not_found'; END IF;
        SELECT max(virtual_date) INTO v_max FROM league_virtual_days WHERE league_id = p_league_id;
        SELECT min(d.virtual_date) INTO v_first FROM jsonb_to_recordset(p_append_days) AS d(virtual_date date);
        IF v_max IS NULL OR v_first <> v_max + 1 THEN RAISE EXCEPTION 'append_not_contiguous'; END IF;
        INSERT INTO league_virtual_days (league_id, room_id, virtual_date, day_index, kind, real_start_at, real_midnight_at, real_end_at)
        SELECT p_league_id, v_room, d.virtual_date, d.day_index, 'playoff', d.real_start_at, d.real_midnight_at, d.real_end_at
          FROM jsonb_to_recordset(p_append_days) AS d(virtual_date date, day_index integer,
                                                     real_start_at timestamptz, real_midnight_at timestamptz, real_end_at timestamptz);
        GET DIAGNOSTICS v_ins = ROW_COUNT;
    END IF;

    UPDATE leagues SET
        match_format               = coalesce(v_fmt, match_format),
        finals_match_format        = CASE WHEN p_settings ? 'finals_match_format' THEN v_ffmt ELSE finals_match_format END,
        playoff_team_count         = coalesce(v_teams, playoff_team_count),
        play_in_enabled            = coalesce((p_settings->>'play_in_enabled')::boolean, play_in_enabled),
        playoff_game_interval_days = coalesce(v_interval, playoff_game_interval_days),
        real_end_date              = coalesce(p_real_end_date, real_end_date),
        season_end_date            = CASE WHEN p_real_end_date IS NOT NULL THEN p_real_end_date::text ELSE season_end_date END
     WHERE id = p_league_id;

    RETURN jsonb_build_object('appended', v_ins, 'trimmed', v_del);
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_league_playoff_format(uuid, jsonb, jsonb, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_league_playoff_format(uuid, jsonb, jsonb, date, date) TO authenticated;
