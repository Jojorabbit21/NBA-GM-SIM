-- leagues.draft_alltime_only (2026-11-10). Applied via Supabase MCP; kept here for the record.
-- Multi draft pool: when true, only meta_players.include_alltime = true players are eligible.
-- ANDed with draft_year range / draft_retired_filter / OVR range. Default false = existing leagues unchanged.
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS draft_alltime_only BOOLEAN NOT NULL DEFAULT false;

-- Settings change audit log: add 'draft_alltime_only' to v_cols (function recreated, rest unchanged).
CREATE OR REPLACE FUNCTION public.trg_lal_league_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_cols text[] := ARRAY['name','max_teams','cap_enabled','finance_enabled','trade_enabled','fa_enabled','rookie_draft_enabled','coaching_enabled',
        'training_enabled','start_draft_enabled','draft_pool','draft_format','draft_pool_strategy','draft_pick_duration_sec','rookie_pool_inclusion',
        'draft_scheduled_at','tournament_format','match_format','season_start_date','real_time_pace','draft_total_rounds','season_end_date',
        'draft_ovr_min','draft_ovr_max','finals_match_format','tournament_start_at','games_per_real_day','sim_real_start_at','draft_auto_pick_after_misses',
        'duration_weeks','daily_window_start_min','daily_window_end_min','playoff_team_count','virtual_season_year','play_in_enabled',
        'salary_cap_amount','luxury_tax_enabled','luxury_tax_amount','apron1_enabled','apron1_amount','apron2_enabled','apron2_amount',
        'salary_floor_enabled','salary_floor_amount','cba_rules_enabled','draft_year_max','draft_year_min','draft_retired_filter','draft_alltime_only','cap_growth_rate',
        'trade_deadline_date','trade_deadline_enabled','max_roster_size','two_way_deadline_date','two_way_slots','use_custom_overrides',
        'day_length_min','playoff_game_interval_days','replay_minutes','personal_draft_format','two_way_enabled','draft_deadline_at',
        'contract_mode','draft_salary_scale','trade_salary_matching_enabled','overtime_enabled'];
    v_old jsonb := to_jsonb(OLD); v_new jsonb := to_jsonb(NEW); v_changed jsonb := '{}'::jsonb; c text; v_room uuid;
BEGIN
    FOREACH c IN ARRAY v_cols LOOP
        IF v_old -> c IS DISTINCT FROM v_new -> c THEN
            v_changed := v_changed || jsonb_build_object(c, jsonb_build_object('before', v_old -> c, 'after', v_new -> c));
        END IF;
    END LOOP;
    IF v_changed = '{}'::jsonb THEN RETURN NEW; END IF;
    SELECT id INTO v_room FROM rooms WHERE league_id = NEW.id ORDER BY created_at DESC LIMIT 1;
    IF v_room IS NULL THEN RETURN NEW; END IF;
    PERFORM public.league_action_log_write(v_room, NULL, 'league_settings_update', '{}', '{}', jsonb_build_object('changed', v_changed));
    RETURN NEW;
END; $function$;

-- Rollback:
--   ALTER TABLE leagues DROP COLUMN draft_alltime_only;
--   Recreate trg_lal_league_settings() without 'draft_alltime_only' in v_cols.
