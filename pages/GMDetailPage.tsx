import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GMDetailView } from '../views/GMDetailView';
import { useGame } from '../hooks/useGameContext';

const GMDetailPage: React.FC = () => {
    const { teamId } = useParams<{ teamId: string }>();
    const { session, gameData } = useGame();
    const navigate = useNavigate();

    if (!teamId || !gameData.leagueGMProfiles?.[teamId]) {
        navigate(-1);
        return null;
    }

    return (
        <GMDetailView
            gmProfile={gameData.leagueGMProfiles[teamId]}
            teamId={teamId}
            onBack={() => navigate(-1)}
            leagueGMProfiles={gameData.leagueGMProfiles}
            allTeams={gameData.teams}
            myTeamId={gameData.myTeamId ?? undefined}
            userNickname={session?.user?.email?.split('@')[0]}
        />
    );
};

export default GMDetailPage;
