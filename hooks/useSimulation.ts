import { useState, useRef, useCallback } from 'react';
import { Team, Game, PlayoffSeries, Transaction, GameTactics, PlayerBoxScore } from '../types';
import { simulateGame } from '../services/gameEngine';
import { saveGameResults } from '../services/queries';
import { generateGameRecapNews } from '../services/geminiService';
import { checkAndInitPlayoffs, generateNextPlayoffGames } from '../utils/playoffLogic';
import { supabase } from '../services/supabaseClient';
import { logEvent } from '../services/analytics';

export const useSimulation = (
    teams: Team[],
    setTeams: React.Dispatch<React.SetStateAction<Team[]>>,
    schedule: Game[],
    setSchedule: React.Dispatch<React.SetStateAction<Game[]>>,
    myTeamId: string | null,
    currentSimDate: string,
    onDateChange: (date: string) => void,
    playoffSeries: PlayoffSeries[],
    setPlayoffSeries: React.Dispatch<React.SetStateAction<PlayoffSeries[]>>,
    setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>,
    setNews: (news: any[]) => void,
    setToastMessage: (msg: string) => void,
    session: any,
    isGuestMode: boolean
) => {
    const [isSimulating, setIsSimulating] = useState(false);
    const [activeGame, setActiveGame] = useState<Game | null>(null);
    const [lastGameResult, setLastGameResult] = useState<any | null>(null);
    const finalizeSimRef = useRef<(() => void) | null>(null);

    const handleExecuteSim = useCallback(async (userTactics: GameTactics) => {
        setIsSimulating(true);
        logEvent('Game', 'Simulate Day', currentSimDate);

        // 1. Identify Games Today
        const todaysGames = schedule.filter(g => g.date === currentSimDate && !g.played);
        const myGame = todaysGames.find(g => g.homeTeamId === myTeamId || g.awayTeamId === myTeamId);
        
        // 2. Prepare for Batch Processing
        const gameResultsToSave: any[] = [];
        let updatedTeams = [...teams];
        const teamsPlayedToday = new Set<string>();
        let myGameResultData: any = null;

        // Helper to find team in local updatedTeams array
        const getTeam = (id: string) => updatedTeams.find(t => t.id === id);

        // 3. Simulate CPU Games (All games except user's for now, user's handled in visualizer or separately)
        const processGame = (game: Game, isUserGame: boolean) => {
            const home = getTeam(game.homeTeamId);
            const away = getTeam(game.awayTeamId);
            if (!home || !away) return null;

            teamsPlayedToday.add(home.id);
            teamsPlayedToday.add(away.id);

            // B2B Check
            const isHomeB2B = false; // TODO: Check previous day schedule
            const isAwayB2B = false;

            const result = simulateGame(home, away, myTeamId, isUserGame ? userTactics : undefined, isHomeB2B, isAwayB2B);
            
            // Apply Roster Updates (Fatigue/Injury) immediately to local state
            updatedTeams = updatedTeams.map(t => {
                if (t.id === home.id || t.id === away.id) {
                    return {
                        ...t,
                        roster: t.roster.map(p => {
                            const update = result.rosterUpdates[p.id];
                            if (update) return { ...p, ...update };
                            return p;
                        })
                    };
                }
                return t;
            });

            // Apply Score & Record Updates
            const homeWon = result.homeScore > result.awayScore;
            updatedTeams = updatedTeams.map(t => {
                if (t.id === home.id) return { ...t, wins: t.wins + (homeWon ? 1 : 0), losses: t.losses + (homeWon ? 0 : 1) };
                if (t.id === away.id) return { ...t, wins: t.wins + (homeWon ? 0 : 1), losses: t.losses + (homeWon ? 1 : 0) };
                return t;
            });

            // Prepare DB Payload
            const dbPayload = {
                user_id: session?.user?.id,
                game_id: game.id,
                date: game.date,
                home_team_id: home.id,
                away_team_id: away.id,
                home_score: result.homeScore,
                away_score: result.awayScore,
                is_playoff: game.isPlayoff,
                series_id: game.seriesId,
                box_score: { home: result.homeBox, away: result.awayBox }
            };
            
            if (isUserGame) {
                myGameResultData = {
                    ...result,
                    home, away, 
                    recap: [], // Generated later
                    otherGames: [], // Filled later
                    gameId: game.id
                };
            }

            return { dbPayload, gameId: game.id, result };
        };

        // 4. Run Simulations
        // CPU Games
        todaysGames.forEach(g => {
            if (g.id !== myGame?.id) {
                const res = processGame(g, false);
                if (res) gameResultsToSave.push(res.dbPayload);
            }
        });

        // 5. User Game Handling / Finalization Logic
        const finalizeDay = async () => {
            // Save Results
            if (session?.user && !isGuestMode) {
                await saveGameResults(gameResultsToSave);
            }

            // Update Schedule State (Mark played)
            const playedGameIds = new Set(gameResultsToSave.map((r: any) => r.game_id));
            const newSchedule = schedule.map(g => {
                if (playedGameIds.has(g.id)) {
                    const r = gameResultsToSave.find((res: any) => res.game_id === g.id);
                    return { ...g, played: true, homeScore: r.home_score, awayScore: r.away_score };
                }
                return g;
            });

            // 6. Playoff Logic
            let newSeries = [...playoffSeries];
            // Update Series Records
            gameResultsToSave.forEach((r: any) => {
                if (r.is_playoff && r.series_id) {
                    const sIdx = newSeries.findIndex(s => s.id === r.series_id);
                    if (sIdx !== -1) {
                        const s = newSeries[sIdx];
                        const homeWon = r.home_score > r.away_score;
                        // Determine winner ID
                        const winnerId = homeWon ? r.home_team_id : r.away_team_id;
                        
                        if (winnerId === s.higherSeedId) s.higherSeedWins++;
                        else s.lowerSeedWins++;

                        // Check Finish
                        const targetWins = s.targetWins || 4;
                        if (s.higherSeedWins >= targetWins) { s.finished = true; s.winnerId = s.higherSeedId; }
                        else if (s.lowerSeedWins >= targetWins) { s.finished = true; s.winnerId = s.lowerSeedId; }
                        
                        newSeries[sIdx] = s;
                    }
                }
            });

            // Init Next Round / Play-in if needed
            const seriesAfterInit = checkAndInitPlayoffs(updatedTeams, newSchedule, newSeries, currentSimDate);
            
            // Generate Next Games
            const { newGames: nextGames, updatedSeries: finalSeries } = generateNextPlayoffGames(newSchedule, seriesAfterInit, currentSimDate);
            const finalSchedule = [...newSchedule, ...nextGames];

            setPlayoffSeries(finalSeries);
            setSchedule(finalSchedule);

            // 7. Date Advancement & Recovery
            const today = new Date(currentSimDate);
            const nextDay = new Date(today);
            nextDay.setDate(today.getDate() + 1);
            const nextDate = nextDay.toISOString().split('T')[0];

            // Recovery Logic (Snippet Integrated)
            updatedTeams = updatedTeams.map(t => ({
                ...t,
                roster: t.roster.map(p => {
                    // Calculate Base Recovery Amount
                    const baseRec = 10; 
                    const staBonus = (p.stamina || 75) * 0.1; 
                    const durBonus = (p.durability || 75) * 0.05;
                    let totalRecovery = baseRec + staBonus + durBonus;

                    // [Update] If team played today, recover only 50% of the normal amount
                    if (teamsPlayedToday.has(t.id)) {
                        totalRecovery *= 0.5;
                    }

                    return { ...p, condition: Math.min(100, Math.round((p.condition || 100) + totalRecovery)) };
                })
            }));
            
            setTeams(updatedTeams);
            onDateChange(nextDate);
            setIsSimulating(false);
            setActiveGame(null);
            
            // News Generation
            if (myGameResultData) {
                const recap = await generateGameRecapNews({ 
                    ...myGameResultData, 
                    myTeamId: myTeamId!,
                    userTactics
                });
                if (recap) setNews(recap);
            }
        };

        if (myGame) {
            // User Game exists -> Set Visualizer
            const userGameRes = processGame(myGame, true);
            if (userGameRes) {
                gameResultsToSave.push(userGameRes.dbPayload);
                
                // Set Data for Visualizer
                setActiveGame(myGame);
                
                // Define what happens when visualizer ends
                finalizeSimRef.current = () => {
                    // Prepare Result View Data
                    setLastGameResult({
                        ...myGameResultData,
                        otherGames: todaysGames.filter(g => g.id !== myGame.id).map(g => {
                            const res = gameResultsToSave.find((r:any) => r.game_id === g.id);
                            return { ...g, homeScore: res?.home_score, awayScore: res?.away_score };
                        })
                    });
                    
                    finalizeDay(); // Commit changes
                };
            }
        } else {
            // No User Game -> Instant Sim
            await finalizeDay();
            setLastGameResult(null);
        }

    }, [teams, schedule, myTeamId, currentSimDate, playoffSeries, session, isGuestMode, setTeams, setSchedule, onDateChange, setPlayoffSeries, setNews]);

    return {
        activeGame,
        lastGameResult,
        isSimulating,
        handleExecuteSim,
        setIsSimulating,
        finalizeSimRef
    };
};