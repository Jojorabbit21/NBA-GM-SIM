-- ============================================================
-- league_trade_offers.to_team_read_at 컬럼 + mark_trade_offer_read() RPC 신설
--
-- 배경: 트레이드 인박스 리스트에 받은 제안의 읽음/안읽음을 표시하기 위함. 싱글플레이의
-- user_messages.is_read와는 완전히 다른 테이블이라 별도 컬럼이 필요. "발신"(내가 보낸)
-- 오퍼는 보낸 쪽이 이미 아는 내용이라 읽음 개념을 적용하지 않고, "수신"(내가 받은) 오퍼에만
-- 해당 — to_team_id 소유 팀 유저만 자기 팀이 받은 오퍼를 읽음 처리할 수 있어야 하므로
-- 클라이언트에서 직접 UPDATE하지 않고 SECURITY DEFINER RPC로 소유권 검증 후 처리.
--
-- [적용 완료] 2026-08-31 Supabase MCP로 반영
-- ============================================================

ALTER TABLE public.league_trade_offers
    ADD COLUMN IF NOT EXISTS to_team_read_at timestamptz;

CREATE OR REPLACE FUNCTION public.mark_trade_offer_read(p_offer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid   uuid := auth.uid();
    v_offer league_trade_offers%ROWTYPE;
    v_team  league_teams%ROWTYPE;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO v_offer FROM league_trade_offers WHERE id = p_offer_id;
    IF v_offer.id IS NULL THEN
        RAISE EXCEPTION 'offer_not_found';
    END IF;

    -- 이 오퍼를 "받은" 팀의 소유자만 읽음 처리 가능 — 발신 팀 유저나 제3자는 불가.
    SELECT * INTO v_team FROM league_teams WHERE id = v_offer.to_team_id;
    IF v_team.user_id IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'not_team_owner';
    END IF;

    UPDATE league_trade_offers SET to_team_read_at = now()
    WHERE id = p_offer_id AND to_team_read_at IS NULL;
END;
$function$;
