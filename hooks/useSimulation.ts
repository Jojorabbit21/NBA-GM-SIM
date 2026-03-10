
import { useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Team, Game, PlayoffSeries, Transaction, GameTactics, SimulationResult, DepthChart } from '../types';
import { processCpuGames } from '../services/simulation/cpuGameService';
import { runUserSimulation, applyUserGameResult } from '../services/simulation/userGameService';
import { handleSeasonEvents } from '../services/simulation/seasonService';
import { saveGameResults } from '../services/queries';
import { savePlayoffGameResult } from '../services/playoffService';
import { applyRestDayRecovery } from '../services/game/engine/fatigueSystem';
import { CpuGameResult } from '../services/simulationService';
import { applyBoxToRoster, updateTeamStats } from '../utils/simulationUtils';
import { sendMessage } from '../services/messageService';
import { buildSeasonReviewContent, buildPlayoffStageContent, buildOwnerLetterContent } from '../services/reportGenerator';

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
    transactions: Transaction[],
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
    const queryClient = useQueryClient();
    const [isSimulating, setIsSimulating] = useState(false);
    const [activeGame, setActiveGame] = useState<Game | null>(null);
    const [lastGameResult, setLastGameResult] = useState<any | null>(null);
    const [tempSimulationResult, setTempSimulationResult] = useState<SimulationResult | null>(null);

    const finalizeSimRef = useRef<(() => void) | undefined>(undefined);

    // ── Spectate Mode (리그 일정에서 AI 경기 참관) ──
    const [spectateTarget, setSpectateTarget] = useState<{
        homeTeam: Team;
        awayTeam: Team;
        spectateGame: Game;
        nextDate: string;
    } | null>(null);

    const clearSpectateTarget = useCallback(() => setSpectateTarget(null), []);

    // 참관 경기 종료 후 결과 적용 + 날짜 진행
    const finalizeSpectateGame = useCallback(async (result: SimulationResult) => {
        if (!spectateTarget) return;
        try {
            const { spectateGame, nextDate } = spectateTarget;
            const newTeams: Team[] = JSON.parse(JSON.stringify(teams));
            const newSchedule: Game[] = [...schedule];

            // 경기 결과 반영
            const home = newTeams.find(t => t.id === spectateGame.homeTeamId);
            const away = newTeams.find(t => t.id === spectateGame.awayTeamId);
            if (home && away) {
                updateTeamStats(home, away, result.homeScore, result.awayScore);
                applyBoxToRoster(home, result.homeBox);
                applyBoxToRoster(away, result.awayBox);
            }

            // 스케줄 업데이트
            const gameIdx = newSchedule.findIndex(g => g.id === spectateGame.id);
            if (gameIdx >= 0) {
                newSchedule[gameIdx] = { ...newSchedule[gameIdx], played: true, homeScore: result.homeScore, awayScore: result.awayScore };
            }

            // DB 저장
            if (!isGuestMode && session?.user?.id) {
                await saveGameResults([{
                    user_id: session.user.id,
                    game_id: spectateGame.id,
                    home_team_id: spectateGame.homeTeamId,
                    away_team_id: spectateGame.awayTeamId,
                    home_score: result.homeScore,
                    away_score: result.awayScore,
                    box_score: { home: result.homeBox, away: result.awayBox },
                    tactics: { home: result.homeTactics, away: result.awayTactics },
                    date: spectateGame.date,
                    pbp_logs: result.pbpLogs,
                    shot_events: result.pbpShotEvents,
                    rotation_data: result.rotationData,
                }]);
            }

            // 상태 커밋
            setTeams(newTeams);
            setSchedule(newSchedule);

            // Invalidate player game log cache
            queryClient.invalidateQueries({ queryKey: ['playerGameLog'] });

            // 날짜 진행
            advanceDate(nextDate, {});
            if (!isGuestMode) {
                await forceSave({ currentSimDate: nextDate, teams: newTeams, schedule: newSchedule, withSnapshot: true });
            }

            setSpectateTarget(null);
        } catch (e) {
            console.error("Spectate Finalization Error:", e);
            setToastMessage("참관 경기 결과 처리 중 오류가 발생했습니다.");
            setSpectateTarget(null);
        }
    }, [spectateTarget, teams, schedule, isGuestMode, session, advanceDate, forceSave, setTeams, setSchedule, setToastMessage]);

    // Helper: 시즌 리뷰 / 플레이오프 스테이지 리뷰 메시지 자동 발송
    const sendReviewMessages = useCallback(async (
        prevSchedule: Game[],
        newSchedule: Game[],
        prevFinishedSeriesIds: Set<string>,
        newPlayoffSeries: PlayoffSeries[],
        newTeams: Team[],
        date: string,
        allTransactions: Transaction[]
    ) => {
        const userId = session?.user?.id;
        if (!userId || !myTeamId) return;

        const myTeam = newTeams.find(t => t.id === myTeamId);
        if (!myTeam) return;

        // 유저 팀 82경기 완료 감지
        const myRegGames = (sched: typeof newSchedule) => sched.filter(g => !g.isPlayoff && (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId));
        const wasMySeasonDone = myRegGames(prevSchedule).length > 0 && myRegGames(prevSchedule).every(g => g.played);
        const isMySeasonDone = myRegGames(newSchedule).length > 0 && myRegGames(newSchedule).every(g => g.played);

        if (!wasMySeasonDone && isMySeasonDone) {
            const nextDay = new Date(date);
            nextDay.setDate(nextDay.getDate() + 1);
            const reviewDate = nextDay.toISOString().split('T')[0];
            const content = buildSeasonReviewContent(myTeam, newTeams, allTransactions, newSchedule);
            await sendMessage(userId, myTeamId, reviewDate, 'SEASON_REVIEW', '[시즌 보고서] 2025-26 정규시즌 리뷰', content);
            const ownerLetter = buildOwnerLetterContent(myTeam, newTeams, newSchedule);
            await sendMessage(userId, myTeamId, reviewDate, 'OWNER_LETTER', `[구단주 서한] ${ownerLetter.title}`, ownerLetter);
            refreshUnreadCount();
        }

        // 플레이오프 스테이지 종료 감지
        const newlyFinished = newPlayoffSeries.filter(s =>
            s.finished &&
            (s.higherSeedId === myTeamId || s.lowerSeedId === myTeamId) &&
            !prevFinishedSeriesIds.has(s.id)
        );

        for (const series of newlyFinished) {
            const content = buildPlayoffStageContent(myTeam, newTeams, series, newSchedule, newPlayoffSeries);
            const roundName = content.roundName;
            await sendMessage(userId, myTeamId, date, 'PLAYOFF_STAGE_REVIEW', `[플레이오프 보고서] ${roundName}`, content);
            refreshUnreadCount();
        }
    }, [session, myTeamId, refreshUnreadCount]);

    const handleExecuteSim = useCallback(async (userTactics: GameTactics, skipAnimation: boolean = false, spectateGameId?: string) => {
        if (isSimulating || !myTeamId) return;
        setIsSimulating(true);

        try {
            // 1. Identify User's Game
            const userGame = schedule.find(g =>
                !g.played &&
                g.date === currentSimDate &&
                (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId)
            );

            // Capture "before" state for review message detection
            const prevScheduleSnapshot = schedule.map(g => ({ id: g.id, played: g.played, isPlayoff: g.isPlayoff }));
            const prevFinishedSeriesIds = new Set(
                playoffSeries.filter(s => s.finished && (s.higherSeedId === myTeamId || s.lowerSeedId === myTeamId)).map(s => s.id)
            );

            // 2. Prepare mutable clones for the pipeline
            let newTeams: Team[] = JSON.parse(JSON.stringify(teams));
            let newSchedule: Game[] = [...schedule];
            let newPlayoffSeries: PlayoffSeries[] = [...playoffSeries];

            // 3. Process CPU Games (참관 경기는 제외 — LiveGameView에서 실시간 진행)
            const excludeGameId = userGame?.id || spectateGameId;
            const cpuData = processCpuGames(newTeams, newSchedule, newPlayoffSeries, currentSimDate, excludeGameId, session?.user?.id);
            
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
                    const seasonEvents = await handleSeasonEvents(newTeams, newSchedule, newPlayoffSeries, currentSimDate, myTeamId, session?.user?.id, isGuestMode, tendencySeed);

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

                    // 시즌/플레이오프 리뷰 메시지 자동 발송
                    await sendReviewMessages(
                        prevScheduleSnapshot as any, newSchedule, prevFinishedSeriesIds,
                        newPlayoffSeries, newTeams, currentSimDate, transactions
                    );

                    // Commit State Updates
                    setTeams(newTeams);
                    setSchedule(newSchedule);
                    setPlayoffSeries(newPlayoffSeries);

                    // Invalidate player game log cache
                    queryClient.invalidateQueries({ queryKey: ['playerGameLog'] });

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
                        cpuResults: cpuData.cpuResults,
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

                // 비경기일 체력 회복 (모든 팀 선수)
                applyRestDayRecovery(newTeams);

                // Handle Season Events
                const seasonEvents = await handleSeasonEvents(newTeams, newSchedule, newPlayoffSeries, currentSimDate, myTeamId, session?.user?.id, isGuestMode, tendencySeed);

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

                // 시즌/플레이오프 리뷰 메시지 자동 발송
                await sendReviewMessages(
                    prevScheduleSnapshot as any, newSchedule, prevFinishedSeriesIds,
                    newPlayoffSeries, newTeams, currentSimDate, transactions
                );

                // Commit Updates
                setTeams(newTeams);
                setSchedule(newSchedule);
                setPlayoffSeries(newPlayoffSeries);

                // Advance Date
                const d = new Date(currentSimDate);
                d.setDate(d.getDate() + 1);
                const nextDate = d.toISOString().split('T')[0];

                // 리그 일정에서 참관 요청 시 — 날짜 진행 보류, LiveGameView에서 경기 진행
                if (spectateGameId) {
                    const spectateGame = newSchedule.find(g => g.id === spectateGameId);
                    if (spectateGame) {
                        const home = newTeams.find(t => t.id === spectateGame.homeTeamId);
                        const away = newTeams.find(t => t.id === spectateGame.awayTeamId);
                        if (home && away) {
                            setSpectateTarget({ homeTeam: home, awayTeam: away, spectateGame, nextDate });
                        }
                    }
                } else {
                    // 일반 휴식일: 즉시 날짜 진행
                    advanceDate(nextDate, {});
                    if (!isGuestMode) {
                        await forceSave({ currentSimDate: nextDate, teams: newTeams, schedule: newSchedule, withSnapshot: true });
                    }
                }

                setIsSimulating(false);
            }

        } catch (e) {
            console.error("Simulation Error:", e);
            setIsSimulating(false);
            setToastMessage("시뮬레이션 중 오류가 발생했습니다.");
        }
    }, [teams, schedule, myTeamId, currentSimDate, isSimulating, isGuestMode, session, depthChart, playoffSeries, tendencySeed, transactions, sendReviewMessages]);

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
                if (cpuData.playoffResultsToSave.length > 0) {
                    await Promise.all(cpuData.playoffResultsToSave.map(res => savePlayoffGameResult(res as any)));
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
            // Capture "before" state for review message detection
            const prevScheduleSnapshot = schedule.map(g => ({ id: g.id, played: g.played, isPlayoff: g.isPlayoff }));
            const prevFinishedSeriesIds = new Set(
                playoffSeries.filter(s => s.finished && (s.higherSeedId === myTeamId || s.lowerSeedId === myTeamId)).map(s => s.id)
            );

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
                newTeams, newSchedule, newPlayoffSeries, currentSimDate, myTeamId, session?.user?.id, isGuestMode, tendencySeed
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

            // 시즌/플레이오프 리뷰 메시지 자동 발송
            await sendReviewMessages(
                prevScheduleSnapshot as any, newSchedule, prevFinishedSeriesIds,
                newPlayoffSeries, newTeams, currentSimDate, transactions
            );

            // 상태 반영
            setTeams(newTeams);
            setSchedule(newSchedule);
            setPlayoffSeries(newPlayoffSeries);

            // Invalidate player game log cache
            queryClient.invalidateQueries({ queryKey: ['playerGameLog'] });

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
        refreshUnreadCount, setTeams, setSchedule, setPlayoffSeries, setTransactions, setNews, setToastMessage, transactions, sendReviewMessages]);

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
        loadSavedGameResult,
        // Spectate
        spectateTarget,
        clearSpectateTarget,
        finalizeSpectateGame,
    };
};
