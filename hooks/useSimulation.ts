
import { useState, useRef, useCallback } from 'react';
import { Team, Game, PlayoffSeries, Transaction, GameTactics, DepthChart, Player } from '../types';

/**
 * Hook to manage game simulation flow and season progression.
 */
export const useSimulation = (
    teams: Team[], setTeams: React.Dispatch<React.SetStateAction<Team[]>>,
    schedule: Game[], setSchedule: React.Dispatch<React.SetStateAction<Game[]>>,
    myTeamId: string | null,
    currentSimDate: string,
    advanceDate: (newDate: string, overrides: any) => void,
    playoffSeries: PlayoffSeries[], setPlayoffSeries: React.Dispatch<React.SetStateAction<PlayoffSeries[]>>,
    setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>,
    setNews: React.Dispatch<React.SetStateAction<any[]>>,
    setToastMessage: (msg: string | null) => void,
    forceSave: (overrides?: any) => Promise<void>,
    session: any, isGuestMode: boolean,
    refreshUnreadCount: () => void,
    depthChart: DepthChart | null
) => {
    const [isSimulating, setIsSimulating] = useState(false);
    const [activeGame, setActiveGame] = useState<Game | null>(null);
    const [lastGameResult, setLastGameResult] = useState<any>(null);
    // [Fix] useRef 초기값 추가
    const finalizeSimRef = useRef<() => void>(undefined);

    const handleExecuteSim = useCallback(async (userTactics: GameTactics) => {
        setIsSimulating(true);
        
        // Handle Inter-day Recovery
        const totalRecovery = 15;
        const updatedTeams = teams.map(team => ({
            ...team,
            roster: team.roster.map(player => {
                const updatedPlayer = { ...player };
                // [Fix] 체력 음수 보정 후 회복
                const currentCond = Math.max(0, updatedPlayer.condition !== undefined ? updatedPlayer.condition : 100);
                updatedPlayer.condition = Math.min(100, Math.round(currentCond + totalRecovery));
                
                return updatedPlayer;
            })
        }));
        setTeams(updatedTeams);

        const userGame = schedule.find(g => g.date === currentSimDate && !g.played && (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId));
        
        if (userGame) {
            setActiveGame(userGame);
        } else {
            advanceDate(currentSimDate, { teams: updatedTeams });
        }
        
        setIsSimulating(false);
    }, [teams, schedule, currentSimDate, myTeamId, advanceDate, setTeams]);

    const clearLastGameResult = () => setLastGameResult(null);

    return {
        isSimulating, setIsSimulating,
        activeGame, lastGameResult,
        handleExecuteSim,
        finalizeSimRef,
        clearLastGameResult
    };
};
