import { useState, useRef, useCallback } from 'react';
import { Team, Game, PlayoffSeries, Transaction, GameTactics, SimulationResult, Player, DepthChart } from '../types';
import { simulateGame } from '../services/gameEngine';
import { simulateCpuGames, CpuGameResult } from '../services/simulationService';
import { generateGameRecapNews, generateCPUTradeNews } from '../services/geminiService';
import { saveGameResults, saveUserTransaction } from '../services/queries';
import { updateTeamStats, updateSeriesState } from '../utils/simulationUtils';
import { advancePlayoffState, generateNextPlayoffGames, checkAndInitPlayoffs } from '../utils/playoffLogic';
import { simulateCPUTrades } from '../services/tradeEngine';
import { savePlayoffState, savePlayoffGameResult } from '../services/playoffService';
import { sendMessage } from '../services/messageService';

export const useSimulation = (
    teams: Team[],
    setTeams: React.Dispatch<React.SetStateAction<Team[]>>,
    schedule: Game[],
    setSchedule: React.Dispatch<React.SetStateAction<Game[]>>,
    myTeamId: string | null,
    currentSimDate: string,
    advanceDate: (date: string, overrides: any) => void,
    playoffSeries: PlayoffSeries[],
    setPlayoffSeries: React.Dispatch<React.SetStateAction<PlayoffSeries[]>>,
    setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>,
    setNews: React.Dispatch<React.SetStateAction<any[]>>,
    setToastMessage: (msg: string) => void,
    forceSave: (overrides?: any) => Promise<void>,
    session: any,
    isGuestMode: boolean,
    refreshUnreadCount: () => void,
    depthChart?: DepthChart | null
) => {
    const [isSimulating, setIsSimulating] = useState(false);
    const [activeGame, setActiveGame] = useState<Game | null>(null);
    const [lastGameResult, setLastGameResult] = useState<any | null>(null);
    const [tempSimulationResult, setTempSimulationResult] = useState<SimulationResult | null>(null);
    
    // Ref to hold the finalization logic for the active game
    const finalizeSimRef = useRef<(() => void) | undefined>(undefined);

    const handleExecuteSim = useCallback(async (userTactics: GameTactics, skipAnimation: boolean = false) => {
        if (isSimulating || !myTeamId) return;
        setIsSimulating(true);

        try {
            // 1. Identify User's Game for today
            const userGame = schedule.find(g => 
                !g.played && 
                g.date === currentSimDate && 
                (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId)
            );

            // 2. Identify CPU Games
            const cpuResults = simulateCpuGames(schedule, teams, currentSimDate, userGame?.id);

            // 3. Prepare updated state containers
            let newTeams = JSON.parse(JSON.stringify(teams));
            let newSchedule = [...schedule];
            let newPlayoffSeries = [...playoffSeries];
            const gameResultsToSave: any[] = [];
            const playoffResultsToSave: any[] = [];

            // 4. Process CPU Results
            cpuResults.forEach(res => {
                const home = newTeams.find((t: Team) => t.id === res.homeTeamId);
                const away = newTeams.find((t: Team) => t.id === res.awayTeamId);
                
                if (home && away) {
                    updateTeamStats(home, away, res.homeScore, res.awayScore);
                    
                    const gameIdx = newSchedule.findIndex(g => g.id === res.gameId);
                    if (gameIdx !== -1) {
                        newSchedule[gameIdx].played = true;
                        newSchedule[gameIdx].homeScore = res.homeScore;
                        newSchedule[gameIdx].awayScore = res.awayScore;
                    }

                    if (res.isPlayoff && res.seriesId) {
                        updateSeriesState(newPlayoffSeries, res.seriesId, res.homeTeamId, res.awayTeamId, res.homeScore, res.awayScore);
                        // Save Playoff Result
                        if (session?.user?.id) {
                            playoffResultsToSave.push({
                                user_id: session.user.id,
                                game_id: res.gameId,
                                date: currentSimDate,
                                home_team_id: res.homeTeamId,
                                away_team_id: res.awayTeamId,
                                home_score: res.homeScore,
                                away_score: res.awayScore,
                                box_score: res.boxScore,
                                tactics: res.tactics,
                                is_playoff: true,
                                series_id: res.seriesId,
                                round_number: 0, // Todo: map round
                                game_number: 0
                            });
                        }
                    }
                }
            });

            // 5. Setup User Game Simulation (if exists)
            if (userGame) {
                const homeTeam = newTeams.find((t: Team) => t.id === userGame.homeTeamId);
                const awayTeam = newTeams.find((t: Team) => t.id === userGame.awayTeamId);
                const isHome = userGame.homeTeamId === myTeamId;

                if (homeTeam && awayTeam) {
                    // Check Back-to-Back status
                    const checkB2B = (teamId: string) => {
                        const yesterday = new Date(currentSimDate);
                        yesterday.setDate(yesterday.getDate() - 1);
                        const yStr = yesterday.toISOString().split('T')[0];
                        return schedule.some(g => g.played && g.date === yStr && (g.homeTeamId === teamId || g.awayTeamId === teamId));
                    };

                    const isHomeB2B = checkB2B(homeTeam.id);
                    const isAwayB2B = checkB2B(awayTeam.id);

                    // User tactics logic
                    const homeDepth = isHome ? depthChart : undefined;
                    const awayDepth = !isHome ? depthChart : undefined;

                    // Run Simulation
                    const result = simulateGame(
                        homeTeam, 
                        awayTeam, 
                        myTeamId, 
                        userTactics,
                        isHomeB2B,
                        isAwayB2B,
                        homeDepth,
                        awayDepth
                    );

                    // Store temp result for animation
                    setTempSimulationResult(result);
                    
                    // [UX Fix] Do NOT set activeGame if skipping animation to prevent flickering to Sim View.
                    // activeGame drives the view switch in App.tsx.
                    if (!skipAnimation) {
                        setActiveGame(userGame);
                    }

                    // Define Finalize Function
                    finalizeSimRef.current = async () => {
                        // Apply User Game Result
                        updateTeamStats(homeTeam, awayTeam, result.homeScore, result.awayScore);
                        
                        // Update Roster (Fatigue/Injury)
                        if (result.rosterUpdates) {
                            [homeTeam, awayTeam].forEach(t => {
                                t.roster.forEach(p => {
                                    const update = result.rosterUpdates[p.id];
                                    if (update) {
                                        if (update.condition !== undefined) p.condition = update.condition;
                                        if (update.health) p.health = update.health;
                                        if (update.injuryType) p.injuryType = update.injuryType;
                                        if (update.returnDate) p.returnDate = update.returnDate;
                                    }
                                });
                            });
                        }

                        // Update Schedule
                        const uGameIdx = newSchedule.findIndex(g => g.id === userGame.id);
                        if (uGameIdx !== -1) {
                            newSchedule[uGameIdx].played = true;
                            newSchedule[uGameIdx].homeScore = result.homeScore;
                            newSchedule[uGameIdx].awayScore = result.awayScore;
                        }

                        if (userGame.isPlayoff && userGame.seriesId) {
                            updateSeriesState(newPlayoffSeries, userGame.seriesId, userGame.homeTeamId, userGame.awayTeamId, result.homeScore, result.awayScore);
                        }

                        // Save Result to DB
                        const resultPayload = {
                            user_id: session?.user?.id || 'guest',
                            game_id: userGame.id,
                            date: currentSimDate,
                            home_team_id: homeTeam.id,
                            away_team_id: awayTeam.id,
                            home_score: result.homeScore,
                            away_score: result.awayScore,
                            box_score: { home: result.homeBox, away: result.awayBox },
                            tactics: { home: result.homeTactics, away: result.awayTactics },
                            pbp_logs: result.pbpLogs,
                            shot_events: result.pbpShotEvents,
                            is_playoff: userGame.isPlayoff || false,
                            series_id: userGame.seriesId,
                            rotation_data: result.rotationData
                        };

                        if (!isGuestMode) {
                            if (userGame.isPlayoff) {
                                await savePlayoffGameResult(resultPayload as any);
                            } else {
                                await saveGameResults([resultPayload]);
                            }
                        }

                        // Send Game Recap Message
                        if (session?.user?.id) {
                            const recapNews = await generateGameRecapNews({
                                home: homeTeam, away: awayTeam,
                                homeScore: result.homeScore, awayScore: result.awayScore,
                                homeBox: result.homeBox, awayBox: result.awayBox,
                                userTactics, myTeamId
                            });
                            
                            await sendMessage(
                                session.user.id,
                                myTeamId,
                                currentSimDate,
                                'GAME_RECAP',
                                `[경기 결과] ${homeTeam.name} vs ${awayTeam.name}`,
                                {
                                    gameId: userGame.id,
                                    homeTeamId: homeTeam.id,
                                    awayTeamId: awayTeam.id,
                                    homeScore: result.homeScore,
                                    awayScore: result.awayScore,
                                    userBoxScore: isHome ? result.homeBox : result.awayBox,
                                    recap: recapNews
                                }
                            );
                            refreshUnreadCount();
                        }

                        // Handle Playoff Advancement & Next Schedule
                        let playoffUpdateTriggered = false;
                        if (newPlayoffSeries.length > 0) {
                            const advancedSeries = advancePlayoffState(newPlayoffSeries, newTeams);
                            if (advancedSeries !== newPlayoffSeries) {
                                newPlayoffSeries = advancedSeries;
                                playoffUpdateTriggered = true;
                            }
                            
                            const { newGames, updatedSeries } = generateNextPlayoffGames(newSchedule, newPlayoffSeries, currentSimDate);
                            if (newGames.length > 0) {
                                newSchedule = [...newSchedule, ...newGames];
                                newPlayoffSeries = updatedSeries;
                                playoffUpdateTriggered = true;
                            }
                        } else {
                            // Check for Playoff Initialization (Regular Season End)
                            const initializedSeries = checkAndInitPlayoffs(newTeams, newSchedule, [], currentSimDate);
                            if (initializedSeries.length > 0) {
                                newPlayoffSeries = initializedSeries;
                                playoffUpdateTriggered = true;
                                // Generate first games
                                const { newGames, updatedSeries } = generateNextPlayoffGames(newSchedule, newPlayoffSeries, currentSimDate);
                                newSchedule = [...newSchedule, ...newGames];
                                newPlayoffSeries = updatedSeries;
                            }
                        }

                        // CPU Trades Logic (Random Chance during Regular Season)
                        if (newPlayoffSeries.length === 0 && Math.random() < 0.3) {
                           const tradeResult = await simulateCPUTrades(newTeams, myTeamId);
                           if (tradeResult && tradeResult.transaction) {
                               // [Fix] Ensure date matches current simulation date
                               const cpuTx = { ...tradeResult.transaction, date: currentSimDate };
                               
                               setTransactions(prev => [cpuTx, ...prev]);
                               
                               // News Ticker
                               const newsItems = await generateCPUTradeNews(cpuTx);
                               if (newsItems) {
                                   setNews(prev => [...prev, ...newsItems.map(c => ({ type: 'text', content: c }))]);
                                   setToastMessage(`[TRADE] ${newsItems[0]}`);
                               }
                           }
                        }

                        // Commit State Updates
                        setTeams(newTeams);
                        setSchedule(newSchedule);
                        setPlayoffSeries(newPlayoffSeries);
                        
                        // Save State
                        if (!isGuestMode) {
                            if (playoffUpdateTriggered && newPlayoffSeries.length > 0) {
                                const currentRound = Math.max(...newPlayoffSeries.map(s => s.round));
                                const isFinished = newPlayoffSeries.some(s => s.round === 4 && s.finished);
                                const championId = isFinished ? newPlayoffSeries.find(s => s.round === 4)?.winnerId : undefined;
                                
                                await savePlayoffState(session.user.id, myTeamId, newPlayoffSeries, currentRound, isFinished, championId);
                            }
                        }

                        // Set View Data
                        setLastGameResult({
                            home: homeTeam,
                            away: awayTeam,
                            homeScore: result.homeScore,
                            awayScore: result.awayScore,
                            homeBox: result.homeBox,
                            awayBox: result.awayBox,
                            recap: [],
                            otherGames: cpuResults.map(r => ({
                                id: r.gameId, homeTeamId: r.homeTeamId, awayTeamId: r.awayTeamId,
                                homeScore: r.homeScore, awayScore: r.awayScore, played: true
                            })),
                            cpuResults: cpuResults,
                            homeTactics: result.homeTactics,
                            awayTactics: result.awayTactics,
                            pbpLogs: result.pbpLogs,
                            rotationData: result.rotationData,
                            pbpShotEvents: result.pbpShotEvents,
                            injuries: result.injuries
                        });

                        setActiveGame(null);
                    };

                    if (skipAnimation) {
                        // Directly finalize without setting activeGame to avoid UI flicker
                        await finalizeSimRef.current();
                        setIsSimulating(false); 
                    }
                    // Else: GameSimulatingView will call finalizeSimRef.current when done
                }
            } else {
                // No User Game - Just Advance Day
                // Apply CPU results to state
                setTeams(newTeams);
                setSchedule(newSchedule);
                setPlayoffSeries(newPlayoffSeries);
                
                const d = new Date(currentSimDate);
                d.setDate(d.getDate() + 1);
                const nextDate = d.toISOString().split('T')[0];
                
                advanceDate(nextDate, { teams: newTeams, schedule: newSchedule });
                
                // Save
                if (!isGuestMode) {
                    await forceSave({ 
                        currentSimDate: nextDate,
                        teams: newTeams 
                    });
                }
                
                setIsSimulating(false);
                // [UX Fix] Toast message removed per user request
            }

        } catch (e) {
            console.error("Simulation Error:", e);
            setIsSimulating(false);
            setToastMessage("시뮬레이션 중 오류가 발생했습니다.");
        }
    }, [teams, schedule, myTeamId, currentSimDate, isSimulating, isGuestMode, session, depthChart, playoffSeries]);

    const clearLastGameResult = () => setLastGameResult(null);
    const loadSavedGameResult = (result: any) => setLastGameResult(result);

    return {
        handleExecuteSim,
        isSimulating,
        setIsSimulating,
        activeGame,
        lastGameResult,
        tempSimulationResult,
        finalizeSimRef,
        clearLastGameResult,
        loadSavedGameResult
    };
};