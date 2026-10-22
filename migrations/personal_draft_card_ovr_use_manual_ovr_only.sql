-- [2026-10-22] 개인 팩 드래프트 카드 OVR 조회에서 base_attributes.ovr 폴백 제거.
-- 카드 OVR의 단일 소스는 meta_player_cards.manual_ovr(505/505 백필 완료). 예전엔 카드 편집기가 저장 때마다
-- 카드 사본의 base_attributes.ovr에 유효 OVR을 이중 기록해 두고 SQL이 그걸 폴백으로 읽었는데,
-- 이중 저장이라 어긋날 수 있어 제거한다. 우선순위: 포맷 cardOvrById → manual_ovr → 0.
-- 롤백: COALESCE 두 번째 인자를 COALESCE(c.manual_ovr, (c.base_attributes->>'ovr')::integer)로 되돌리기.
CREATE OR REPLACE FUNCTION public.personal_draft_card_ovr(p_format jsonb, p_card_id text)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(
        (p_format->'cardOvrById'->>p_card_id)::integer,
        (SELECT c.manual_ovr FROM meta_player_cards c WHERE c.id::text = p_card_id),
        0
    );
$function$;
