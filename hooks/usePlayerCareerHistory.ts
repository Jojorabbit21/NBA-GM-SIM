
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import type { CareerSeasonStat } from '../types/player';

/**
 * [2026-09-03] FA(어느 팀 로스터에도 없는) 선수 프로필 전용 — meta_players.career_history
 * (레전드 선수의 실제 과거 시즌 기록, JSONB)를 이 선수 한 명만 targeted로 조회한다.
 *
 * 로스터 화면들이 쓰는 useMultiSearchData/poolPlayers는 드래프트풀 전체(수백 명)를 한 번에
 * 불러오는 쿼리라 select에 career_history를 넣으면 선수당 최대 30여 시즌짜리 JSONB를
 * 전원 몫으로 얹게 돼 페이로드가 크게 늘어난다(목록 화면엔 커리어 기록이 필요 없는데도).
 * 대신 프로필 화면에서 그 선수 하나를 볼 때만 이 훅으로 별도 조회 — 행 1개, 시즌 수십 개
 * 수준이라 비용이 미미하다. staleTime: Infinity는 usePlayerShortCodes.ts/useMultiSearchData.ts와
 * 동일한 근거(meta_players는 사실상 불변·읽기전용).
 */
export function usePlayerCareerHistory(playerId: string | undefined, enabled: boolean) {
    return useQuery({
        queryKey: ['playerCareerHistory', playerId],
        enabled: enabled && !!playerId,
        staleTime: Infinity,
        gcTime: Infinity,
        queryFn: async (): Promise<CareerSeasonStat[]> => {
            const { data, error } = await supabase
                .from('meta_players')
                .select('career_history')
                .eq('id', playerId!)
                .maybeSingle();
            if (error) throw error;
            return (data?.career_history as CareerSeasonStat[] | null) ?? [];
        },
    });
}
