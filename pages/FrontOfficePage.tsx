import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FrontOfficeView } from '../views/FrontOfficeView';
import { useGame } from '../hooks/useGameContext';

const FrontOfficePage: React.FC = () => {
    const { session, gameData } = useGame();
    const navigate = useNavigate();

    const myTeam = gameData.teams.find(t => t.id === gameData.myTeamId);
    if (!myTeam) return null;

    const seasonShort: string = gameData.seasonConfig?.seasonShort ?? '2025-26';

    return (
        <FrontOfficeView
            team={myTeam}
            teams={gameData.teams}
            currentSimDate={gameData.currentSimDate}
            myTeamId={gameData.myTeamId!}
            seasonShort={seasonShort}
            coachingData={gameData.coachingData}
            onCoachClick={(teamId) => {
                const coach = gameData.coachingData?.[teamId]?.headCoach;
                if (coach) navigate(`/coach/${coach.id}`, { state: { coach, teamId } });
            }}
            onGMClick={(teamId) => {
                if (gameData.leagueGMProfiles?.[teamId]) navigate(`/gm/${teamId}`);
            }}
            leaguePickAssets={gameData.leaguePickAssets}
            leagueGMProfiles={gameData.leagueGMProfiles}
            userNickname={session?.user?.email?.split('@')[0]}
        />
    );
};

export default FrontOfficePage;
