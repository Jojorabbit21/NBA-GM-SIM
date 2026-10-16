-- [2026-10-16] league_transactions를 Realtime 발행 대상에 추가.
-- 다른 유저의 FA 서명/방출이 히스토리·홈 최근 거래에 즉시 반영되도록 클라이언트
-- (hooks/useLeagueTransactionsRealtime.ts)가 postgres_changes로 구독한다.
-- SELECT RLS(accessible_room_ids)가 그대로 적용되므로 방 멤버만 이벤트를 받는다.
-- 롤백: ALTER PUBLICATION supabase_realtime DROP TABLE public.league_transactions;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'league_transactions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.league_transactions;
    END IF;
END $$;
