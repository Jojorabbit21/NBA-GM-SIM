
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';

// get_team_season_advanced_stats RPC(migrations/add_team_season_advanced_stats_rpc.sql) —
// 팀 화면 헤더의 Off Rtg/Def Rtg/Pace 표시용. 포제션 추정이 필요해 서버에서 game_pbp
// 박스스코어를 팀 단위로 집계해 내려준다(사용법은 usePlayerSeasonStatsBatch와 동일 패턴).
export interface TeamAdvancedStats {
    g: number;
    ppg: number;
    oppg: number;
    offRtg: number;
    defRtg: number;
    pace: number;
}

export interface TeamAdvancedStatsWithRank extends TeamAdvancedStats {
    /** 리그 전체(30팀) 기준 순위 — ppg/offRtg/pace는 높을수록 1위, oppg/defRtg는 낮을수록 1위. */
    ppgRank: number;
    oppgRank: number;
    offRtgRank: number;
    defRtgRank: number;
    paceRank: number;
}

export type TeamAdvancedStatsMap = Record<string, TeamAdvancedStatsWithRank>;

interface RpcRow {
    team_id: string;
    g: number;
    ppg: string | number;
    oppg: string | number;
    off_rtg: string | number;
    def_rtg: string | number;
    pace: string | number;
}

function buildRank(entries: { id: string; value: number }[], descending: boolean): Record<string, number> {
    const sorted = [...entries].sort((a, b) => descending ? b.value - a.value : a.value - b.value);
    const ranks: Record<string, number> = {};
    sorted.forEach((e, i) => { ranks[e.id] = i + 1; });
    return ranks;
}

export function useTeamSeasonAdvancedStats(roomId: string | undefined | null) {
    return useQuery({
        queryKey: ['teamSeasonAdvancedStats', roomId],
        enabled: !!roomId,
        staleTime: 5 * 60 * 1000,
        queryFn: async (): Promise<TeamAdvancedStatsMap> => {
            const { data, error } = await supabase.rpc('get_team_season_advanced_stats', { p_room_id: roomId });
            if (error) throw error;

            const rows = (data ?? []) as RpcRow[];
            const stats: Record<string, TeamAdvancedStats> = {};
            for (const r of rows) {
                stats[r.team_id] = {
                    g: r.g,
                    ppg: Number(r.ppg), oppg: Number(r.oppg),
                    offRtg: Number(r.off_rtg), defRtg: Number(r.def_rtg), pace: Number(r.pace),
                };
            }

            const ppgRank = buildRank(rows.map(r => ({ id: r.team_id, value: Number(r.ppg) })), true);
            const oppgRank = buildRank(rows.map(r => ({ id: r.team_id, value: Number(r.oppg) })), false);
            const offRtgRank = buildRank(rows.map(r => ({ id: r.team_id, value: Number(r.off_rtg) })), true);
            const defRtgRank = buildRank(rows.map(r => ({ id: r.team_id, value: Number(r.def_rtg) })), false);
            const paceRank = buildRank(rows.map(r => ({ id: r.team_id, value: Number(r.pace) })), true);

            const result: TeamAdvancedStatsMap = {};
            for (const id of Object.keys(stats)) {
                result[id] = {
                    ...stats[id],
                    ppgRank: ppgRank[id], oppgRank: oppgRank[id],
                    offRtgRank: offRtgRank[id], defRtgRank: defRtgRank[id], paceRank: paceRank[id],
                };
            }
            return result;
        },
    });
}
