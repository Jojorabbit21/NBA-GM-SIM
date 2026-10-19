import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';

// get_team_season_advanced_stats RPC(migrations/unify_team_season_advanced_stats_rpc.sql) —
// 멀티 팀 어드밴스드 스탯(PPG/OPPG/POSS/PACE/ORTG/DRTG/NRTG/TOV%/STL%)의 유일한 계산 경로.
// 팀 화면 헤더뿐 아니라 리더보드/전술 인사이트/로스터 선수 기록 탭도 useLeaderboardData의
// teamAdvanced 인자로 이 값을 받아 덮어쓴다(BBRef 공통 포제션 기준, 2026-10-19 통일).
export interface TeamAdvancedStats {
    g: number;
    ppg: number;
    oppg: number;
    /** 경기당 포제션(BBRef 경기별 공통 포제션 — 팀 포제션 = 상대 포제션). */
    poss: number;
    pace: number;
    offRtg: number;
    defRtg: number;
    netRtg: number;
    /** 0~1 분수 — TOV / (FGA + 0.44·FTA + TOV). */
    tovPct: number;
    /** 0~1 분수 — STL / 상대 포제션. */
    stlPct: number;
    /** 아래는 선수 STL%/USG% 분모용 시즌 합계. */
    possTotal: number;
    mpTotal: number;
    fga: number;
    fta: number;
    tov: number;
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
    poss: string | number;
    pace: string | number;
    off_rtg: string | number;
    def_rtg: string | number;
    net_rtg: string | number;
    tov_pct: string | number;
    stl_pct: string | number;
    poss_total: string | number;
    mp_total: string | number;
    fga: string | number;
    fta: string | number;
    tov: string | number;
}

function buildRank(entries: { id: string; value: number }[], descending: boolean): Record<string, number> {
    const sorted = [...entries].sort((a, b) => descending ? b.value - a.value : a.value - b.value);
    const ranks: Record<string, number> = {};
    sorted.forEach((e, i) => { ranks[e.id] = i + 1; });
    return ranks;
}

/** enabled=false로 플레이오프 조회를 토글이 켜졌을 때만 활성화할 수 있다(usePlayerSeasonStatsLeague와 같은 용도). */
export function useTeamSeasonAdvancedStats(roomId: string | undefined | null, isPlayoff = false, enabled = true) {
    return useQuery({
        queryKey: ['teamSeasonAdvancedStats', roomId, isPlayoff],
        enabled: !!roomId && enabled,
        staleTime: 5 * 60 * 1000,
        queryFn: async (): Promise<TeamAdvancedStatsMap> => {
            const { data, error } = await supabase.rpc('get_team_season_advanced_stats', { p_room_id: roomId, p_is_playoff: isPlayoff });
            if (error) throw error;

            const rows = (data ?? []) as RpcRow[];
            const stats: Record<string, TeamAdvancedStats> = {};
            for (const r of rows) {
                stats[r.team_id] = {
                    g: r.g,
                    ppg: Number(r.ppg), oppg: Number(r.oppg),
                    poss: Number(r.poss), pace: Number(r.pace),
                    offRtg: Number(r.off_rtg), defRtg: Number(r.def_rtg), netRtg: Number(r.net_rtg),
                    tovPct: Number(r.tov_pct), stlPct: Number(r.stl_pct),
                    possTotal: Number(r.poss_total), mpTotal: Number(r.mp_total),
                    fga: Number(r.fga), fta: Number(r.fta), tov: Number(r.tov),
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
