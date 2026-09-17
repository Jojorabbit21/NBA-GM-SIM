-- ============================================================
-- 계약 유형(ContractType)/예외 조항(SigningType) 어휘 재설계 — DB 백필 + RPC 갱신
--
-- 배경: admin/player-editor의 "계약 타입"(11종)/"체결 방식"(9종)을 4종(ContractType:
-- extension/free_agent/rookie_scale/two_way) + 10종(SigningType, "예외 조항"으로 개명:
-- full_bird/early_bird/non_bird/non_taxpayer_mle/taxpayer_mle/room_mle/biannual_exception/
-- minimum_exception/second_round_exception/rookie_scale_exception)으로 재설계. 하위호환
-- 매핑 대신 DB를 직접 새 값으로 일괄 변환하기로 확정(사용자 선택, 대화 참고) — 이 파일
-- 실행 후에는 코드도 새 값만 사용하도록 함께 배포한다(types/player.ts, types/fa.ts 등).
--
-- 적용 대상 3곳: meta_players.base_attributes->'contract'(단일), ->'contract_history'
-- (배열), room_player_state.contract(단일). 실측(2026-09-17, Supabase MCP로 사전 조회):
--   meta_players.contract.type 분포: veteran 364, null 221, min 118, rookie 80, max 48,
--     extension 15, two-way 11, standard 2(★예상 밖 값 — 자유계약으로 간주해 free_agent 매핑)
--   meta_players.contract.signingType: 0건(비어있음, 매핑 불필요하나 방어적으로 포함)
--   meta_players.contract_history[].type 분포: rookie 14, min 12, veteran 6, extension 4,
--     two-way 4, 10-day 2, max 1
--   room_player_state.contract.type 분포: veteran 371, max 96, rookie 68, min 62,
--     extension 12, two-way 4, null 2
--   room_player_state.contract.signingType 분포: two_way 4, cap_space 5(둘 다 신규 스킴에선
--     "예외 없음"이라 키 자체를 삭제)
--
-- 순서: ①데이터 UPDATE(3곳) → ②RPC 재정의(two-way 하드코딩을 two_way로) — 원자적 적용.
-- ============================================================

-- ── ① meta_players.base_attributes->'contract'.type ──
UPDATE meta_players
SET base_attributes = jsonb_set(
    base_attributes,
    '{contract,type}',
    to_jsonb(
        CASE base_attributes->'contract'->>'type'
            WHEN 'rookie' THEN 'rookie_scale'
            WHEN 'veteran' THEN 'free_agent'
            WHEN 'max' THEN 'free_agent'
            WHEN 'min' THEN 'free_agent'
            WHEN '10-day' THEN 'free_agent'
            WHEN 'qualifying_offer' THEN 'free_agent'
            WHEN 'standard' THEN 'free_agent'
            WHEN 'two-way' THEN 'two_way'
            WHEN 'rookie_extension' THEN 'extension'
            WHEN 'veteran_extension' THEN 'extension'
            WHEN 'veteran_max_extension' THEN 'extension'
            WHEN 'extension' THEN 'extension'
            ELSE base_attributes->'contract'->>'type'
        END
    )
)
WHERE base_attributes->'contract'->>'type' IS NOT NULL;

-- meta_players.contract.signingType — 실측 0건이지만 방어적으로 포함(cap_space/two_way면 삭제)
UPDATE meta_players
SET base_attributes = base_attributes #- '{contract,signingType}'
WHERE base_attributes->'contract'->>'signingType' IN ('cap_space', 'two_way');

UPDATE meta_players
SET base_attributes = jsonb_set(
    base_attributes,
    '{contract,signingType}',
    to_jsonb(
        CASE base_attributes->'contract'->>'signingType'
            WHEN 'non_tax_mle' THEN 'non_taxpayer_mle'
            WHEN 'tax_mle' THEN 'taxpayer_mle'
            WHEN 'bae' THEN 'biannual_exception'
            WHEN 'bird_full' THEN 'full_bird'
            WHEN 'bird_early' THEN 'early_bird'
            WHEN 'bird_non' THEN 'non_bird'
            WHEN 'vet_min' THEN 'minimum_exception'
            WHEN 'second_round' THEN 'second_round_exception'
            WHEN 'rookie_scale' THEN 'rookie_scale_exception'
            ELSE base_attributes->'contract'->>'signingType'
        END
    )
)
WHERE base_attributes->'contract'->>'signingType' IS NOT NULL
  AND base_attributes->'contract'->>'signingType' NOT IN ('cap_space', 'two_way');

-- ── ② meta_players.base_attributes->'contract_history'[].type (배열 재조립) ──
UPDATE meta_players
SET base_attributes = jsonb_set(
    base_attributes,
    '{contract_history}',
    (
        SELECT jsonb_agg(
            CASE WHEN elem->>'type' IS NOT NULL THEN
                jsonb_set(
                    elem, '{type}',
                    to_jsonb(
                        CASE elem->>'type'
                            WHEN 'rookie' THEN 'rookie_scale'
                            WHEN 'veteran' THEN 'free_agent'
                            WHEN 'max' THEN 'free_agent'
                            WHEN 'min' THEN 'free_agent'
                            WHEN '10-day' THEN 'free_agent'
                            WHEN 'qualifying_offer' THEN 'free_agent'
                            WHEN 'standard' THEN 'free_agent'
                            WHEN 'two-way' THEN 'two_way'
                            WHEN 'rookie_extension' THEN 'extension'
                            WHEN 'veteran_extension' THEN 'extension'
                            WHEN 'veteran_max_extension' THEN 'extension'
                            WHEN 'extension' THEN 'extension'
                            ELSE elem->>'type'
                        END
                    )
                )
            ELSE elem END
        )
        FROM jsonb_array_elements(base_attributes->'contract_history') elem
    )
)
WHERE base_attributes ? 'contract_history';

-- ── ③ room_player_state.contract.type / .signingType ──
UPDATE room_player_state
SET contract = jsonb_set(
    contract,
    '{type}',
    to_jsonb(
        CASE contract->>'type'
            WHEN 'rookie' THEN 'rookie_scale'
            WHEN 'veteran' THEN 'free_agent'
            WHEN 'max' THEN 'free_agent'
            WHEN 'min' THEN 'free_agent'
            WHEN '10-day' THEN 'free_agent'
            WHEN 'qualifying_offer' THEN 'free_agent'
            WHEN 'standard' THEN 'free_agent'
            WHEN 'two-way' THEN 'two_way'
            WHEN 'rookie_extension' THEN 'extension'
            WHEN 'veteran_extension' THEN 'extension'
            WHEN 'veteran_max_extension' THEN 'extension'
            WHEN 'extension' THEN 'extension'
            ELSE contract->>'type'
        END
    )
)
WHERE contract->>'type' IS NOT NULL;

UPDATE room_player_state
SET contract = contract #- '{signingType}'
WHERE contract->>'signingType' IN ('cap_space', 'two_way');

UPDATE room_player_state
SET contract = jsonb_set(
    contract,
    '{signingType}',
    to_jsonb(
        CASE contract->>'signingType'
            WHEN 'non_tax_mle' THEN 'non_taxpayer_mle'
            WHEN 'tax_mle' THEN 'taxpayer_mle'
            WHEN 'bae' THEN 'biannual_exception'
            WHEN 'bird_full' THEN 'full_bird'
            WHEN 'bird_early' THEN 'early_bird'
            WHEN 'bird_non' THEN 'non_bird'
            WHEN 'vet_min' THEN 'minimum_exception'
            WHEN 'second_round' THEN 'second_round_exception'
            WHEN 'rookie_scale' THEN 'rookie_scale_exception'
            ELSE contract->>'signingType'
        END
    )
)
WHERE contract->>'signingType' IS NOT NULL
  AND contract->>'signingType' NOT IN ('cap_space', 'two_way');

-- ── ④ RPC 재정의: 'two-way' 하드코딩 비교를 'two_way'로 (백필 뒤이므로 하위호환 불필요) ──

CREATE OR REPLACE FUNCTION public.sign_free_agent(p_team_id uuid, p_player_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid        uuid := auth.uid();
    v_team       league_teams%ROWTYPE;
    v_admin      boolean;
    v_fa_enabled boolean;
    v_max_roster integer;
    v_regular_count integer;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO v_team FROM league_teams WHERE id = p_team_id FOR UPDATE;
    IF v_team.id IS NULL THEN
        RAISE EXCEPTION 'team_not_found';
    END IF;

    SELECT l.admin_user_id = v_uid, coalesce(l.fa_enabled, true), coalesce(l.max_roster_size, 15)
    INTO v_admin, v_fa_enabled, v_max_roster
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = v_team.room_id;

    IF NOT v_fa_enabled THEN
        RAISE EXCEPTION 'fa_disabled';
    END IF;
    IF NOT v_admin AND v_team.user_id IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'not_team_owner';
    END IF;
    IF v_team.roster ? p_player_id THEN
        RAISE EXCEPTION 'already_on_roster';
    END IF;
    IF EXISTS (
        SELECT 1 FROM league_teams
        WHERE room_id = v_team.room_id AND id <> v_team.id AND roster ? p_player_id
    ) THEN
        RAISE EXCEPTION 'player_already_signed';
    END IF;

    SELECT count(*) INTO v_regular_count
    FROM jsonb_array_elements_text(v_team.roster) AS pid
    WHERE NOT EXISTS (
        SELECT 1 FROM room_player_state rps
        WHERE rps.room_id = v_team.room_id AND rps.player_id = pid
          AND rps.contract->>'type' = 'two_way'
    );
    IF v_regular_count >= v_max_roster THEN
        RAISE EXCEPTION 'roster_full';
    END IF;

    UPDATE league_teams SET roster = roster || to_jsonb(p_player_id) WHERE id = v_team.id;

    RETURN jsonb_build_object('ok', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sign_free_agent_negotiated(
    p_team_id     uuid,
    p_player_id   text,
    p_contract    jsonb,
    p_signing_type text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid        uuid := auth.uid();
    v_team       league_teams%ROWTYPE;
    v_admin      boolean;
    v_fa_enabled boolean;
    v_max_roster integer;
    v_two_way_slots integer;
    v_regular_count integer;
    v_two_way_count integer;
    v_sim_date   date;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO v_team FROM league_teams WHERE id = p_team_id FOR UPDATE;
    IF v_team.id IS NULL THEN
        RAISE EXCEPTION 'team_not_found';
    END IF;

    SELECT l.admin_user_id = v_uid, coalesce(l.fa_enabled, true), coalesce(l.max_roster_size, 15), coalesce(l.two_way_slots, 3)
    INTO v_admin, v_fa_enabled, v_max_roster, v_two_way_slots
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = v_team.room_id;

    IF NOT v_fa_enabled THEN
        RAISE EXCEPTION 'fa_disabled';
    END IF;
    IF NOT v_admin AND v_team.user_id IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'not_team_owner';
    END IF;
    IF v_team.roster ? p_player_id THEN
        RAISE EXCEPTION 'already_on_roster';
    END IF;
    IF EXISTS (
        SELECT 1 FROM league_teams
        WHERE room_id = v_team.room_id AND id <> v_team.id AND roster ? p_player_id
    ) THEN
        RAISE EXCEPTION 'player_already_signed';
    END IF;

    IF p_contract->>'type' = 'two_way' THEN
        SELECT count(*) INTO v_two_way_count
        FROM jsonb_array_elements_text(v_team.roster) AS pid
        WHERE EXISTS (
            SELECT 1 FROM room_player_state rps
            WHERE rps.room_id = v_team.room_id AND rps.player_id = pid
              AND rps.contract->>'type' = 'two_way'
        );
        IF v_two_way_count >= v_two_way_slots THEN
            RAISE EXCEPTION 'two_way_slots_full';
        END IF;
    ELSE
        SELECT count(*) INTO v_regular_count
        FROM jsonb_array_elements_text(v_team.roster) AS pid
        WHERE NOT EXISTS (
            SELECT 1 FROM room_player_state rps
            WHERE rps.room_id = v_team.room_id AND rps.player_id = pid
              AND rps.contract->>'type' = 'two_way'
        );
        IF v_regular_count >= v_max_roster THEN
            RAISE EXCEPTION 'roster_full';
        END IF;
    END IF;

    UPDATE league_teams SET roster = roster || to_jsonb(p_player_id) WHERE id = v_team.id;

    INSERT INTO room_player_state (room_id, player_id, contract)
    VALUES (v_team.room_id, p_player_id, p_contract)
    ON CONFLICT (room_id, player_id) DO UPDATE SET contract = EXCLUDED.contract;

    SELECT sim_date::date INTO v_sim_date FROM rooms WHERE id = v_team.room_id;

    INSERT INTO league_transactions (room_id, type, team_id, player_id, sim_date, acted_by, resolved_as_admin, details)
    VALUES (
        v_team.room_id, 'fa_sign', v_team.id, p_player_id, v_sim_date, v_uid, v_admin,
        jsonb_build_object('contract', p_contract, 'signingType', p_signing_type)
    );

    RETURN jsonb_build_object('ok', true);
END;
$function$
;

-- [적용 예정] Supabase MCP로 반영 후 이 주석을 날짜로 교체
