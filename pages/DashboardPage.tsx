import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardView } from '../views/DashboardView';
import { useGame } from '../hooks/useGameContext';
import { Loader2 } from 'lucide-react';

const DashboardPage: React.FC = () => {
    const { session, gameData, sim, setViewPlayerData } = useGame();
    const navigate = useNavigate();

    const myTeam = gameData.teams.find(t => t.id === gameData.myTeamId);
    if (!myTeam) return null;

    if (!gameData.userTactics) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 size={40} className="text-indigo-500 animate-spin" />
            </div>
        );
    }

    return (
        <DashboardView
            team={myTeam}
            teams={gameData.teams}
            schedule={gameData.schedule}
            onSim={sim.handleExecuteSim}
            tactics={gameData.userTactics}
            onUpdateTactics={gameData.setUserTactics}
            currentSimDate={gameData.currentSimDate}
            isSimulating={sim.isSimulating}
            depthChart={gameData.depthChart}
            onUpdateDepthChart={gameData.setDepthChart}
            onForceSave={gameData.forceSave}
            tendencySeed={gameData.tendencySeed || undefined}
            onViewPlayer={(player, teamId, teamName) => {
                setViewPlayerData({ player, teamId, teamName });
                navigate(`/player/${player.id}`, { state: { player, teamId, teamName } });
            }}
            userId={session?.user?.id}
            onViewGameResult={(result) => {
                navigate(`/result/${result.gameId ?? result.id ?? 'unknown'}`, { state: { result } });
            }}
            coachingData={gameData.coachingData}
            onCoachClick={(teamId) => {
                const coach = gameData.coachingData?.[teamId]?.headCoach;
                if (coach) navigate(`/coach/${coach.id}`, { state: { coach, teamId } });
            }}
            seasonStartYear={gameData.seasonConfig?.startYear}
        />
    );
};

export default DashboardPage;
