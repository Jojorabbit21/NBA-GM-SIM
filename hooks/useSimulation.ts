
import { useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Team, Game, PlayoffSeries, Transaction, GameTactics, SimulationResult, DepthChart } from '../types';
import { LeagueCoachingData } from '../types/coaching';
import { LeaguePickAssets } from '../types/draftAssets';
import { LeagueTradeBlocks, LeagueTradeOffers } from '../types/trade';
import { LeagueGMProfiles } from '../types/gm';
import { SimSettings } from '../types/simSettings';
import { applyTradeSimSettings } from '../services/tradeEngine/tradeConfig';
import { processCpuGames } from '../services/simulation/cpuGameService';
import { runUserSimulation, applyUserGameResult, processInjuryRecovery, computeReturnDate } from '../services/simulation/userGameService';
import { handleSeasonEvents } from '../services/simulation/seasonService';
import { detectFinalsEnd, dispatchOffseasonEvent, checkProspectReveal } from '../services/simulation/offseasonEventHandler';
import { mapRawPlayerToRuntimePlayer } from '../services/dataMapper';
import { OffseasonPhase } from '../types/app';
import { archiveCurrentSeason, updateSeasonArchiveLottery } from '../services/seasonArchive';
import { insertDraftClass } from '../services/draft/rookieRepository';
import { saveGameResults } from '../services/queries';
import { savePlayoffGameResult, fetchPlayoffSeriesResults } from '../services/playoffService';
import { applyRestDayRecovery } from '../services/game/engine/fatigueSystem';
import { CpuGameResult } from '../services/simulationService';
import { applyBoxToRoster, updateTeamStats, sumTeamBoxScore, extractQuarterScores } from '../utils/simulationUtils';
import { sendMessage, hasMessageOfType } from '../services/messageService';
import { calculatePlayerOvr } from '../utils/constants';
import { buildSeasonReviewContent, buildPlayoffStageContent, buildOwnerLetterContent, buildPlayoffOwnerLetterContent, aggregateSeriesBoxScores, selectFinalsMvp, buildPlayoffChampionContent, computeAllTeamsStats, buildRosterStats, maybeSendScoutReport } from '../services/reportGenerator';
import { calculateHallOfFameScore, createRosterSnapshot, maskEmail } from '../utils/hallOfFameScorer';
import { submitHallOfFameEntry, checkUserHasSubmitted } from '../services/hallOfFameService';
import { HofQualificationContent, FinalsMvpContent, ProspectRevealContent } from '../types/message';
import { stampPlayoffAwards } from '../utils/awardStamper';
import { SeasonConfig, DEFAULT_SEASON_CONFIG } from '../utils/seasonConfig';

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
    tendencySeed?: string,
    hofId?: string | null,
    onHofSubmitted?: () => void,
    simSettings?: SimSettings,
    coachingData?: LeagueCoachingData | null,
    leagueTradeBlocks?: LeagueTradeBlocks,
    setLeagueTradeBlocks?: React.Dispatch<React.SetStateAction<LeagueTradeBlocks>>,
    leagueTradeOffers?: LeagueTradeOffers,
    leaguePickAssets?: LeaguePickAssets | null,
    leagueGMProfiles?: LeagueGMProfiles,
    seasonConfig?: SeasonConfig,
    lotteryResult?: any | null,
    setLotteryResult?: (result: any) => void,
    offseasonPhase?: OffseasonPhase,
    setOffseasonPhase?: (phase: OffseasonPhase) => void,
    onOffseasonEvent?: (view: string) => void,
    prospects?: any[],
    setProspects?: React.Dispatch<React.SetStateAction<any[]>>,
) => {
    const seasonShort = seasonConfig?.seasonShort ?? DEFAULT_SEASON_CONFIG.seasonShort;
    const queryClient = useQueryClient();
    const [isSimulating, setIsSimulating] = useState(false);
    const [simProgress, setSimProgress] = useState<{ percent: number; label: string } | null>(null);
    const [activeGame, setActiveGame] = useState<Game | null>(null);
    const [lastGameResult, setLastGameResult] = useState<any | null>(null);
    const [tempSimulationResult, setTempSimulationResult] = useState<SimulationResult | null>(null);

    const finalizeSimRef = useRef<(() => void) | undefined>(undefined);
    const isFinalizingRef = useRef(false); // 재진입 방지 가드

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
                (newSchedule[gameIdx] as any).homeStats = sumTeamBoxScore(result.homeBox);
                (newSchedule[gameIdx] as any).awayStats = sumTeamBoxScore(result.awayBox);
            }

            // DB 저장
            if (!isGuestMode && session?.user?.id) {
                const qs = result.pbpLogs?.length
                    ? extractQuarterScores(result.pbpLogs, spectateGame.homeTeamId, result.homeScore, result.awayScore)
                    : undefined;
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
                    ...(qs && { quarter_scores: qs }),
                    ...(seasonConfig?.seasonLabel && { season: seasonConfig.seasonLabel }),
                }]);
            }

            // 상태 커밋
            setTeams(newTeams);
            setSchedule(newSchedule);

            // Invalidate player game log cache
            queryClient.invalidateQueries({ queryKey: ['playerGameLog'] });

            // 날짜 진행
            advanceDate(nextDate, {});
            setSpectateTarget(null);

            // 저장은 UI 해제 후 백그라운드 (fire-and-forget)
            if (!isGuestMode) {
                forceSave({ currentSimDate: nextDate, teams: newTeams, schedule: newSchedule, withSnapshot: true });
            }
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
            const alreadySent = await hasMessageOfType(userId, myTeamId, 'SEASON_REVIEW');
            if (!alreadySent) {
                const nextDay = new Date(date);
                nextDay.setDate(nextDay.getDate() + 1);
                const reviewDate = nextDay.toISOString().split('T')[0];
                const content = buildSeasonReviewContent(myTeam, newTeams, allTransactions, newSchedule);
                await sendMessage(userId, myTeamId, reviewDate, 'SEASON_REVIEW', `[시즌 보고서] ${seasonShort} 정규시즌 리뷰`, content);
                const ownerLetter = buildOwnerLetterContent(myTeam, newTeams, newSchedule);
                await sendMessage(userId, myTeamId, reviewDate, 'OWNER_LETTER', `[서신] ${ownerLetter.title}`, ownerLetter);
                refreshUnreadCount();
            }
        }

        // 플레이오프 스테이지 종료 감지
        const newlyFinished = newPlayoffSeries.filter(s =>
            s.finished &&
            (s.higherSeedId === myTeamId || s.lowerSeedId === myTeamId) &&
            !prevFinishedSeriesIds.has(s.id)
        );

        for (const series of newlyFinished) {
            const content = buildPlayoffStageContent(myTeam, newTeams, series, newSchedule, newPlayoffSeries);
            // Fetch series game results and aggregate box scores
            if (userId && userId !== 'guest') {
                const seriesResults = await fetchPlayoffSeriesResults(series.id, userId);
                if (seriesResults.length > 0) {
                    content.seriesPlayerStats = aggregateSeriesBoxScores(seriesResults, myTeamId);
                }
            }
            const roundName = content.roundName;
            await sendMessage(userId, myTeamId, date, 'PLAYOFF_STAGE_REVIEW', `[플레이오프 보고서] ${roundName}`, content);
            // 탈락 또는 우승 시 구단주 서신 발송
            if (content.isFinalStage) {
                const ownerLetter = buildPlayoffOwnerLetterContent(myTeam, content.result, series.round);
                await sendMessage(userId, myTeamId, date, 'OWNER_LETTER', `[서신] ${ownerLetter.title}`, ownerLetter);
            }
            // 파이널(round 4) 우승/준우승 시 명예의 전당 자동 등록
            if (content.isFinalStage && series.round === 4 && !isGuestMode && hofId) {
                const alreadySubmitted = await checkUserHasSubmitted(hofId);
                if (!alreadySubmitted) {
                    const { totalScore, breakdown } = calculateHallOfFameScore(
                        myTeam, newTeams, allTransactions, newSchedule, newPlayoffSeries
                    );
                    const roster = createRosterSnapshot(myTeam);
                    const email = session?.user?.email ? maskEmail(session.user.email) : undefined;
                    const hofResult = await submitHallOfFameEntry(userId, myTeamId, hofId, totalScore, breakdown, roster, email);
                    if (hofResult.success || hofResult.alreadySubmitted) {
                        onHofSubmitted?.();
                        const totalGames = myTeam.wins + myTeam.losses || 82;
                        const hofContent: HofQualificationContent = {
                            result: content.result, round: 4,
                            teamId: myTeamId,
                            teamName: myTeam.name, totalScore,
                            breakdown: { season_score: breakdown.season_score, ptDiff_score: breakdown.ptDiff_score, stat_score: breakdown.stat_score, playoff_score: breakdown.playoff_score },
                            conference: myTeam.conference || '',
                            wins: myTeam.wins,
                            losses: myTeam.losses,
                            pct: (myTeam.wins / totalGames).toFixed(3).replace(/^0/, ''),
                            allTeamsStats: computeAllTeamsStats(newTeams, newSchedule),
                            rosterStats: buildRosterStats(myTeam),
                        };
                        const hofTitle = content.result === 'WON' ? '[명예의 전당] 챔피언십 우승' : '[명예의 전당] 파이널 준우승';
                        await sendMessage(userId, myTeamId, date, 'HOF_QUALIFICATION', hofTitle, hofContent);
                    }
                }
            }
            // 파이널 MVP 뉴스 기사 발송 + 플레이오프 우승 보고서
            if (series.round === 4 && series.winnerId) {
                let finalsMvpPlayerId: string | undefined;
                if (userId && userId !== 'guest') {
                    const seriesResultsForMvp = await fetchPlayoffSeriesResults(series.id, userId);
                    if (seriesResultsForMvp.length > 0) {
                        const mvpResult = selectFinalsMvp(seriesResultsForMvp, series.winnerId);
                        if (mvpResult) {
                            finalsMvpPlayerId = mvpResult.mvp.playerId;
                            const winnerTeam = newTeams.find(t => t.id === series.winnerId);
                            const loserId = series.winnerId === series.higherSeedId ? series.lowerSeedId : series.higherSeedId;
                            const loserTeam = newTeams.find(t => t.id === loserId);
                            const winnerWins = series.winnerId === series.higherSeedId ? series.higherSeedWins : series.lowerSeedWins;
                            const loserWins = series.winnerId === series.higherSeedId ? series.lowerSeedWins : series.higherSeedWins;
                            const fmvpContent: FinalsMvpContent = {
                                mvpPlayerId: mvpResult.mvp.playerId,
                                mvpPlayerName: mvpResult.mvp.playerName,
                                mvpTeamId: series.winnerId,
                                mvpTeamName: winnerTeam?.name || 'Unknown',
                                opponentTeamId: loserId,
                                opponentTeamName: loserTeam?.name || 'Unknown',
                                seriesScore: `${winnerWins}-${loserWins}`,
                                stats: mvpResult.mvp,
                                leaderboard: mvpResult.leaderboard,
                            };
                            await sendMessage(userId, myTeamId, date, 'FINALS_MVP', `[속보] 파이널 MVP 발표`, fmvpContent);
                        }
                    }
                    // 플레이오프 우승 보고서
                    const champTeam = newTeams.find(t => t.id === series.winnerId);
                    if (champTeam) {
                        const champContent = buildPlayoffChampionContent(champTeam, newTeams, newSchedule, newPlayoffSeries);
                        await sendMessage(userId, myTeamId, date, 'PLAYOFF_CHAMPION',
                            `[속보] ${seasonShort} 플레이오프 우승: ${champTeam.name}`, champContent);
                    }
                }
                // ★ 챔피언 + 파이널 MVP stamp (게스트 포함)
                stampPlayoffAwards(newTeams, seasonShort, series.winnerId, finalsMvpPlayerId);
            }
            refreshUnreadCount();
        }
    }, [session, myTeamId, refreshUnreadCount, hofId, isGuestMode, onHofSubmitted]);

    // UI 렌더링 기회를 주는 마이크로 yield
    const yieldToUI = () => new Promise<void>(r => setTimeout(r, 0));

    const handleExecuteSim = useCallback(async (userTactics: GameTactics, skipAnimation: boolean = false, spectateGameId?: string) => {
        if (isSimulating || !myTeamId) return;
        setIsSimulating(true);
        setSimProgress({ percent: 5, label: '준비 중...' });
        await yieldToUI();

        try {
            const _t0 = performance.now();
            const _perf: Record<string, number> = {};

            // Apply trade settings from simSettings
            if (simSettings) applyTradeSimSettings(simSettings);

            // 1. Identify User's Game
            const userGame = schedule.find(g =>
                !g.played &&
                g.date === currentSimDate &&
                (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId)
            );

            // Capture "before" state for review message detection
            const prevScheduleSnapshot = schedule.map(g => ({ id: g.id, played: g.played, isPlayoff: g.isPlayoff, homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId }));
            const prevFinishedSeriesIds = new Set(
                playoffSeries.filter(s => s.finished && (s.higherSeedId === myTeamId || s.lowerSeedId === myTeamId)).map(s => s.id)
            );

            _perf['1_findGame+snapshots'] = performance.now() - _t0;

            // 2. Prepare mutable clones for the pipeline
            let _t1 = performance.now();
            let newTeams: Team[] = JSON.parse(JSON.stringify(teams));
            let newSchedule: Game[] = JSON.parse(JSON.stringify(schedule));
            let newPlayoffSeries: PlayoffSeries[] = JSON.parse(JSON.stringify(playoffSeries));
            _perf['2_deepClone'] = performance.now() - _t1;

            // 2.5. 부상 복귀 체크
            setSimProgress({ percent: 10, label: '부상 체크...' });
            await yieldToUI();
            _t1 = performance.now();
            const recoveredPlayers = processInjuryRecovery(newTeams, currentSimDate, myTeamId);
            if (recoveredPlayers.length > 0 && !isGuestMode && session?.user?.id) {
                for (const rec of recoveredPlayers) {
                    await sendMessage(session.user.id, myTeamId, currentSimDate, 'INJURY_REPORT',
                        `[복귀 보고] ${rec.playerName} — 훈련 복귀`,
                        {
                            playerId: rec.playerId,
                            playerName: rec.playerName,
                            injuryType: rec.injuryType,
                            severity: 'Minor',
                            duration: '',
                            returnDate: currentSimDate,
                            isRecovery: true,
                        }
                    );
                }
                refreshUnreadCount();
            }
            _perf['3_injuryRecovery'] = performance.now() - _t1;

            // 3. Process CPU Games (참관 경기는 제외 — LiveGameView에서 실시간 진행)
            setSimProgress({ percent: 25, label: 'CPU 경기 처리...' });
            await yieldToUI();
            _t1 = performance.now();
            const excludeGameId = userGame?.id || spectateGameId;
            const cpuData = processCpuGames(newTeams, newSchedule, newPlayoffSeries, currentSimDate, excludeGameId, session?.user?.id, tendencySeed, simSettings, coachingData, seasonConfig?.seasonLabel);
            _perf['4_cpuGames(' + cpuData.gameResultsToSave.length + '+' + cpuData.playoffResultsToSave.length + ')'] = performance.now() - _t1;

            // [Fix] Save CPU Game Results to DB
            setSimProgress({ percent: 40, label: '결과 저장...' });
            await yieldToUI();
            _t1 = performance.now();
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
            _perf['5_saveCpuResults'] = performance.now() - _t1;

            // 4. Handle User Game
            if (userGame) {
                // Run Simulation (Pure Logic)
                setSimProgress({ percent: 55, label: '경기 시뮬레이션...' });
                await yieldToUI();
                _t1 = performance.now();
                const result = runUserSimulation(userGame, newTeams, newSchedule, myTeamId, userTactics, currentSimDate, depthChart, tendencySeed, simSettings, coachingData);
                _perf['6_userSimulation'] = performance.now() - _t1;

                setTempSimulationResult(result);

                // [UX Fix] Do NOT set activeGame if skipping animation to prevent flickering to Sim View.
                if (!skipAnimation) {
                    setActiveGame(userGame);
                }

                // Finalize Function (Called after animation or immediately)
                finalizeSimRef.current = async () => {
                    if (isFinalizingRef.current) return;
                    isFinalizingRef.current = true;
                    try {
                    const _ft0 = performance.now();
                    const _fPerf: Record<string, number> = {};

                    // Apply Results (Mutates newTeams/Schedule/Playoffs)
                    setSimProgress({ percent: 65, label: '결과 반영...' });
                    await yieldToUI();
                    let _ft1 = performance.now();
                    await applyUserGameResult(
                        result, userGame, newTeams, newSchedule, newPlayoffSeries,
                        currentSimDate, session?.user?.id, myTeamId, userTactics, isGuestMode, refreshUnreadCount,
                        tendencySeed, simSettings, seasonConfig?.seasonLabel,
                    );
                    _fPerf['1_applyUserGameResult'] = performance.now() - _ft1;

                    // 5. Handle Season Events (Playoffs, Trades) - Post Game
                    setSimProgress({ percent: 80, label: '시즌 이벤트...' });
                    await yieldToUI();
                    _ft1 = performance.now();
                    const seasonEvents = await handleSeasonEvents(newTeams, newSchedule, newPlayoffSeries, currentSimDate, myTeamId, session?.user?.id, isGuestMode, tendencySeed, leagueTradeBlocks, leaguePickAssets ?? undefined, leagueTradeOffers, leagueGMProfiles, seasonConfig);
                    _fPerf['2_seasonEvents'] = performance.now() - _ft1;

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

                    // CPU 트레이드 블록 변경을 React 상태에 반영
                    if (leagueTradeBlocks && setLeagueTradeBlocks) {
                        setLeagueTradeBlocks({ ...leagueTradeBlocks });
                    }

                    // 시즌/플레이오프 리뷰 메시지 자동 발송
                    _ft1 = performance.now();
                    await sendReviewMessages(
                        prevScheduleSnapshot as any, newSchedule, prevFinishedSeriesIds,
                        newPlayoffSeries, newTeams, currentSimDate, transactions
                    );
                    _fPerf['3_reviewMessages'] = performance.now() - _ft1;

                    // 월간 스카우트 보고서 (월 경계 감지)
                    _ft1 = performance.now();
                    if (!isGuestMode && session?.user?.id) {
                        const nd = new Date(currentSimDate);
                        nd.setDate(nd.getDate() + 1);
                        const nextDateStr = nd.toISOString().split('T')[0];
                        if (new Date(currentSimDate).getMonth() !== new Date(nextDateStr).getMonth()) {
                            await maybeSendScoutReport(newTeams, myTeamId, session.user.id, currentSimDate, refreshUnreadCount);
                        }
                    }
                    _fPerf['4_scoutReport'] = performance.now() - _ft1;

                    // Commit State Updates
                    setSimProgress({ percent: 95, label: '마무리...' });
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

                    _fPerf['TOTAL'] = performance.now() - _ft0;
                    console.log(`[PERF] finalizeSim (${currentSimDate})`, Object.entries(_fPerf).map(([k, v]) => `${k}: ${v.toFixed(1)}ms`).join(' | '));
                    } finally {
                        isFinalizingRef.current = false;
                    }
                };

                _perf['TOTAL_preFinalize'] = performance.now() - _t0;
                console.log(`[PERF] handleExecuteSim:GAME (${currentSimDate})`, Object.entries(_perf).map(([k, v]) => `${k}: ${v.toFixed(1)}ms`).join(' | '));

                if (skipAnimation) {
                    await finalizeSimRef.current();
                    setSimProgress(null);
                    setIsSimulating(false);
                }

            } else {
                // No User Game - Advance Day Only

                // 비경기일 체력 회복 + 훈련 중 부상 체크
                setSimProgress({ percent: 20, label: '훈련 진행...' });
                await yieldToUI();
                _t1 = performance.now();
                const injuriesOn = simSettings?.injuriesEnabled ?? false;
                const injFreq = injuriesOn ? (simSettings?.injuryFrequency ?? 1.0) : 0;
                const trainingInjuries = applyRestDayRecovery(newTeams, injFreq);

                // 훈련 부상 returnDate 변환 + 히스토리 기록 + 메시지 전송
                for (const ti of trainingInjuries) {
                    const injured = newTeams.flatMap(t => t.roster).find(p => p.id === ti.playerId);
                    if (injured) {
                        injured.returnDate = computeReturnDate(currentSimDate, ti.duration);
                        // 부상 히스토리 기록
                        if (!injured.injuryHistory) injured.injuryHistory = [];
                        injured.injuryHistory.push({
                            injuryType: ti.injuryType,
                            severity: ti.severity,
                            duration: ti.duration,
                            date: currentSimDate,
                            returnDate: injured.returnDate,
                            isTraining: true,
                        });
                    }
                    if (ti.teamId === myTeamId && session?.user?.id && !isGuestMode) {
                        await sendMessage(session.user.id, myTeamId, currentSimDate, 'INJURY_REPORT',
                            `[부상 보고] ${ti.playerName} — ${ti.injuryType} (훈련 중)`,
                            {
                                playerId: ti.playerId,
                                playerName: ti.playerName,
                                injuryType: ti.injuryType,
                                severity: ti.severity,
                                duration: ti.duration,
                                returnDate: computeReturnDate(currentSimDate, ti.duration),
                                isTrainingInjury: true,
                            }
                        );
                    }
                }
                _perf['6_restDayRecovery'] = performance.now() - _t1;

                // Handle Season Events
                setSimProgress({ percent: 60, label: '시즌 이벤트...' });
                await yieldToUI();
                _t1 = performance.now();
                const seasonEvents = await handleSeasonEvents(newTeams, newSchedule, newPlayoffSeries, currentSimDate, myTeamId, session?.user?.id, isGuestMode, tendencySeed, leagueTradeBlocks, leaguePickAssets ?? undefined, leagueTradeOffers, leagueGMProfiles, seasonConfig);
                _perf['7_seasonEvents'] = performance.now() - _t1;

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

                // CPU 트레이드 블록 변경을 React 상태에 반영
                if (leagueTradeBlocks && setLeagueTradeBlocks) {
                    setLeagueTradeBlocks({ ...leagueTradeBlocks });
                }

                // 시즌/플레이오프 리뷰 메시지 자동 발송
                setSimProgress({ percent: 80, label: '보고서 생성...' });
                await yieldToUI();
                _t1 = performance.now();
                await sendReviewMessages(
                    prevScheduleSnapshot as any, newSchedule, prevFinishedSeriesIds,
                    newPlayoffSeries, newTeams, currentSimDate, transactions
                );
                _perf['8_reviewMessages'] = performance.now() - _t1;

                // ★ 파이널 종료 감지 → 오프시즌 진입
                const currentSeasonNumber = seasonConfig?.seasonNumber ?? 1;
                const finalsDetection = detectFinalsEnd(newPlayoffSeries, offseasonPhase ?? null);
                if (finalsDetection.fired && finalsDetection.updates?.offseasonPhase) {
                    // 현재 시즌 아카이브
                    const myTeam = newTeams.find(t => t.id === myTeamId);
                    if (!isGuestMode && session?.user?.id && myTeam && seasonConfig) {
                        archiveCurrentSeason(session.user.id, seasonConfig, myTeam, newTeams, newPlayoffSeries)
                            .catch(e => console.warn('⚠️ Season archive failed (non-critical):', e));
                    }
                    setOffseasonPhase?.(finalsDetection.updates.offseasonPhase);
                }

                // Commit Updates
                setSimProgress({ percent: 95, label: '마무리...' });
                setTeams(newTeams);
                setSchedule(newSchedule);
                setPlayoffSeries(newPlayoffSeries);

                // Advance Date
                const d = new Date(currentSimDate);
                d.setDate(d.getDate() + 1);
                const nextDate = d.toISOString().split('T')[0];

                // 월간 스카우트 보고서 (월 경계 감지)
                _t1 = performance.now();
                if (!isGuestMode && session?.user?.id) {
                    if (new Date(currentSimDate).getMonth() !== new Date(nextDate).getMonth()) {
                        await maybeSendScoutReport(newTeams, myTeamId, session.user.id, currentSimDate, refreshUnreadCount);
                    }
                }
                _perf['9_scoutReport'] = performance.now() - _t1;

                // ★ 인시즌: 드래프트 풀 공개 감지
                if (seasonConfig?.keyDates && (offseasonPhase ?? null) === null) {
                    const prospectResult = await checkProspectReveal({
                        currentDate: nextDate,
                        prospectRevealDate: seasonConfig.keyDates.prospectReveal,
                        currentSeasonNumber,
                        tendencySeed: tendencySeed || '',
                        userId: session?.user?.id,
                        hasProspects: (prospects?.length ?? 0) > 0,
                    });
                    if (prospectResult.fired && prospectResult.updates?.generatedDraftClass) {
                        const dc = prospectResult.updates.generatedDraftClass;
                        // GeneratedPlayerRow[] → Player[] 변환
                        const players = dc.map(row => mapRawPlayerToRuntimePlayer(row));
                        setProspects?.(players);
                        if (!isGuestMode) {
                            insertDraftClass(dc)
                                .catch(e => console.warn('⚠️ Prospect class insert failed (non-critical):', e));
                        }

                        // 인박스 메시지: 드래프트 풀 공개 알림
                        if (!isGuestMode && session?.user?.id && myTeamId) {
                            // OVR을 한 번만 계산하여 재사용
                            const withOvr = players.map(p => ({ player: p, ovr: calculatePlayerOvr(p) }));
                            withOvr.sort((a, b) => b.ovr - a.ovr);
                            const top10 = withOvr.slice(0, 10).map((e, i) => ({
                                rank: i + 1,
                                name: e.player.name,
                                position: e.player.position,
                                age: e.player.age,
                                ovr: e.ovr,
                                height: e.player.height,
                            }));
                            const avgOvr = withOvr.reduce((s, e) => s + e.ovr, 0) / withOvr.length;
                            const classGrade = avgOvr >= 68 ? '풍작' : avgOvr >= 62 ? '보통' : '흉작';
                            const nextSeason = currentSeasonNumber + 1;
                            const draftSeasonLabel = seasonConfig?.seasonLabel || `${nextSeason}년`;

                            const prospectContent: ProspectRevealContent = {
                                teamId: myTeamId,
                                draftYear: nextSeason,
                                classGrade,
                                totalCount: players.length,
                                top10,
                            };

                            sendMessage(
                                session.user.id,
                                myTeamId,
                                nextDate,
                                'PROSPECT_REVEAL',
                                `[스카우팅] ${draftSeasonLabel} 드래프트 클래스 보고서`,
                                prospectContent,
                            ).then(() => refreshUnreadCount())
                             .catch(e => console.warn('⚠️ Prospect reveal message failed:', e));
                        }
                    }
                }

                // ★ 오프시즌 Key Date 이벤트 디스패처
                const currentPhase = finalsDetection.updates?.offseasonPhase ?? offseasonPhase ?? null;
                if (currentPhase !== null && seasonConfig?.keyDates) {
                    const offseasonEvent = await dispatchOffseasonEvent({
                        currentDate: nextDate,
                        keyDates: seasonConfig.keyDates,
                        offseasonPhase: currentPhase,
                        teams: newTeams,
                        schedule: newSchedule,
                        playoffSeries: newPlayoffSeries,
                        currentSeasonNumber,
                        tendencySeed: tendencySeed || '',
                        userId: session?.user?.id,
                        userTeamId: myTeamId || undefined,
                        hasProspects: (prospects?.length ?? 0) > 0,
                    });

                    if (offseasonEvent.fired && offseasonEvent.updates) {
                        const u = offseasonEvent.updates;
                        if (u.offseasonPhase !== undefined) setOffseasonPhase?.(u.offseasonPhase);

                        // openingNight 핸들러 결과: 새 시즌 시작
                        if (u.newSchedule && u.newSeasonNumber && u.newSeasonConfig) {
                            newSchedule = u.newSchedule;
                            newPlayoffSeries = [];
                            setTeams([...newTeams]);
                            setSchedule(newSchedule);
                            setPlayoffSeries([]);
                            advanceDate(nextDate, {
                                seasonNumber: u.newSeasonNumber,
                                currentSeason: u.newSeasonConfig.seasonLabel,
                            });
                            setSimProgress(null);
                            setIsSimulating(false);
                            if (!isGuestMode) {
                                forceSave({
                                    currentSimDate: nextDate,
                                    teams: newTeams,
                                    schedule: newSchedule,
                                    withSnapshot: false,
                                    seasonNumber: u.newSeasonNumber,
                                    currentSeason: u.newSeasonConfig.seasonLabel,
                                    offseasonPhase: u.offseasonPhase,
                                    lotteryResult: u.lotteryResult || null,
                                });
                            }
                            return;
                        }

                        // blocking 이벤트 (draftLottery 등): 뷰 전환 후 중단
                        if (offseasonEvent.blocked && offseasonEvent.navigateTo) {
                            advanceDate(nextDate, {});
                            if (u.lotteryResult) setLotteryResult?.(u.lotteryResult);
                            setSimProgress(null);
                            setIsSimulating(false);
                            if (!isGuestMode) {
                                forceSave({
                                    currentSimDate: nextDate,
                                    teams: newTeams,
                                    schedule: newSchedule,
                                    withSnapshot: true,
                                    offseasonPhase: u.offseasonPhase,
                                    lotteryResult: u.lotteryResult || null,
                                });
                                // 로터리 결과를 시즌 아카이브에도 기록
                                if (u.lotteryResult && session?.user?.id && seasonConfig) {
                                    updateSeasonArchiveLottery(session.user.id, seasonConfig.seasonLabel, u.lotteryResult)
                                        .catch(e => console.warn('⚠️ Lottery archive update failed (non-critical):', e));
                                }
                            }
                            onOffseasonEvent?.(offseasonEvent.navigateTo);
                            return;
                        }

                        // moratoriumStart 결과: 에이징/은퇴/계약만료/옵션 처리
                        if (u.offseasonProcessed) {
                            setTeams([...newTeams]); // roster mutation 반영
                            // 인박스 발송: 유저팀 변동 + 리그 전체 은퇴
                            if (!isGuestMode && session?.user?.id && myTeamId) {
                                const op = u.offseasonProcessed;
                                const myRetired = op.retiredPlayers.filter(p => p.teamId === myTeamId);
                                const myExpired = op.expiredPlayers.filter(p => p.teamId === myTeamId);
                                const myOptions = op.optionDecisions.filter(p => p.teamId === myTeamId);
                                const leagueRetired = op.retiredPlayers.filter(p => p.teamId !== myTeamId);
                                const myPendingTeamOptions = op.pendingTeamOptions;

                                if (myRetired.length > 0 || myExpired.length > 0 || myOptions.length > 0 || leagueRetired.length > 0 || myPendingTeamOptions.length > 0) {
                                    const reportContent = {
                                        retired: myRetired.map(p => ({ playerId: p.playerId, playerName: p.playerName, age: p.age, ovr: p.ovr, position: p.position })),
                                        expired: myExpired.map(p => ({ playerId: p.playerId, playerName: p.playerName, age: p.age, ovr: p.ovr, position: p.position, lastSalary: p.lastSalary })),
                                        optionDecisions: myOptions.map(p => ({ playerId: p.playerId, playerName: p.playerName, optionType: p.optionType, exercised: p.exercised, salary: p.salary })),
                                        leagueRetired: leagueRetired.map(p => ({ playerId: p.playerId, playerName: p.playerName, age: p.age, ovr: p.ovr, position: p.position, teamId: p.teamId })),
                                        pendingTeamOptions: myPendingTeamOptions.length > 0
                                            ? myPendingTeamOptions.map(p => ({ playerId: p.playerId, playerName: p.playerName, ovr: p.ovr, position: p.position, age: p.age, salary: p.salary }))
                                            : undefined,
                                    };
                                    sendMessage(session.user.id, myTeamId, nextDate, 'OFFSEASON_REPORT', '오프시즌 로스터 변동 보고서', reportContent)
                                        .then(() => refreshUnreadCount())
                                        .catch(e => console.warn('⚠️ Offseason report message failed:', e));
                                }
                            }
                        }

                        // 생성된 드래프트 클래스를 DB에 저장
                        if (u.generatedDraftClass && u.generatedDraftClass.length > 0 && !isGuestMode) {
                            insertDraftClass(u.generatedDraftClass)
                                .catch(e => console.warn('⚠️ Draft class insert failed (non-critical):', e));
                        }

                        // 비-blocking 이벤트: phase 업데이트만 저장
                        if (u.offseasonPhase !== undefined && !isGuestMode) {
                            forceSave({
                                offseasonPhase: u.offseasonPhase,
                                teams: u.offseasonProcessed ? newTeams : undefined,
                                withSnapshot: !!u.offseasonProcessed,
                            });
                        }
                    }
                }

                // 리그 일정에서 참관 요청 시 — 날짜 진행 보류, LiveGameView에서 경기 진행
                _t1 = performance.now();
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
                }
                _perf['10_advanceDate'] = performance.now() - _t1;

                _perf['TOTAL'] = performance.now() - _t0;
                console.log(`[PERF] handleExecuteSim:REST (${currentSimDate})`, Object.entries(_perf).map(([k, v]) => `${k}: ${v.toFixed(1)}ms`).join(' | '));

                setSimProgress(null);
                setIsSimulating(false);

                // 저장은 UI 해제 후 백그라운드 (fire-and-forget)
                if (!isGuestMode && !spectateGameId) {
                    forceSave({ currentSimDate: nextDate, teams: newTeams, schedule: newSchedule, withSnapshot: true });
                }
            }

        } catch (e) {
            console.error("Simulation Error:", e);
            setSimProgress(null);
            setIsSimulating(false);
            setToastMessage("시뮬레이션 중 오류가 발생했습니다.");
        }
    }, [teams, schedule, myTeamId, currentSimDate, isSimulating, isGuestMode, session, depthChart, playoffSeries, tendencySeed, transactions, sendReviewMessages, simSettings]);

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
        setSimProgress({ percent: 5, label: '준비 중...' });
        await yieldToUI();

        try {
            if (simSettings) applyTradeSimSettings(simSettings);

            const userGame = schedule.find(g =>
                !g.played &&
                g.date === currentSimDate &&
                (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId)
            );
            if (!userGame) {
                setSimProgress(null);
                setIsSimulating(false);
                return;
            }

            let newTeams: Team[] = JSON.parse(JSON.stringify(teams));
            let newSchedule: Game[] = [...schedule];
            let newPlayoffSeries: PlayoffSeries[] = [...playoffSeries];

            setSimProgress({ percent: 30, label: 'CPU 경기 처리...' });
            await yieldToUI();
            const cpuData = processCpuGames(
                newTeams, newSchedule, newPlayoffSeries, currentSimDate, userGame.id, session?.user?.id,
                tendencySeed, simSettings, undefined, seasonConfig?.seasonLabel,
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
            setSimProgress(null);
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
            setSimProgress(null);
            setIsSimulating(false);
            setToastMessage("라이브 경기 시작 중 오류가 발생했습니다.");
        }
    }, [teams, schedule, myTeamId, currentSimDate, isSimulating, isGuestMode, session, playoffSeries,
        setTeams, setSchedule, setToastMessage, simSettings]);

    const clearLiveGameTarget = () => {
        setLiveGameTarget(null);
        setIsSimulating(false);
    };

    // 라이브 경기 종료 후 전체 파이프라인 실행 (applyUserGameResult + seasonEvents + state commit)
    const finalizeLiveGame = useCallback(async (result: SimulationResult) => {
        if (!liveGameTarget || !myTeamId || isFinalizingRef.current) return;
        isFinalizingRef.current = true;
        const { userGame, cpuViewData, cpuResults, userTactics: liveUserTactics } = liveGameTarget;

        try {
            // Capture "before" state for review message detection
            const prevScheduleSnapshot = schedule.map(g => ({ id: g.id, played: g.played, isPlayoff: g.isPlayoff, homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId }));
            const prevFinishedSeriesIds = new Set(
                playoffSeries.filter(s => s.finished && (s.higherSeedId === myTeamId || s.lowerSeedId === myTeamId)).map(s => s.id)
            );

            let newTeams: Team[] = JSON.parse(JSON.stringify(teams));
            let newSchedule: Game[] = JSON.parse(JSON.stringify(schedule));
            let newPlayoffSeries: PlayoffSeries[] = JSON.parse(JSON.stringify(playoffSeries));

            // 경기 결과 적용 (스탯 누적, DB 저장, 메시지 전송)
            await applyUserGameResult(
                result, userGame, newTeams, newSchedule, newPlayoffSeries,
                currentSimDate, session?.user?.id, myTeamId, liveUserTactics, isGuestMode, refreshUnreadCount,
                tendencySeed, simSettings, seasonConfig?.seasonLabel,
            );

            // 시즌 이벤트 처리 (트레이드, 플레이오프 등)
            const seasonEvents = await handleSeasonEvents(
                newTeams, newSchedule, newPlayoffSeries, currentSimDate, myTeamId, session?.user?.id, isGuestMode, tendencySeed,
                leagueTradeBlocks, leaguePickAssets ?? undefined, leagueTradeOffers, leagueGMProfiles, seasonConfig
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

            // CPU 트레이드 블록 변경을 React 상태에 반영
            if (leagueTradeBlocks && setLeagueTradeBlocks) {
                setLeagueTradeBlocks({ ...leagueTradeBlocks });
            }

            // 시즌/플레이오프 리뷰 메시지 자동 발송
            await sendReviewMessages(
                prevScheduleSnapshot as any, newSchedule, prevFinishedSeriesIds,
                newPlayoffSeries, newTeams, currentSimDate, transactions
            );

            // 월간 스카우트 보고서 (월 경계 감지)
            if (!isGuestMode && session?.user?.id && myTeamId) {
                const nd = new Date(currentSimDate);
                nd.setDate(nd.getDate() + 1);
                const nextDateStr = nd.toISOString().split('T')[0];
                if (new Date(currentSimDate).getMonth() !== new Date(nextDateStr).getMonth()) {
                    await maybeSendScoutReport(newTeams, myTeamId, session.user.id, currentSimDate, refreshUnreadCount);
                }
            }

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
        } finally {
            isFinalizingRef.current = false;
        }
    }, [liveGameTarget, myTeamId, teams, schedule, playoffSeries, currentSimDate, session, isGuestMode,
        refreshUnreadCount, setTeams, setSchedule, setPlayoffSeries, setTransactions, setNews, setToastMessage, transactions, sendReviewMessages, simSettings]);

    return {
        handleExecuteSim,
        handleStartLiveGame,
        finalizeLiveGame,
        liveGameTarget,
        clearLiveGameTarget,
        isSimulating,
        setIsSimulating,
        simProgress,
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
