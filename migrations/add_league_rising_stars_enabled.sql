-- leagues.rising_stars_enabled (2026-11-13). Applied via Supabase MCP; kept here for the record.
-- Session setting (settings "리그" tab): when false the server skips the Rising Stars roster
-- selection on the vote end day, the allstar_rising_stars letter, and the Rising Stars game.
-- Background: NBAL S2-T draft pool had too few rookies, so the roster came out 6 vs 5 even
-- after widening YOS to the ceiling (runRisingStarsSelection, RISING_STARS_MAX_YOS_CEILING = 4).
-- Default true = existing leagues unchanged.
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS rising_stars_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.leagues.rising_stars_enabled IS
    'Rising Stars Challenge on/off (main_league). Locked once the all-star fan vote starts (trg_leagues_rising_stars_lock).';

-- Lock: once the all-star fan vote of the current season has started, the value can no longer change.
-- Vote start = allStarStart - 35 days (getAllStarKeyDates: selection = allStarStart - 7, vote window 28 days).
-- allStarStart = resolveSeasonCalendar() mirror: stored leagues.season_calendar when its four dates are
-- valid, otherwise the legacy fixed calendar (virtual_season_year + 1)-02-13.
-- Current virtual date = current_virtual_date(room) (never rooms.sim_date).
CREATE OR REPLACE FUNCTION public.trg_leagues_rising_stars_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_cal   jsonb := NEW.season_calendar;
    v_re    constant text := '^\d{4}-\d{2}-\d{2}$';
    v_start date;
    v_room  uuid;
    v_vdate date;
BEGIN
    IF NEW.rising_stars_enabled IS NOT DISTINCT FROM OLD.rising_stars_enabled THEN RETURN NEW; END IF;
    IF OLD.type IS DISTINCT FROM 'main_league' OR OLD.status NOT IN ('in_progress', 'finished') THEN RETURN NEW; END IF;

    IF jsonb_typeof(v_cal) = 'object'
       AND coalesce(v_cal->>'regularStart', '') ~ v_re AND coalesce(v_cal->>'regularEnd', '') ~ v_re
       AND coalesce(v_cal->>'allStarStart', '') ~ v_re AND coalesce(v_cal->>'allStarEnd', '') ~ v_re THEN
        v_start := (v_cal->>'allStarStart')::date;
    ELSE
        v_start := make_date(coalesce(NEW.virtual_season_year, extract(year from now())::int) + 1, 2, 13);
    END IF;

    SELECT id INTO v_room FROM rooms WHERE league_id = OLD.id ORDER BY created_at DESC LIMIT 1;
    IF v_room IS NULL THEN RETURN NEW; END IF;
    v_vdate := current_virtual_date(v_room);

    IF v_vdate IS NOT NULL AND v_vdate >= v_start - 35 THEN
        RAISE EXCEPTION 'rising_stars_locked';
    END IF;
    RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_leagues_rising_stars_lock ON public.leagues;
CREATE TRIGGER trg_leagues_rising_stars_lock
    BEFORE UPDATE OF rising_stars_enabled ON public.leagues
    FOR EACH ROW EXECUTE FUNCTION public.trg_leagues_rising_stars_lock();

-- Settings change audit log: add 'rising_stars_enabled' to v_cols (same replace approach as
-- add_overtime_enabled_to_settings_audit.sql — the rest of the function stays as-is).
DO $$
DECLARE
    v_def text;
    v_old constant text := '''overtime_enabled''];';
BEGIN
    SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'trg_lal_league_settings';
    IF position('''rising_stars_enabled''' IN v_def) > 0 THEN RETURN; END IF;   -- already applied
    IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'trg_lal_league_settings column list pattern missing'; END IF;
    EXECUTE replace(v_def, v_old, '''overtime_enabled'',''rising_stars_enabled''];');
END $$;

-- Rollback:
--   DROP TRIGGER IF EXISTS trg_leagues_rising_stars_lock ON public.leagues;
--   DROP FUNCTION IF EXISTS public.trg_leagues_rising_stars_lock();
--   Recreate trg_lal_league_settings() with ',''rising_stars_enabled''' removed from v_cols.
--   ALTER TABLE public.leagues DROP COLUMN rising_stars_enabled;   -- only after the server/client no longer read it
