
import { useState, useRef, useCallback } from 'react';
import { Team, Game, PlayoffSeries, Transaction, GameTactics, SimulationResult, DepthChart } from '../types';
import { simulateGame } from '../services/gameEngine';
import { simulateCpuGames } from '../services/simulationService';
import { checkAndInitPlayoffs, advancePlayoffState, generateNextPlayoffGames } from '../utils/playoffLogic';
import { updateTeamStats, updateSeriesState } from '../utils/simulationUtils';
import { saveGameResults, saveUserTransaction } from '../services/queries';
import { savePlayoffState, savePlayoffGameResult } from '../services/playoffService';
import { simulateCPUTrades } from '../services/tradeEngine';
import { generateCPUTradeNews, generateGameRecapNews } from '../services/geminiService';
import { sendMessage } from '../services/messageService';

export const useSimulation = (
    teams: Team[],
    setTeams: React.Dispatch<React.SetStateAction<Team[]>>,
    schedule: Game[],
    setSchedule: React.Dispatch<React.SetStateAction<Game[]>>,
    myTeamId: string | null,
    currentSimDate: string,
    advanceDate: (newDate: string, overrides: any) => void,
    playoffSeries: PlayoffSeries[],
    setPlayoffSeries: React.Dispatch<React.SetStateAction<PlayoffSeries[]>>,
    setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>,
    setNews: React.Dispatch<React.SetStateAction<any[]>>,
    setToastMessage: (msg: string | null) => void,
    forceSave: (overrides?: any) => Promise<void>,
    session: any,
    isGuestMode: boolean,
    refreshUnreadCount: () => void,
    depthChart: DepthChart | null
) => {
    const [isSimulating, setIsSimulating] = useState(false);
    const [activeGame, setActiveGame] = useState<Game | null>(null);
    const [lastGameResult, setLastGameResult] = useState<any | null>(null);
    const [tempSimulationResult, setTempSimulationResult] = useState<SimulationResult | null>(null);
    
    // Ref to hold the finalize function so it can be called from the View
    const finalizeSimRef = useRef<(() => void) | null>(null);

    const handleExecuteSim = useCallback(async (userTactics: GameTactics, skipAnimation: boolean = false) => {
        if (isSimulating || !myTeamId) return;
        setIsSimulating(true);

        try {
            // 1. Identify User's Game today
            const userGame = schedule.find(g => 
                !g.played && 
                g.date === currentSimDate && 
                (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId)
            );

            // 2. Prepare CPU Games
            const cpuResults = simulateCpuGames(schedule, teams, currentSimDate, userGame?.id);

            // 3. User Game Logic
            if (userGame) {
                const homeTeam = teams.find(t => t.id === userGame.homeTeamId)!;
                const awayTeam = teams.find(t => t.id === userGame.awayTeamId)!;

                // [Fix] Inject Depth Chart into Tactics for simulation
                const effectiveTactics = { ...userTactics };
                if (depthChart) effectiveTactics.depthChart = depthChart;

                // Check B2B status (simple check: played yesterday?)
                // Assuming date strings are comparable or we check schedule
                const yesterday = new Date(new Date(currentSimDate).getTime() - 86400000).toISOString().split('T')[0];
                const isHomeB2B = schedule.some(g => g.played && g.date === yesterday && (g.homeTeamId === homeTeam.id || g.awayTeamId === homeTeam.id));
                const isAwayB2B = schedule.some(g => g.played && g.date === yesterday && (g.homeTeamId === awayTeam.id || g.awayTeamId === awayTeam.id));

                const userSimResult = simulateGame(
                    homeTeam, awayTeam, myTeamId, effectiveTactics, 
                    isHomeB2B, isAwayB2B,
                    myTeamId === homeTeam.id ? depthChart : undefined, // homeDepthChart
                    myTeamId === awayTeam.id ? depthChart : undefined  // awayDepthChart
                );

                // Define Finalize Function (State updates & DB save)
                const executeStateUpdates = async () => {
                    const newTeams = JSON.parse(JSON.stringify(teams));
                    
                    // Update stats for User Game
                    const homeT = newTeams.find((t: Team) => t.id === homeTeam.id);
                    const awayT = newTeams.find((t: Team) => t.id === awayTeam.id);
                    updateTeamStats(homeT, awayT, userSimResult.homeScore, userSimResult.awayScore);

                    // Update stats for CPU Games
                    cpuResults.forEach(res => {
                        const h = newTeams.find((t: Team) => t.id === res.homeTeamId);
                        const a = newTeams.find((t: Team) => t.id === res.awayTeamId);
                        if (h && a) updateTeamStats(h, a, res.homeScore, res.awayScore);
                    });

                    // Update Schedule
                    const newSchedule = [...schedule];
                    const uIdx = newSchedule.findIndex(g => g.id === userGame.id);
                    if (uIdx !== -1) {
                        newSchedule[uIdx].played = true;
                        newSchedule[uIdx].homeScore = userSimResult.homeScore;
                        newSchedule[uIdx].awayScore = userSimResult.awayScore;
                    }
                    cpuResults.forEach(res => {
                        const cIdx = newSchedule.findIndex(g => g.id === res.gameId);
                        if (cIdx !== -1) {
                            newSchedule[cIdx].played = true;
                            newSchedule[cIdx].homeScore = res.homeScore;
                            newSchedule[cIdx].awayScore = res.awayScore;
                        }
                    });

                    // Playoff Logic
                    let updatedSeries = [...playoffSeries];
                    if (playoffSeries.length > 0) {
                        // User Game Series Update
                        if (userGame.isPlayoff && userGame.seriesId) {
                            updateSeriesState(updatedSeries, userGame.seriesId, userGame.homeTeamId, userGame.awayTeamId, userSimResult.homeScore, userSimResult.awayScore);
                        }
                        // CPU Games Series Update
                        cpuResults.forEach(res => {
                            if (res.isPlayoff && res.seriesId) {
                                updateSeriesState(updatedSeries, res.seriesId, res.homeTeamId, res.awayTeamId, res.homeScore, res.awayScore);
                            }
                        });

                        // Advance Rounds
                        updatedSeries = advancePlayoffState(updatedSeries, newTeams);
                        setPlayoffSeries(updatedSeries);

                        // Generate Next Games
                        const { newGames, updatedSeries: nextSeries } = generateNextPlayoffGames(newSchedule, updatedSeries, currentSimDate);
                        if (newGames.length > 0) {
                            newSchedule.push(...newGames);
                            updatedSeries = nextSeries; // update local ref
                            setPlayoffSeries(nextSeries);
                        }
                    } else {
                        // Check if regular season finished to init playoffs
                        const nextSeries = checkAndInitPlayoffs(newTeams, newSchedule, [], currentSimDate);
                        if (nextSeries.length > 0) {
                            setPlayoffSeries(nextSeries);
                            const { newGames } = generateNextPlayoffGames(newSchedule, nextSeries, currentSimDate);
                            if (newGames.length > 0) newSchedule.push(...newGames);
                        }
                    }

                    // DB Save (User Game Result)
                    if (session?.user?.id) {
                        const userId = session.user.id;
                        
                        // Save User Game
                        const userGamePayload = {
                            user_id: userId,
                            game_id: userGame.id,
                            date: currentSimDate,
                            home_team_id: userGame.homeTeamId,
                            away_team_id: userGame.awayTeamId,
                            home_score: userSimResult.homeScore,
                            away_score: userSimResult.awayScore,
                            box_score: { home: userSimResult.homeBox, away: userSimResult.awayBox },
                            tactics: { home: userSimResult.homeTactics, away: userSimResult.awayTactics },
                            is_playoff: userGame.isPlayoff || false,
                            series_id: userGame.seriesId || null,
                            pbp_logs: userSimResult.pbpLogs,
                            shot_events: userSimResult.pbpShotEvents,
                            rotation_data: userSimResult.rotationData
                        };

                        // Use different tables for regular vs playoff
                        if (userGame.isPlayoff) {
                            await savePlayoffGameResult(userGamePayload as any);
                            await savePlayoffState(userId, myTeamId, updatedSeries, 0, false);
                        } else {
                            await saveGameResults([userGamePayload]);
                        }

                        // Send Game Recap Message
                        const recapNews = await generateGameRecapNews({
                            home: homeTeam,
                            away: awayTeam,
                            homeScore: userSimResult.homeScore,
                            awayScore: userSimResult.awayScore,
                            homeBox: userSimResult.homeBox,
                            awayBox: userSimResult.awayBox,
                            userTactics,
                            myTeamId
                        });

                        await sendMessage(
                            userId, 
                            myTeamId, 
                            currentSimDate === 'PLAYOFF' ? new Date().toISOString().split('T')[0] : currentSimDate,
                            'GAME_RECAP', 
                            recapNews ? recapNews[0] : '경기 결과',
                            {
                                gameId: userGame.id,
                                homeTeamId: homeTeam.id,
                                awayTeamId: awayTeam.id,
                                homeScore: userSimResult.homeScore,
                                awayScore: userSimResult.awayScore,
                                userBoxScore: myTeamId === homeTeam.id ? userSimResult.homeBox : userSimResult.awayBox
                            }
                        );
                        refreshUnreadCount();
                    }

                    // CPU Trades Logic (Random Chance)
                    if (!playoffSeries.length && Math.random() < 0.3) {
                       const tradeResult = await simulateCPUTrades(newTeams, myTeamId);
                       if (tradeResult && tradeResult.transaction) {
                           setTransactions(prev => [tradeResult.transaction!, ...prev]);
                           
                           // News Ticker
                           const newsItems = await generateCPUTradeNews(tradeResult.transaction);
                           if (newsItems) {
                               setNews(prev => [...prev, ...newsItems.map(c => ({ type: 'text', content: c }))]);
                               setToastMessage(`[TRADE] ${newsItems[0]}`);
                           }
                       }
                    }

                    // Update State
                    setTeams(newTeams);
                    setSchedule(newSchedule);
                    
                    // Create Flattened Result for View
                    setLastGameResult({
                        ...userSimResult,
                        homeScore: userSimResult.homeScore,
                        awayScore: userSimResult.awayScore,
                        pbpLogs: userSimResult.pbpLogs,
                        rotationData: userSimResult.rotationData,
                        pbpShotEvents: userSimResult.pbpShotEvents,
                        homeBox: userSimResult.homeBox,
                        awayBox: userSimResult.awayBox,
                        homeTactics: userSimResult.homeTactics,
                        awayTactics: userSimResult.awayTactics,
                        home: homeTeam,
                        away: awayTeam,
                        otherGames: cpuResults.map(r => ({
                            id: r.gameId,
                            homeTeamId: r.homeTeamId,
                            awayTeamId: r.awayTeamId,
                            homeScore: r.homeScore,
                            awayScore: r.awayScore,
                            date: currentSimDate,
                            played: true
                        })),
                        recap: [],
                        injuries: userSimResult.injuries
                    });

                    setActiveGame(null);
                };

                if (skipAnimation) {
                    // [Feature] Instant Sim: Execute immediately without entering GameSim view
                    await executeStateUpdates();
                } else {
                    // Normal Sim: Enter GameSim view and wait for completion
                    setActiveGame(userGame);
                    setTempSimulationResult(userSimResult);
                    finalizeSimRef.current = executeStateUpdates;
                }

            } else {
                // No User Game today - Just Advance
                const newTeams = JSON.parse(JSON.stringify(teams));
                cpuResults.forEach(res => {
                    const h = newTeams.find((t: Team) => t.id === res.homeTeamId);
                    const a = newTeams.find((t: Team) => t.id === res.awayTeamId);
                    if (h && a) updateTeamStats(h, a, res.homeScore, res.awayScore);
                });

                const newSchedule = [...schedule];
                cpuResults.forEach(res => {
                    const cIdx = newSchedule.findIndex(g => g.id === res.gameId);
                    if (cIdx !== -1) {
                        newSchedule[cIdx].played = true;
                        newSchedule[cIdx].homeScore = res.homeScore;
                        newSchedule[cIdx].awayScore = res.awayScore;
                    }
                });

                // Advance Date
                const d = new Date(currentSimDate);
                d.setDate(d.getDate() + 1);
                const nextDate = d.toISOString().split('T')[0];
                
                advanceDate(nextDate, { teams: newTeams, schedule: newSchedule });
                await forceSave({ currentSimDate: nextDate, teams: newTeams });
                setIsSimulating(false);
                setToastMessage("다음 날짜로 이동했습니다.");
            }

        } catch (e) {
            console.error("Simulation Failed:", e);
            setIsSimulating(false);
            setToastMessage("시뮬레이션 중 오류가 발생했습니다.");
        }
    }, [isSimulating, myTeamId, schedule, currentSimDate, teams, playoffSeries, depthChart, session, refreshUnreadCount]);

    return {
        isSimulating,
        setIsSimulating,
        activeGame,
        lastGameResult,
        tempSimulationResult,
        finalizeSimRef,
        handleExecuteSim,
        clearLastGameResult: () => {
            setLastGameResult(null);
            setTempSimulationResult(null);
            setActiveGame(null);
        },
        loadSavedGameResult: (res: any) => setLastGameResult(res)
    };
};
