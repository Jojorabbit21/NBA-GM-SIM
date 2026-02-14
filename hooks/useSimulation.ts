
import { useState, useRef, useCallback } from 'react';
import { Team, Game, PlayoffSeries, Transaction, GameTactics, DepthChart, Player, RosterUpdate, SimulationResult, PlayerBoxScore } from '../types';
import { simulateGame } from '../services/gameEngine';
import { simulateCpuGames } from '../services/simulationService';
import { updateTeamStats, updateSeriesState } from '../utils/simulationUtils';
import { checkAndInitPlayoffs, advancePlayoffState, generateNextPlayoffGames } from '../utils/playoffLogic';
import { saveGameResults } from '../services/queries';
import { savePlayoffState, savePlayoffGameResult } from '../services/playoffService';
import { generateGameRecapNews, generateCPUTradeNews } from '../services/geminiService';
import { simulateCPUTrades } from '../services/tradeEngine';
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
    depthChart: DepthChart | null
) => {
    const [isSimulating, setIsSimulating] = useState(false);
    const [activeGame, setActiveGame] = useState<Game | null>(null);
    const [lastGameResult, setLastGameResult] = useState<any | null>(null);
    const [tempSimulationResult, setTempSimulationResult] = useState<SimulationResult | null>(null);
    const finalizeSimRef = useRef<(() => void) | null>(null);

    const handleExecuteSim = useCallback(async (userTactics: GameTactics, skipAnimation: boolean = false) => {
        if (isSimulating || !myTeamId) return;
        setIsSimulating(true);

        try {
            // 1. Identify User Game
            const userGame = schedule.find(g => 
                !g.played && 
                g.date === currentSimDate && 
                (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId)
            );

            // 2. Simulate CPU Games
            const cpuResults = simulateCpuGames(schedule, teams, currentSimDate, userGame?.id);

            // Helper to save CPU results
            const saveCpuGames = async (uId: string) => {
                const regPayloads: any[] = [];
                const poPayloads: any[] = [];
                
                cpuResults.forEach(res => {
                    const p = {
                        user_id: uId,
                        game_id: res.gameId,
                        date: currentSimDate,
                        home_team_id: res.homeTeamId,
                        away_team_id: res.awayTeamId,
                        home_score: res.homeScore,
                        away_score: res.awayScore,
                        box_score: res.boxScore,
                        tactics: res.tactics,
                        is_playoff: res.isPlayoff || false,
                        series_id: res.seriesId || null,
                        pbp_logs: [],
                        shot_events: [],
                        rotation_data: {}
                    };
                    if (res.isPlayoff) poPayloads.push(p);
                    else regPayloads.push(p);
                });

                if (regPayloads.length > 0) await saveGameResults(regPayloads);
                if (poPayloads.length > 0) {
                    for (const pg of poPayloads) await savePlayoffGameResult(pg);
                }
            };

            // 3. User Game Logic
            if (userGame) {
                const homeTeam = teams.find(t => t.id === userGame.homeTeamId);
                const awayTeam = teams.find(t => t.id === userGame.awayTeamId);

                if (!homeTeam || !awayTeam) {
                    setIsSimulating(false);
                    return;
                }

                // Simulate User Game (PbP Engine)
                // Determine Back-to-Back status
                const isHomeB2B = schedule.some(g => g.played && g.date === new Date(new Date(currentSimDate).setDate(new Date(currentSimDate).getDate() - 1)).toISOString().split('T')[0] && (g.homeTeamId === homeTeam.id || g.awayTeamId === homeTeam.id));
                const isAwayB2B = schedule.some(g => g.played && g.date === new Date(new Date(currentSimDate).setDate(new Date(currentSimDate).getDate() - 1)).toISOString().split('T')[0] && (g.homeTeamId === awayTeam.id || g.awayTeamId === awayTeam.id));

                const userSimResult = simulateGame(
                    homeTeam, 
                    awayTeam, 
                    myTeamId, 
                    userTactics, 
                    isHomeB2B, 
                    isAwayB2B,
                    homeTeam.id === myTeamId ? depthChart : undefined,
                    awayTeam.id === myTeamId ? depthChart : undefined
                );

                // Define Finalize Function (State updates & DB save)
                const executeStateUpdates = async () => {
                    const newTeams = JSON.parse(JSON.stringify(teams));
                    
                    // Update stats for User Game
                    const homeT = newTeams.find((t: Team) => t.id === homeTeam.id);
                    const awayT = newTeams.find((t: Team) => t.id === awayTeam.id);
                    if (homeT && awayT) {
                        updateTeamStats(homeT, awayT, userSimResult.homeScore, userSimResult.awayScore);
                        // [Fix] Aggregate Stats
                        accumulatePlayerStats(homeT, userSimResult.homeBox);
                        accumulatePlayerStats(awayT, userSimResult.awayBox);
                    }

                    // Apply Roster Updates (Fatigue & Injuries) from Game Result
                    if (userSimResult.rosterUpdates) {
                        const updates = userSimResult.rosterUpdates;
                        // Iterate affected teams (User's game only involves 2 teams)
                        [homeT, awayT].forEach((team: Team) => {
                            if (team) {
                                team.roster.forEach((p: Player) => {
                                    const update = updates[p.id];
                                    const oldCond = p.condition || 100;

                                    if (update) {
                                        // Update Condition from Engine
                                        if (update.condition !== undefined) {
                                            p.condition = update.condition;
                                            p.conditionDelta = Number((p.condition - oldCond).toFixed(1));
                                        }
                                        // Update Health
                                        if (update.health) {
                                            p.health = update.health as any;
                                            p.injuryType = update.injuryType;
                                            p.returnDate = update.returnDate;
                                        }
                                    } else {
                                        // DNP (Did Not Play) -> Minor Recovery on game day
                                        if (oldCond < 100) {
                                            const recovered = Math.min(100, oldCond + 5);
                                            p.condition = recovered;
                                            p.conditionDelta = Number((recovered - oldCond).toFixed(1));
                                        } else {
                                            p.conditionDelta = 0;
                                        }
                                    }
                                });
                            }
                        });
                    }

                    // Update stats for CPU Games
                    cpuResults.forEach(res => {
                        const h = newTeams.find((t: Team) => t.id === res.homeTeamId);
                        const a = newTeams.find((t: Team) => t.id === res.awayTeamId);
                        if (h && a) {
                            updateTeamStats(h, a, res.homeScore, res.awayScore);
                            // [Fix] Aggregate Stats for CPU games
                            accumulatePlayerStats(h, res.boxScore.home);
                            accumulatePlayerStats(a, res.boxScore.away);
                        }
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

                    // DB Save (User Game Result & CPU Game Results)
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
                        
                        // [FIX] Save CPU Games
                        await saveCpuGames(userId);

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
                    await executeStateUpdates();
                } else {
                    setActiveGame(userGame);
                    setTempSimulationResult(userSimResult);
                    finalizeSimRef.current = executeStateUpdates;
                }

            } else {
                // No User Game today - Just Advance
                const newTeams = JSON.parse(JSON.stringify(teams));
                
                // Apply Daily Rest Recovery for User Team (Day Off)
                const myTeam = newTeams.find((t: Team) => t.id === myTeamId);
                if (myTeam) {
                    myTeam.roster.forEach((p: Player) => {
                        const oldCond = p.condition || 100;
                        if (oldCond < 100) {
                            // Recover 15% per rest day
                            const newCond = Math.min(100, oldCond + 15);
                            p.condition = parseFloat(newCond.toFixed(1));
                            p.conditionDelta = Number((newCond - oldCond).toFixed(1));
                        } else {
                            p.conditionDelta = 0;
                        }
                    });
                }
                
                cpuResults.forEach(res => {
                    const h = newTeams.find((t: Team) => t.id === res.homeTeamId);
                    const a = newTeams.find((t: Team) => t.id === res.awayTeamId);
                    if (h && a) {
                        updateTeamStats(h, a, res.homeScore, res.awayScore);
                        // [Fix] Aggregate Stats for CPU games
                        accumulatePlayerStats(h, res.boxScore.home);
                        accumulatePlayerStats(a, res.boxScore.away);
                    }
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
                
                // [FIX] Save CPU Games
                if (session?.user?.id) {
                    await saveCpuGames(session.user.id);
                }

                // Advance Date
                const d = new Date(currentSimDate);
                d.setDate(d.getDate() + 1);
                const nextDate = d.toISOString().split('T')[0];
                
                advanceDate(nextDate, { teams: newTeams, schedule: newSchedule });
                await forceSave({ currentSimDate: nextDate, teams: newTeams });
                setIsSimulating(false);
            }
        } catch (e) {
            console.error("Simulation Error:", e);
            setToastMessage("시뮬레이션 중 오류가 발생했습니다.");
            setIsSimulating(false);
        }
    }, [isSimulating, myTeamId, teams, schedule, currentSimDate, depthChart, playoffSeries, advanceDate, forceSave, session, refreshUnreadCount]);

    const loadSavedGameResult = (result: any) => {
        setLastGameResult(result);
    };

    const clearLastGameResult = () => {
        setLastGameResult(null);
    };

    return {
        handleExecuteSim,
        isSimulating,
        setIsSimulating,
        activeGame,
        setActiveGame,
        lastGameResult,
        clearLastGameResult,
        loadSavedGameResult,
        tempSimulationResult,
        setTempSimulationResult,
        finalizeSimRef
    };
};

// [Helper] Aggregate Game Stats into Season Stats
function accumulatePlayerStats(team: Team, box: PlayerBoxScore[]) {
    if (!team || !box) return;
    box.forEach(stat => {
        const p = team.roster.find(rp => rp.id === stat.playerId);
        if (p) {
            // Stats object should exist, but init if safety needed (rare case)
            if (!p.stats) p.stats = { 
                g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, 
                fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, rimM: 0, rimA: 0, midM: 0, midA: 0, pf: 0, plusMinus: 0 
            } as any;

            p.stats.g += 1;
            p.stats.gs += (stat.gs || 0);
            p.stats.mp += (stat.mp || 0);
            p.stats.pts += (stat.pts || 0);
            p.stats.reb += (stat.reb || 0);
            p.stats.offReb += (stat.offReb || 0);
            p.stats.defReb += (stat.defReb || 0);
            p.stats.ast += (stat.ast || 0);
            p.stats.stl += (stat.stl || 0);
            p.stats.blk += (stat.blk || 0);
            p.stats.tov += (stat.tov || 0);
            p.stats.pf += (stat.pf || 0);
            p.stats.fgm += (stat.fgm || 0);
            p.stats.fga += (stat.fga || 0);
            p.stats.p3m += (stat.p3m || 0);
            p.stats.p3a += (stat.p3a || 0);
            p.stats.ftm += (stat.ftm || 0);
            p.stats.fta += (stat.fta || 0);
            p.stats.rimM += (stat.rimM || 0);
            p.stats.rimA += (stat.rimA || 0);
            p.stats.midM += (stat.midM || 0);
            p.stats.midA += (stat.midA || 0);
            p.stats.plusMinus += (stat.plusMinus || 0);

            // Aggregate Zone Data
            if (stat.zoneData) {
                Object.entries(stat.zoneData).forEach(([k, v]) => {
                    if (typeof v === 'number') {
                        p.stats[k] = (p.stats[k] || 0) + v;
                    }
                });
            }
        }
    });
}
