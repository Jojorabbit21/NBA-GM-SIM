-- 개인 팩 드래프트 진행 행을 Realtime 발행에 추가 — hooks/usePersonalDraftStatus.ts가
-- (room_id, team_id) 행의 변경을 구독해 마지막 픽 직후 사이드바/헤더/로비 메뉴를 즉시 갱신한다.
-- (RLS pdp_member_select가 그대로 적용되므로 같은 룸 멤버에게만 이벤트가 전달된다.)
ALTER PUBLICATION supabase_realtime ADD TABLE public.personal_draft_progress;

-- [적용] 2026-09-18 Supabase MCP로 반영
