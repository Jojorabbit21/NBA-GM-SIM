import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GMDetailView } from '../views/GMDetailView';
import { useGame } from '../hooks/useGameContext';
import { loadSeasonHistory, SeasonArchiveEntry } from '../services/seasonArchive';

const GMDetailPage: React.FC = () => {
    const { teamId } = useParams<{ teamId: string }>();
    const { session, gameData } = useGame();
    const navigate = useNavigate();
    const [seasonHistory, setSeasonHistory] = useState<SeasonArchiveEntry[]>([]);

    useEffect(() => {
        if (!session?.user?.id) return;
        loadSeasonHistory(session.user.id).then(setSeasonHistory);
    }, [session?.user?.id]);

    if (!teamId || !gameData.leagueGMProfiles?.[teamId]) {
        navigate(-1);
        return null;
    }

    const seasonYear = gameData.seasonConfig?.seasonLabel
        ? parseInt(gameData.seasonConfig.seasonLabel.split('-')[0], 10)
        : new Date().getFullYear();

    return (
        <GMDetailView
            gmProfile={gameData.leagueGMProfiles[teamId]}
            teamId={teamId}
            onBack={() => navigate(-1)}
            leagueGMProfiles={gameData.leagueGMProfiles}
            allTeams={gameData.teams}
            myTeamId={gameData.myTeamId ?? undefined}
            userNickname={session?.user?.email?.split('@')[0]}
            seasonYear={seasonYear}
            seasonHistory={seasonHistory}
        />
    );
};

export default GMDetailPage;
