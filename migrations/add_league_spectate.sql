-- 리그 관전(Spectate) 모드: 참가하지 않은 로그인 유저가 진행 중/종료된 리그를 읽기 전용으로 둘러본다.
--
-- 설계 원칙
--  * 쓰기는 일절 열지 않는다 — 여기서는 SELECT 정책만 "추가(permissive)"한다. 기존 my_room_ids()/
--    accessible_room_ids()는 멤버 판정·쓰기 정책에도 쓰이므로 건드리지 않는다.
--  * 리그별 on/off: leagues.spectate_enabled (기본 false — 마이그레이션 적용만으로는 아무 것도 노출되지 않음).
--  * 대상 상태는 in_progress / finished 뿐 — recruiting / drafting 은 관전 불가(드래프트 정보 보호).
--  * 로그인 필수(auth.uid() IS NOT NULL) — 비로그인(anon) 은 열지 않는다.
--  * 열지 않는 것: personal_draft_progress, league_trade_offers/blocks(트레이드), 채팅, 전술 프리셋,
--    league_allstar_votes, draft_picks, league_action_logs.
--  * 전술/트레이드 숨김은 UI 단에서 처리한다(room_members.tactics 는 기존에도 같은 방 멤버에게 읽히는 컬럼).
--
-- 롤백: 맨 아래 ROLLBACK 블록 참고.

ALTER TABLE public.leagues
    ADD COLUMN IF NOT EXISTS spectate_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.leagues.spectate_enabled IS
    '참가하지 않은 로그인 유저의 읽기 전용 관전 허용 여부(in_progress/finished 상태에서만 유효).';

-- 관전 가능한 방 id 집합. SECURITY DEFINER — leagues/rooms 를 RLS 와 무관하게 읽어 판정한다.
CREATE OR REPLACE FUNCTION public.spectatable_room_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT r.id
    FROM rooms r
    JOIN leagues l ON l.id = r.league_id
    WHERE auth.uid() IS NOT NULL
      AND l.spectate_enabled
      AND l.status IN ('in_progress', 'finished')
$function$;

GRANT EXECUTE ON FUNCTION public.spectatable_room_ids() TO authenticated;

-- ── SELECT 전용 추가 정책 ────────────────────────────────────────────────────

CREATE POLICY r_spectator_select ON public.rooms
    FOR SELECT USING (id IN (SELECT spectatable_room_ids()));

CREATE POLICY rm_spectator_select ON public.room_members
    FOR SELECT USING (room_id IN (SELECT spectatable_room_ids()));

CREATE POLICY g_spectator_select ON public.games
    FOR SELECT USING (room_id IN (SELECT spectatable_room_ids()));

-- game_pbp: 멤버 정책과 동일하게 리플레이 종료(공개 시각) 이후 행만.
CREATE POLICY game_pbp_spectator_select ON public.game_pbp
    FOR SELECT USING (
        room_id IN (SELECT spectatable_room_ids())
        AND (game_start_time + room_replay_interval(room_id)) <= now()
    );

-- league_events: le_member_select 와 동일 — game_id 가 있는 이벤트는 해당 경기 PBP 가 공개된 뒤에만.
CREATE POLICY le_spectator_select ON public.league_events
    FOR SELECT USING (
        room_id IN (SELECT spectatable_room_ids())
        AND (
            game_id IS NULL
            OR EXISTS (
                SELECT 1 FROM game_pbp gp
                WHERE gp.room_id = league_events.room_id
                  AND gp.game_id = league_events.game_id
                  AND (gp.game_start_time + room_replay_interval(gp.room_id)) <= now()
            )
        )
    );

CREATE POLICY lps_spectator_select ON public.league_player_seasons
    FOR SELECT USING (room_id IN (SELECT spectatable_room_ids()));

CREATE POLICY lpa_spectator_select ON public.league_player_awards
    FOR SELECT USING (room_id IN (SELECT spectatable_room_ids()));

CREATE POLICY lvd_spectator_select ON public.league_virtual_days
    FOR SELECT USING (room_id IN (SELECT spectatable_room_ids()));

CREATE POLICY pss_spectator_select ON public.player_stat_streaks
    FOR SELECT USING (room_id IN (SELECT spectatable_room_ids()));

CREATE POLICY rps_spectator_select ON public.room_player_state
    FOR SELECT USING (room_id IN (SELECT spectatable_room_ids()));

CREATE POLICY rpi_spectator_select ON public.room_player_instances
    FOR SELECT USING (room_id IN (SELECT spectatable_room_ids()));

CREATE POLICY league_transactions_spectator_select ON public.league_transactions
    FOR SELECT USING (room_id IN (SELECT spectatable_room_ids()));

-- 경기 URL 단축코드 — 일정/박스스코어 링크에 필요.
CREATE POLICY gsc_spectator_select ON public.game_short_codes
    FOR SELECT USING (room_id IN (SELECT spectatable_room_ids()));

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (필요 시 아래를 실행)
--   DROP POLICY IF EXISTS r_spectator_select ON public.rooms;
--   DROP POLICY IF EXISTS rm_spectator_select ON public.room_members;
--   DROP POLICY IF EXISTS g_spectator_select ON public.games;
--   DROP POLICY IF EXISTS game_pbp_spectator_select ON public.game_pbp;
--   DROP POLICY IF EXISTS le_spectator_select ON public.league_events;
--   DROP POLICY IF EXISTS lps_spectator_select ON public.league_player_seasons;
--   DROP POLICY IF EXISTS lpa_spectator_select ON public.league_player_awards;
--   DROP POLICY IF EXISTS lvd_spectator_select ON public.league_virtual_days;
--   DROP POLICY IF EXISTS pss_spectator_select ON public.player_stat_streaks;
--   DROP POLICY IF EXISTS rps_spectator_select ON public.room_player_state;
--   DROP POLICY IF EXISTS rpi_spectator_select ON public.room_player_instances;
--   DROP POLICY IF EXISTS league_transactions_spectator_select ON public.league_transactions;
--   DROP POLICY IF EXISTS gsc_spectator_select ON public.game_short_codes;
--   DROP FUNCTION IF EXISTS public.spectatable_room_ids();
--   ALTER TABLE public.leagues DROP COLUMN IF EXISTS spectate_enabled;
