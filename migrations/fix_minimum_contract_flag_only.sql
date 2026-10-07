-- ============================================================
-- 트레이드 최저연봉 예외 판정을 signingType 플래그 단일 기준으로 (금액 조건 제거)
--
-- 배경: add_trade_minimum_salary_exception.sql(2026-10-01)의 player_is_minimum_contract()는
-- "signingType = 'minimum_exception' OR 현재 연봉 ≤ 캡×2.35%"였다. 금액 조건은 standard 모드가 쓰는
-- meta_players 실제 계약에 서명 유형이 전혀 없던 상황의 안전망이었는데, 사용자 검토로 실제 계약
-- 118명(미니멈 41 포함)의 signingType을 정확히 채우고(dev-log 2026-10-01 (3), 2026-10-02 (6)) 투웨이
-- 금액의 free_agent 계약도 정리한 뒤 제거한다 — 기준이 둘이면 어긋났을 때 판정 근거가 모호하고,
-- 레전드 수기 계약($1M 등)이 금액 때문에 예외로 잡히는 부작용이 있었음. 클라이언트 미러
-- services/multi/tradeSalaryMatching.ts isMinimumContractPlayer()도 같은 커밋에서 플래그만 본다.
-- p_cap 인자는 respond_trade_offer() 호출부 호환을 위해 시그니처만 유지(미사용).
-- [적용] 2026-10-02 Supabase MCP로 반영
-- ============================================================
CREATE OR REPLACE FUNCTION public.player_is_minimum_contract(p_room_id uuid, p_player_id text, p_cap numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_contract jsonb;
BEGIN
    SELECT coalesce(rps.contract, mp.base_attributes->'contract')
    INTO v_contract
    FROM meta_players mp
    LEFT JOIN room_player_state rps ON rps.room_id = p_room_id AND rps.player_id = p_player_id
    WHERE mp.id::text = p_player_id;

    RETURN v_contract IS NOT NULL AND v_contract->>'signingType' = 'minimum_exception';
END;
$function$;
