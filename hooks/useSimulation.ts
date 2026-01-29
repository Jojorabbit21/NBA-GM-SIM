
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Game, Team, PlayerBoxScore, TacticStatRecord, TacticalSnapshot, GameTactics, SimulationResult } from '../types';
import { simulateGame } from '../services/gameEngine';
import { generateGameRecapNews, generateCPUTradeNews } from '../services/geminiService';
import { simulateCPUTrades } from '../services/tradeEngine';
import { INITIAL_STATS, TRADE_DEADLINE, SEASON_START_DATE } from '../utils/constants';
import { saveGameResults, saveUserTransaction } from '../services/queries';
import { checkAndInitPlayoffs, generateNextPlayoffGames } from '../utils/playoffLogic';

export const useSimulation = (
    teams: Team[], setTeams: React.Dispatch<React.SetStateAction<Team[]>>,
    schedule: Game[], setSchedule: React.Dispatch<React.SetStateAction<Game[]>>,
    myTeamId: string | null,
    currentSimDate: string, 
    onDateChange: (newDate: string) => void,
    playoffSeries: any[], setPlayoffSeries: React.Dispatch<React.SetStateAction<any[]>>,
    setTransactions: React.Dispatch<React.SetStateAction<any[]>>,
    setNews: React.Dispatch<React.SetStateAction<any[]>>,
    setToastMessage: (msg: string | null) => void,
    session: any,
    isGuestMode: boolean
) => {
    const [isSimulating, setIsSimulating] = useState(false);
    const [activeGame, setActiveGame] = useState<Game | null>(null);
    const [lastGameResult, setLastGameResult] = useState<any>(null);
    const finalizeSimRef = useRef<((userResult?: any) => void) | null>(null);

    const updatedTeamsRef = useRef(teams);
    useEffect(() => { updatedTeamsRef.current = teams; }, [teams]);

    // [Playoff Hook] Generate Schedule Automatically
    useEffect(() => {
        // [Fix] Do not run logic if data is not yet loaded
        if (!teams || teams.length === 0 || !schedule || schedule.length === 0) return;

        // Run this check whenever date or series changes
        const currentSeries = playoffSeries;
        
        // 1. Init Playoffs if needed
        const newSeriesList = checkAndInitPlayoffs(teams, schedule, currentSeries, currentSimDate);
        if (newSeriesList.length > currentSeries.length) {
            setPlayoffSeries(newSeriesList);
            setToastMessage("🏆 플레이오프가 시작되었습니다!");
            return;
        }

        // 2. Generate Next Games
        const { newGames } = generateNextPlayoffGames(schedule, currentSeries, currentSimDate);
        if (newGames.length > 0) {
            setSchedule(prev => [...prev, ...newGames]);
            console.log("📅 Playoff Games Scheduled:", newGames.length);
        }

    }, [currentSimDate, schedule, playoffSeries, teams, setSchedule, setPlayoffSeries, setToastMessage]);


    const advanceDate = useCallback(() => {
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
        
        // [Trade Logic]
        const deadline = new Date(TRADE_DEADLINE);
        const start = new Date(SEASON_START_DATE);
        const current = new Date(nextDate);

        if (current <= deadline) {
            const totalDuration = deadline.getTime() - start.getTime();
            const elapsed = current.getTime() - start.getTime();
            let progress = elapsed / totalDuration;
            if (progress < 0) progress = 0;
            
            const tradeChance = Math.pow(progress, 3) * 0.70;
            const isTradeTriggered = Math.random() < tradeChance;

            if (isTradeTriggered) {
                setTeams(prevTeams => {
                    const tradeResult = simulateCPUTrades(prevTeams, myTeamId);
                    if (tradeResult) {
                        const { updatedTeams, transaction } = tradeResult;
                        if (transaction) {
                            setTransactions(prev => [transaction, ...prev]);
                            if (session?.user && !isGuestMode) {
                                saveUserTransaction(session.user.id, transaction);
                            }
                            generateCPUTradeNews(transaction).then(newsItems => {
                                if (newsItems) setNews(prev => [...newsItems, ...prev.slice(0, 5)]);
                            });
                            setToastMessage("🔥 BLOCKBUSTER: 트레이드 데드라인 임박 대형 트레이드 성사!");
                            return updatedTeams.map(t => ({
                                ...t,
                                roster: t.roster.map(p => {
                                    if (teamsPlayedToday.has(t.id)) return p;
                                    const baseRec = 10; const staBonus = (p.stamina || 75) * 0.1; const durBonus = (p.durability || 75) * 0.05;
                                    return { ...p, condition: Math.min(100, Math.round((p.condition || 100) + baseRec + staBonus + durBonus)) };
                                })
                            }));
                        }
                    }
                    return prevTeams.map(t => ({
                        ...t,
                        roster: t.roster.map(p => {
                            if (teamsPlayedToday.has(t.id)) return p;
                            const baseRec = 10; const staBonus = (p.stamina || 75) * 0.1; const durBonus = (p.durability || 75) * 0.05;
                            return { ...p, condition: Math.min(100, Math.round((p.condition || 100) + baseRec + staBonus + durBonus)) };
                        })
                    }));
                });
            } else {
                setTeams(prevTeams => prevTeams.map(t => ({
                    ...t,
                    roster: t.roster.map(p => {
                        if (teamsPlayedToday.has(t.id)) return p;
                        const baseRec = 10; const staBonus = (p.stamina || 75) * 0.1; const durBonus = (p.durability || 75) * 0.05;
                        return { ...p, condition: Math.min(100, Math.round((p.condition || 100) + baseRec + staBonus + durBonus)) };
                    })
                })));
            }
        } else {
            setTeams(prevTeams => prevTeams.map(t => ({
                ...t,
                roster: t.roster.map(p => {
                    if (teamsPlayedToday.has(t.id)) return p;
                    const baseRec = 10; const staBonus = (p.stamina || 75) * 0.1; const durBonus = (p.durability || 75) * 0.05;
                    return { ...p, condition: Math.min(100, Math.round((p.condition || 100) + baseRec + staBonus + durBonus)) };
                })
            })));
        }

        onDateChange(nextDate);
        setLastGameResult(null);

    }, [schedule, myTeamId, session, isGuestMode, setTeams, setTransactions, setNews, setToastMessage, currentSimDate, onDateChange]);

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
            setTimeout(() => { advanceDate(); setIsSimulating(false); }, 2000);
            return;
        }

        const userGameToday = unplayedGamesToday.find(g => g.homeTeamId === myTeamId || g.awayTeamId === myTeamId);
        
        const processSimulation = async (precalcUserResult?: SimulationResult) => {
            let updatedTeams = [...teams];
            let updatedSchedule = [...schedule];
            let updatedSeries = [...playoffSeries];
            let userGameResultOutput = null;
            let allPlayedToday: Game[] = [];
            const gameResultsToInsert: any[] = [];
            const getTeam = (id: string) => updatedTeams.find(t => t.id === id);

            for (const game of unplayedGamesToday) {
                const isUserGame = (game.homeTeamId === myTeamId || game.awayTeamId === myTeamId);
                const home = getTeam(game.homeTeamId); const away = getTeam(game.awayTeamId);
                
                // [Safety Check] Ensure teams exist before simulation
                if (!home || !away) {
                    console.warn(`Skipping simulation for game ${game.id}: Teams not found.`);
                    continue;
                }

                const result = (isUserGame && precalcUserResult) ? precalcUserResult : simulateGame(home, away, myTeamId, isUserGame ? tactics : undefined, playedYesterday(home.id), playedYesterday(away.id));
                const homeIdx = updatedTeams.findIndex(t => t.id === home.id); const awayIdx = updatedTeams.findIndex(t => t.id === away.id);
                const homeWin = result.homeScore > result.awayScore;

                const updateHistory = (t: Team, myBox: PlayerBoxScore[], oppBox: PlayerBoxScore[], tactics: TacticalSnapshot, isWin: boolean) => {
                    const history = { ...(t.tacticHistory || { offense: {}, defense: {} }) };
                    const updateRecord = (record: Record<string, TacticStatRecord>, key: string) => {
                        if (!record[key]) record[key] = { games: 0, wins: 0, ptsFor: 0, ptsAgainst: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, rimM: 0, rimA: 0, midM: 0, midA: 0, aceImpact: 0 };
                        const r = record[key];
                        const totals = myBox.reduce((acc, p) => ({ pts: acc.pts + p.pts, fgm: acc.fgm + p.fgm, fga: acc.fga + p.fga, p3m: acc.p3m + p.p3m, p3a: acc.p3a + p.p3a, rimM: acc.rimM + (p.rimM || 0), rimA: acc.rimA + (p.rimA || 0), midM: acc.midM + (p.midM || 0), midA: acc.midA + (p.midA || 0) }), { pts: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, rimM: 0, rimA: 0, midM: 0, midA: 0 });
                        r.games++; if (isWin) r.wins++;
                        r.ptsFor += totals.pts; r.ptsAgainst += oppBox.reduce((sum, p) => sum + p.pts, 0);
                        r.fgm += totals.fgm; r.fga += totals.fga; r.p3m += totals.p3m; r.p3a += totals.p3a; r.rimM += totals.rimM; r.rimA += totals.rimA; r.midM += totals.midM; r.midA += totals.midA;
                    };
                    updateRecord(history.offense, tactics.offense); updateRecord(history.defense, tactics.defense);
                    if (tactics.stopperId) {
                        if (!history.defense['AceStopper']) history.defense['AceStopper'] = { games: 0, wins: 0, ptsFor: 0, ptsAgainst: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, rimM: 0, rimA: 0, midM: 0, midA: 0, aceImpact: 0 };
                        const r = history.defense['AceStopper']; const targetAceBox = oppBox.find(b => b.isAceTarget);
                        if (targetAceBox) { r.games++; if (isWin) r.wins++; r.ptsAgainst += targetAceBox.pts; r.fgm += targetAceBox.fgm; r.fga += targetAceBox.fga; r.p3m += targetAceBox.p3m; r.p3a += targetAceBox.p3a; r.aceImpact = (r.aceImpact || 0) + (targetAceBox.matchupEffect || 0); }
                    }
                    return history;
                };

                updatedTeams[homeIdx] = { ...home, wins: home.wins + (homeWin ? 1 : 0), losses: home.losses + (homeWin ? 0 : 1), tacticHistory: updateHistory(home, result.homeBox, result.awayBox, result.homeTactics, homeWin) };
                updatedTeams[awayIdx] = { ...away, wins: away.wins + (homeWin ? 0 : 1), losses: away.losses + (homeWin ? 1 : 0), tacticHistory: updateHistory(away, result.awayBox, result.homeBox, result.awayTactics, !homeWin) };

                const updateRosterStats = (teamIdx: number, boxScore: PlayerBoxScore[], rosterUpdates: any) => {
                    const t = updatedTeams[teamIdx];
                    t.roster = t.roster.map(p => {
                        const update = rosterUpdates[p.id]; const box = boxScore.find(b => b.playerId === p.id);
                        let targetStats = game.isPlayoff ? (p.playoffStats || INITIAL_STATS()) : p.stats;
                        if (box) { 
                            targetStats.g += 1; targetStats.gs += box.gs; targetStats.mp += box.mp; targetStats.pts += box.pts; targetStats.reb += box.reb; targetStats.ast += box.ast; targetStats.stl += box.stl; targetStats.blk += box.blk; targetStats.tov += box.tov; targetStats.fgm += box.fgm; targetStats.fga += box.fga; targetStats.p3m += box.p3m; targetStats.p3a += box.p3a; targetStats.ftm += box.ftm; targetStats.fta += box.fta; 
                            targetStats.rimM = (targetStats.rimM || 0) + (box.rimM || 0); targetStats.rimA = (targetStats.rimA || 0) + (box.rimA || 0); targetStats.midM = (targetStats.midM || 0) + (box.midM || 0); targetStats.midA = (targetStats.midA || 0) + (box.midA || 0);
                        }
                        const returnObj = { ...p, condition: update?.condition !== undefined ? Math.round(update.condition) : p.condition, health: update?.health ?? p.health, injuryType: update?.injuryType ?? p.injuryType, returnDate: update?.returnDate ?? p.returnDate };
                        if (game.isPlayoff) returnObj.playoffStats = targetStats; else returnObj.stats = targetStats;
                        return returnObj;
                    });
                };
                updateRosterStats(homeIdx, result.homeBox, result.rosterUpdates); updateRosterStats(awayIdx, result.awayBox, result.rosterUpdates);

                const updatedGame: Game = { ...game, played: true, homeScore: result.homeScore, awayScore: result.awayScore, tactics: { home: result.homeTactics, away: result.awayTactics } };
                const schIdx = updatedSchedule.findIndex(g => g.id === game.id); if (schIdx !== -1) updatedSchedule[schIdx] = updatedGame;
                
                // [Playoff Update] Update Series Score
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
                        
                        updatedSeries[sIdx] = { 
                            ...series, 
                            higherSeedWins: newH, 
                            lowerSeedWins: newL, 
                            finished, 
                            winnerId: finished ? (newH >= target ? series.higherSeedId : series.lowerSeedId) : undefined 
                        };
                    }
                }

                if (session?.user && !isGuestMode) {
                    gameResultsToInsert.push({ 
                        user_id: session.user.id, 
                        game_id: game.id, 
                        date: game.date, 
                        home_team_id: game.homeTeamId, 
                        away_team_id: game.awayTeamId, 
                        home_score: result.homeScore, 
                        away_score: result.awayScore, 
                        box_score: { home: result.homeBox, away: result.awayBox },
                        is_playoff: game.isPlayoff, 
                        series_id: game.seriesId 
                    });
                }
                allPlayedToday.push(updatedGame);
                if (isUserGame) userGameResultOutput = { ...result, home: updatedTeams[homeIdx], away: updatedTeams[awayIdx], userTactics: tactics, myTeamId }; 
            }

            if (gameResultsToInsert.length > 0) { saveGameResults(gameResultsToInsert); }
            setTeams(updatedTeams); setSchedule(updatedSchedule); setPlayoffSeries(updatedSeries); 
            
            if (userGameResultOutput) {
                const recap = await generateGameRecapNews(userGameResultOutput);
                setLastGameResult({ ...userGameResultOutput, recap: recap || [], otherGames: allPlayedToday.filter(g => g.homeTeamId !== myTeamId && g.awayTeamId !== myTeamId) });
            } else { 
                setIsSimulating(false); 
                advanceDate(); 
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
                // If teams missing, skip simulation for user game (shouldn't happen in healthy state)
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
