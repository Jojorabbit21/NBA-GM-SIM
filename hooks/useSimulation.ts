
import { useState, useRef, useCallback, useEffect } from 'react';
import { Team, Game, PlayoffSeries, Transaction, GameTactics, DepthChart, Player, PlayerBoxScore } from '../types';
import { simulateGame } from '../services/gameEngine';
import { saveGameResults } from '../services/queries';
import { checkAndInitPlayoffs, advancePlayoffState, generateNextPlayoffGames } from '../utils/playoffLogic';
import { savePlayoffState } from '../services/playoffService';
import { INITIAL_STATS } from '../utils/constants';
import { sendMessage } from '../services/messageService';

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

                                // [Fix] Detailed Zone Stats Accumulation
                                // Iterate over keys to capture all dynamic zone_ keys from the simulation result
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
                away_score: res.awayScore,
                is_playoff: og.isPlayoff,
                series_id: og.seriesId,
                box_score: { home: res.homeBox, away: res.awayBox }
            });
        });

        if (resultsToSave.length > 0 && !isGuestMode) {
            await saveGameResults(resultsToSave);
        }
        
        // Immediate local reflect
        updateLocalStandingsAndStats(resultsToSave);

        return updatedSchedule;
    }, [schedule, teams, isGuestMode, session, updateLocalStandingsAndStats]);

    // Handle User Game Completion
    useEffect(() => {
        finalizeSimRef.current = async () => {
            if (!activeGame) return;

            const userGame = activeGame;
            const homeTeam = teams.find(t => t.id === userGame.homeTeamId)!;
            const awayTeam = teams.find(t => t.id === userGame.awayTeamId)!;

            const result = simulateGame(homeTeam, awayTeam, myTeamId, undefined, false, false, depthChart);

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
                // [Fix] Save Rotation Data
                rotation_data: result.rotationData
            };

            if (!isGuestMode && session?.user?.id) {
                await saveGameResults([userResult]);
                
                // [Fix] Send Message for Game Recap
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

            // Update local memory for user game
            updateLocalStandingsAndStats([userResult]);

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
    }, [activeGame, teams, schedule, currentSimDate, myTeamId, depthChart, setSchedule, isGuestMode, session, simulateLeagueGames, playoffSeries, setPlayoffSeries, updateLocalStandingsAndStats, refreshUnreadCount]);

    const handleExecuteSim = useCallback(async (userTactics: GameTactics) => {
        setIsSimulating(true);
        
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
            setActiveGame(userGame);
        } else {
            const updatedSchedule = await simulateLeagueGames(currentSimDate, undefined, updatedTeams);
            setSchedule(updatedSchedule);

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
