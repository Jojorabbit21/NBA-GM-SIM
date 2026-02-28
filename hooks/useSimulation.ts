
import { useState, useRef, useCallback } from 'react';
import { Team, Game, PlayoffSeries, Transaction, GameTactics, SimulationResult, DepthChart } from '../types';
import { processCpuGames } from '../services/simulation/cpuGameService';
import { runUserSimulation, applyUserGameResult } from '../services/simulation/userGameService';
import { handleSeasonEvents } from '../services/simulation/seasonService';
import { saveGameResults } from '../services/queries';
import { savePlayoffGameResult } from '../services/playoffService';

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
    depthChart?: DepthChart | null,
    tendencySeed?: string
) => {
    const [isSimulating, setIsSimulating] = useState(false);
    const [activeGame, setActiveGame] = useState<Game | null>(null);
    const [lastGameResult, setLastGameResult] = useState<any | null>(null);
    const [tempSimulationResult, setTempSimulationResult] = useState<SimulationResult | null>(null);
    
    const finalizeSimRef = useRef<(() => void) | undefined>(undefined);

    const handleExecuteSim = useCallback(async (userTactics: GameTactics, skipAnimation: boolean = false) => {
        if (isSimulating || !myTeamId) return;
        setIsSimulating(true);

        try {
            // 1. Identify User's Game
            const userGame = schedule.find(g => 
                !g.played && 
                g.date === currentSimDate && 
                (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId)
            );

            // 2. Prepare mutable clones for the pipeline
            let newTeams: Team[] = JSON.parse(JSON.stringify(teams));
            let newSchedule: Game[] = [...schedule];
            let newPlayoffSeries: PlayoffSeries[] = [...playoffSeries];

            // 3. Process CPU Games
            const cpuData = processCpuGames(newTeams, newSchedule, newPlayoffSeries, currentSimDate, userGame?.id, session?.user?.id);
            
            // [Fix] Save CPU Game Results to DB
            if (!isGuestMode) {
                if (cpuData.gameResultsToSave.length > 0) {
                    // Batch insert regular season games
                    await saveGameResults(cpuData.gameResultsToSave);
                }
                if (cpuData.playoffResultsToSave.length > 0) {
                    // Insert playoff games (sequentially to ensure safety, or promise.all)
                    await Promise.all(cpuData.playoffResultsToSave.map(res => savePlayoffGameResult(res as any)));
                }
            }

            // 4. Handle User Game
            if (userGame) {
                // Run Simulation (Pure Logic)
                const result = runUserSimulation(userGame, newTeams, newSchedule, myTeamId, userTactics, currentSimDate, depthChart, tendencySeed);
                
                setTempSimulationResult(result);

                // [UX Fix] Do NOT set activeGame if skipping animation to prevent flickering to Sim View.
                if (!skipAnimation) {
                    setActiveGame(userGame);
                }

                // Finalize Function (Called after animation or immediately)
                finalizeSimRef.current = async () => {
                    // Apply Results (Mutates newTeams/Schedule/Playoffs)
                    await applyUserGameResult(
                        result, userGame, newTeams, newSchedule, newPlayoffSeries, 
                        currentSimDate, session?.user?.id, myTeamId, userTactics, isGuestMode, refreshUnreadCount
                    );

                    // 5. Handle Season Events (Playoffs, Trades) - Post Game
                    const seasonEvents = await handleSeasonEvents(newTeams, newSchedule, newPlayoffSeries, currentSimDate, myTeamId, session?.user?.id, isGuestMode);
                    
                    if (seasonEvents.updatedPlayoffSeries) {
                        newPlayoffSeries = seasonEvents.updatedPlayoffSeries;
                    }
                    
                    // Add Trades
                    if (seasonEvents.newTransactions.length > 0) {
                        setTransactions(prev => [...seasonEvents.newTransactions, ...prev]);
                    }
                    if (seasonEvents.newsItems.length > 0) {
                         setNews(prev => [...prev, ...seasonEvents.newsItems.map(c => ({ type: 'text', content: c }))]);
                    }
                    if (seasonEvents.tradeToast) {
                        setToastMessage(seasonEvents.tradeToast);
                    }

                    // Commit State Updates
                    setTeams(newTeams);
                    setSchedule(newSchedule);
                    setPlayoffSeries(newPlayoffSeries);

                    // Set View Data
                    setLastGameResult({
                        home: newTeams.find(t => t.id === userGame.homeTeamId),
                        away: newTeams.find(t => t.id === userGame.awayTeamId),
                        homeScore: result.homeScore,
                        awayScore: result.awayScore,
                        homeBox: result.homeBox,
                        awayBox: result.awayBox,
                        recap: [],
                        otherGames: cpuData.viewData,
                        cpuResults: cpuData.cpuResults, // [Fix] Use View-Ready camelCase results
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
                    await finalizeSimRef.current();
                    setIsSimulating(false);
                }

            } else {
                // No User Game - Advance Day Only
                
                // Handle Season Events
                const seasonEvents = await handleSeasonEvents(newTeams, newSchedule, newPlayoffSeries, currentSimDate, myTeamId, session?.user?.id, isGuestMode);
                
                if (seasonEvents.updatedPlayoffSeries) {
                    newPlayoffSeries = seasonEvents.updatedPlayoffSeries;
                }
                
                if (seasonEvents.newTransactions.length > 0) {
                    setTransactions(prev => [...seasonEvents.newTransactions, ...prev]);
                }
                if (seasonEvents.newsItems.length > 0) {
                     setNews(prev => [...prev, ...seasonEvents.newsItems.map(c => ({ type: 'text', content: c }))]);
                }
                if (seasonEvents.tradeToast) {
                    setToastMessage(seasonEvents.tradeToast);
                }

                // Commit Updates
                setTeams(newTeams);
                setSchedule(newSchedule);
                setPlayoffSeries(newPlayoffSeries);

                // Advance Date
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
                // [UX Fix] Toast removed
            }

        } catch (e) {
            console.error("Simulation Error:", e);
            setIsSimulating(false);
            setToastMessage("시뮬레이션 중 오류가 발생했습니다.");
        }
    }, [teams, schedule, myTeamId, currentSimDate, isSimulating, isGuestMode, session, depthChart, playoffSeries, tendencySeed]);

    const clearLastGameResult = () => setLastGameResult(null);
    const loadSavedGameResult = (result: any) => setLastGameResult(result);

    // ── Live Game Mode ──
    // 유저 경기를 인터랙티브 모드로 시작. CPU 경기는 기존 배치 방식 유지.
    const [liveGameTarget, setLiveGameTarget] = useState<{
        homeTeam: Team;
        awayTeam: Team;
        userGame: Game;
        cpuViewData: any;
        cpuResults: any;
        userTactics: GameTactics;
    } | null>(null);

    const handleStartLiveGame = useCallback(async (userTactics: GameTactics) => {
        if (isSimulating || !myTeamId) return;
        setIsSimulating(true);

        try {
            const userGame = schedule.find(g =>
                !g.played &&
                g.date === currentSimDate &&
                (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId)
            );
            if (!userGame) {
                setIsSimulating(false);
                return;
            }

            let newTeams: Team[] = JSON.parse(JSON.stringify(teams));
            let newSchedule: Game[] = [...schedule];
            let newPlayoffSeries: PlayoffSeries[] = [...playoffSeries];

            const cpuData = processCpuGames(
                newTeams, newSchedule, newPlayoffSeries, currentSimDate, userGame.id, session?.user?.id
            );

            if (!isGuestMode) {
                if (cpuData.gameResultsToSave.length > 0) {
                    await saveGameResults(cpuData.gameResultsToSave);
                }
            }

            const homeTeam = newTeams.find(t => t.id === userGame.homeTeamId)!;
            const awayTeam  = newTeams.find(t => t.id === userGame.awayTeamId)!;

            // CPU 변경사항 반영 후 teams 업데이트
            setTeams(newTeams);
            setSchedule(newSchedule);

            setLiveGameTarget({
                homeTeam,
                awayTeam,
                userGame,
                cpuViewData: cpuData.viewData,
                cpuResults: cpuData.cpuResults,
                userTactics,
            });

        } catch (e) {
            console.error("Live Game Start Error:", e);
            setIsSimulating(false);
            setToastMessage("라이브 경기 시작 중 오류가 발생했습니다.");
        }
    }, [teams, schedule, myTeamId, currentSimDate, isSimulating, isGuestMode, session, playoffSeries,
        setTeams, setSchedule, setToastMessage]);

    const clearLiveGameTarget = () => {
        setLiveGameTarget(null);
        setIsSimulating(false);
    };

    // 라이브 경기 종료 후 전체 파이프라인 실행 (applyUserGameResult + seasonEvents + state commit)
    const finalizeLiveGame = useCallback(async (result: SimulationResult) => {
        if (!liveGameTarget || !myTeamId) return;
        const { userGame, cpuViewData, cpuResults, userTactics: liveUserTactics } = liveGameTarget;

        try {
            let newTeams: Team[] = JSON.parse(JSON.stringify(teams));
            let newSchedule: Game[] = [...schedule];
            let newPlayoffSeries: PlayoffSeries[] = [...playoffSeries];

            // 경기 결과 적용 (스탯 누적, DB 저장, 메시지 전송)
            await applyUserGameResult(
                result, userGame, newTeams, newSchedule, newPlayoffSeries,
                currentSimDate, session?.user?.id, myTeamId, liveUserTactics, isGuestMode, refreshUnreadCount
            );

            // 시즌 이벤트 처리 (트레이드, 플레이오프 등)
            const seasonEvents = await handleSeasonEvents(
                newTeams, newSchedule, newPlayoffSeries, currentSimDate, myTeamId, session?.user?.id, isGuestMode
            );

            if (seasonEvents.updatedPlayoffSeries) {
                newPlayoffSeries = seasonEvents.updatedPlayoffSeries;
            }
            if (seasonEvents.newTransactions.length > 0) {
                setTransactions(prev => [...seasonEvents.newTransactions, ...prev]);
            }
            if (seasonEvents.newsItems.length > 0) {
                setNews(prev => [...prev, ...seasonEvents.newsItems.map((c: any) => ({ type: 'text', content: c }))]);
            }
            if (seasonEvents.tradeToast) {
                setToastMessage(seasonEvents.tradeToast);
            }

            // 상태 반영
            setTeams(newTeams);
            setSchedule(newSchedule);
            setPlayoffSeries(newPlayoffSeries);

            // GameResultView용 데이터 세팅
            setLastGameResult({
                home: newTeams.find(t => t.id === userGame.homeTeamId),
                away: newTeams.find(t => t.id === userGame.awayTeamId),
                homeScore: result.homeScore,
                awayScore: result.awayScore,
                homeBox: result.homeBox,
                awayBox: result.awayBox,
                recap: [],
                otherGames: cpuViewData,
                cpuResults,
                homeTactics: result.homeTactics,
                awayTactics: result.awayTactics,
                pbpLogs: result.pbpLogs,
                rotationData: result.rotationData,
                pbpShotEvents: result.pbpShotEvents,
                injuries: result.injuries,
                date: userGame.date,
            });

            setLiveGameTarget(null);
            setIsSimulating(false);
        } catch (e) {
            console.error("Live Game Finalization Error:", e);
            setIsSimulating(false);
            setToastMessage("경기 결과 처리 중 오류가 발생했습니다.");
        }
    }, [liveGameTarget, myTeamId, teams, schedule, playoffSeries, currentSimDate, session, isGuestMode,
        refreshUnreadCount, setTeams, setSchedule, setPlayoffSeries, setTransactions, setNews, setToastMessage]);

    return {
        handleExecuteSim,
        handleStartLiveGame,
        finalizeLiveGame,
        liveGameTarget,
        clearLiveGameTarget,
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
