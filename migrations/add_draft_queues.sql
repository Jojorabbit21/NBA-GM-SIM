-- ============================================================================
-- 멀티 드래프트 큐 (2026-10-23) — docs/plan/draft-queue-plan.md D1/D2
--
-- 유저가 드래프트 시작 전부터 "뽑고 싶은 선수 순서"를 저장해 두고, 오토픽/타임아웃 대납/스킵/자동완료 시
-- Fly 드래프트 서버(server/src/DraftRoom.ts)가 이 순서대로 지명한다(큐 소진 시 BPA 폴백).
--
-- - rooms.draft_cursor 에 넣지 않는 이유: submit_draft_pick_v2 RPC 가 매 픽마다 cursor 를 통째로 덮어써서
--   그 안의 부가 상태는 안정적으로 남지 않는다(오토픽 상태가 메모리 전용이 된 것과 같은 이유).
-- - 클라이언트는 이 테이블에 직접 접근하지 않는다: 큐 편집은 WS `setQueue` 메시지로 서버가 service role 로
--   upsert 한다(WS auth 로 userId 검증 완료). RLS 는 켜되 정책을 두지 않아 anon/authenticated 전부 거부.
-- - 유저당 1행, 방 삭제 시 CASCADE. 별도 정리 스윕 없음.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.draft_queues (
    room_id    uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id    uuid NOT NULL,
    player_ids text[] NOT NULL DEFAULT '{}',
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (room_id, user_id)
);

ALTER TABLE public.draft_queues ENABLE ROW LEVEL SECURITY;
-- 정책 없음: Fly 서버(service role)만 읽고 쓴다.
