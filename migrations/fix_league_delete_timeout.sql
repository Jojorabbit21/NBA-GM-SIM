-- "Weakly League"(실제로 완주된 main_league, games 1327/league_events 5400/room_player_state
-- 451행 등 총 9천여 행) 삭제 시 "canceling statement due to statement timeout" 에러 수정.
--
-- 원인 두 가지:
-- 1) leagues/rooms를 참조하는 FK 컬럼 중 6개(league_allstar_votes.league_id,
--    league_events.league_id, league_player_awards.league_id, league_trade_offers.league_id,
--    league_user_history.league_id, tournament_archives.room_id)에 인덱스가 없어서, CASCADE/
--    SET NULL 처리 시 해당 컬럼을 시퀀셜 스캔으로 찾아야 했다(Postgres는 FK 참조 컬럼에
--    자동으로 인덱스를 만들지 않음 — PK 쪽만 인덱스가 생김).
-- 2) `authenticated` 롤의 statement_timeout이 8초(Supabase 기본값)로 고정돼 있어, 완주된
--    시즌 하나를 삭제하며 10여 개 테이블에 걸쳐 총 9천+ 행을 CASCADE로 지우는 무거운 작업이
--    이 짧은 제한에 걸림. 전체 API 롤의 타임아웃을 늘리면 느린 쿼리 버그를 가려버릴 위험이
--    있으므로, 이 무거운 삭제 한 건에만 국한된 SECURITY DEFINER RPC를 새로 만들어 그
--    트랜잭션 안에서만 SET LOCAL로 타임아웃을 늘린다.

-- ── 1. 누락된 인덱스 6개 추가 ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_league_allstar_votes_league_id ON public.league_allstar_votes(league_id);
CREATE INDEX IF NOT EXISTS idx_league_events_league_id        ON public.league_events(league_id);
CREATE INDEX IF NOT EXISTS idx_league_player_awards_league_id ON public.league_player_awards(league_id);
CREATE INDEX IF NOT EXISTS idx_league_trade_offers_league_id  ON public.league_trade_offers(league_id);
CREATE INDEX IF NOT EXISTS idx_league_user_history_league_id  ON public.league_user_history(league_id);
CREATE INDEX IF NOT EXISTS idx_tournament_archives_room_id    ON public.tournament_archives(room_id);

-- ── 2. 리그 삭제 전용 RPC — 이 호출 트랜잭션 안에서만 타임아웃 연장 ───────────────
-- 권한 조건은 기존 클라이언트 deleteLeague()의 필터 로직과 동일: 전역 어드민이거나
-- 그 리그 본인 방장(leagues.admin_user_id = auth.uid())이어야 한다. RLS(l_admin_write /
-- l_global_admin_manage)가 이미 이 조건을 강제하지만, SECURITY DEFINER로 RLS를 우회하는
-- 함수이므로 여기서 다시 명시적으로 검사해야 한다.

CREATE OR REPLACE FUNCTION public.admin_delete_league(p_league_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (
        public.is_global_admin()
        OR EXISTS (SELECT 1 FROM leagues WHERE id = p_league_id AND admin_user_id = auth.uid())
    ) THEN
        RAISE EXCEPTION 'not_authorized';
    END IF;

    -- 이 트랜잭션(=이 RPC 호출) 안에서만 적용, 커밋/롤백과 함께 자동 원복.
    SET LOCAL statement_timeout = '60s';

    DELETE FROM leagues WHERE id = p_league_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'league_not_found';
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_league(uuid) TO authenticated;
