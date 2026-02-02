
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Game, Team, PlayerBoxScore, TacticStatRecord, TacticalSnapshot, GameTactics, SimulationResult, PlayoffGameResultDB, Transaction, TradeAlertContent } from '../types';
import { simulateGame } from '../services/gameEngine';
import { generateGameRecapNews, generateCPUTradeNews } from '../services/geminiService';
import { simulateCPUTrades } from '../services/tradeEngine';
import { INITIAL_STATS, TRADE_DEADLINE, SEASON_START_DATE } from '../utils/constants';
import { saveGameResults, saveUserTransaction } from '../services/queries';
import { savePlayoffState, savePlayoffGameResult } from '../services/playoffService';
import { sendMessage } from '../services/messageService'; // Added
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
    refreshUnreadCount: () => void // Added: Callback to refresh sidebar badge
) => {
    const [isSimulating, setIsSimulating] = useState(false);
    const [activeGame, setActiveGame] = useState<Game | null>(null);
    const [lastGameResult, setLastGameResult] = useState<any>(null);
    const finalizeSimRef = useRef<((userResult?: any) => void) | null>(null);

    const updatedTeamsRef = useRef(teams);
    useEffect(() => { updatedTeamsRef.current = teams; }, [teams]);

    // [Playoff Hook] Generate Schedule & Advance Rounds Automatically (Preserved)
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


    const advanceDate = useCallback(async () => {
        const prevDate = currentSimDate;
        const teamsPlayedToday = schedule
            .filter(g => g.date === prevDate && g.played)
            .reduce((acc, g) => {
                acc.add(g.homeTeamId);
                acc.add(g.awayTeamId);
                return acc;
            }, new Set<string>());

        const currentDateObj = new Date(prevDate);
        currentDateObj.setDate(currentDateObj.getDate() + 1);
        const nextDate = currentDateObj.toISOString().split('T')[0];
        
        if (myTeamId) {
            const nextDayKey = `trade_ops_${myTeamId}_${nextDate}`;
            localStorage.removeItem(nextDayKey);
        }
        
        // [Trade Logic] (Preserved & Enhanced with Messaging)
        const deadline = new Date(TRADE_DEADLINE);
        const start = new Date(SEASON_START_DATE);
        const current = new Date(nextDate);
        const recoveredPlayers: string[] = [];
        const recoveryTransactions: Transaction[] = [];
        const dailyTrades: Transaction[] = []; // Store for Daily Report

        let newTeams = [...teams];

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
                        dailyTrades.push(transaction); // Collect
                        setTransactions(prev => [transaction, ...prev]);
                        if (session?.user && !isGuestMode) {
                            saveUserTransaction(session.user.id, transaction);
                        }
                    }
                }
            }
        }
        
        // [Inbox] Create Daily Trade Report (Added)
        if (dailyTrades.length > 0 && session?.user && !isGuestMode && myTeamId) {
            const tradeContent: TradeAlertContent = {
                summary: `${dailyTrades.length}건의 새로운 트레이드가 성사되었습니다.`,
                trades: dailyTrades.map(t => {
                    const team1 = newTeams.find(tm => tm.id === t.teamId);
                    return {
                        team1Id: t.teamId,
                        team1Name: team1?.name || t.teamId,
                        team2Id: t.details?.partnerTeamId || '',
                        team2Name: t.details?.partnerTeamName || 'Unknown',
                        team1Acquired: t.details?.acquired?.map(p => ({ id: p.id, name: p.name, ovr: p.ovr || 0 })) || [],
                        team2Acquired: t.details?.traded?.map(p => ({ id: p.id, name: p.name, ovr: p.ovr || 0 })) || [],
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
            refreshUnreadCount(); // Update Sidebar Badge
        }

        // Recovery & Fatigue Logic (Preserved)
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
                            id: `rec_${Date.now()}_${p.id}`,
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
                    totalRecovery *= 0.5;
                }

                updatedPlayer.condition = Math.min(100, Math.round((updatedPlayer.condition || 100) + totalRecovery));
                
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
        setLastGameResult(null);

    }, [schedule, myTeamId, session, isGuestMode, teams, setTeams, setTransactions, setNews, setToastMessage, currentSimDate, onDateChange, refreshUnreadCount]);

    const handleExecuteSim = async (tactics: GameTactics) => {
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
            const injuryTransactionsToInsert: Transaction[] = [];
            
            const getTeam = (id: string) => updatedTeams.find(t => t.id === id);

            for (const game of unplayedGamesToday) {
                const isUserGame = (game.homeTeamId === myTeamId || game.awayTeamId === myTeamId);
                const home = getTeam(game.homeTeamId); const away = getTeam(game.awayTeamId);
                
                if (!home || !away) continue;

                const result = (isUserGame && precalcUserResult) ? precalcUserResult : simulateGame(home, away, myTeamId, isUserGame ? tactics : undefined, playedYesterday(home.id), playedYesterday(away.id));
                const homeIdx = updatedTeams.findIndex(t => t.id === home.id); const awayIdx = updatedTeams.findIndex(t => t.id === away.id);
                const homeWin = result.homeScore > result.awayScore;

                // Update Team Stats & Tactics History (Preserved)
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

                const updateRosterStats = (teamIdx: number, boxScore: PlayerBoxScore[], rosterUpdates: any) => {
                    const t = updatedTeams[teamIdx];
                    t.roster = t.roster.map(p => {
                        const update = rosterUpdates[p.id]; const box = boxScore.find(b => b.playerId === p.id);
                        
                        let targetStats = game.isPlayoff 
                            ? { ...(p.playoffStats || INITIAL_STATS()) } 
                            : { ...(p.stats || INITIAL_STATS()) };

                        if (box) { 
                            targetStats.g += 1; targetStats.gs += box.gs; targetStats.mp += box.mp; targetStats.pts += box.pts; targetStats.reb += box.reb; targetStats.ast += box.ast; targetStats.stl += box.stl; targetStats.blk += box.blk; targetStats.tov += box.tov; targetStats.fgm += box.fgm; targetStats.fga += box.fga; targetStats.p3m += box.p3m; targetStats.p3a += box.p3a; targetStats.ftm += box.ftm; targetStats.fta += box.fta; 
                            targetStats.rimM = (targetStats.rimM || 0) + (box.rimM || 0); targetStats.rimA = (targetStats.rimA || 0) + (box.rimA || 0); targetStats.midM = (targetStats.midM || 0) + (box.midM || 0); targetStats.midA = (targetStats.midA || 0) + (box.midA || 0);
                            targetStats.pf = (targetStats.pf || 0) + (box.pf || 0);
                        }

                        // Check for NEW injuries (Preserved + Messaging)
                        if (update && update.health === 'Injured' && p.health !== 'Injured') {
                            const isMyPlayer = t.id === myTeamId;
                            const tx: Transaction = {
                                id: `inj_${Date.now()}_${p.id}`,
                                date: game.date,
                                type: 'InjuryUpdate',
                                teamId: t.id,
                                description: `${p.name} 부상: ${update.injuryType} (${update.returnDate} 복귀 예상)`,
                                details: {
                                    playerId: p.id,
                                    playerName: p.name,
                                    health: 'Injured',
                                    injuryType: update.injuryType,
                                    returnDate: update.returnDate
                                }
                            };
                            injuryTransactionsToInsert.push(tx);
                            
                            // User notification (Toast + Inbox)
                            if (isMyPlayer) {
                                setToastMessage(`🚑 부상 발생: ${p.name} (${update.injuryType})`);
                                
                                if (session?.user && !isGuestMode) {
                                    const rDate = new Date(update.returnDate!);
                                    const cDate = new Date(game.date);
                                    const diffTime = Math.abs(rDate.getTime() - cDate.getTime());
                                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                                    
                                    const isMajor = diffDays > 14;
                                    const titlePrefix = isMajor ? "[중요] " : "";
                                    
                                    sendMessage(
                                        session.user.id,
                                        myTeamId,
                                        game.date,
                                        'INJURY_REPORT',
                                        `${titlePrefix}부상 리포트: ${p.name}`,
                                        {
                                            playerId: p.id,
                                            playerName: p.name,
                                            injuryType: update.injuryType,
                                            duration: `${diffDays}일 결장 예상`,
                                            returnDate: update.returnDate,
                                            severity: isMajor ? 'Major' : 'Minor'
                                        }
                                    );
                                    refreshUnreadCount();
                                }
                            }
                        }

                        const returnObj = { ...p, condition: update?.condition !== undefined ? Math.round(update.condition) : p.condition, health: update?.health ?? p.health, injuryType: update?.injuryType ?? p.injuryType, returnDate: update?.returnDate ?? p.returnDate };
                        if (game.isPlayoff) returnObj.playoffStats = targetStats; else returnObj.stats = targetStats;
                        return returnObj;
                    });
                };
                updateRosterStats(homeIdx, result.homeBox, result.rosterUpdates); updateRosterStats(awayIdx, result.awayBox, result.rosterUpdates);

                const updatedGame: Game = { ...game, played: true, homeScore: result.homeScore, awayScore: result.awayScore, tactics: { home: result.homeTactics, away: result.awayTactics } };
                const schIdx = updatedSchedule.findIndex(g => g.id === game.id); if (schIdx !== -1) updatedSchedule[schIdx] = updatedGame;
                
                // Playoff Series Update Logic (Preserved)
                if (game.isPlayoff && game.seriesId) {
                    const sIdx = updatedSeries.findIndex(s => s.id === game.seriesId);
                    if (sIdx !== -1) {
                        const series = updatedSeries[sIdx]; 
                        const winnerId = result.homeScore > result.awayScore ? home.id : away.id;
                        const isHigherWinner = winnerId === series.higherSeedId;
                        const newH = series.higherSeedWins + (isHigherWinner ? 1 : 0); 
                        const newL = series.lowerSeedWins + (!isHigherWinner ? 1 : 0);
                        const target = series.targetWins || 4; 
                        const finished = newH >= target || newL >= target;
                        updatedSeries[sIdx] = { ...series, higherSeedWins: newH, lowerSeedWins: newL, finished, winnerId: finished ? (newH >= target ? series.higherSeedId : series.lowerSeedId) : undefined };

                        if (session?.user && !isGuestMode) {
                            playoffGameResultsToInsert.push({
                                user_id: session.user.id,
                                game_id: game.id,
                                date: game.date,
                                series_id: game.seriesId,
                                round_number: series.round,
                                game_number: newH + newL,
                                home_team_id: game.homeTeamId,
                                away_team_id: game.awayTeamId,
                                home_score: result.homeScore,
                                away_score: result.awayScore,
                                box_score: { home: result.homeBox, away: result.awayBox },
                                tactics: { home: result.homeTactics, away: result.awayTactics }
                            });
                        }
                    }
                }

                // Regular Season Save Queue
                if (session?.user && !isGuestMode && !game.isPlayoff) {
                    regularGameResultsToInsert.push({ 
                        user_id: session.user.id, 
                        game_id: game.id, 
                        date: game.date, 
                        home_team_id: game.homeTeamId, 
                        away_team_id: game.awayTeamId, 
                        home_score: result.homeScore, 
                        away_score: result.awayScore, 
                        box_score: { home: result.homeBox, away: result.awayBox },
                        is_playoff: false, 
                        series_id: undefined,
                        tactics: { home: result.homeTactics, away: result.awayTactics } 
                    });
                }
                allPlayedToday.push(updatedGame);
                if (isUserGame) userGameResultOutput = { ...result, home: updatedTeams[homeIdx], away: updatedTeams[awayIdx], userTactics: tactics, myTeamId }; 
            }

            // Save Transactions
            if (injuryTransactionsToInsert.length > 0) {
                setTransactions(prev => [...injuryTransactionsToInsert, ...prev]);
                if (session?.user && !isGuestMode) {
                    for (const tx of injuryTransactionsToInsert) {
                        saveUserTransaction(session.user.id, tx);
                    }
                }
            }

            // Batch Save Results
            if (regularGameResultsToInsert.length > 0) { saveGameResults(regularGameResultsToInsert); }
            
            if (playoffGameResultsToInsert.length > 0) {
                for (const res of playoffGameResultsToInsert) {
                    await savePlayoffGameResult(res);
                }
                if (updatedSeries.length > 0 && session?.user && !isGuestMode) {
                     savePlayoffState(session.user.id, myTeamId, updatedSeries);
                }
            }

            // Local State Update
            setTeams(updatedTeams); 
            setSchedule(updatedSchedule); 
            setPlayoffSeries(updatedSeries); 
            
            // [Inbox] Generate Game Recap Message for User (Added)
            if (userGameResultOutput && session?.user && !isGuestMode) {
                const isHome = userGameResultOutput.myTeamId === userGameResultOutput.home.id;
                const userScore = isHome ? userGameResultOutput.homeScore : userGameResultOutput.awayScore;
                const oppScore = isHome ? userGameResultOutput.awayScore : userGameResultOutput.homeScore;
                const userWon = userScore > oppScore;
                const oppName = isHome ? userGameResultOutput.away.name : userGameResultOutput.home.name;
                
                const allPlayers = [...userGameResultOutput.homeBox, ...userGameResultOutput.awayBox];
                const mvp = allPlayers.reduce((prev, curr) => (curr.pts > prev.pts ? curr : prev), allPlayers[0]);

                await sendMessage(
                    session.user.id,
                    myTeamId,
                    userGameResultOutput.homeBox[0]?.g ? 'PLAYOFF' : targetSimDate,
                    'GAME_RECAP',
                    userWon ? `[승리] vs ${oppName} (${userScore}:${oppScore})` : `[패배] vs ${oppName} (${userScore}:${oppScore})`,
                    {
                        gameId: activeGame?.id || `g_${targetSimDate}`,
                        homeTeamId: userGameResultOutput.home.id,
                        awayTeamId: userGameResultOutput.away.id,
                        homeScore: userGameResultOutput.homeScore,
                        awayScore: userGameResultOutput.awayScore,
                        userWon: userWon,
                        mvp: {
                            playerId: mvp.playerId,
                            name: mvp.playerName,
                            stats: `${mvp.pts} PTS, ${mvp.reb} REB, ${mvp.ast} AST`
                        },
                        // Send FULL user team box score (Removed slice)
                        userBoxScore: isHome ? userGameResultOutput.homeBox : userGameResultOutput.awayBox
                    }
                );
                refreshUnreadCount();

                const recap = await generateGameRecapNews(userGameResultOutput);
                setLastGameResult({ ...userGameResultOutput, recap: recap || [], otherGames: allPlayedToday.filter(g => g.homeTeamId !== myTeamId && g.awayTeamId !== myTeamId) });
                
                // Critical Save
                triggerSave({ teams: updatedTeams, schedule: updatedSchedule, playoffSeries: updatedSeries });
            } else if (userGameResultOutput) {
                // Guest mode recap
                const recap = await generateGameRecapNews(userGameResultOutput);
                setLastGameResult({ ...userGameResultOutput, recap: recap || [], otherGames: allPlayedToday.filter(g => g.homeTeamId !== myTeamId && g.awayTeamId !== myTeamId) });
            } else { 
                setIsSimulating(false); 
                await advanceDate(); 
            }
        };
        
        if (userGameToday) {
            const home = updatedTeamsRef.current.find(t => t.id === userGameToday.homeTeamId);
            const away = updatedTeamsRef.current.find(t => t.id === userGameToday.awayTeamId);

            if (home && away) {
                const precalculatedUserResult = simulateGame(home, away, myTeamId, tactics, playedYesterday(home.id), playedYesterday(away.id));
                setActiveGame({ ...userGameToday, homeScore: precalculatedUserResult.homeScore, awayScore: precalculatedUserResult.awayScore }); 
                finalizeSimRef.current = () => processSimulation(precalculatedUserResult);
            } else {
                setIsSimulating(true);
                setTimeout(() => processSimulation(), 2000);
            }
        } else { 
            setIsSimulating(true); 
            setTimeout(() => processSimulation(), 2000); 
        }
    };

    return {
        isSimulating, setIsSimulating,
        activeGame, setActiveGame,
        lastGameResult, setLastGameResult,
        finalizeSimRef,
        handleExecuteSim,
        advanceDate
    };
};
