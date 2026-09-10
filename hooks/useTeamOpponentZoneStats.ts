
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';

// get_team_opponent_zone_stats RPC(migrations/add_player_season_stats_league_rpc.sql) —
// buildLeagueTeams.ts의 oppZoneStats(팀이 상대에게 허용한 존별 슈팅 시즌 누적, 전술 >
// 인사이트 탭 CONTEST 섹션 전용)를 서버에서 집계. 예전엔 room 전체 game_pbp 원본을 클라
// 이언트에서 직접 순회해 계산했다.
export type TeamOpponentZoneStats = Record<string, Record<string, number>>;

const ZONE_KEYS = [
    'zone_rim_m', 'zone_rim_a', 'zone_paint_m', 'zone_paint_a',
    'zone_mid_l_m', 'zone_mid_l_a', 'zone_mid_c_m', 'zone_mid_c_a', 'zone_mid_r_m', 'zone_mid_r_a',
    'zone_c3_l_m', 'zone_c3_l_a', 'zone_c3_r_m', 'zone_c3_r_a',
    'zone_atb3_l_m', 'zone_atb3_l_a', 'zone_atb3_c_m', 'zone_atb3_c_a', 'zone_atb3_r_m', 'zone_atb3_r_a',
] as const;

export function useTeamOpponentZoneStats(roomId: string | undefined | null) {
    return useQuery({
        queryKey: ['teamOpponentZoneStats', roomId],
        enabled: !!roomId,
        queryFn: async (): Promise<TeamOpponentZoneStats> => {
            const { data, error } = await supabase.rpc('get_team_opponent_zone_stats', { p_room_id: roomId });
            if (error) throw error;

            const result: TeamOpponentZoneStats = {};
            for (const row of (data ?? []) as Record<string, string | number>[]) {
                const teamId = String(row.team_id);
                const zones: Record<string, number> = {};
                for (const k of ZONE_KEYS) zones[k] = Number(row[k]);
                result[teamId] = zones;
            }
            return result;
        },
    });
}
