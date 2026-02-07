
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Game, Team, SimulationResult, PlayoffGameResultDB, Transaction, TradeAlertContent, DepthChart, GameTactics, GameRecapContent } from '../types';
import { simulateGame } from '../services/gameEngine';
import { generateGameRecapNews } from '../services/geminiService';
import { simulateCPUTrades } from '../services/tradeEngine';
import { TRADE_DEADLINE, SEASON_START_DATE } from '../utils/constants';
import { saveGameResults, saveUserTransaction } from '../services/queries';
import { savePlayoffState, savePlayoffGameResult } from '../services/playoffService';
import { sendMessage } from '../services/messageService';
import { checkAndInitPlayoffs, generateNextPlayoffGames, advancePlayoffState } from '../utils/playoffLogic';
import { updateTeamTacticHistory } from '../utils/tacticUtils';

export const useSimulation = (
    teams: Team[], setTeams: React.Dispatch<React.SetStateAction<Team[]>>,
    schedule: Game[], setSchedule: React.Dispatch<React.SetStateAction<Game[]>>,
    myTeamId: string | null,
    currentSimDate: string, 
    onDateChange: (newDate: string, overrides?: any) => void,
    playoffSeries: any[], setPlayoffSeries: React.Dispatch<React.SetStateAction<any[]>>,
    setTransactions: React.Dispatch<React.SetStateAction<any[]>>,
    setNews: React.Dispatch<React.SetStateAction<any[]>>,
    setToastMessage: (msg: string | null) => void,
    triggerSave: (overrides?: any) => void,
    session: any,
    isGuestMode: boolean,
    refreshUnreadCount: () => void,
    userDepthChart?: DepthChart | null
) => {
    const [isSimulating, setIsSimulating] = useState(false);
    const [activeGame, setActiveGame] = useState<Game | null>(null);
    const [lastGameResult, setLastGameResult] = useState<any>(null);
    const finalizeSimRef = useRef<((userResult?: any) => Promise<void>) | null>(null);

    const updatedTeamsRef = useRef(teams);
    useEffect(() => { updatedTeamsRef.current = teams; }, [teams]);

    // [Playoff Hook] Generate Schedule & Advance Rounds Automatically
    useEffect(() => {
        if (!teams || teams.length === 0 || !schedule || schedule.length === 0) return;

        let currentSeries = [...playoffSeries];
        let stateChanged = false;
        
        // 1. Check for Init (Regular Season End)
        const initializedSeries = checkAndInitPlayoffs(teams, schedule, currentSeries, currentSimDate);
        if (initializedSeries.length > currentSeries.length) {
            currentSeries = initializedSeries;
            stateChanged = true;
            setToastMessage("🏆 플레이-인 토너먼트가 시작되었습니다!");
        }

        // 2. Advance State (Check wins, promote to next round)
        const advancedSeries = advancePlayoffState(currentSeries, teams);
        if (JSON.stringify(advancedSeries) !== JSON.stringify(currentSeries)) {
            currentSeries = advancedSeries;
            stateChanged = true;
        }

        // 3. Generate Games for Active Series
        const { newGames, updatedSeries } = generateNextPlayoffGames(schedule, currentSeries, currentSimDate);
        
        if (newGames.length > 0) {
            setSchedule(prev => [...prev, ...newGames]);
            console.log("📅 Playoff Games Scheduled:", newGames.length);
            triggerSave({ schedule: [...schedule, ...newGames] });
        }

        if (stateChanged || JSON.stringify(updatedSeries) !== JSON.stringify(playoffSeries)) {
             setPlayoffSeries(updatedSeries);
             stateChanged = true;
        }

        // Save Playoff State if structure changed
        if (stateChanged && session?.user && !isGuestMode && myTeamId) {
            savePlayoffState(session.user.id, myTeamId, updatedSeries);
        }

    }, [currentSimDate, schedule, playoffSeries, teams, setSchedule, setPlayoffSeries, setToastMessage, triggerSave, session, isGuestMode, myTeamId]);


    // [Fix] Allow passing overrideTeams to use the latest state (e.g., after game sim)
    const advanceDate = useCallback(async (overrideTeams?: Team[]) => {
        const prevDate = currentSimDate;
        const teamsPlayedToday = schedule
            .filter(g => g.date === prevDate && g.played)
            .reduce((acc, g) => {
                acc.add(g.homeTeamId);
                acc.add(g.awayTeamId);
                return acc;
            }, new Set<string>());

        // [Fix] Robust Date Addition to prevent Timezone issues
        const [y, m, d] = prevDate.split('-').map(Number);
        const nextDateObj = new Date(y, m - 1, d);
        nextDateObj.setDate(nextDateObj.getDate() + 1);
        const nextDate = `${nextDateObj.getFullYear()}-${String(nextDateObj.getMonth()+1).padStart(2,'0')}-${String(nextDateObj.getDate()).padStart(2,'0')}`;
        
        if (myTeamId) {
            const nextDayKey = `trade_ops_${myTeamId}_${nextDate}`;
            localStorage.removeItem(nextDayKey);
        }
        
        // [Trade Logic]
        const deadline = new Date(TRADE_DEADLINE);
        const start = new Date(SEASON_START_DATE);
        const current = new Date(nextDate);
        const recoveredPlayers: string[] = [];
        const recoveryTransactions: Transaction[] = [];
        const dailyTrades: Transaction[] = []; 

        // Use overrideTeams if provided (vital for post-game update)
        let newTeams = overrideTeams ? [...overrideTeams] : [...teams];

        if (current <= deadline) {
            const totalDuration = deadline.getTime() - start.getTime();
            const elapsed = current.getTime() - start.getTime();
            let progress = elapsed / totalDuration;
            if (progress < 0) progress = 0;
            
            const tradeChance = Math.pow(progress, 3) * 0.70;
            const isTradeTriggered = Math.random() < tradeChance;

            if (isTradeTriggered) {
                const tradeResult = await simulateCPUTrades(newTeams, myTeamId);
                if (tradeResult) {
                    const { updatedTeams, transaction } = tradeResult;
                    newTeams = updatedTeams;
                    if (transaction) {
                        transaction.id = crypto.randomUUID();
                        transaction.date = nextDate; 

                        dailyTrades.push(transaction); 
                        setTransactions(prev => [transaction, ...prev]);
                        
                        if (session?.user && !isGuestMode) {
                            console.log("💾 Saving CPU Trade:", transaction);
                            await saveUserTransaction(session.user.id, transaction);
                        }
                    }
                }
            }
        }
        
        // [Inbox] Create Daily Trade Report
        if (dailyTrades.length > 0 && session?.user && !isGuestMode && myTeamId) {
            const tradeContent: TradeAlertContent = {
                summary: ``, 
                trades: dailyTrades.map(t => {
                    const team1 = newTeams.find(tm => tm.id === t.teamId);
                    const partnerTeamName = t.details?.partnerTeamName || 'Unknown';
                    
                    return {
                        team1Id: t.teamId,
                        team1Name: team1?.name || t.teamId,
                        team2Id: t.details?.partnerTeamId || '',
                        team2Name: partnerTeamName,
                        team1Acquired: t.details?.acquired?.map((p: any) => ({ id: p.id, name: p.name, ovr: p.ovr || 0 })) || [],
                        team2Acquired: t.details?.traded?.map((p: any) => ({ id: p.id, name: p.name, ovr: p.ovr || 0 })) || [],
                    };
                })
            };
            
            await sendMessage(
                session.user.id,
                myTeamId,
                nextDate,
                'TRADE_ALERT',
                `[리그 리포트] ${nextDate} 트레이드 소식`,
                tradeContent
            );
            refreshUnreadCount(); 
        }

        // Recovery & Fatigue Logic
        newTeams = newTeams.map(t => ({
            ...t,
            roster: t.roster.map(p => {
                let updatedPlayer = { ...p };

                // 1. Injury Recovery
                if (updatedPlayer.health === 'Injured' && updatedPlayer.returnDate) {
                    if (new Date(nextDate) >= new Date(updatedPlayer.returnDate)) {
                        updatedPlayer.health = 'Healthy';
                        updatedPlayer.injuryType = undefined;
                        updatedPlayer.returnDate = undefined;
                        
                        if (t.id === myTeamId) {
                            recoveredPlayers.push(updatedPlayer.name);
                        }

                        const tx: Transaction = {
                            id: crypto.randomUUID(),
                            date: nextDate,
                            type: 'InjuryUpdate',
                            teamId: t.id,
                            description: `${p.name} 부상 복귀`,
                            details: {
                                playerId: p.id,
                                playerName: p.name,
                                health: 'Healthy',
                                injuryType: undefined,
                                returnDate: undefined
                            }
                        };
                        recoveryTransactions.push(tx);
                    }
                }

                // 2. Fatigue Recovery
                const baseRec = 10; 
                const staBonus = (updatedPlayer.stamina || 75) * 0.1; 
                const durBonus = (updatedPlayer.durability || 75) * 0.05;
                let totalRecovery = baseRec + staBonus + durBonus;

                if (teamsPlayedToday.has(t.id)) {
                    // Played yesterday: reduced recovery
                    totalRecovery *= 0.5;
                }

                // Apply recovery
                const currentCond = updatedPlayer.condition !== undefined ? updatedPlayer.condition : 100;
                updatedPlayer.condition = Math.min(100, Math.round(currentCond + totalRecovery));
                
                return updatedPlayer;
            })
        }));
        
        // Save Recovery Transactions
        if (recoveryTransactions.length > 0) {
             setTransactions(prev => [...recoveryTransactions, ...prev]);
             if (session?.user && !isGuestMode) {
                 for (const tx of recoveryTransactions) {
                     saveUserTransaction(session.user.id, tx);
                 }
             }
        }
        
        if (recoveredPlayers.length > 0) {
            const names = recoveredPlayers.join(", ");
            setToastMessage(`🏥 부상 복귀: ${names} 선수가 건강을 회복했습니다.`);
        }

        setTeams(newTeams);
        onDateChange(nextDate, { teams: newTeams, currentSimDate: nextDate });

    }, [schedule, myTeamId, session, isGuestMode, teams, setTeams, setTransactions, setNews, setToastMessage, currentSimDate, onDateChange, refreshUnreadCount]);

    const handleExecuteSim = async (tactics: GameTactics) => {
        // [Fixed] Clear last result at START of sim, not end of date advance
        setLastGameResult(null);

        const myTeam = teams.find(t => t.id === myTeamId);
        if (!myTeamId || !myTeam) return;
        
        const targetSimDate = currentSimDate;
        const unplayedGamesToday = schedule.filter(g => g.date === targetSimDate && !g.played);
        
        const playedYesterday = (teamId: string) => {
            const yesterday = new Date(currentSimDate);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            return schedule.some(g => g.date === yesterdayStr && (g.homeTeamId === teamId || g.awayTeamId === teamId));
        };

        if (unplayedGamesToday.length === 0) {
            setIsSimulating(true);
            setTimeout(async () => { 
                await advanceDate(); 
                setIsSimulating(false); 
            }, 2000);
            return;
        }

        const userGameToday = unplayedGamesToday.find(g => g.homeTeamId === myTeamId || g.awayTeamId === myTeamId);
        
        const processSimulation = async (precalcUserResult?: SimulationResult) => {
            let updatedTeams = [...teams];
            let updatedSchedule = [...schedule];
            let updatedSeries = [...playoffSeries];
            let userGameResultOutput = null;
            let allPlayedToday: Game[] = [];
            const regularGameResultsToInsert: any[] = [];
            const playoffGameResultsToInsert: PlayoffGameResultDB[] = [];
            
            const getTeam = (id: string) => updatedTeams.find(t => t.id === id);

            for (const game of unplayedGamesToday) {
                const isUserGame = (game.homeTeamId === myTeamId || game.awayTeamId === myTeamId);
                const home = getTeam(game.homeTeamId); const away = getTeam(game.awayTeamId);
                
                if (!home || !away) continue;

                const homeDepth = home.id === myTeamId ? userDepthChart : null;
                const awayDepth = away.id === myTeamId ? userDepthChart : null;

                const result = (isUserGame && precalcUserResult) ? precalcUserResult : simulateGame(
                    home, 
                    away, 
                    myTeamId, 
                    isUserGame ? tactics : undefined, 
                    playedYesterday(home.id), 
                    playedYesterday(away.id),
                    homeDepth,
                    awayDepth
                );
                
                const homeIdx = updatedTeams.findIndex(t => t.id === home.id); const awayIdx = updatedTeams.findIndex(t => t.id === away.id);
                const homeWin = result.homeScore > result.awayScore;

                updatedTeams[homeIdx] = { 
                    ...home, 
                    wins: home.wins + (homeWin ? 1 : 0), 
                    losses: home.losses + (homeWin ? 0 : 1), 
                    tacticHistory: updateTeamTacticHistory(home, result.homeBox, result.awayBox, result.homeTactics, homeWin) 
                };
                
                updatedTeams[awayIdx] = { 
                    ...away, 
                    wins: away.wins + (homeWin ? 0 : 1), 
                    losses: away.losses + (homeWin ? 1 : 0), 
                    tacticHistory: updateTeamTacticHistory(away, result.awayBox, result.homeBox, result.awayTactics, !homeWin) 
                };

                // Update Roster Conditions
                Object.entries(result.rosterUpdates).forEach(([pid, update]: [string, any]) => {
                    const t = updatedTeams.find(tm => tm.roster.some(p => p.id === pid));
                    if (t) {
                        const p = t.roster.find(rp => rp.id === pid);
                        if (p) {
                            if (update.condition !== undefined) p.condition = update.condition;
                            if (update.health) p.health = update.health;
                            if (update.injuryType) p.injuryType = update.injuryType;
                            if (update.returnDate) p.returnDate = update.returnDate;
                        }
                    }
                });

                // Save Game Result Logic
                const baseGameResult = {
                    user_id: session?.user?.id,
                    game_id: game.id,
                    date: game.date,
                    home_team_id: game.homeTeamId,
                    away_team_id: game.awayTeamId,
                    home_score: Math.round(result.homeScore), 
                    away_score: Math.round(result.awayScore), 
                    box_score: { home: result.homeBox, away: result.awayBox },
                    tactics: { home: result.homeTactics, away: result.awayTactics },
                    is_playoff: game.isPlayoff || false,
                    series_id: game.seriesId || null
                };

                if (game.isPlayoff && game.seriesId) {
                    const series = updatedSeries.find(s => s.id === game.seriesId);
                    if (series) {
                        const playoffResult: PlayoffGameResultDB = {
                            ...baseGameResult,
                            series_id: game.seriesId, 
                            round_number: series.round,
                            game_number: series.higherSeedWins + series.lowerSeedWins + 1
                        };

                        if (homeWin) {
                            if (home.id === series.higherSeedId) series.higherSeedWins++;
                            else series.lowerSeedWins++;
                        } else {
                            if (away.id === series.higherSeedId) series.higherSeedWins++;
                            else series.lowerSeedWins++;
                        }
                        playoffGameResultsToInsert.push(playoffResult);
                    }
                } else {
                    regularGameResultsToInsert.push(baseGameResult);
                }

                // Update Schedule
                const schedIdx = updatedSchedule.findIndex(g => g.id === game.id);
                if (schedIdx !== -1) {
                    updatedSchedule[schedIdx] = {
                        ...game,
                        played: true,
                        homeScore: result.homeScore,
                        awayScore: result.awayScore
                    };
                    allPlayedToday.push(updatedSchedule[schedIdx]);
                }

                if (isUserGame) {
                    const recap = await generateGameRecapNews({
                        home, away, homeScore: result.homeScore, awayScore: result.awayScore,
                        homeBox: result.homeBox, awayBox: result.awayBox,
                        userTactics: tactics, myTeamId
                    });
                    
                    userGameResultOutput = {
                        home, away, homeScore: result.homeScore, awayScore: result.awayScore,
                        homeBox: result.homeBox, awayBox: result.awayBox,
                        recap: recap || ["경기 결과 요약을 불러올 수 없습니다."],
                        homeTactics: result.homeTactics, awayTactics: result.awayTactics,
                        pbpLogs: result.pbpLogs,
                        rotationData: result.rotationData,
                        otherGames: [] 
                    };

                    // [Fix] Send Game Recap to Inbox with Try/Catch safety
                    if (session?.user && !isGuestMode) {
                        try {
                            const isHome = myTeamId === home.id;
                            const userWon = isHome ? result.homeScore > result.awayScore : result.awayScore > result.homeScore;
                            const opponent = isHome ? away : home;
                            
                            const title = `[경기 결과] ${userWon ? '승리' : '패배'} vs ${opponent.name} (${Math.round(result.homeScore)} : ${Math.round(result.awayScore)})`;
                            
                            const recapContent: GameRecapContent = {
                                gameId: game.id,
                                homeTeamId: home.id,
                                awayTeamId: away.id,
                                homeScore: Math.round(result.homeScore),
                                awayScore: Math.round(result.awayScore),
                                userBoxScore: isHome ? result.homeBox : result.awayBox
                            };

                            const sent = await sendMessage(
                                session.user.id,
                                myTeamId,
                                game.date,
                                'GAME_RECAP',
                                title,
                                recapContent
                            );
                            
                            if (sent) {
                                console.log("📩 Game recap message sent successfully.");
                                refreshUnreadCount();
                            } else {
                                console.warn("📩 Failed to send game recap message.");
                            }
                        } catch (msgErr) {
                            console.error("❌ Error sending game recap message:", msgErr);
                        }
                    }
                }
            }

            if (userGameResultOutput) {
                userGameResultOutput.otherGames = allPlayedToday.filter(g => g.homeTeamId !== myTeamId && g.awayTeamId !== myTeamId);
            }

            // DB Saves
            if (session?.user && !isGuestMode) {
                if (regularGameResultsToInsert.length > 0) await saveGameResults(regularGameResultsToInsert);
                for (const res of playoffGameResultsToInsert) {
                    await savePlayoffGameResult(res);
                }
            }

            // State Updates
            setTeams(updatedTeams);
            setSchedule(updatedSchedule);
            setPlayoffSeries(updatedSeries);
            
            // [Fix] Set result BEFORE date advance to ensure UI updates correctly
            if (userGameResultOutput) {
                setLastGameResult(userGameResultOutput);
            }

            // Advance Date Logic
            await advanceDate(updatedTeams);
        };

        if (userGameToday) {
            // Visual Simulation Pre-Calculation
            const home = teams.find(t => t.id === userGameToday.homeTeamId)!;
            const away = teams.find(t => t.id === userGameToday.awayTeamId)!;
            const homeDepth = home.id === myTeamId ? userDepthChart : null;
            const awayDepth = away.id === myTeamId ? userDepthChart : null;

            const preResult = simulateGame(
                home, away, myTeamId, tactics, 
                playedYesterday(home.id), playedYesterday(away.id),
                homeDepth, awayDepth
            );
            
            setActiveGame({ ...userGameToday, homeScore: preResult.homeScore, awayScore: preResult.awayScore });
            
            // [Fix] Async finalize to prevent race condition causing view flash
            finalizeSimRef.current = async () => {
                await processSimulation(preResult);
                setActiveGame(null);
            };

        } else {
            // Sim all quickly
            setIsSimulating(true);
            setTimeout(async () => {
                await processSimulation();
                setIsSimulating(false);
            }, 100);
        }
    };

    return {
        isSimulating,
        setIsSimulating,
        activeGame,
        lastGameResult,
        handleExecuteSim,
        finalizeSimRef
    };
};
