import React from 'react';
import { useNavigate } from 'react-router-dom';
import { OnboardingView } from '../views/OnboardingView';
import { useGame } from '../hooks/useGameContext';

const OnboardingPage: React.FC = () => {
    const { gameData } = useGame();
    const navigate = useNavigate();

    const myTeam = gameData.teams.find(t => t.id === gameData.myTeamId);
    if (!myTeam) { navigate('/select-team', { replace: true }); return null; }

    const seasonShort: string = gameData.seasonConfig?.seasonShort ?? '2025-26';
    const userGMProfile = gameData.leagueGMProfiles?.[gameData.myTeamId ?? ''];
    const gmLastName = userGMProfile?.lastName;

    return (
        <div className="fixed inset-0 z-[500]">
            <OnboardingView
                team={myTeam}
                onComplete={() => navigate('/', { replace: true })}
                seasonShort={seasonShort}
                gmLastName={gmLastName}
            />
        </div>
    );
};

export default OnboardingPage;
