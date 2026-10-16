import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';

// [2026-10-16] FA 서명/방출 기록(league_transactions)은 전역 staleTime: Infinity 때문에 한 번 받으면 다시 조회되지 않아,
// 같은 화면의 하위 탭(자유 계약)에서 계약한 뒤 히스토리 탭으로 가도, 다른 유저의 거래도 새로고침 전까지 보이지 않았다.
// 이 키들을 한 곳에서 무효화한다 — 보고 있는 화면(active)만 즉시 재조회되고 나머지는 stale 표시만 돼 다음 진입 때 조회된다.
export function invalidateLeagueTransactions(queryClient: QueryClient, roomId: string | null | undefined): void {
    if (!roomId) return;
    queryClient.invalidateQueries({ queryKey: ['leagueTransactionsAll', roomId] });
    queryClient.invalidateQueries({ queryKey: ['homeLeagueTransactions', roomId] });
    queryClient.invalidateQueries({ queryKey: ['playerTransactionHistory', roomId] });
}

/**
 * 방 안 모든 유저의 FA 서명/방출을 실시간으로 반영. LeagueLayout에 한 번만 건다(화면 이동·부트스트랩 게이트로
 * 하위 화면이 언마운트돼도 구독이 유지되도록). 서명이 몰려도 재조회가 한 번으로 묶이게 400ms 디바운스
 * (hooks/useLeagueHeadlines.ts의 league_events 구독과 같은 값).
 * 재연결 시(SUBSCRIBED 재수신)에는 끊긴 동안의 변경을 흡수하려고 한 번 더 무효화한다 — 최초 구독은 진입 직후라 제외.
 */
export function useLeagueTransactionsRealtime(roomId: string | null | undefined): void {
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!roomId) return;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let firstSubscribe = true;

        const scheduleInvalidate = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => invalidateLeagueTransactions(queryClient, roomId), 400);
        };

        const channel = supabase
            .channel(`league-transactions-${roomId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'league_transactions', filter: `room_id=eq.${roomId}` },
                scheduleInvalidate,
            )
            .subscribe((status) => {
                if (status !== 'SUBSCRIBED') return;
                if (firstSubscribe) { firstSubscribe = false; return; }
                scheduleInvalidate();
            });

        return () => {
            if (timer) clearTimeout(timer);
            supabase.removeChannel(channel);
        };
    }, [roomId, queryClient]);
}
