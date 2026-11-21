import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';

// [2026-11-21] 팀 전술 › 인사이트 "라인업"·"온/오프" — get_team_lineup_stats / get_team_on_off(migrations/add_team_lineup_stats.sql).
// 방의 현재 시즌, 공개된(리플레이 끝난) 경기만. 경기별 5인 조합 집계(team_lineup_stats)를 합산한 값.

export interface LineupTotal {
    key: string; playerIds: string[]; playerNames: string[]; games: number; secs: number;
    ptsFor: number; ptsAgainst: number; possFor: number; possAgainst: number;
}
export interface OnOffRow {
    playerId: string; playerName: string;
    onSecs: number; onPtsFor: number; onPtsAgainst: number; onPossFor: number; onPossAgainst: number;
    totSecs: number; totPtsFor: number; totPtsAgainst: number; totPossFor: number; totPossAgainst: number;
}

const n = (v: unknown) => Number(v ?? 0);

/** isPlayoff: false = 정규시즌만, true = 플레이오프만 */
export function useTeamLineupStats(roomId: string | undefined | null, teamId: string | undefined | null, isPlayoff = false) {
    return useQuery({
        queryKey: ['teamLineupStats', roomId, teamId, isPlayoff],
        enabled: !!roomId && !!teamId,
        queryFn: async (): Promise<LineupTotal[]> => {
            const { data, error } = await supabase.rpc('get_team_lineup_stats', { p_room_id: roomId, p_team_id: teamId, p_is_playoff: isPlayoff });
            if (error) throw error;
            return ((data ?? []) as any[]).map(r => ({
                key: String(r.lineup_key), playerIds: (r.player_ids ?? []) as string[], playerNames: (r.player_names ?? []) as string[],
                games: n(r.games), secs: n(r.secs), ptsFor: n(r.pts_for), ptsAgainst: n(r.pts_against), possFor: n(r.poss_for), possAgainst: n(r.poss_against),
            }));
        },
    });
}

export function useTeamOnOff(roomId: string | undefined | null, teamId: string | undefined | null, isPlayoff = false) {
    return useQuery({
        queryKey: ['teamOnOff', roomId, teamId, isPlayoff],
        enabled: !!roomId && !!teamId,
        queryFn: async (): Promise<OnOffRow[]> => {
            const { data, error } = await supabase.rpc('get_team_on_off', { p_room_id: roomId, p_team_id: teamId, p_is_playoff: isPlayoff });
            if (error) throw error;
            return ((data ?? []) as any[]).map(r => ({
                playerId: String(r.player_id), playerName: String(r.player_name ?? ''),
                onSecs: n(r.on_secs), onPtsFor: n(r.on_pts_for), onPtsAgainst: n(r.on_pts_against), onPossFor: n(r.on_poss_for), onPossAgainst: n(r.on_poss_against),
                totSecs: n(r.tot_secs), totPtsFor: n(r.tot_pts_for), totPtsAgainst: n(r.tot_pts_against), totPossFor: n(r.tot_poss_for), totPossAgainst: n(r.tot_poss_against),
            }));
        },
    });
}

/** [2026-11-21] 고른 선수 묶음(1~5명) 한 줄 — get_team_lineup_combo. 0명이거나 6명 이상이면 조회 안 함(null). */
export function useTeamLineupCombo(roomId: string | undefined | null, teamId: string | undefined | null, playerIds: string[], isPlayoff = false) {
    const ids = [...playerIds].sort();
    return useQuery({
        queryKey: ['teamLineupCombo', roomId, teamId, ids.join(','), isPlayoff],
        enabled: !!roomId && !!teamId && ids.length >= 1 && ids.length <= 5,
        queryFn: async (): Promise<Omit<LineupTotal, 'key' | 'playerIds' | 'playerNames'>> => {
            const { data, error } = await supabase.rpc('get_team_lineup_combo', { p_room_id: roomId, p_team_id: teamId, p_player_ids: ids, p_is_playoff: isPlayoff });
            if (error) throw error;
            const r = ((data ?? []) as any[])[0] ?? {};
            return { games: n(r.games), secs: n(r.secs), ptsFor: n(r.pts_for), ptsAgainst: n(r.pts_against), possFor: n(r.poss_for), possAgainst: n(r.poss_against) };
        },
    });
}
