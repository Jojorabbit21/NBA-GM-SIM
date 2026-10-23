import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';

// get_team_playtype_stats RPC(migrations/add_team_playtype_stats.sql) — 방의 현재 시즌, 공개된(리플레이 끝난) 경기만
// 팀×플레이타입 합산. 서버 simRunner가 경기마다 team_playtype_stats에 저장한 요약을 더하는 것이라 응답은 최대 팀 수×12행.
// [2026-10-18] 멀티 전술 화면 팀 전술 탭 "PPP" 섹션 전용.

export interface PlayTypeTotals { poss: number; pts: number; fga: number; fgm: number; fta: number; tov: number }
/** teamId → playType → 시즌 합계 */
export type TeamPlayTypeTotals = Record<string, Record<string, PlayTypeTotals>>;
// RPC의 estimated_games 열(엔진 집계 도입 전 백필 경기 수)은 [2026-10-23] 화면 안내 제거로 읽지 않는다.
export interface TeamPlayTypeStatsData { totals: TeamPlayTypeTotals }

export function useTeamPlayTypeStats(roomId: string | undefined | null) {
    return useQuery({
        queryKey: ['teamPlayTypeStats', roomId],
        enabled: !!roomId,
        queryFn: async (): Promise<TeamPlayTypeStatsData> => {
            const { data, error } = await supabase.rpc('get_team_playtype_stats', { p_room_id: roomId });
            if (error) throw error;
            const totals: TeamPlayTypeTotals = {};
            for (const row of (data ?? []) as Record<string, string | number>[]) {
                const teamId = String(row.team_id);
                (totals[teamId] ??= {})[String(row.play_type)] = {
                    poss: Number(row.poss), pts: Number(row.pts), fga: Number(row.fga),
                    fgm: Number(row.fgm), fta: Number(row.fta), tov: Number(row.tov),
                };
            }
            return { totals };
        },
    });
}
