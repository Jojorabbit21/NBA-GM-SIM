import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';

// get_team_assist_pairs RPC(migrations/add_team_assist_pairs.sql) — 방의 현재 시즌, 공개된(리플레이 끝난) 경기만.
// 팀 1개의 패서→슈터 쌍별 어시스트 합산. [2026-11-21] 팀 전술 › 인사이트 "어시스트 네트워크" 전용.
// 보관본 엔진(stable 방)은 엔진이 이 집계를 만들지 않아 빈 배열.

/** passes = 야투로 이어진 패스, fgm = 그중 성공(add_team_assist_pairs_passes.sql) */
export interface AssistPairTotal { passerId: string; receiverId: string; ast: number; pts: number; games: number; passes: number; fgm: number }

/** isPlayoff: false = 정규시즌만, true = 플레이오프만 */
export function useTeamAssistPairs(roomId: string | undefined | null, teamId: string | undefined | null, isPlayoff = false) {
    return useQuery({
        queryKey: ['teamAssistPairs', roomId, teamId, isPlayoff],
        enabled: !!roomId && !!teamId,
        queryFn: async (): Promise<AssistPairTotal[]> => {
            const { data, error } = await supabase.rpc('get_team_assist_pairs', { p_room_id: roomId, p_team_id: teamId, p_is_playoff: isPlayoff });
            if (error) throw error;
            return ((data ?? []) as Record<string, string | number>[]).map(r => ({
                passerId: String(r.passer_id), receiverId: String(r.receiver_id),
                ast: Number(r.ast), pts: Number(r.pts), games: Number(r.games),
                passes: Number(r.passes ?? 0), fgm: Number(r.fgm ?? 0),
            }));
        },
    });
}
