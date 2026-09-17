-- [2026-09-16] 트레이드 데드라인이 지나면(가상 캘린더 날짜 기준) 그 리그의 보류중(pending)
-- 트레이드 제안을 전부 'expired'로 일괄 처리한다.
--
-- 기존 expire_trade_offers()는 오퍼 개별 만료 시각(expires_at, 생성 후 N일 뒤 자동 만료)만
-- 검사하므로 데드라인 경과와는 별개 개념 — create_trade_offer/respond_trade_offer(accept) RPC가
-- 이미 검사하는 조건(migrations/add_leagues_trade_deadline_enabled.sql)과 동일한 기준
-- (trade_deadline_enabled IS DISTINCT FROM false && trade_deadline_date IS NOT NULL &&
--  current_virtual_date(room_id) > trade_deadline_date)을 그대로 재사용해 별도 함수로 추가.
--
-- server/src/scheduler.ts의 sweepExpiredTradeOffers()가 기존 expire_trade_offers()와 함께
-- 10분 간격으로 이 함수도 호출한다.
CREATE OR REPLACE FUNCTION public.expire_trade_offers_past_deadline()
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
      AND l.trade_deadline_enabled IS DISTINCT FROM false
      AND l.trade_deadline_date IS NOT NULL
      AND current_virtual_date(o.room_id) > l.trade_deadline_date
    RETURNING 1
  )
  SELECT count(*)::int FROM u;
$function$;
