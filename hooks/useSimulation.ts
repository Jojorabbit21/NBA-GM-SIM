
import { useState, useRef, useCallback, useEffect } from 'react';
import { Team, Game, PlayoffSeries, Transaction, GameTactics, DepthChart, Player, PlayerBoxScore, SimulationResult } from '../types';
import { simulateGame } from '../services/gameEngine';
import { saveGameResults } from '../services/queries';
import { checkAndInitPlayoffs, advancePlayoffState, generateNextPlayoffGames } from '../utils/playoffLogic';
import { savePlayoffState } from '../services/playoffService';
import { INITIAL_STATS } from '../utils/constants';
import { sendMessage } from '../services/messageService';

// [Config] Recovery Rates
const RECOVERY_REST_DAY = 25; // 경기 없는 날 (완전 휴식)
const RECOVERY_POST_GAME_PLAYED = 15; // 경기 출전 후 (수면 회복)
const RECOVERY_POST_GAME_DNP = 25; // 경기 결장 (수면 + 휴식)

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
    
    // [Fix] Store the pre-calculated result to ensure animation matches final data
    const [tempSimulationResult, setTempSimulationResult] = useState<SimulationResult | null>(null);
    
    const finalizeSimRef = useRef<() => void>(undefined);

    const getNextDate = (dateStr: string) => {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
    };

    // Helper to update standings and stats in local memory immediately
    const updateLocalStandingsAndStats = useCallback((gameResults: any[]) => {
        setTeams(prevTeams => {
            const nextTeams = [...prevTeams];
            gameResults.forEach(res => {
                const homeTeam = nextTeams.find(t => t.id === res.home_team_id);
                const awayTeam = nextTeams.find(t => t.id === res.away_team_id);

                if (homeTeam && awayTeam) {
                    // 1. Update Standings
                    if (res.home_score > res.away_score) {
                        homeTeam.wins++;
                        awayTeam.losses++;
                    } else {
                        homeTeam.losses++;
                        awayTeam.wins++;
                    }

                    // 2. Update Player Stats
                    const applyBox = (team: Team, box: PlayerBoxScore[]) => {
                        box.forEach(line => {
                            const p = team.roster.find(player => player.id === line.playerId);
                            if (p) {
                                if (!p.stats) p.stats = INITIAL_STATS();
                                
                                // Basic Stats
                                p.stats.g += 1;
                                p.stats.gs += (line.gs || 0);
                                p.stats.mp += (line.mp || 0);
                                p.stats.pts += line.pts;
                                p.stats.reb += line.reb;
                                p.stats.offReb += (line.offReb || 0);
                                p.stats.defReb += (line.defReb || 0);
                                p.stats.ast += line.ast;
                                p.stats.stl += line.stl;
                                p.stats.blk += line.blk;
                                p.stats.tov += line.tov;
                                p.stats.fga += line.fga;
                                p.stats.fgm += line.fgm;
                                p.stats.p3a += line.p3a;
                                p.stats.p3m += line.p3m;
                                p.stats.fta += line.fta;
                                p.stats.ftm += line.ftm;
                                p.stats.pf += line.pf || 0;
                                p.stats.plusMinus += (line.plusMinus || 0);

                                // Detailed Zone Stats Accumulation
                                Object.keys(line).forEach(key => {
                                    if (key.startsWith('zone_')) {
                                        const val = (line as any)[key];
                                        if (typeof val === 'number') {
                                            p.stats[key] = (p.stats[key] || 0) + val;
                                        }
                                    }
                                });
                            }
                        });
                    };

                    if (res.box_score?.home) applyBox(homeTeam, res.box_score.home);
                    if (res.box_score?.away) applyBox(awayTeam, res.box_score.away);
                }
            });
            return nextTeams;
        });
    }, [setTeams]);

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

            resultsToSave.push({
                user_id: session?.user?.id || 'guest',
                game_id: og.id,
                date: targetDate,
                home_team_id: og.homeTeamId,
                away_team_id: og.awayTeamId,
                home_score: res.homeScore,
                away_score: res.awayScore, // [Fixed] Changed from res.away_score to res.awayScore
                is_playoff: og.isPlayoff,
                series_id: og.seriesId,
                box_score: { home: res.homeBox, away: res.awayBox }
            });
        });

        if (resultsToSave.length > 0 && !isGuestMode) {
            await saveGameResults(resultsToSave);
        }
        
        updateLocalStandingsAndStats(resultsToSave);

        return updatedSchedule;
    }, [schedule, teams, isGuestMode, session, updateLocalStandingsAndStats]);

    // Handle User Game Completion
    useEffect(() => {
        finalizeSimRef.current = async () => {
            if (!activeGame || !tempSimulationResult) return;

            const userGame = activeGame;
            const result = tempSimulationResult; // Pre-calculated engine result

            const homeTeam = teams.find(t => t.id === userGame.homeTeamId)!;
            const awayTeam = teams.find(t => t.id === userGame.awayTeamId)!;

            // 1. Calculate Post-Game Recovery (Sleep) & Deltas
            // result.homeBox/awayBox contains the 'end of game' condition (fatigued).
            // We apply recovery based on whether they played or not.
            
            const processRecovery = (team: Team, box: PlayerBoxScore[]) => {
                return team.roster.map(p => {
                    const statLine = box.find(b => b.playerId === p.id);
                    const oldCond = p.condition || 100; // Previous day's condition
                    let newCond = oldCond;
                    
                    if (statLine) {
                        // Player was on the active roster list for this game
                        const fatiguedCond = statLine.condition; // Condition at buzzer
                        // If MP > 0, they played and get normal sleep (+15). If DNP, they get rest (+25).
                        const recovery = statLine.mp > 0 ? RECOVERY_POST_GAME_PLAYED : RECOVERY_POST_GAME_DNP;
                        newCond = Math.min(100, Math.round(fatiguedCond + recovery));
                    } else {
                        // Player was not in the game object at all (Reserved/Inactive)
                        newCond = Math.min(100, Math.round(oldCond + RECOVERY_REST_DAY));
                    }

                    return {
                        ...p,
                        condition: newCond,
                        conditionDelta: newCond - oldCond
                    };
                });
            };

            const nextHomeRoster = processRecovery(homeTeam, result.homeBox);
            const nextAwayRoster = processRecovery(awayTeam, result.awayBox);

            // Apply to Teams State
            setTeams(prev => prev.map(t => {
                if (t.id === homeTeam.id) return { ...t, roster: nextHomeRoster };
                if (t.id === awayTeam.id) return { ...t, roster: nextAwayRoster };
                return t;
            }));

            // 2. Save Results
            const userResult = {
                user_id: session?.user?.id || 'guest',
                game_id: userGame.id,
                date: currentSimDate,
                home_team_id: userGame.homeTeamId,
                away_team_id: userGame.awayTeamId,
                home_score: result.homeScore,
                away_score: result.awayScore,
                is_playoff: userGame.isPlayoff,
                series_id: userGame.seriesId,
                box_score: { home: result.homeBox, away: result.awayBox },
                rotation_data: result.rotationData,
                tactics: { home: result.homeTactics, away: result.awayTactics }
            };

            if (!isGuestMode && session?.user?.id) {
                await saveGameResults([userResult]);
                
                // Send Message for Game Recap
                const myTeamName = homeTeam.id === myTeamId ? homeTeam.name : awayTeam.name;
                const oppTeamName = homeTeam.id === myTeamId ? awayTeam.name : homeTeam.name;
                const isWin = (homeTeam.id === myTeamId && result.homeScore > result.awayScore) ||
                              (awayTeam.id === myTeamId && result.awayScore > result.homeScore);
                const resultText = isWin ? '승리' : '패배';

                await sendMessage(
                    session.user.id,
                    myTeamId!,
                    currentSimDate,
                    'GAME_RECAP',
                    `경기 결과: vs ${oppTeamName} (${resultText})`,
                    {
                        gameId: userGame.id,
                        homeTeamId: homeTeam.id,
                        awayTeamId: awayTeam.id,
                        homeScore: result.homeScore,
                        awayScore: result.awayScore,
                        userBoxScore: myTeamId === homeTeam.id ? result.homeBox : result.awayBox
                    }
                );
                refreshUnreadCount();
            }

            // Update stats
            updateLocalStandingsAndStats([userResult]);

            // Simulate CPU Games
            const updatedSchedule = await simulateLeagueGames(currentSimDate, userGame.id);
            const userGameIdx = updatedSchedule.findIndex(g => g.id === userGame.id);
            updatedSchedule[userGameIdx] = { ...userGame, played: true, homeScore: result.homeScore, awayScore: result.awayScore };

            setSchedule(updatedSchedule);
            setLastGameResult({
                ...result,
                home: homeTeam,
                away: awayTeam,
                myTeamId,
                otherGames: updatedSchedule.filter(g => g.date === currentSimDate && g.id !== userGame.id)
            });

            // Playoffs
            let updatedSeries = playoffSeries;
            if (playoffSeries.length > 0) {
                updatedSeries = advancePlayoffState(playoffSeries, teams);
                setPlayoffSeries(updatedSeries);
                if (!isGuestMode && session?.user?.id) {
                    await savePlayoffState(session.user.id, myTeamId!, updatedSeries);
                }
            }

            setActiveGame(null);
            setTempSimulationResult(null); 
        };
    }, [activeGame, tempSimulationResult, teams, schedule, currentSimDate, myTeamId, setSchedule, isGuestMode, session, simulateLeagueGames, playoffSeries, setPlayoffSeries, updateLocalStandingsAndStats, refreshUnreadCount]);

    const handleExecuteSim = useCallback(async (userTactics: GameTactics) => {
        setIsSimulating(true);
        
        // [Logic Update] Removed instant recovery before game.
        // Players play with their current condition.
        
        const userGame = schedule.find(g => g.date === currentSimDate && !g.played && (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId));
        
        if (userGame) {
            const homeTeam = teams.find(t => t.id === userGame.homeTeamId)!;
            const awayTeam = teams.find(t => t.id === userGame.awayTeamId)!;
            
            // Execute Physics Engine
            const result = simulateGame(
                homeTeam, 
                awayTeam, 
                myTeamId, 
                userTactics, 
                false, 
                false, 
                depthChart
            );

            setTempSimulationResult(result);
            setActiveGame(userGame); // Triggers View Switch -> Game Animation
            
        } else {
            // --- NO USER GAME TODAY (REST DAY SIMULATION) ---
            
            // 1. Apply Rest Day Recovery (+25) to User Team (and others)
            const updatedTeams = teams.map(team => ({
                ...team,
                roster: team.roster.map(p => {
                    const oldCond = p.condition || 100;
                    const newCond = Math.min(100, Math.round(oldCond + RECOVERY_REST_DAY));
                    return { 
                        ...p, 
                        condition: newCond,
                        conditionDelta: newCond - oldCond
                    };
                })
            }));
            setTeams(updatedTeams);

            // 2. Simulate CPU Games
            const updatedSchedule = await simulateLeagueGames(currentSimDate, undefined, updatedTeams);
            setSchedule(updatedSchedule);

            // 3. Playoff Logic
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
            
            await forceSave({ 
                currentSimDate: nextDay, 
                teams: updatedTeams,
                userTactics: userTactics 
            });
            setIsSimulating(false);
        }
    }, [teams, schedule, currentSimDate, myTeamId, advanceDate, setTeams, setSchedule, simulateLeagueGames, forceSave, playoffSeries, setPlayoffSeries, isGuestMode, session, depthChart]);

    const clearLastGameResult = () => setLastGameResult(null);

    return {
        isSimulating, setIsSimulating,
        activeGame, lastGameResult,
        handleExecuteSim,
        finalizeSimRef,
        clearLastGameResult,
        tempSimulationResult 
    };
};
