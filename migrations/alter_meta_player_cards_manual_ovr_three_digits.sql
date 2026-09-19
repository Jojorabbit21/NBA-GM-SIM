-- 카드 전용 OVR 고정값(manual_ovr) 상한을 99 → 999로 확장.
-- 사용자 요청 "카드 전용에만 세 자리 수의 오버롤을 적용하고싶다."
-- 일반 선수 OVR(calculateOvr / ovrEngine의 40~99 clamp, meta_players)은 그대로 둔다 —
-- 세 자리 OVR은 meta_player_cards.manual_ovr에 직접 입력한 카드에서만 나올 수 있다.
ALTER TABLE public.meta_player_cards
    DROP CONSTRAINT IF EXISTS meta_player_cards_manual_ovr_range;
ALTER TABLE public.meta_player_cards
    ADD CONSTRAINT meta_player_cards_manual_ovr_range CHECK (manual_ovr IS NULL OR (manual_ovr BETWEEN 0 AND 999));

-- 롤백: 위 두 문장을 BETWEEN 0 AND 99로 되돌리기 전에 100 이상 값이 있으면 먼저 정리해야 한다.
--   UPDATE public.meta_player_cards SET manual_ovr = 99 WHERE manual_ovr > 99;

-- [적용] 2026-09-20 Supabase MCP로 반영
