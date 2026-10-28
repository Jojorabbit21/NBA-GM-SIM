import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { listLeaguesByGroup, type LeagueRow } from '../services/multi/roomQueries';

// 멀티 세션(main_league 의 group_id + tier)에서 진행된 시즌 목록 — 시즌마다 leagues 행이 따로 생기고(UNIQUE (group_id, tier, season_number))
// 시즌 라벨(예: 2026-27)은 그 리그의 방(rooms.season)에 있다. 토너먼트(group_id 없음)는 목록 없이 현재 시즌만.
// 2026-10-28 기준 DB 에는 시즌 2 이상이 하나도 없어 항상 현재 시즌 1건만 나온다 — 시즌 전환이 구현되면 자동으로 늘어난다.
export interface SessionSeason {
    leagueId: string;
    seasonNumber: number;
    label: string;
    isCurrent: boolean;
}

export function useSessionSeasons(league: LeagueRow | null | undefined, currentLabel: string) {
    const groupId = league?.group_id ?? null;
    const tier = league?.tier ?? null;
    const enabled = !!league && league.type === 'main_league' && !!groupId && !!tier;

    return useQuery({
        queryKey: ['sessionSeasons', groupId, tier, league?.id],
        enabled,
        staleTime: 5 * 60 * 1000,
        queryFn: async (): Promise<SessionSeason[]> => {
            const leagues = (await listLeaguesByGroup(groupId!)).filter(l => l.tier === tier);
            if (leagues.length === 0) return [];
            const { data, error } = await supabase.from('rooms').select('league_id, season').in('league_id', leagues.map(l => l.id));
            if (error) throw error;
            const labelByLeague = new Map<string, string>();
            for (const r of (data ?? []) as { league_id: string; season: string | null }[]) {
                if (r.season && !labelByLeague.has(r.league_id)) labelByLeague.set(r.league_id, r.season);
            }
            return leagues
                .map(l => ({
                    leagueId: l.id,
                    seasonNumber: l.season_number,
                    label: l.id === league!.id ? currentLabel : (labelByLeague.get(l.id) ?? `시즌 ${l.season_number}`),
                    isCurrent: l.id === league!.id,
                }))
                .sort((a, b) => b.seasonNumber - a.seasonNumber);
        },
    });
}
