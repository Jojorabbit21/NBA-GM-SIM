import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import type { PlayTypeTotals } from './useTeamPlayTypeStats';

// get_player_playtype_stats RPC(migrations/add_player_playtype_stats.sql) — 방의 현재 시즌, 공개된(리플레이 끝난) 경기만
// 선수 1명의 플레이타입별 합산(이적했다면 팀 합산). 응답은 최대 12행.
// [2026-11-16] 선수 프로필 샷 차트 탭 하단 "플레이타입별 기록" 전용.

/** playType → 시즌 합계 */
export type PlayerPlayTypeTotals = Record<string, PlayTypeTotals>;

/** isPlayoff: false = 정규시즌만, true = 플레이오프만 */
export function usePlayerPlayTypeStats(roomId: string | undefined | null, playerId: string | undefined | null, isPlayoff = false) {
    return useQuery({
        queryKey: ['playerPlayTypeStats', roomId, playerId, isPlayoff],
        enabled: !!roomId && !!playerId,
        queryFn: async (): Promise<PlayerPlayTypeTotals> => {
            const { data, error } = await supabase.rpc('get_player_playtype_stats', { p_room_id: roomId, p_player_id: playerId, p_is_playoff: isPlayoff });
            if (error) throw error;
            const totals: PlayerPlayTypeTotals = {};
            for (const row of (data ?? []) as Record<string, string | number>[]) {
                totals[String(row.play_type)] = {
                    poss: Number(row.poss), pts: Number(row.pts), fga: Number(row.fga),
                    fgm: Number(row.fgm), fta: Number(row.fta), tov: Number(row.tov),
                };
            }
            return totals;
        },
    });
}
