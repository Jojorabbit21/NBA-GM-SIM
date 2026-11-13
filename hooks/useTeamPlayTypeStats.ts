import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';

// get_team_playtype_stats RPC(migrations/add_team_playtype_stats.sql · stats_split_regular_playoff_exclude_allstar.sql) — 방의 현재 시즌, 공개된(리플레이 끝난) 경기만
// 팀×플레이타입 합산. 서버 simRunner가 경기마다 team_playtype_stats에 저장한 요약을 더하는 것이라 응답은 최대 팀 수×12행.
// [2026-10-18] 멀티 전술 화면 팀 전술 탭 "PPP" 섹션 전용.

export interface PlayTypeTotals { poss: number; pts: number; fga: number; fgm: number; fta: number; tov: number }
/** teamId → playType → 시즌 합계 */
export type TeamPlayTypeTotals = Record<string, Record<string, PlayTypeTotals>>;
// RPC의 estimated_games 열(엔진 집계 도입 전 백필 경기 수)은 [2026-10-23] 화면 안내 제거로 읽지 않는다.
export interface TeamPlayTypeStatsData { totals: TeamPlayTypeTotals }

/** [2026-11-13] isPlayoff: false = 정규시즌만, true = 플레이오프만(RPC p_is_playoff). 전엔 인자 없이 불러 정규+플레이오프 합산이었다.
 *  enabled=false로 지금 보지 않는 쪽 조회를 꺼 둘 수 있다. */
export function useTeamPlayTypeStats(roomId: string | undefined | null, isPlayoff = false, enabled = true) {
    return useQuery({
        queryKey: ['teamPlayTypeStats', roomId, isPlayoff],
        enabled: !!roomId && enabled,
        queryFn: async (): Promise<TeamPlayTypeStatsData> => {
            const { data, error } = await supabase.rpc('get_team_playtype_stats', { p_room_id: roomId, p_is_playoff: isPlayoff });
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
