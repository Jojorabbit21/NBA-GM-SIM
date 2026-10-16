-- ============================================================================
-- 드래프트 로터리(순서 추첨) 이후 세션 신규 참가 명시적 차단 (2026-10-16)
--
-- 배경: 로터리 후 "팀 변경"만 claim_team이 막고(draft_already_ordered), "신규 참가"는 막는 장치가
-- 없었다. 로터리 직후 AI 슬롯이 정원을 채워 room_members 정원 트리거(check_room_capacity)에
-- 우연히 걸릴 뿐이라, AI 채우기가 실패/지연되면 팀 없는 신규 참가자가 빈 팀을 선점할 수 있었고
-- 에러 메시지도 부정확("방이 가득 참")했다.
--
-- 변경:
-- 1) claim_team: 로터리 완료 후 팀 없는 유저의 선점도 거부(lottery_already_done).
--    (이미 팀이 있으면 기존대로 draft_already_ordered)
-- 2) room_members BEFORE INSERT 트리거(block_join_after_lottery): 로터리 완료 후 사람(is_ai=false)의
--    신규 멤버 추가 거부. AI 멤버(서버가 로터리 직후 채움)와 이미 멤버인 유저의 멱등 upsert는 허용.
--    RLS 때문에 비회원에겐 league_teams가 안 보이므로 SECURITY DEFINER.
--
-- "로터리 완료" 판정 = league_teams.draft_order가 하나라도 있음(기존 claim_team/run_draft_lottery와 동일).
-- 개인 팩 드래프트/토너먼트는 draft_order를 쓰지 않아 영향 없음.
--
-- 롤백: DROP TRIGGER trg_block_join_after_lottery ON public.room_members;
--       DROP FUNCTION public.block_join_after_lottery();
--       claim_team은 아래 로터리 분기(lottery_already_done RAISE)만 제거한 이전 정의(add_personal_draft_deadline.sql)로 복원.
-- ============================================================================

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

    IF v_lottery_done THEN
        SELECT EXISTS(
            SELECT 1 FROM league_teams
            WHERE room_id = p_room_id AND user_id = p_user_id
        ) INTO v_has_team;

        IF v_has_team THEN
            RAISE EXCEPTION 'draft_already_ordered';   -- 팀 변경 불가
        END IF;
        RAISE EXCEPTION 'lottery_already_done';        -- 신규 참가(팀 선점) 불가
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

    UPDATE league_teams
    SET user_id = NULL
    WHERE room_id = p_room_id AND user_id = p_user_id AND id != p_team_id;

    UPDATE league_teams
    SET user_id = p_user_id
    WHERE id = p_team_id
    RETURNING * INTO v_team;

    UPDATE room_members
    SET team_id = v_team.team_slug
    WHERE room_id = p_room_id AND user_id = p_user_id;

    RETURN row_to_json(v_team)::jsonb;
END;
$function$;

CREATE OR REPLACE FUNCTION public.block_join_after_lottery()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
    -- AI 멤버는 서버가 로터리 직후 슬롯을 채우며 넣는다 — 허용
    IF COALESCE(NEW.is_ai, false) THEN
        RETURN NEW;
    END IF;

    -- 이미 멤버인 유저의 멱등 upsert(joinLeague의 ignoreDuplicates)는 허용
    IF EXISTS (SELECT 1 FROM room_members WHERE room_id = NEW.room_id AND user_id = NEW.user_id) THEN
        RETURN NEW;
    END IF;

    IF EXISTS (SELECT 1 FROM league_teams WHERE room_id = NEW.room_id AND draft_order IS NOT NULL) THEN
        RAISE EXCEPTION 'lottery_already_done';
    END IF;

    RETURN NEW;
END;
$function$;

-- 트리거 이름이 trg_room_capacity보다 알파벳 앞이라 정원 에러보다 먼저 실행된다(더 정확한 메시지).
DROP TRIGGER IF EXISTS trg_block_join_after_lottery ON public.room_members;
CREATE TRIGGER trg_block_join_after_lottery
    BEFORE INSERT ON public.room_members
    FOR EACH ROW EXECUTE FUNCTION public.block_join_after_lottery();
