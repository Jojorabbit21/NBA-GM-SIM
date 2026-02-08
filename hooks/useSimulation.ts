
import { useState, useRef, useCallback, useEffect } from 'react';
import { Team, Game, PlayoffSeries, Transaction, GameTactics, DepthChart, Player } from '../types';
import { simulateGame } from '../services/gameEngine';

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
    const finalizeSimRef = useRef<() => void>(undefined);

    // [Fix] 날짜 증가 헬퍼
    const getNextDate = (dateStr: string) => {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
    };

    // [Fix] 실제 시뮬레이션 결과 처리 로직 (애니메이션 종료 후 실행)
    useEffect(() => {
        finalizeSimRef.current = () => {
            if (!activeGame) return;

            const userGame = activeGame;
            const homeTeam = teams.find(t => t.id === userGame.homeTeamId)!;
            const awayTeam = teams.find(t => t.id === userGame.awayTeamId)!;

            // 1. 사용자 경기 시뮬레이션
            const result = simulateGame(homeTeam, awayTeam, myTeamId, undefined, false, false, depthChart);

            // 2. 같은 날짜의 나머지 리그 경기 시뮬레이션
            const otherGames = schedule.filter(g => g.date === currentSimDate && !g.played && g.id !== userGame.id);
            const updatedSchedule = [...schedule];
            
            // 사용자 경기 결과 반영
            const userGameIdx = updatedSchedule.findIndex(g => g.id === userGame.id);
            updatedSchedule[userGameIdx] = { 
                ...userGame, 
                played: true, 
                homeScore: result.homeScore, 
                awayScore: result.awayScore 
            };

            // 리그 경기들 시뮬레이션 및 결과 반영
            otherGames.forEach(og => {
                const h = teams.find(t => t.id === og.homeTeamId)!;
                const a = teams.find(t => t.id === og.awayTeamId)!;
                const res = simulateGame(h, a, null);
                const idx = updatedSchedule.findIndex(g => g.id === og.id);
                updatedSchedule[idx] = { ...og, played: true, homeScore: res.homeScore, awayScore: res.awayScore };
            });

            // 3. 상태 업데이트 및 결과창 진입
            setSchedule(updatedSchedule);
            setLastGameResult({
                ...result,
                home: homeTeam,
                away: awayTeam,
                myTeamId,
                otherGames: updatedSchedule.filter(g => g.date === currentSimDate && g.id !== userGame.id)
            });
            setActiveGame(null);
        };
    }, [activeGame, teams, schedule, currentSimDate, myTeamId, depthChart, setSchedule]);

    const handleExecuteSim = useCallback(async (userTactics: GameTactics) => {
        setIsSimulating(true);
        
        // 선수 체력 회복
        const updatedTeams = teams.map(team => ({
            ...team,
            roster: team.roster.map(player => {
                const currentCond = Math.max(0, player.condition !== undefined ? player.condition : 100);
                return { ...player, condition: Math.min(100, Math.round(currentCond + 15)) };
            })
        }));
        setTeams(updatedTeams);

        const userGame = schedule.find(g => g.date === currentSimDate && !g.played && (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId));
        
        if (userGame) {
            setActiveGame(userGame);
        } else {
            // [Fix] 사용자의 경기가 없는 경우, 리그 전체 경기 시뮬레이션 후 날짜 증가
            const dailyGames = schedule.filter(g => g.date === currentSimDate && !g.played);
            const updatedSchedule = [...schedule];
            
            dailyGames.forEach(og => {
                const h = updatedTeams.find(t => t.id === og.homeTeamId)!;
                const a = updatedTeams.find(t => t.id === og.awayTeamId)!;
                const res = simulateGame(h, a, null);
                const idx = updatedSchedule.findIndex(g => g.id === og.id);
                updatedSchedule[idx] = { ...og, played: true, homeScore: res.homeScore, awayScore: res.awayScore };
            });

            setSchedule(updatedSchedule);
            const nextDay = getNextDate(currentSimDate);
            advanceDate(nextDay, { teams: updatedTeams, schedule: updatedSchedule });
        }
        
        setIsSimulating(false);
    }, [teams, schedule, currentSimDate, myTeamId, advanceDate, setTeams, setSchedule]);

    const clearLastGameResult = () => setLastGameResult(null);

    return {
        isSimulating, setIsSimulating,
        activeGame, lastGameResult,
        handleExecuteSim,
        finalizeSimRef,
        clearLastGameResult
    };
};
