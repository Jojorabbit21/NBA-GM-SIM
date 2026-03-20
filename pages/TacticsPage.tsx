import React, { useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useGame } from '../hooks/useGameContext';
import { TacticsBoard } from '../components/dashboard/TacticsBoard';
import { generateAutoTactics } from '../services/gameEngine';
import { getCoachPreferences } from '../services/coachingStaff/coachGenerator';
import { computeDefensiveStats } from '../utils/defensiveStats';

const TacticsPage: React.FC = () => {
    const { gameData, setViewPlayerData } = useGame();
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

    const effectiveRoster = myTeam.roster || [];

    const defensiveStats = computeDefensiveStats(gameData.schedule, myTeam.id);

    const handleAutoSet = () => {
        const coachPrefs = getCoachPreferences(gameData.coachingData, myTeam.id);
        const autoTactics = generateAutoTactics({ ...myTeam, roster: effectiveRoster }, coachPrefs);
        gameData.setUserTactics(autoTactics);
    };

    return (
        <div className="h-full animate-in fade-in duration-500 ko-normal overflow-hidden">
            <TacticsBoard
                team={myTeam}
                tactics={gameData.userTactics}
                roster={effectiveRoster}
                onUpdateTactics={gameData.setUserTactics}
                onAutoSet={handleAutoSet}
                onForceSave={gameData.forceSave}
                defensiveStats={defensiveStats}
                coachName={gameData.coachingData?.[myTeam.id]?.headCoach?.name}
            />
        </div>
    );
};

export default TacticsPage;
