-- [2026-11-17] Mark an incoming trade offer as read when its receiver responds to it.
--
-- Background: respond_trade_offer (accept/reject) and create_trade_offer (counter) never set to_team_read_at,
-- so an offer the receiver answered without opening it stayed "unread". Opening the inbox later called
-- mark_trade_offer_read() on those already-resolved offers; each UPDATE fired a Realtime event to the sender, whose
-- notification hook read it as a result and showed a fake "trade executed" / "trade rejected" toast (2026-11-17,
-- NBA-L S2). The client now ignores updates without a status change; this trigger removes the stale unread state.
--
-- Base: no existing function is redefined (new function + new trigger only). Live triggers on the table before this
-- change: lal_offer_ai (AFTER INSERT), lal_offer_au (AFTER UPDATE OF status) — untouched.
-- BEFORE trigger edits NEW in the same row UPDATE, so no additional UPDATE / Realtime event is produced.
-- Only responses by the receiving team itself count (resolved_as_admin IS NOT TRUE); system transitions
-- (cancelled / expired / invalidated) and admin overrides leave the offer unread.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_trade_offer_mark_read_on_response ON public.league_trade_offers;
--   DROP FUNCTION IF EXISTS public.trg_trade_offer_mark_read_on_response();

CREATE OR REPLACE FUNCTION public.trg_trade_offer_mark_read_on_response()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.to_team_read_at IS NULL
       AND NEW.status IN ('accepted', 'rejected', 'countered')
       AND OLD.status IS DISTINCT FROM NEW.status
       AND NEW.resolved_as_admin IS NOT TRUE THEN
        NEW.to_team_read_at := now();
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_trade_offer_mark_read_on_response ON public.league_trade_offers;
CREATE TRIGGER trg_trade_offer_mark_read_on_response
    BEFORE UPDATE OF status ON public.league_trade_offers
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_trade_offer_mark_read_on_response();
