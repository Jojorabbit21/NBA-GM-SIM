-- 2026-11-15 — sign_free_agent() 거래 기록(league_transactions) INSERT 복원
--
-- 배경: 2026-09-17 add_roster_full_check_to_fa_rpcs.sql 이 sign_free_agent() 를 재정의하면서
-- 09-10 에 넣었던 league_transactions INSERT(type='fa_sign') 가 빠졌다.
-- 결과: CBA 꺼진 리그의 즉시 FA 영입(MultiFreeAgentView.handleSign → signFreeAgent)이
-- 거래 내역·선수 이동 내역·'open_market' 업적(sweepFrontOffice 가 fa_sign 을 읽음)에서 빠졌다.
-- (sign_free_agent_negotiated 는 INSERT 가 살아 있어 영향 없음.)
--
-- 변경: 라이브 정의(11-15 확인, two_way 슬롯 제외 로직 포함)를 그대로 두고 INSERT 만 추가.
--   인게임 날짜는 rooms.sim_date(실제 KST)가 아니라 current_virtual_date() — 09-10 교정 규칙 유지.
--
-- 롤백: 아래 함수에서 v_sim_date 선언·대입과 INSERT 두 문장만 지운 정의로 CREATE OR REPLACE.
--       (이미 쌓인 fa_sign 행은 정상 기록이라 지우지 않아도 됨.)

CREATE OR REPLACE FUNCTION public.sign_free_agent(p_team_id uuid, p_player_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid           uuid := auth.uid();
    v_team          league_teams%ROWTYPE;
    v_admin         boolean;
    v_fa_enabled    boolean;
    v_max_roster    integer;
    v_regular_count integer;
    v_sim_date      date;
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
    -- 같은 리그(room) 내 다른 팀이 이미 데려간 선수인지 확인(동시 계약 경합 방지)
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

    -- [2026-11-15] 09-17 재정의에서 빠졌던 거래 기록 복원 — 인게임 날짜는 가상 캘린더 기준
    v_sim_date := current_virtual_date(v_team.room_id);
    INSERT INTO league_transactions (room_id, type, team_id, player_id, sim_date, acted_by, resolved_as_admin)
    VALUES (v_team.room_id, 'fa_sign', v_team.id, p_player_id, v_sim_date, v_uid, v_admin);

    RETURN jsonb_build_object('ok', true);
END;
$function$;
