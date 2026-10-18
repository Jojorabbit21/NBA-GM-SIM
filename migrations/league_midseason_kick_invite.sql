-- ============================================================================
-- 세션 시작 후 강퇴(AI 전환) + 초대 링크로 AI 팀 인계 (2026-10-18)
--
-- 배경: 기존 강퇴(release_team)는 모집 중(recruiting)에만 가능했고, 세션 시작 후엔 탈퇴/강퇴가 모두 막혀 있었다
--       (leaveLeague의 클라이언트 가드). 팀이 사라지면 일정이 깨지므로 "삭제" 대신 "AI 전환"으로 처리한다.
--
-- 모델: room_members가 사람/AI 공통의 신뢰 원천(AI는 가짜 UUID 00000000-0000-0000-0000-{n:12}, is_ai=true).
--       league_teams.user_id는 auth.users FK라 AI는 NULL + is_ai=true.
--
-- 1) kick_member_to_ai(room, user)  — 리그 방장/전역 어드민. 진행 중 세션의 사람 멤버를 AI로 전환.
--      room_members: user_id→가짜 UUID, is_ai=true (전술/뎁스차트/팀명/색상 보존)
--      league_teams: user_id=NULL, is_ai=true, nickname=NULL
--      보류 중 트레이드 제안 취소(release_team과 동일 규칙)
-- 2) league_invites 테이블 + create/revoke/get/accept RPC
--      초대 = 특정 AI 팀 1개를 지정한 1회용 토큰(기본 무기한, 필요 시 시간 지정). 수락자가 그 팀을 인계받는다.
--      accept: room_members UPDATE(가짜→수락자, is_ai=false)라 INSERT 트리거(정원/로터리 차단)를 타지 않는다
--              — 정원은 AI가 이미 차지한 자리를 그대로 넘겨받으므로 변하지 않는다.
--      league_teams.user_id 변경은 기존 트리거(lal_teams_au)가 team_reassign 감사 로그로 자동 기록.
--
-- 롤백:
--   DROP FUNCTION public.kick_member_to_ai(uuid, uuid);
--   DROP FUNCTION public.create_league_invite(uuid, uuid, integer);
--   DROP FUNCTION public.revoke_league_invite(uuid);
--   DROP FUNCTION public.get_league_invite(text);
--   DROP FUNCTION public.accept_league_invite(text);
--   DROP TABLE public.league_invites;
--   (이미 인계된 팀은 그대로 유지됨 — 되돌리려면 kick_member_to_ai 대신 수동 SQL 필요)
-- ============================================================================

-- ── 1. 강퇴 → AI 전환 ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kick_member_to_ai(p_room_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid     uuid := auth.uid();
    v_admin   uuid;
    v_status  text;
    v_member  room_members%ROWTYPE;
    v_team    league_teams%ROWTYPE;
    v_fake    uuid;
    v_n       integer := 0;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

    SELECT l.admin_user_id, l.status INTO v_admin, v_status
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = p_room_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'room_not_found'; END IF;
    IF v_admin <> v_uid AND NOT public.is_global_admin() THEN RAISE EXCEPTION 'not_league_admin'; END IF;

    IF v_status = 'recruiting' THEN RAISE EXCEPTION 'session_not_started'; END IF;   -- 모집 중엔 release_team
    IF v_status = 'drafting'   THEN RAISE EXCEPTION 'draft_in_progress';   END IF;   -- 드래프트룸 인메모리 상태 보호
    IF v_status = 'finished'   THEN RAISE EXCEPTION 'league_finished';     END IF;
    IF p_user_id = v_uid       THEN RAISE EXCEPTION 'cannot_kick_self';    END IF;

    -- 가짜 UUID 채번을 직렬화(같은 방에서 동시에 두 명을 내보내도 충돌 없게)
    PERFORM 1 FROM rooms WHERE id = p_room_id FOR UPDATE;

    SELECT * INTO v_member FROM room_members WHERE room_id = p_room_id AND user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'member_not_found'; END IF;
    IF v_member.is_ai THEN RAISE EXCEPTION 'already_ai'; END IF;

    SELECT * INTO v_team FROM league_teams WHERE room_id = p_room_id AND user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'team_not_found'; END IF;

    LOOP
        v_n := v_n + 1;
        v_fake := ('00000000-0000-0000-0000-' || lpad(v_n::text, 12, '0'))::uuid;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM room_members WHERE room_id = p_room_id AND user_id = v_fake);
    END LOOP;

    UPDATE room_members
       SET user_id = v_fake, is_ai = true, ai_gm_personality = 'balanced', ai_gm_sliders = NULL
     WHERE room_id = p_room_id AND user_id = p_user_id;

    UPDATE league_teams
       SET user_id = NULL, is_ai = true, nickname = NULL
     WHERE id = v_team.id;

    UPDATE league_trade_offers
       SET status = 'cancelled', resolved_at = now()
     WHERE status = 'pending' AND room_id = p_room_id
       AND (from_team_id = v_team.id OR to_team_id = v_team.id);

    RETURN jsonb_build_object('team_id', v_team.id, 'ai_user_id', v_fake);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.kick_member_to_ai(uuid, uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.kick_member_to_ai(uuid, uuid) TO authenticated;

-- ── 2. 초대 ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.league_invites (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id     uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    team_id     uuid NOT NULL REFERENCES public.league_teams(id) ON DELETE CASCADE,
    token       text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
    created_by  uuid NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz,   -- NULL = 무기한(기본). 팀이 인계되면 status/팀 상태로 자동 소멸
    accepted_by uuid,
    accepted_at timestamptz
);
-- 팀당 유효한 초대는 1개
CREATE UNIQUE INDEX IF NOT EXISTS league_invites_one_pending_per_team
    ON public.league_invites (team_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS league_invites_room_idx ON public.league_invites (room_id, created_at DESC);

ALTER TABLE public.league_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.league_invites FROM anon, authenticated;
GRANT SELECT ON public.league_invites TO authenticated;

-- 열람은 방장/전역 어드민만(토큰이 곧 권한이므로). 쓰기는 RPC 단일 경로.
CREATE POLICY league_invites_admin_select ON public.league_invites
    FOR SELECT TO authenticated
    USING (
        public.is_global_admin()
        OR EXISTS (
            SELECT 1 FROM rooms r JOIN leagues l ON l.id = r.league_id
            WHERE r.id = league_invites.room_id AND l.admin_user_id = auth.uid()
        )
    );

CREATE OR REPLACE FUNCTION public.create_league_invite(p_room_id uuid, p_team_id uuid, p_expires_hours integer DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid    uuid := auth.uid();
    v_admin  uuid;
    v_status text;
    v_team   league_teams%ROWTYPE;
    v_inv    league_invites%ROWTYPE;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
    IF p_expires_hours IS NOT NULL AND (p_expires_hours < 1 OR p_expires_hours > 8760) THEN RAISE EXCEPTION 'invalid_expiry'; END IF;

    SELECT l.admin_user_id, l.status INTO v_admin, v_status
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = p_room_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'room_not_found'; END IF;
    IF v_admin <> v_uid AND NOT public.is_global_admin() THEN RAISE EXCEPTION 'not_league_admin'; END IF;
    IF v_status IN ('recruiting','drafting','finished') THEN RAISE EXCEPTION 'invite_not_available'; END IF;

    SELECT * INTO v_team FROM league_teams WHERE id = p_team_id AND room_id = p_room_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'team_not_found'; END IF;
    IF v_team.user_id IS NOT NULL OR NOT COALESCE(v_team.is_ai, false) THEN RAISE EXCEPTION 'team_not_ai'; END IF;

    -- 기존 유효 초대는 폐기하고 새로 발급(링크 재발급 = 이전 링크 무효화)
    UPDATE league_invites SET status = 'revoked' WHERE team_id = p_team_id AND status = 'pending';

    INSERT INTO league_invites (room_id, team_id, created_by, expires_at)
    VALUES (p_room_id, p_team_id, v_uid, CASE WHEN p_expires_hours IS NULL THEN NULL ELSE now() + make_interval(hours => p_expires_hours) END)
    RETURNING * INTO v_inv;

    RETURN jsonb_build_object('id', v_inv.id, 'token', v_inv.token, 'expires_at', v_inv.expires_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_league_invite(p_invite_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid   uuid := auth.uid();
    v_room  uuid;
    v_admin uuid;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
    SELECT i.room_id INTO v_room FROM league_invites i WHERE i.id = p_invite_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
    SELECT l.admin_user_id INTO v_admin FROM rooms r JOIN leagues l ON l.id = r.league_id WHERE r.id = v_room;
    IF v_admin <> v_uid AND NOT public.is_global_admin() THEN RAISE EXCEPTION 'not_league_admin'; END IF;
    UPDATE league_invites SET status = 'revoked' WHERE id = p_invite_id AND status = 'pending';
END;
$function$;

-- 초대 페이지 미리보기. 토큰을 아는 로그인 유저만 호출 — 리그/팀 표시 정보와 유효성만 돌려준다.
CREATE OR REPLACE FUNCTION public.get_league_invite(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid    uuid := auth.uid();
    v_inv    league_invites%ROWTYPE;
    v_team   league_teams%ROWTYPE;
    v_league leagues%ROWTYPE;
    v_state  text;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
    SELECT * INTO v_inv FROM league_invites WHERE token = p_token;
    IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;

    SELECT * INTO v_team FROM league_teams WHERE id = v_inv.team_id;
    SELECT l.* INTO v_league FROM rooms r JOIN leagues l ON l.id = r.league_id WHERE r.id = v_inv.room_id;

    v_state := CASE
        WHEN v_inv.status = 'accepted'                                  THEN 'accepted'
        WHEN v_inv.status = 'revoked'                                   THEN 'revoked'
        WHEN v_inv.expires_at IS NOT NULL AND v_inv.expires_at <= now() THEN 'expired'
        WHEN v_team.user_id IS NOT NULL OR NOT COALESCE(v_team.is_ai, false) THEN 'team_taken'
        ELSE 'valid'
    END;

    RETURN jsonb_build_object(
        'state',          v_state,
        'league_id',      v_league.id,
        'league_name',    v_league.name,
        'team_name',      v_team.team_name,
        'team_abbr',      v_team.team_abbr,
        'team_slug',      v_team.team_slug,
        'color_primary',  v_team.color_primary,
        'color_secondary',v_team.color_secondary,
        'color_text',     v_team.color_text,
        'expires_at',     v_inv.expires_at,
        'already_member', EXISTS (SELECT 1 FROM room_members WHERE room_id = v_inv.room_id AND user_id = v_uid)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_league_invite(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid    uuid := auth.uid();
    v_inv    league_invites%ROWTYPE;
    v_team   league_teams%ROWTYPE;
    v_status text;
    v_league uuid;
    v_nick   text;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

    SELECT * INTO v_inv FROM league_invites WHERE token = p_token FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
    IF v_inv.status = 'accepted' THEN RAISE EXCEPTION 'invite_used'; END IF;
    IF v_inv.status = 'revoked'  THEN RAISE EXCEPTION 'invite_revoked'; END IF;
    IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at <= now() THEN RAISE EXCEPTION 'invite_expired'; END IF;

    SELECT l.id, l.status INTO v_league, v_status FROM rooms r JOIN leagues l ON l.id = r.league_id WHERE r.id = v_inv.room_id;
    IF v_status IN ('recruiting','drafting','finished') THEN RAISE EXCEPTION 'invite_not_available'; END IF;

    IF EXISTS (SELECT 1 FROM room_members WHERE room_id = v_inv.room_id AND user_id = v_uid) THEN
        RAISE EXCEPTION 'already_member';
    END IF;

    SELECT * INTO v_team FROM league_teams WHERE id = v_inv.team_id FOR UPDATE;
    IF NOT FOUND OR v_team.user_id IS NOT NULL OR NOT COALESCE(v_team.is_ai, false) THEN RAISE EXCEPTION 'team_taken'; END IF;

    -- 팀 슬러그로 현재 AI 멤버 행을 찾아 수락자로 인계 (전술/뎁스차트/팀 정보는 그대로)
    UPDATE room_members
       SET user_id = v_uid, is_ai = false, ai_gm_personality = NULL, ai_gm_sliders = NULL, joined_at = now()
     WHERE room_id = v_inv.room_id AND team_id = v_team.team_slug AND is_ai = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'team_taken'; END IF;

    SELECT nullif(btrim(nickname), '') INTO v_nick FROM profiles WHERE id = v_uid;
    UPDATE league_teams SET user_id = v_uid, is_ai = false, nickname = v_nick WHERE id = v_team.id;

    UPDATE league_invites SET status = 'accepted', accepted_by = v_uid, accepted_at = now() WHERE id = v_inv.id;

    RETURN jsonb_build_object('league_id', v_league, 'team_id', v_team.id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_league_invite(uuid, uuid, integer) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_league_invite(uuid)               FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_league_invite(text)                  FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.accept_league_invite(text)               FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.create_league_invite(uuid, uuid, integer) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.revoke_league_invite(uuid)               TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_league_invite(text)                  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.accept_league_invite(text)               TO authenticated;
