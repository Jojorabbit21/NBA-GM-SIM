-- ============================================================================
-- 개인 팩 드래프트: "준비 단계"(AI 채우기 + 자동 드래프트 + 일정 생성)를 시작 시각 앞으로 분리
-- 사용자 지적 (2026-09-20): "토너먼트 시작 시각에 드래프트까지 진행하고 스케줄 생성까지 하면 첫 경기
-- 시작을 뒤로 미룰 수 밖에 없지 않나?" → 준비를 마감 시각(없으면 시작 5분 전)에 끝내고, 시작 시각엔
-- 상태 전환만 남긴다. forceInitSchedule은 tournament_start_at이 미래면 그 시각을 첫 경기(slot 0)로
-- 잡으므로 첫 경기가 정확히 시작 시각에 돌아간다.
--
-- - leagues.personal_draft_prepared_at: 준비 완료 시각(서버 personalDraftStart.ts가 원자적 클레임에 사용).
-- - claim_team: 개인 팩 드래프트 리그는 "유효 준비 시각" = COALESCE(draft_deadline_at, tournament_start_at - 5분)
--   이후, 또는 이미 준비가 끝났으면(prepared_at NOT NULL) 신규 참가/팀 변경을 거부(draft_deadline_passed —
--   클라이언트 에러 매핑 재사용). 준비 여유 5분은 server/src/personalDraftStart.ts PREP_LEAD_MIN 과 같은 값.
-- ============================================================================

ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS personal_draft_prepared_at timestamptz NULL;

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
    v_start        timestamptz;
    v_prepared     timestamptz;
    v_cutoff       timestamptz;
BEGIN
    -- [2026-09-18] 개인 팩 드래프트 마감 — 마감 시각이 지나면 신규 참가/팀 변경 모두 차단.
    -- [2026-09-20] 마감이 없으면 시작 5분 전(준비 시각)부터 차단, 준비가 끝난 리그도 차단.
    SELECT l.personal_draft_format, l.draft_deadline_at, l.tournament_start_at, l.personal_draft_prepared_at
    INTO v_pdf, v_deadline, v_start, v_prepared
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = p_room_id;

    IF v_pdf IS NOT NULL THEN
        v_cutoff := COALESCE(v_deadline, v_start - interval '5 minutes');
        IF v_prepared IS NOT NULL OR (v_cutoff IS NOT NULL AND now() > v_cutoff) THEN
            RAISE EXCEPTION 'draft_deadline_passed';
        END IF;
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

-- 롤백: 컬럼 DROP + claim_team 을 add_personal_draft_deadline.sql 본문으로 재정의.

-- [적용] 2026-09-20 Supabase MCP로 반영
