-- ============================================================
-- league_transactions 테이블 신설 + sign_free_agent()/release_player() 갱신
--
-- 배경: 멀티리그에서 FA 서명/방출이 league_teams.roster 배열만 직접 갱신하고
-- 아무 기록도 남기지 않아(add_sign_free_agent_release_player_rpc.sql, 2026-09-04),
-- 선수 프로필 "선수 이동 내역" 위젯(services/multi/playerHistoryService.ts)이
-- draft_picks/league_trade_offers만 조회하고 PlayerTransactionType의 'fa'/'waive'를
-- 채우지 못하는 상태였음. 누가 언제 어떤 선수를 영입/방출했는지 추적 불가.
--
-- 설계: league_trade_offers/league_trade_offer_players(트레이드)는 "제안-수락" 상태를
-- 가진 이벤트라 오퍼 테이블 자체가 로그를 겸하고, 여러 선수가 양방향으로 오갈 수 있어
-- 1:N으로 분리돼 있음. FA/웨이브는 RPC 한 번으로 끝나는 원자적 액션(선수 1명=이벤트 1건)
-- 이라 그런 분리가 필요 없어 평평한 단일 테이블로 설계.
--
-- 트레이드 패턴을 그대로 따름:
--  - 현실 시각(created_at, DB 자동)과 시뮬 날짜(sim_date, rooms.sim_date 스냅샷) 둘 다 기록
--    (respond_trade_offer()의 v_sim_date 패턴과 동일 — add_sim_date_resolution_to_trade_offers.sql)
--  - 관리자 대리 처리 여부(resolved_as_admin)도 동일하게 반영
--  - player_id는 league_trade_offer_players.player_id와 동일하게 text(meta_players.id를 문자열로)
--  - RLS SELECT는 league_trade_blocks.ltb_select와 동일하게 accessible_room_ids() 재사용
--
-- details jsonb는 확장용 — 현재 FA는 캡 체크 없는 1단계 스코프(salary/contract 없음)라
-- 지금은 비워두지만, 캡 시스템이 붙으면 서명 당시 salary/contract_years 등을 넣을 자리.
-- [적용] 2026-09-04 Supabase MCP로 반영
-- ============================================================

CREATE TABLE IF NOT EXISTS public.league_transactions (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id            uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    type               text NOT NULL CHECK (type IN ('fa_sign', 'waive')),
    team_id            uuid NOT NULL REFERENCES public.league_teams(id) ON DELETE CASCADE,
    player_id          text NOT NULL,
    sim_date           date,
    created_at         timestamptz NOT NULL DEFAULT now(),
    acted_by           uuid REFERENCES auth.users(id),
    resolved_as_admin  boolean NOT NULL DEFAULT false,
    details            jsonb
);

CREATE INDEX IF NOT EXISTS idx_league_transactions_room_player
    ON public.league_transactions (room_id, player_id);

CREATE INDEX IF NOT EXISTS idx_league_transactions_team
    ON public.league_transactions (team_id);

ALTER TABLE public.league_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY league_transactions_select ON public.league_transactions
    FOR SELECT
    USING (room_id IN (SELECT accessible_room_ids()));

-- INSERT는 아래 SECURITY DEFINER RPC를 통해서만 이뤄짐(RLS는 SECURITY DEFINER 함수
-- 실행 시 우회되므로 별도 INSERT policy 불필요) — ltb_write 등과 달리 클라이언트가
-- 이 테이블에 직접 쓸 경로가 없음.

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
    v_sim_date   date;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO v_team FROM league_teams WHERE id = p_team_id FOR UPDATE;
    IF v_team.id IS NULL THEN
        RAISE EXCEPTION 'team_not_found';
    END IF;

    SELECT l.admin_user_id = v_uid, coalesce(l.fa_enabled, true)
    INTO v_admin, v_fa_enabled
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

    UPDATE league_teams SET roster = roster || to_jsonb(p_player_id) WHERE id = v_team.id;

    SELECT sim_date::date INTO v_sim_date FROM rooms WHERE id = v_team.room_id;

    INSERT INTO league_transactions (room_id, type, team_id, player_id, sim_date, acted_by, resolved_as_admin)
    VALUES (v_team.room_id, 'fa_sign', v_team.id, p_player_id, v_sim_date, v_uid, v_admin);

    RETURN jsonb_build_object('ok', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.release_player(p_team_id uuid, p_player_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid      uuid := auth.uid();
    v_team     league_teams%ROWTYPE;
    v_admin    boolean;
    v_sim_date date;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO v_team FROM league_teams WHERE id = p_team_id FOR UPDATE;
    IF v_team.id IS NULL THEN
        RAISE EXCEPTION 'team_not_found';
    END IF;

    SELECT l.admin_user_id = v_uid INTO v_admin
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = v_team.room_id;

    IF NOT v_admin AND v_team.user_id IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'not_team_owner';
    END IF;
    IF NOT (v_team.roster ? p_player_id) THEN
        RAISE EXCEPTION 'player_not_on_roster';
    END IF;

    UPDATE league_teams SET roster = (
        SELECT coalesce(jsonb_agg(e), '[]'::jsonb)
        FROM jsonb_array_elements_text(roster) e
        WHERE e <> p_player_id
    ) WHERE id = v_team.id;

    -- 방출 선수가 걸려있던 트레이드 블록 정리 (트레이드 accept 로직과 동일 관례)
    DELETE FROM league_trade_blocks WHERE team_id = v_team.id AND player_id = p_player_id;

    -- 뎁스차트/전술이 방금 방출된 선수를 참조하고 있을 수 있음 — 트레이드 accept와
    -- 동일하게 리셋(다음 접속 시 자동 재생성 폴백)해 stale 참조를 방지.
    UPDATE room_members SET tactics = NULL, depth_chart = NULL
    WHERE room_id = v_team.room_id AND team_id = v_team.team_slug;

    SELECT sim_date::date INTO v_sim_date FROM rooms WHERE id = v_team.room_id;

    INSERT INTO league_transactions (room_id, type, team_id, player_id, sim_date, acted_by, resolved_as_admin)
    VALUES (v_team.room_id, 'waive', v_team.id, p_player_id, v_sim_date, v_uid, v_admin);

    RETURN jsonb_build_object('ok', true);
END;
$function$
;
