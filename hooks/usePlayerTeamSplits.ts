import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import type { PlayerStats } from '../types/player';

/** 한 팀에서 뛴 구간의 누적 스탯 (소문자 팀 slug, 첫 출전 시각 순 정렬용 firstAt 포함). */
export interface PlayerTeamSplit {
    teamId: string;
    firstAt: string;
    stats: PlayerStats;
}
export interface PlayerTeamSplits {
    regular: PlayerTeamSplit[];
    playoff: PlayerTeamSplit[];
}

/**
 * 선수 프로필(멀티) 기록 탭용 — 시즌 중 이적한 선수의 팀별 누적을 가져온다
 * (get_player_team_splits, migrations/add_player_team_splits_rpc.sql). 선수 1명분이라 가볍다.
 * 시즌 스탯과 같이 5분 단위로 갱신한다.
 */
export function usePlayerTeamSplits(roomId: string | undefined, playerId: string | undefined) {
    return useQuery({
        queryKey: ['playerTeamSplits', roomId, playerId],
        enabled: !!roomId && !!playerId,
        staleTime: 5 * 60 * 1000,
        queryFn: async (): Promise<PlayerTeamSplits> => {
            const { data, error } = await supabase.rpc('get_player_team_splits', {
                p_room_id: roomId,
                p_player_id: playerId,
            });
            if (error) throw error;
            const out: PlayerTeamSplits = { regular: [], playoff: [] };
            for (const r of (data ?? []) as any[]) {
                const n = (k: string) => Number(r[k] ?? 0);
                const stats = {
                    g: n('g'), gs: n('gs'), mp: n('mp'), pts: n('pts'), reb: n('reb'),
                    offReb: n('off_reb'), defReb: n('def_reb'), ast: n('ast'), stl: n('stl'),
                    blk: n('blk'), tov: n('tov'), pf: n('pf'),
                    fgm: n('fgm'), fga: n('fga'), p3m: n('p3m'), p3a: n('p3a'),
                    ftm: n('ftm'), fta: n('fta'),
                    contestedAttempted: n('contested_attempted'), contestedMade: n('contested_made'),
                } as PlayerStats;
                (r.is_playoff ? out.playoff : out.regular).push({ teamId: r.team_id, firstAt: r.first_at, stats });
            }
            const byTime = (a: PlayerTeamSplit, b: PlayerTeamSplit) => a.firstAt.localeCompare(b.firstAt);
            out.regular.sort(byTime);
            out.playoff.sort(byTime);
            return out;
        },
    });
}
