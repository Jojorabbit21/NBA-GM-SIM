-- [2026-11-07] Regular season end safety net: when a league has regular_season_ended_at stamped
-- (scheduler.checkSeasonCompletions), expire every still-pending trade offer that existed at that moment.
-- Needed for leagues with trade_deadline_enabled = false, where expire_trade_offers_past_deadline()
-- never fires. Offers created after the stamp are not touched (idempotent, safe to re-run each sweep).
CREATE OR REPLACE FUNCTION public.expire_trade_offers_at_regular_season_end()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH u AS (
    UPDATE public.league_trade_offers o
    SET status = 'expired',
        resolved_at = now(),
        sim_date_at_resolution = current_virtual_date(o.room_id)
    FROM public.leagues l
    WHERE o.league_id = l.id
      AND o.status = 'pending'
      AND l.regular_season_ended_at IS NOT NULL
      AND o.created_at <= l.regular_season_ended_at
    RETURNING 1
  )
  SELECT count(*)::int FROM u;
$function$;

-- Server-only: do not expose to clients.
REVOKE ALL ON FUNCTION public.expire_trade_offers_at_regular_season_end() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_trade_offers_at_regular_season_end() TO service_role;
