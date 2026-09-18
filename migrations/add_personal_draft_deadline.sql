-- ============================================================================
-- 개인 팩 드래프트 참가/드래프트 마감 시각 (docs/plan/tournament-personal-pack-draft-plan.md 후속)
--
-- 사용자 요청: "토너먼트 세션을 만들 때 드래프트 기한을 설정할 수 있도록 만들어줘.
-- 그 드래프트 기한을 넘기면 새 참가자가 더 이상 참가할 수 없고, 아직 드래프트 하지 않은
-- 참가자는 자동으로 강퇴되어야해"
--
-- - leagues.draft_deadline_at (timestamptz, null=마감 없음) 추가.
-- - claim_team RPC: 개인 팩 드래프트 리그에서 마감이 지났으면 신규 참가/팀 변경 모두 거부.
--   (release_team은 건드리지 않음 — 탈퇴/강퇴는 언제든 가능해야 하므로.)
-- - 강퇴 자체는 server/src/personalDraftDeadline.ts(스케줄러)가 담당 — 새 SQL 함수 불필요,
--   기존 release_team RPC를 그대로 재사용(트레이드 취소까지 자동 처리되는 걸 그대로 활용).
-- ============================================================================

ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS draft_deadline_at timestamptz NULL;

CREATE OR REPLACE FUNCTION public.claim_team(p_room_id uuid, p_team_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_team         league_teams%ROWTYPE;
    v_lottery_done boolean;
    v_has_team     boolean;
    v_pdf          jsonb;
    v_deadline     timestamptz;
BEGIN
    -- [2026-09-18] 개인 팩 드래프트 마감 — 마감 시각이 지나면 신규 참가/팀 변경 모두 차단.
    -- 공유풀 드래프트(personal_draft_format NULL)나 마감 미설정(draft_deadline_at NULL)이면 no-op.
    SELECT l.personal_draft_format, l.draft_deadline_at INTO v_pdf, v_deadline
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = p_room_id;

    IF v_pdf IS NOT NULL AND v_deadline IS NOT NULL AND now() > v_deadline THEN
        RAISE EXCEPTION 'draft_deadline_passed';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM league_teams
        WHERE room_id = p_room_id AND draft_order IS NOT NULL
        LIMIT 1
    ) INTO v_lottery_done;

    -- 로터리 이후에는 팀 변경 금지 (이미 팀을 선점한 유저만 차단)
    -- 신규 참가자의 빈 팀 선점은 허용
    IF v_lottery_done THEN
        SELECT EXISTS(
            SELECT 1 FROM league_teams
            WHERE room_id = p_room_id AND user_id = p_user_id
        ) INTO v_has_team;

        IF v_has_team THEN
            RAISE EXCEPTION 'draft_already_ordered';
        END IF;
    END IF;

    SELECT * INTO v_team
    FROM league_teams
    WHERE room_id = p_room_id AND id = p_team_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'team not found';
    END IF;

    IF v_team.user_id IS NOT NULL AND v_team.user_id != p_user_id THEN
        RAISE EXCEPTION 'team_already_claimed';
    END IF;

    -- 기존 선점 팀 반환 (로터리 전 팀 변경 시에만 실행됨)
    UPDATE league_teams
    SET user_id = NULL
    WHERE room_id = p_room_id AND user_id = p_user_id AND id != p_team_id;

    -- 새 팀 선점
    UPDATE league_teams
    SET user_id = p_user_id
    WHERE id = p_team_id
    RETURNING * INTO v_team;

    -- room_members.team_id 동기화
    UPDATE room_members
    SET team_id = v_team.team_slug
    WHERE room_id = p_room_id AND user_id = p_user_id;

    RETURN row_to_json(v_team)::jsonb;
END;
$function$;

-- [적용] 2026-09-18 Supabase MCP로 반영
