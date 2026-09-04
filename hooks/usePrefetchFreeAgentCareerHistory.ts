
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import type { CareerSeasonStat } from '../types/player';

/**
 * [2026-09-04] "FA 화면 진입 시, 화면은 안 막고 백그라운드에서 전체를 미리 받아두자"는
 * 요청 — MultiFreeAgentView.tsx가 뜨는 순간, undraftedPlayers 전체의 career_history를
 * 벌크로 한 번에 조회해서 usePlayerCareerHistory.ts가 쓰는 것과 **동일한 쿼리키**
 * (['playerCareerHistory', playerId])에 개별 시딩해둔다. 이러면 MultiPlayerDetailView.tsx
 * 쪽 코드는 전혀 안 건드려도 된다 — 나중에 그 훅이 실행될 때 이미 캐시가 있으면
 * (staleTime: Infinity) 네트워크 요청 없이 즉시 반환된다.
 *
 * 목록 렌더링을 막지 않기 위해 이 훅 자체는 아무것도 렌더링에 쓰이는 값을 반환하지 않는다
 * (부수효과 전용 — react-query를 쓰는 이유는 staleTime/gcTime: Infinity로 "세션당 한 번만"
 * 실행되게 하기 위함일 뿐, loading/error 상태를 화면에서 참조하지 않는다).
 *
 * 실측(2026-09-04, MAIN 1 리그 기준): 드래프트풀 464명 중 career_history 보유 425명,
 * 합산 페이로드 약 2MB — 화면을 막고 받으면 체감 지연이 생기는 수준이라 백그라운드로 뺌.
 */
export function usePrefetchFreeAgentCareerHistory(playerIds: string[]) {
    const queryClient = useQueryClient();
    const sortedIds = [...playerIds].sort();

    useQuery({
        queryKey: ['faCareerHistoryBulkPrefetch', sortedIds.join(',')],
        enabled: sortedIds.length > 0,
        staleTime: Infinity,
        gcTime: Infinity,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('meta_players')
                .select('id, career_history')
                .in('id', sortedIds);
            if (error) throw error;

            for (const row of data ?? []) {
                // usePlayerCareerHistory.ts와 동일한 쿼리키에 시딩 — 이미 그 키로 캐시가
                // 있으면(예: 유저가 이 벌크 프리페치보다 먼저 특정 선수 프로필에 들어가
                // targeted-fetch가 먼저 도착한 경우) 덮어써도 결과는 동일(같은 원본
                // 데이터)이라 무해하다.
                queryClient.setQueryData(
                    ['playerCareerHistory', row.id],
                    (row.career_history as CareerSeasonStat[] | null) ?? [],
                );
            }
            return data?.length ?? 0;
        },
    });
}
