
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { mapRawPlayerToRuntimePlayer } from '../services/dataMapper';
import { calculatePlayerOvr } from '../utils/constants';
import type { Player } from '../types';
import type { LeagueRow, LeagueTeamRow } from '../services/multi/roomQueries';

export function useMultiSearchData(league: LeagueRow | null, leagueTeams: LeagueTeamRow[]) {
    const [poolPlayers, setPoolPlayers] = useState<Player[]>([]);

    // roster 역인덱스: playerId → team_slug
    const rosterMap = useMemo(() => {
        const m = new Map<string, string>();
        for (const t of leagueTeams) {
            for (const pid of (t.roster ?? [])) m.set(pid, t.team_slug);
        }
        return m;
    }, [leagueTeams]);

    useEffect(() => {
        if (!league?.id) return;
        let cancelled = false;

        const load = async () => {
            const draftPools = (league.draft_pool ?? 'standard')
                .split(',').map((s: string) => s.trim()).filter(Boolean);
            const ovrMin = league.draft_ovr_min ?? 0;
            const ovrMax = league.draft_ovr_max ?? 99;
            const useCustomOverrides = draftPools.includes('alltime');
            const seenIds = new Set<string>();
            const all: Player[] = [];

            for (const pt of draftPools) {
                let q = supabase
                    .from('meta_players')
                    .select('id, name, position, base_attributes, tendencies');

                if (pt === 'standard') {
                    q = (q as any).eq('in_multi_pool', true).lt('draft_year', 2026).not('base_team_id', 'is', null);
                } else if (pt === 'alltime') {
                    q = (q as any).eq('in_multi_pool', true).eq('include_alltime', true).lt('draft_year', 2026);
                } else {
                    q = (q as any).eq('draft_year', 2026);
                }

                const { data } = await q;
                if (!data || cancelled) continue;

                for (const raw of data) {
                    if (seenIds.has(raw.id)) continue;
                    seenIds.add(raw.id);
                    const player = mapRawPlayerToRuntimePlayer(raw, useCustomOverrides, true);
                    const ovr = calculatePlayerOvr(player);
                    if (ovr >= ovrMin && ovr <= ovrMax) all.push(player);
                }
            }

            if (!cancelled) setPoolPlayers(all);
        };

        load();
        return () => { cancelled = true; };
    }, [league?.id]);

    return { poolPlayers, rosterMap };
}
