-- All-star session settings (2026-11-13). Applied via Supabase MCP; kept here for the record.
-- Follows add_league_rising_stars_enabled.sql (same day) and generalises its lock trigger.
--
--   leagues.allstar_enabled              master switch. Off before the schedule is built (finalize) = season without a break
--                                        (finalize writes season_calendar.allStarBreak = false; the switch can't be turned
--                                        back on for that season). Off after the schedule exists = break days stay as rest days.
--   leagues.three_point_contest_enabled  3-point contest (participants letter + contest)
--   leagues.dunk_contest_enabled         dunk contest (participants letter + contest)
--   leagues.rising_stars_enabled         (existing) Rising Stars
--   season_calendar.allStarOffsets       key dates as day offsets from allStarStart (break day 1):
--                                        { voteStart, voteEnd, rising, contests, main }, default {-35,-7,1,2,3}.
--                                        Mirror of utils/seasonCalendar.ts parseAllStarOffsets / getAllStarKeyDates.
--
-- Lock: every all-star setting is frozen once the fan vote of the current season has started
-- (current_virtual_date(room) >= allStarStart + voteStart). Writes go through update_league_allstar_settings().

ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS allstar_enabled             boolean NOT NULL DEFAULT true;
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS three_point_contest_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS dunk_contest_enabled        boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.leagues.allstar_enabled IS
    'All-star master switch (main_league). Off before finalize = schedule without a break. Locked once the fan vote starts.';
COMMENT ON COLUMN public.leagues.three_point_contest_enabled IS '3-point contest on/off. Locked once the all-star fan vote starts.';
COMMENT ON COLUMN public.leagues.dunk_contest_enabled IS 'Dunk contest on/off. Locked once the all-star fan vote starts.';

-- resolveSeasonCalendar() mirror: stored dates when all four are valid, else the legacy fixed calendar.
CREATE OR REPLACE FUNCTION public.league_season_dates(p_cal jsonb, p_year integer,
    OUT regular_start date, OUT break_start date, OUT break_end date)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_re constant text := '^\d{4}-\d{2}-\d{2}$';
    v_y  integer := coalesce(p_year, extract(year from now())::int);
BEGIN
    IF jsonb_typeof(p_cal) = 'object'
       AND coalesce(p_cal->>'regularStart', '') ~ v_re AND coalesce(p_cal->>'regularEnd', '') ~ v_re
       AND coalesce(p_cal->>'allStarStart', '') ~ v_re AND coalesce(p_cal->>'allStarEnd', '') ~ v_re THEN
        regular_start := (p_cal->>'regularStart')::date;
        break_start   := (p_cal->>'allStarStart')::date;
        break_end     := (p_cal->>'allStarEnd')::date;
    ELSE
        regular_start := make_date(v_y, 10, 21);
        break_start   := make_date(v_y + 1, 2, 13);
        break_end     := make_date(v_y + 1, 2, 18);
    END IF;
END; $function$;

-- parseAllStarOffsets() mirror: stored offsets when all five are integers, else the defaults.
CREATE OR REPLACE FUNCTION public.league_allstar_offsets(p_cal jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
    SELECT CASE
        WHEN jsonb_typeof(p_cal->'allStarOffsets') = 'object'
         AND (SELECT bool_and(jsonb_typeof(p_cal->'allStarOffsets'->k) = 'number' AND (p_cal->'allStarOffsets'->>k) ~ '^-?\d+$')
                FROM unnest(ARRAY['voteStart','voteEnd','rising','contests','main']) AS k)
        THEN jsonb_build_object(
                'voteStart', (p_cal->'allStarOffsets'->>'voteStart')::int, 'voteEnd', (p_cal->'allStarOffsets'->>'voteEnd')::int,
                'rising', (p_cal->'allStarOffsets'->>'rising')::int, 'contests', (p_cal->'allStarOffsets'->>'contests')::int,
                'main', (p_cal->'allStarOffsets'->>'main')::int)
        ELSE '{"voteStart":-35,"voteEnd":-7,"rising":1,"contests":2,"main":3}'::jsonb
    END
$function$;

-- Replace the Rising-Stars-only lock with one covering every all-star setting.
DROP TRIGGER IF EXISTS trg_leagues_rising_stars_lock ON public.leagues;
DROP FUNCTION IF EXISTS public.trg_leagues_rising_stars_lock();

CREATE OR REPLACE FUNCTION public.trg_leagues_allstar_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_old_off jsonb := league_allstar_offsets(OLD.season_calendar);
    v_new_off jsonb := league_allstar_offsets(NEW.season_calendar);
    v_old     record;
    v_new     record;
    v_room    uuid;
    v_vdate   date;
BEGIN
    IF NEW.allstar_enabled             IS NOT DISTINCT FROM OLD.allstar_enabled
       AND NEW.rising_stars_enabled        IS NOT DISTINCT FROM OLD.rising_stars_enabled
       AND NEW.three_point_contest_enabled IS NOT DISTINCT FROM OLD.three_point_contest_enabled
       AND NEW.dunk_contest_enabled        IS NOT DISTINCT FROM OLD.dunk_contest_enabled
       AND v_new_off = v_old_off THEN
        RETURN NEW;
    END IF;

    -- Season scheduled without a break (all-star off at finalize): it stays off.
    IF NEW.allstar_enabled AND NEW.season_calendar->>'allStarBreak' = 'false' THEN
        RAISE EXCEPTION 'allstar_no_break';
    END IF;

    IF OLD.type IS DISTINCT FROM 'main_league' OR OLD.status NOT IN ('in_progress', 'finished') THEN RETURN NEW; END IF;
    SELECT id INTO v_room FROM rooms WHERE league_id = OLD.id ORDER BY created_at DESC LIMIT 1;
    IF v_room IS NULL THEN RETURN NEW; END IF;
    v_vdate := current_virtual_date(v_room);
    IF v_vdate IS NULL THEN RETURN NEW; END IF;

    SELECT * INTO v_old FROM league_season_dates(OLD.season_calendar, OLD.virtual_season_year);
    IF v_vdate >= v_old.break_start + (v_old_off->>'voteStart')::int THEN
        RAISE EXCEPTION 'allstar_settings_locked';
    END IF;
    IF v_new_off <> v_old_off THEN
        SELECT * INTO v_new FROM league_season_dates(NEW.season_calendar, NEW.virtual_season_year);
        IF v_vdate >= v_new.break_start + (v_new_off->>'voteStart')::int THEN
            RAISE EXCEPTION 'allstar_vote_start_past';
        END IF;
    END IF;
    RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_leagues_allstar_lock ON public.leagues;
CREATE TRIGGER trg_leagues_allstar_lock
    BEFORE UPDATE OF allstar_enabled, rising_stars_enabled, three_point_contest_enabled, dunk_contest_enabled, season_calendar
    ON public.leagues
    FOR EACH ROW EXECUTE FUNCTION public.trg_leagues_allstar_lock();

-- Session settings "올스타" tab save. Validates the key dates, writes toggles + season_calendar.allStarOffsets
-- (the lock trigger above rejects locked / past changes), then — when a timeline already exists — relabels the
-- break days in league_virtual_days and recomputes leagues.allstar_schedule (same rule as admin_time_jump step 6).
-- Error codes: forbidden / league_not_found / not_main_league / allstar_offsets_invalid:<reason> + trigger codes.
CREATE OR REPLACE FUNCTION public.update_league_allstar_settings(
    p_league_id                   uuid,
    p_allstar_enabled             boolean,
    p_rising_stars_enabled        boolean,
    p_three_point_contest_enabled boolean,
    p_dunk_contest_enabled        boolean,
    p_offsets                     jsonb
) RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    l         leagues%ROWTYPE;
    v_d       record;
    v_span    integer;
    v_vs integer; v_ve integer; v_r integer; v_c integer; v_m integer;
    v_old_off jsonb;
    v_new_off jsonb;
    v_cal     jsonb;
    v_allstar jsonb;
    v_room    uuid;
BEGIN
    SELECT * INTO l FROM leagues WHERE id = p_league_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'league_not_found'; END IF;
    IF NOT (coalesce(auth.role(), '') = 'service_role' OR coalesce(is_global_admin(), false) OR l.admin_user_id = auth.uid()) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    IF l.type IS DISTINCT FROM 'main_league' THEN RAISE EXCEPTION 'not_main_league'; END IF;

    v_old_off := league_allstar_offsets(l.season_calendar);
    v_cal := l.season_calendar;
    IF p_offsets IS NOT NULL THEN
        BEGIN
            v_vs := (p_offsets->>'voteStart')::int; v_ve := (p_offsets->>'voteEnd')::int;
            v_r  := (p_offsets->>'rising')::int;    v_c  := (p_offsets->>'contests')::int; v_m := (p_offsets->>'main')::int;
        EXCEPTION WHEN others THEN
            RAISE EXCEPTION 'allstar_offsets_invalid:format';
        END;
        IF v_vs IS NULL OR v_ve IS NULL OR v_r IS NULL OR v_c IS NULL OR v_m IS NULL THEN
            RAISE EXCEPTION 'allstar_offsets_invalid:format';
        END IF;
        SELECT * INTO v_d FROM league_season_dates(l.season_calendar, l.virtual_season_year);
        v_span := v_d.break_end - v_d.break_start;
        IF NOT (v_vs < v_ve AND v_ve <= -1) THEN RAISE EXCEPTION 'allstar_offsets_invalid:vote_order'; END IF;
        IF v_ve - v_vs < 4 THEN RAISE EXCEPTION 'allstar_offsets_invalid:vote_window'; END IF;
        IF v_d.break_start + v_vs < v_d.regular_start THEN RAISE EXCEPTION 'allstar_offsets_invalid:vote_before_season'; END IF;
        IF least(v_r, v_c, v_m) < 1 OR greatest(v_r, v_c, v_m) > v_span - 1 THEN
            RAISE EXCEPTION 'allstar_offsets_invalid:event_outside_break';
        END IF;
        IF v_r = v_c OR v_r = v_m OR v_c = v_m THEN RAISE EXCEPTION 'allstar_offsets_invalid:event_same_day'; END IF;
        v_cal := jsonb_set(coalesce(l.season_calendar, '{}'::jsonb), '{allStarOffsets}',
                           jsonb_build_object('voteStart', v_vs, 'voteEnd', v_ve, 'rising', v_r, 'contests', v_c, 'main', v_m));
    END IF;
    v_new_off := league_allstar_offsets(v_cal);

    UPDATE leagues SET
        allstar_enabled             = coalesce(p_allstar_enabled, allstar_enabled),
        rising_stars_enabled        = coalesce(p_rising_stars_enabled, rising_stars_enabled),
        three_point_contest_enabled = coalesce(p_three_point_contest_enabled, three_point_contest_enabled),
        dunk_contest_enabled        = coalesce(p_dunk_contest_enabled, dunk_contest_enabled),
        season_calendar             = v_cal
     WHERE id = p_league_id;

    IF v_new_off IS DISTINCT FROM v_old_off THEN
        IF coalesce(v_cal->>'allStarBreak', '') <> 'false' THEN
            SELECT * INTO v_d FROM league_season_dates(v_cal, l.virtual_season_year);
            UPDATE league_virtual_days d
               SET kind = CASE d.virtual_date - v_d.break_start
                              WHEN 0 THEN 'allstar_announce'
                              WHEN (v_new_off->>'rising')::int   THEN 'allstar_rising'
                              WHEN (v_new_off->>'contests')::int THEN 'allstar_contests'
                              WHEN (v_new_off->>'main')::int     THEN 'allstar_main'
                              ELSE 'allstar_break' END
             WHERE d.league_id = p_league_id
               AND d.virtual_date BETWEEN v_d.break_start AND v_d.break_end
               AND d.kind LIKE 'allstar%';
            SELECT CASE WHEN count(*) FILTER (WHERE kind IN ('allstar_announce','allstar_rising','allstar_contests','allstar_main')) = 4 THEN
                        jsonb_build_object(
                            'announceAt',    min(real_start_at) FILTER (WHERE kind = 'allstar_announce'),
                            'risingStarsAt', min(real_start_at) FILTER (WHERE kind = 'allstar_rising'),
                            'contestsAt',    min(real_start_at) FILTER (WHERE kind = 'allstar_contests'),
                            'mainGameAt',    min(real_start_at) FILTER (WHERE kind = 'allstar_main'))
                   END
              INTO v_allstar
              FROM league_virtual_days WHERE league_id = p_league_id;
            IF v_allstar IS NOT NULL THEN
                UPDATE leagues SET allstar_schedule = v_allstar WHERE id = p_league_id;
            END IF;
        END IF;
        -- season_calendar is not in the settings audit trigger's column list — log the key dates here.
        SELECT id INTO v_room FROM rooms WHERE league_id = p_league_id ORDER BY created_at DESC LIMIT 1;
        IF v_room IS NOT NULL THEN
            PERFORM league_action_log_write(v_room, NULL, 'league_settings_update', '{}', '{}',
                jsonb_build_object('changed', jsonb_build_object('allstar_key_dates',
                    jsonb_build_object('before', v_old_off, 'after', v_new_off))));
        END IF;
    END IF;
END; $function$;

REVOKE ALL ON FUNCTION public.update_league_allstar_settings(uuid, boolean, boolean, boolean, boolean, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.update_league_allstar_settings(uuid, boolean, boolean, boolean, boolean, jsonb) TO authenticated;

-- Settings change audit log: add the three new switches after 'rising_stars_enabled'.
DO $$
DECLARE
    v_def text;
    v_old constant text := '''rising_stars_enabled''];';
BEGIN
    SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'trg_lal_league_settings';
    IF position('''allstar_enabled''' IN v_def) > 0 THEN RETURN; END IF;   -- already applied
    IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'trg_lal_league_settings column list pattern missing'; END IF;
    EXECUTE replace(v_def, v_old,
        '''rising_stars_enabled'',''allstar_enabled'',''three_point_contest_enabled'',''dunk_contest_enabled''];');
END $$;

-- Rollback (after the server/client no longer read these):
--   DROP FUNCTION public.update_league_allstar_settings(uuid, boolean, boolean, boolean, boolean, jsonb);
--   DROP TRIGGER trg_leagues_allstar_lock ON public.leagues; DROP FUNCTION public.trg_leagues_allstar_lock();
--   Re-run the lock section of add_league_rising_stars_enabled.sql (trg_leagues_rising_stars_lock) if Rising Stars stays.
--   DROP FUNCTION public.league_allstar_offsets(jsonb); DROP FUNCTION public.league_season_dates(jsonb, integer);
--   Recreate trg_lal_league_settings() without the three new names in v_cols.
--   ALTER TABLE public.leagues DROP COLUMN allstar_enabled, DROP COLUMN three_point_contest_enabled, DROP COLUMN dunk_contest_enabled;
--   Stored season_calendar.allStarOffsets / allStarBreak keys are ignored by old code (resolveSeasonCalendar drops unknown keys).
