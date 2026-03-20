import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RosterView } from '../views/RosterView';
import { useGame } from '../hooks/useGameContext';

const RosterPage: React.FC = () => {
    const { teamId } = useParams<{ teamId?: string }>();
    const { session, gameData, selectedTeamId, setViewPlayerData } = useGame();
    const navigate = useNavigate();

    return (
        <RosterView
            allTeams={gameData.teams}
            myTeamId={gameData.myTeamId!}
            initialTeamId={teamId || selectedTeamId || gameData.myTeamId}
            tendencySeed={gameData.tendencySeed || undefined}
            onViewPlayer={(player, pTeamId, teamName) => {
                setViewPlayerData({ player, teamId: pTeamId, teamName });
                navigate(`/player/${player.id}`, { state: { player, teamId: pTeamId, teamName } });
            }}
            schedule={gameData.schedule}
            userId={session?.user?.id}
            onViewGameResult={(result) => {
                navigate(`/result/${result.gameId ?? result.id ?? 'unknown'}`, { state: { result } });
            }}
            coachingData={gameData.coachingData}
            onCoachClick={(coachTeamId) => {
                const coach = gameData.coachingData?.[coachTeamId]?.headCoach;
                if (coach) navigate(`/coach/${coach.id}`, { state: { coach, teamId: coachTeamId } });
            }}
            onGMClick={(gmTeamId) => {
                if (gameData.leagueGMProfiles?.[gmTeamId]) navigate(`/gm/${gmTeamId}`);
            }}
            leaguePickAssets={gameData.leaguePickAssets}
            leagueGMProfiles={gameData.leagueGMProfiles}
            userNickname={session?.user?.email?.split('@')[0]}
        />
    );
};

export default RosterPage;
