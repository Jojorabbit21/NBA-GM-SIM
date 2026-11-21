import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import type { PlayTypeTotals } from './useTeamPlayTypeStats';

// get_player_playtype_stats RPC(migrations/add_player_playtype_stats.sql · add_player_playtype_pass_stats.sql) — 방의 현재 시즌, 공개된(리플레이 끝난) 경기만
// 선수 1명의 플레이타입별 합산(이적했다면 팀 합산). 응답은 최대 13행(Kickout 포함).
// [2026-11-16] 선수 프로필 샷 차트 탭 하단 "플레이타입별 기록" 전용.

/** [2026-11-21] po = 패스아웃(이 플레이를 패스로 끝낸 횟수), ast = 그중 어시스트, past = 어시스트된 야투 득점 */
export interface PlayerPlayTypeLine extends PlayTypeTotals { po: number; ast: number; past: number }
/** playType → 시즌 합계 */
export type PlayerPlayTypeTotals = Record<string, PlayerPlayTypeLine>;

/** isPlayoff: false = 정규시즌만, true = 플레이오프만 */
export function usePlayerPlayTypeStats(roomId: string | undefined | null, playerId: string | undefined | null, isPlayoff = false) {
    return useQuery({
        queryKey: ['playerPlayTypeStats', roomId, playerId, isPlayoff],
        enabled: !!roomId && !!playerId,
        queryFn: async (): Promise<PlayerPlayTypeTotals> => {
            const { data, error } = await supabase.rpc('get_player_playtype_stats', { p_room_id: roomId, p_player_id: playerId, p_is_playoff: isPlayoff });
            if (error) throw error;
            const totals: PlayerPlayTypeTotals = {};
            for (const row of (data ?? []) as Record<string, string | number | null>[]) {
                totals[String(row.play_type)] = {
                    poss: Number(row.poss), pts: Number(row.pts), fga: Number(row.fga),
                    fgm: Number(row.fgm), fta: Number(row.fta), tov: Number(row.tov),
                    po: Number(row.po ?? 0), ast: Number(row.ast ?? 0), past: Number(row.past ?? 0),
                };
            }
            return totals;
        },
    });
}

/** [2026-11-21] 리그 전체 선수 집계의 플레이타입별 합(get_league_player_playtype_stats) — 선수 프로필 PPP 리그 평균용.
 *  팀 집계(get_team_playtype_stats)가 아니라 선수 집계를 쓰는 이유: 선수 집계는 킥아웃 슛을 'Kickout'으로 떼어 내 팀 집계와 기준이 다르다. */
export function useLeaguePlayerPlayTypeStats(roomId: string | undefined | null, isPlayoff = false) {
    return useQuery({
        queryKey: ['leaguePlayerPlayTypeStats', roomId, isPlayoff],
        enabled: !!roomId,
        queryFn: async (): Promise<Record<string, { poss: number; pts: number }>> => {
            const { data, error } = await supabase.rpc('get_league_player_playtype_stats', { p_room_id: roomId, p_is_playoff: isPlayoff });
            if (error) throw error;
            const out: Record<string, { poss: number; pts: number }> = {};
            for (const row of (data ?? []) as Record<string, string | number>[]) {
                out[String(row.play_type)] = { poss: Number(row.poss), pts: Number(row.pts) };
            }
            return out;
        },
    });
}
