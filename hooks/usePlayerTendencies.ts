
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import type { PlayerTendencies } from '../types/player';

/**
 * [2026-09-07] usePlayerCareerHistory.ts와 동일한 목적/패턴 — meta_players.tendencies
 * (존별 슛 성향 JSONB)를 이 선수 한 명만 targeted로 조회한다.
 *
 * 예전엔 useLeagueRawStats(RAW_PLAYER_COLS)가 리그 로스터 전체(최대 250명+)의 tendencies를
 * 매번 같이 받아왔는데, 실제로 이 필드를 쓰는 화면은 선수 프로필의 스카우팅 리포트
 * (generateScoutReport, utils/scoutReport.ts)뿐이라 그 화면에서 보고 있는 선수 한 명만
 * 조회하면 충분하다 — 나머지 화면(로스터/리더보드/전술/홈 위젯)은 이 필드를 아예 안 씀.
 * staleTime: Infinity는 usePlayerCareerHistory.ts와 동일한 근거(meta_players는 사실상 불변).
 */
export function usePlayerTendencies(playerId: string | undefined, enabled: boolean) {
    return useQuery({
        queryKey: ['playerTendencies', playerId],
        enabled: enabled && !!playerId,
        staleTime: Infinity,
        gcTime: Infinity,
        queryFn: async (): Promise<PlayerTendencies | null> => {
            const { data, error } = await supabase
                .from('meta_players')
                .select('tendencies')
                .eq('id', playerId!)
                .maybeSingle();
            if (error) throw error;
            return (data?.tendencies as PlayerTendencies | null) ?? null;
        },
    });
}
