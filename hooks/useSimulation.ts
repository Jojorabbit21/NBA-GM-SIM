
import { useState, useRef, useCallback, useEffect } from 'react';
import { Team, Game, PlayoffSeries, Transaction, GameTactics, DepthChart, Player } from '../types';
import { simulateGame } from '../services/gameEngine';
import { saveGameResults } from '../services/queries';
import { checkAndInitPlayoffs, advancePlayoffState, generateNextPlayoffGames } from '../utils/playoffLogic';
import { savePlayoffState, savePlayoffGameResult } from '../services/playoffService';

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

    const getNextDate = (dateStr: string) => {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
    };

    // Helper to simulate all other league games on a given date
    const simulateLeagueGames = useCallback(async (targetDate: string, excludeGameId?: string, currentTeams?: Team[]) => {
        const leagueGames = schedule.filter(g => g.date === targetDate && !g.played && g.id !== excludeGameId);
        const resultsToSave: any[] = [];
        const updatedSchedule = [...schedule];
        const activeTeams = currentTeams || teams;

        leagueGames.forEach(og => {
            const h = activeTeams.find(t => t.id === og.homeTeamId)!;
            const a = activeTeams.find(t => t.id === og.awayTeamId)!;
            if (!h || !a) return;

            const res = simulateGame(h, a, null);
            const idx = updatedSchedule.findIndex(g => g.id === og.id);
            
            updatedSchedule[idx] = { 
                ...og, 
                played: true, 
                homeScore: res.homeScore, 
                awayScore: res.awayScore 
            };

            if (!isGuestMode && session?.user?.id) {
                resultsToSave.push({
                    user_id: session.user.id,
                    game_id: og.id,
                    date: targetDate,
                    home_team_id: og.homeTeamId,
                    away_team_id: og.awayTeamId,
                    home_score: res.homeScore,
                    away_score: res.awayScore,
                    is_playoff: og.isPlayoff,
                    series_id: og.seriesId,
                    box_score: { home: res.homeBox, away: res.awayBox }
                });
            }
        });

        if (resultsToSave.length > 0) {
            await saveGameResults(resultsToSave);
        }

        return updatedSchedule;
    }, [schedule, teams, isGuestMode, session]);

    // Handle User Game Completion
    useEffect(() => {
        finalizeSimRef.current = async () => {
            if (!activeGame) return;

            const userGame = activeGame;
            const homeTeam = teams.find(t => t.id === userGame.homeTeamId)!;
            const awayTeam = teams.find(t => t.id === userGame.awayTeamId)!;

            // 1. User Game Simulation
            const result = simulateGame(homeTeam, awayTeam, myTeamId, undefined, false, false, depthChart);

            // 2. Save User Game to DB
            if (!isGuestMode && session?.user?.id) {
                const userResult = {
                    user_id: session.user.id,
                    game_id: userGame.id,
                    date: currentSimDate,
                    home_team_id: userGame.homeTeamId,
                    away_team_id: userGame.awayTeamId,
                    home_score: result.homeScore,
                    away_score: result.awayScore,
                    is_playoff: userGame.isPlayoff,
                    series_id: userGame.seriesId,
                    box_score: { home: result.homeBox, away: result.awayBox }
                };
                await saveGameResults([userResult]);
            }

            // 3. Simulate other league games on the same day
            const updatedSchedule = await simulateLeagueGames(currentSimDate, userGame.id);
            const userGameIdx = updatedSchedule.findIndex(g => g.id === userGame.id);
            updatedSchedule[userGameIdx] = { ...userGame, played: true, homeScore: result.homeScore, awayScore: result.awayScore };

            // 4. Update state and show results
            setSchedule(updatedSchedule);
            setLastGameResult({
                ...result,
                home: homeTeam,
                away: awayTeam,
                myTeamId,
                otherGames: updatedSchedule.filter(g => g.date === currentSimDate && g.id !== userGame.id)
            });

            // 5. Post-Simulation Logic: Playoff Advancement
            let updatedSeries = playoffSeries;
            if (playoffSeries.length > 0) {
                updatedSeries = advancePlayoffState(playoffSeries, teams);
                setPlayoffSeries(updatedSeries);
                if (!isGuestMode && session?.user?.id) {
                    await savePlayoffState(session.user.id, myTeamId!, updatedSeries);
                }
            }

            setActiveGame(null);
        };
    }, [activeGame, teams, schedule, currentSimDate, myTeamId, depthChart, setSchedule, isGuestMode, session, simulateLeagueGames, playoffSeries, setPlayoffSeries]);

    const handleExecuteSim = useCallback(async (userTactics: GameTactics) => {
        setIsSimulating(true);
        
        // Recover player condition daily
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
            // Found user game: Trigger visual simulation
            setActiveGame(userGame);
        } else {
            // No user game: Simulate entire league for the day and advance date
            const updatedSchedule = await simulateLeagueGames(currentSimDate, undefined, updatedTeams);
            setSchedule(updatedSchedule);

            // Playoff Logic Check
            let nextSeries = playoffSeries;
            const isRegularOver = updatedSchedule.filter(g => !g.isPlayoff).every(g => g.played);
            
            if (isRegularOver && playoffSeries.length === 0) {
                nextSeries = checkAndInitPlayoffs(updatedTeams, updatedSchedule, [], currentSimDate);
                if (nextSeries.length > 0) {
                    setPlayoffSeries(nextSeries);
                    const { newGames } = generateNextPlayoffGames(updatedSchedule, nextSeries, currentSimDate);
                    if (newGames.length > 0) {
                        setSchedule(prev => [...prev, ...newGames]);
                    }
                    if (!isGuestMode && session?.user?.id) {
                        await savePlayoffState(session.user.id, myTeamId!, nextSeries);
                    }
                }
            } else if (playoffSeries.length > 0) {
                nextSeries = advancePlayoffState(playoffSeries, updatedTeams);
                setPlayoffSeries(nextSeries);
                const { newGames } = generateNextPlayoffGames(updatedSchedule, nextSeries, currentSimDate);
                if (newGames.length > 0) {
                    setSchedule(prev => [...prev, ...newGames]);
                }
                if (!isGuestMode && session?.user?.id) {
                    await savePlayoffState(session.user.id, myTeamId!, nextSeries);
                }
            }

            const nextDay = getNextDate(currentSimDate);
            advanceDate(nextDay, { teams: updatedTeams, schedule: updatedSchedule });
            
            // Finalize day save
            await forceSave({ 
                currentSimDate: nextDay, 
                teams: updatedTeams,
                userTactics: userTactics 
            });
        }
        
        setIsSimulating(false);
    }, [teams, schedule, currentSimDate, myTeamId, advanceDate, setTeams, setSchedule, simulateLeagueGames, forceSave, playoffSeries, setPlayoffSeries, isGuestMode, session]);

    const clearLastGameResult = () => setLastGameResult(null);

    return {
        isSimulating, setIsSimulating,
        activeGame, lastGameResult,
        handleExecuteSim,
        finalizeSimRef,
        clearLastGameResult
    };
};
