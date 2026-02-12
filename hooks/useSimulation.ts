
import { useState, useRef } from 'react';
import { Team, Game, PlayoffSeries, Transaction, GameTactics, SimulationResult, DepthChart, TradeAlertContent } from '../types';
import { simulateGame } from '../services/gameEngine';
import { saveGameResults, saveUserTransaction } from '../services/queries';
import { generateGameRecapNews } from '../services/geminiService';
import { sendMessage } from '../services/messageService';
import { simulateCPUTrades } from '../services/tradeEngine';
import { generateNextPlayoffGames, advancePlayoffState, checkAndInitPlayoffs } from '../utils/playoffLogic';
import { updateTeamStats, updateSeriesState } from '../utils/simulationUtils';
import { simulateCpuGames } from '../services/simulationService';

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
    
    const finalizeSimRef = useRef<(() => void) | null>(null);

    const clearLastGameResult = () => setLastGameResult(null);
    const loadSavedGameResult = (result: any) => setLastGameResult(result);

    const handleExecuteSim = async (userTactics: GameTactics) => {
        if (isSimulating || !myTeamId) return;
        setIsSimulating(true);

        // 1. Find User's Game Today
        const userGame = schedule.find(g => 
            !g.played && 
            g.date === currentSimDate && 
            (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId)
        );

        if (userGame) {
            // Simulate User Game
            const homeTeam = teams.find(t => t.id === userGame.homeTeamId)!;
            const awayTeam = teams.find(t => t.id === userGame.awayTeamId)!;
            
            // Check for Back-to-Back
            const checkB2B = (teamId: string) => {
                const yesterday = new Date(currentSimDate);
                yesterday.setDate(yesterday.getDate() - 1);
                const yStr = yesterday.toISOString().split('T')[0];
                return schedule.some(g => g.played && g.date === yStr && (g.homeTeamId === teamId || g.awayTeamId === teamId));
            };

            // Run Simulation
            const result = simulateGame(
                homeTeam, awayTeam, myTeamId, userTactics, checkB2B(homeTeam.id), checkB2B(awayTeam.id),
                homeTeam.id === myTeamId ? depthChart : null,
                awayTeam.id === myTeamId ? depthChart : null
            );

            setTempSimulationResult(result);
            setActiveGame(userGame);

            // Set up callback for when animation finishes
            finalizeSimRef.current = async () => {
                setActiveGame(null);
                await processDayCompletion(result, userGame);
            };
        } else {
            // No game for user today, just simulate others and advance
            await processDayCompletion();
        }
    };

    const processDayCompletion = async (userSimResult?: SimulationResult, userGame?: Game) => {
        // Create Mutable Copies
        let updatedTeams = [...teams];
        let updatedSchedule = [...schedule];
        let updatedPlayoffSeries = [...playoffSeries];

        // 1. Process User Game Result
        if (userSimResult && userGame) {
            const homeTeam = updatedTeams.find(t => t.id === userGame.homeTeamId)!;
            const awayTeam = updatedTeams.find(t => t.id === userGame.awayTeamId)!;
            
            // Update Logic
            updateTeamStats(homeTeam, awayTeam, userSimResult.homeScore, userSimResult.awayScore);
            
            if (userGame.isPlayoff && userGame.seriesId) {
                updateSeriesState(updatedPlayoffSeries, userGame.seriesId, userGame.homeTeamId, userGame.awayTeamId, userSimResult.homeScore, userSimResult.awayScore);
            }

            // Update Schedule
            const gameIdx = updatedSchedule.findIndex(g => g.id === userGame.id);
            if (gameIdx !== -1) {
                updatedSchedule[gameIdx].played = true;
                updatedSchedule[gameIdx].homeScore = userSimResult.homeScore;
                updatedSchedule[gameIdx].awayScore = userSimResult.awayScore;
            }

            // Save to DB
            const userResult = {
                user_id: session?.user?.id || 'guest',
                game_id: userGame.id,
                date: currentSimDate,
                home_team_id: userGame.homeTeamId,
                away_team_id: userGame.awayTeamId,
                home_score: userSimResult.homeScore,
                away_score: userSimResult.awayScore,
                is_playoff: userGame.isPlayoff || false,
                series_id: userGame.seriesId,
                box_score: { home: userSimResult.homeBox, away: userSimResult.awayBox },
                rotation_data: userSimResult.rotationData,
                tactics: { home: userSimResult.homeTactics, away: userSimResult.awayTactics },
                shot_events: userSimResult.pbpShotEvents || [], // [Critical] Persist Shot Events
                pbp_logs: userSimResult.pbpLogs
            };

            if (!isGuestMode && session?.user?.id) {
                console.log("💾 Saving Game Result with Shots:", userResult.shot_events?.length);
                await saveGameResults([userResult]);
                
                // Messages & News
                const recapNews = await generateGameRecapNews({
                    home: homeTeam, away: awayTeam,
                    homeScore: userSimResult.homeScore, awayScore: userSimResult.awayScore,
                    homeBox: userSimResult.homeBox, awayBox: userSimResult.awayBox,
                    userTactics: userSimResult.homeTactics,
                    myTeamId: myTeamId!
                });

                if (recapNews) setNews(prev => [...prev, { type: 'text', content: recapNews.join('\n') }]);

                const myTeamName = homeTeam.id === myTeamId ? homeTeam.name : awayTeam.name;
                await sendMessage(
                    session.user.id,
                    myTeamId!,
                    currentSimDate,
                    'GAME_RECAP',
                    `경기 결과: ${myTeamName} vs ${homeTeam.id === myTeamId ? awayTeam.name : homeTeam.name}`,
                    {
                        gameId: userGame.id,
                        homeTeamId: userGame.homeTeamId,
                        awayTeamId: userGame.awayTeamId,
                        homeScore: userSimResult.homeScore,
                        awayScore: userSimResult.awayScore,
                        userBoxScore: homeTeam.id === myTeamId ? userSimResult.homeBox : userSimResult.awayBox
                    }
                );
                refreshUnreadCount();
            }

            // [Fix] Flatten structure for GameResultView
            setLastGameResult({
                ...userResult,
                // Explicitly pass flattened props expected by GameResultView
                homeBox: userSimResult.homeBox,
                awayBox: userSimResult.awayBox,
                homeTactics: userSimResult.homeTactics,
                awayTactics: userSimResult.awayTactics,
                home: homeTeam,
                away: awayTeam,
                otherGames: [], // Filled below
                recap: []
            });
        }

        // 2. Simulate CPU Games (Batch Processing)
        const cpuResults = simulateCpuGames(updatedSchedule, updatedTeams, currentSimDate, userGame?.id);
        
        for (const res of cpuResults) {
            const h = updatedTeams.find(t => t.id === res.homeTeamId)!;
            const a = updatedTeams.find(t => t.id === res.awayTeamId)!;
            const gIdx = updatedSchedule.findIndex(g => g.id === res.gameId);
            
            // Apply Results
            updateTeamStats(h, a, res.homeScore, res.awayScore);
            
            if (res.isPlayoff && res.seriesId) {
                updateSeriesState(updatedPlayoffSeries, res.seriesId, res.homeTeamId, res.awayTeamId, res.homeScore, res.awayScore);
            }

            if (gIdx !== -1) {
                updatedSchedule[gIdx].played = true;
                updatedSchedule[gIdx].homeScore = res.homeScore;
                updatedSchedule[gIdx].awayScore = res.awayScore;
            }
        }

        // Update Last Game Result with Other Games
        if (lastGameResult || userSimResult) {
             setLastGameResult((prev: any) => ({ ...prev, otherGames: cpuResults }));
        }

        // 3. CPU Trades
        if (Math.random() < 0.3) {
            const tradeResult = await simulateCPUTrades(updatedTeams, myTeamId);
            if (tradeResult && tradeResult.transaction) {
                // [Fix] Generate ID if missing (Fixes ?????? in History)
                if (!tradeResult.transaction.id) {
                    tradeResult.transaction.id = crypto.randomUUID();
                }

                updatedTeams = tradeResult.updatedTeams;
                setTransactions(prev => [tradeResult.transaction!, ...prev]);
                
                // [Request] Removed Toast Message
                // setToastMessage(`[트레이드] ${tradeResult.transaction.description}`);
                
                if (!isGuestMode && session?.user?.id) {
                    await saveUserTransaction(session.user.id, tradeResult.transaction);
                    
                    // [Request] Send Message to Inbox for CPU Trades
                    const tx = tradeResult.transaction;
                    const team1 = updatedTeams.find(t => t.id === tx.teamId);
                    const team2 = updatedTeams.find(t => t.id === tx.details.partnerTeamId);
                    
                    const tradeContent: TradeAlertContent = {
                        summary: tx.description,
                        trades: [{
                            team1Id: tx.teamId,
                            team1Name: team1?.name || tx.teamId,
                            team2Id: tx.details.partnerTeamId,
                            team2Name: tx.details.partnerTeamName,
                            team1Acquired: tx.details.acquired.map((p: any) => ({ id: p.id, name: p.name, ovr: p.ovr || 70 })),
                            team2Acquired: tx.details.traded.map((p: any) => ({ id: p.id, name: p.name, ovr: p.ovr || 70 }))
                        }]
                    };

                    await sendMessage(
                        session.user.id,
                        myTeamId!,
                        currentSimDate,
                        'TRADE_ALERT',
                        tx.description,
                        tradeContent
                    );
                    refreshUnreadCount();
                }
            }
        }

        // 4. Playoff Management (Init / Advance)
        if (playoffSeries.length === 0) {
            const newSeries = checkAndInitPlayoffs(updatedTeams, updatedSchedule, updatedPlayoffSeries, currentSimDate);
            if (newSeries.length > 0) {
                updatedPlayoffSeries = newSeries;
                const { newGames } = generateNextPlayoffGames(updatedSchedule, updatedPlayoffSeries, currentSimDate);
                updatedSchedule = [...updatedSchedule, ...newGames];
            }
        } else {
            const nextSeriesState = advancePlayoffState(updatedPlayoffSeries, updatedTeams);
            const { newGames, updatedSeries } = generateNextPlayoffGames(updatedSchedule, nextSeriesState, currentSimDate);
            updatedPlayoffSeries = updatedSeries;
            updatedSchedule = [...updatedSchedule, ...newGames];
        }

        // 5. Finalize State & Advance Date
        setTeams(updatedTeams);
        setSchedule(updatedSchedule);
        setPlayoffSeries(updatedPlayoffSeries);

        if (!userGame) {
            // Auto-advance if no user game
            const d = new Date(currentSimDate);
            d.setDate(d.getDate() + 1);
            const nextDate = d.toISOString().split('T')[0];
            advanceDate(nextDate, { teams: updatedTeams, schedule: updatedSchedule });
            forceSave({ teams: updatedTeams, currentSimDate: nextDate });
        } else {
            // Just save state, user advances manually from GameResultView
            forceSave({ teams: updatedTeams }); 
        }

        setIsSimulating(false);
    };

    return {
        isSimulating,
        setIsSimulating,
        activeGame,
        lastGameResult,
        tempSimulationResult,
        handleExecuteSim,
        loadSavedGameResult,
        clearLastGameResult,
        finalizeSimRef
    };
};
