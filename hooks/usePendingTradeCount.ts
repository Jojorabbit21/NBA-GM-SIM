
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { listPendingTradeOffers } from '../services/multi/tradeService';

// [2026-09-07] MultiSidebar.tsx(사이드바 배지)와 MultiHeaderNavMenu.tsx(상단 메뉴 배지)가
// "받은 트레이드 제안 중 안읽은 개수"를 각자 독립적인 useState+useEffect로 따로 조회하고
// 있었다 — listPendingTradeOffers 자체가 내부에서 incoming/outgoing 2개 쿼리를 날리는데,
// 두 컴포넌트가 항상 같이 마운트돼 있어 동일한 값을 위해 매번 요청이 2배(+ Realtime 구독도
// 채널 2개)로 나갔다(네트워크 탭 실측으로 발견). react-query로 옮겨 queryKey를 공유하면
// 두 컴포넌트가 동시에 마운트돼도 실제 fetch는 한 번만 나간다(react-query가 동일 key의
// 동시 요청을 자동으로 하나로 묶어줌).
export function usePendingTradeCount(
    roomId: string | null | undefined,
    myTeamDbId: string | null | undefined,
): number {
    const queryClient = useQueryClient();
    const enabled = !!roomId && !!myTeamDbId;

    const { data: pendingTradeCount = 0 } = useQuery({
        queryKey: ['pendingTradeCount', roomId, myTeamDbId],
        enabled,
        queryFn: async () => {
            const { incoming } = await listPendingTradeOffers(roomId!, myTeamDbId!);
            // (인박스 "메세지함" 탭 배지와 동일한 기준: to_team_read_at이 null인 것만 카운트)
            return incoming.filter(o => !o.to_team_read_at).length;
        },
    });

    // 채널 자체는 이 훅을 쓰는 컴포넌트 수만큼 열리지만(예: 사이드바+헤더 메뉴 동시 마운트 시
    // 2개), 콜백이 하는 일은 invalidateQueries뿐이라 실제 refetch는 react-query가 같은
    // queryKey에 대해 다시 한 번만 묶어서 실행한다 — HTTP 요청 중복은 여기서도 사라짐.
    useEffect(() => {
        if (!enabled) return;
        const channel = supabase
            .channel(`trade-offers-badge-${roomId}-${myTeamDbId}`)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'league_trade_offers', filter: `to_team_id=eq.${myTeamDbId}` },
                () => queryClient.invalidateQueries({ queryKey: ['pendingTradeCount', roomId, myTeamDbId] }),
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [enabled, roomId, myTeamDbId, queryClient]);

    return pendingTradeCount;
}
