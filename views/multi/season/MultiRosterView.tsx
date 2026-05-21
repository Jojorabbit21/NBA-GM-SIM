
import React, { useEffect, useState, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useLeagueContext } from '../league/LeagueLayout';
import { useGame } from '../../../hooks/useGameContext';
import { supabase } from '../../../services/supabaseClient';
import { RosterView } from '../../RosterView';
import { mapRawPlayerToRuntimePlayer } from '../../../services/dataMapper';
import type { Team, Player } from '../../../types';

const MultiRosterView: React.FC = () => {
    const { league, leagueTeams, members, isLoading: leagueLoading } = useLeagueContext();
    const useCustomOverrides = (league?.draft_pool ?? '').split(',').map(s => s.trim()).includes('alltime');
    const { session } = useGame();

    const myTeamId = useMemo(
        () => members.find(m => m.user_id === session?.user?.id)?.team_id ?? null,
        [members, session],
    );

    const [allTeams, setAllTeams] = useState<Team[]>([]);
    const [fetchLoading, setFetchLoading] = useState(false);

    const allRosterIds = useMemo(
        () => [...new Set(leagueTeams.flatMap(t => t.roster ?? []))],
        [leagueTeams],
    );

    useEffect(() => {
        if (!allRosterIds.length) return;
        let cancelled = false;
        setFetchLoading(true);
        supabase
            .from('meta_players')
            .select('id, name, position, base_attributes, tendencies')
            .in('id', allRosterIds)
            .then(({ data }) => {
                if (cancelled || !data) return;
                const playerMap = new Map<string, Player>(
                    data.map((raw: any) => [String(raw.id), mapRawPlayerToRuntimePlayer(raw, useCustomOverrides)])
                );
                const teams: Team[] = leagueTeams.map(lt => ({
                    id: lt.team_slug,
                    name: lt.team_name,
                    city: '',
                    logo: lt.team_abbr,
                    conference: (lt.conference as 'East' | 'West') ?? 'East',
                    division: '',
                    wins: 0,
                    losses: 0,
                    budget: 0,
                    salaryCap: 0,
                    luxuryTaxLine: 0,
                    roster: (lt.roster ?? []).map(id => playerMap.get(id)).filter(Boolean) as Player[],
                }));
                setAllTeams(teams);
                setFetchLoading(false);
            });
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allRosterIds.join(',')]);

    const isLoading = leagueLoading || fetchLoading;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    return (
        <RosterView
            allTeams={allTeams}
            myTeamId={myTeamId ?? allTeams[0]?.id ?? ''}
            initialTeamId={myTeamId}
            onViewPlayer={() => {}}
            userId={session?.user?.id}
            hideTabs={['coaching', 'draftPicks']}
        />
    );
};

export default MultiRosterView;
