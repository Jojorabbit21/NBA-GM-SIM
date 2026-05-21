
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useLeagueContext } from '../league/LeagueLayout';
import { useGame } from '../../../hooks/useGameContext';
import { useMultiGameData } from '../../../hooks/useMultiGameData';
import { TacticsBoard } from '../../../components/dashboard/TacticsBoard';
import { supabase } from '../../../services/supabaseClient';
import { mapRawPlayerToRuntimePlayer } from '../../../services/dataMapper';
import { generateAutoTactics } from '../../../services/gameEngine';
import type { Team, Player } from '../../../types';

const MultiTacticsView: React.FC = () => {
    const { league, leagueTeams, members, room, isLoading: leagueLoading } = useLeagueContext();
    const useCustomOverrides = (league?.draft_pool ?? '').split(',').map(s => s.trim()).includes('alltime');
    const { session } = useGame();

    const myTeamId = useMemo(
        () => members.find(m => m.user_id === session?.user?.id)?.team_id ?? null,
        [members, session],
    );
    const myTeamRow = leagueTeams.find(t => t.team_slug === myTeamId) ?? null;

    const { userTactics, setUserTactics, isLoading: gameLoading } = useMultiGameData(session, room?.id ?? null);

    const [rosterPlayers, setRosterPlayers] = useState<Player[]>([]);
    const rosterKey = myTeamRow?.roster?.join(',') ?? '';

    useEffect(() => {
        if (!myTeamRow?.roster?.length) return;
        supabase
            .from('meta_players')
            .select('id, name, position, base_attributes, tendencies')
            .in('id', myTeamRow.roster)
            .then(({ data }) => {
                if (!data) return;
                setRosterPlayers(data.map((raw: any) => mapRawPlayerToRuntimePlayer(raw, useCustomOverrides)));
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rosterKey]);

    const team = useMemo((): Team => ({
        id:            myTeamId ?? '',
        name:          myTeamRow?.team_name ?? '',
        city:          '',
        logo:          '',
        conference:    'East',
        division:      '',
        wins:          0,
        losses:        0,
        budget:        0,
        salaryCap:     0,
        luxuryTaxLine: 0,
        roster:        rosterPlayers,
    }), [myTeamId, myTeamRow?.team_name, rosterPlayers]);

    const handleAutoSet = useCallback(() => {
        if (!rosterPlayers.length) return;
        setUserTactics(generateAutoTactics(team));
    }, [team, rosterPlayers.length, setUserTactics]);

    // tactics가 없는 신규 유저: 로스터 로드 완료 후 자동 생성
    useEffect(() => {
        if (gameLoading || userTactics || rosterPlayers.length === 0) return;
        setUserTactics(generateAutoTactics(team));
    }, [gameLoading, userTactics, rosterPlayers.length, team, setUserTactics]);

    const isReady = !leagueLoading && !gameLoading && !!userTactics;

    if (!isReady) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-950">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    return (
        <div className="h-full animate-in fade-in duration-300">
            <TacticsBoard
                team={team}
                tactics={userTactics!}
                roster={rosterPlayers}
                onUpdateTactics={setUserTactics}
                onAutoSet={handleAutoSet}
                hidePresets
            />
        </div>
    );
};

export default MultiTacticsView;
