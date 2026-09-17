
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import type { CareerSeasonStat } from '../types/player';

/**
 * [2026-09-17] usePlayerCareerHistory.ts(선수 1명 targeted 조회)의 배치 버전 — 재정 탭
 * (TeamPayrollTable.tsx)의 UFA/RFA 미리보기가 팀 로스터 전체(보통 15~20명)의 career_history를
 * 한 번에 필요로 해서 신설. hooks/useLeagueRawStats.ts의 RAW_PLAYER_COLS는 2026-09-07에
 * career_history를 의도적으로 뺐다(리그 로스터 250명+ 전체에 이 무거운 JSONB를 매번 얹는 게
 * 병목이었음) — 그 결정은 유지하고, 이 훅은 한 팀 로스터 규모(15~20명)로만 범위를 좁혀
 * 별도 조회한다. staleTime: Infinity는 usePlayerCareerHistory.ts와 동일 근거(meta_players는
 * 사실상 불변·읽기전용).
 */
export function usePlayerCareerHistoryBatch(playerIds: string[], enabled: boolean = true) {
    const idsKey = [...playerIds].sort().join(',');

    return useQuery({
        queryKey: ['playerCareerHistoryBatch', idsKey],
        enabled: enabled && playerIds.length > 0,
        staleTime: Infinity,
        gcTime: Infinity,
        queryFn: async (): Promise<Record<string, CareerSeasonStat[]>> => {
            const { data, error } = await supabase
                .from('meta_players')
                .select('id, career_history')
                .in('id', playerIds);
            if (error) throw error;

            const map: Record<string, CareerSeasonStat[]> = {};
            for (const row of data ?? []) {
                map[row.id as string] = (row.career_history as CareerSeasonStat[] | null) ?? [];
            }
            return map;
        },
    });
}
