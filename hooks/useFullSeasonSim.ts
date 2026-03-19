/**
 * 시즌 전체 시뮬레이션 훅 (테스트 전용)
 * 프로그레스 상태 관리 + 취소 토큰 + 배치 결과 커밋.
 */

import { useState, useRef, useCallback } from 'react';
import { Team, Game, PlayoffSeries, Transaction, GameTactics, DepthChart } from '../types';
import { LeagueCoachingData } from '../types/coaching';
import { SimSettings } from '../types/simSettings';
import { LeaguePickAssets } from '../types/draftAssets';
import { LeagueTradeBlocks, LeagueTradeOffers } from '../types/trade';
import { LeagueGMProfiles } from '../types/gm';
import { applyTradeSimSettings } from '../services/tradeEngine/tradeConfig';
import { runBatchSeason, BatchSeasonResult } from '../services/simulation/batchSeasonService';
import { bulkSaveGameResults } from '../services/queries';
import { savePlayoffState, savePlayoffGameResult } from '../services/playoffService';
import { bulkSendMessages, hasMessageOfType } from '../services/messageService';
import { buildSeasonReviewContent, buildOwnerLetterContent, selectFinalsMvp, buildPlayoffChampionContent, buildPlayoffStageContent, aggregateSeriesBoxScores, computeAllTeamsStats, buildRosterStats } from '../services/reportGenerator';
import { FinalsMvpContent } from '../types/message';
import { calculateHallOfFameScore, createRosterSnapshot, maskEmail } from '../utils/hallOfFameScorer';
import { submitHallOfFameEntry, checkUserHasSubmitted } from '../services/hallOfFameService';
import { HofQualificationContent } from '../types/message';
import { SeasonConfig, DEFAULT_SEASON_CONFIG } from '../utils/seasonConfig';
import { OffseasonPhase } from '../types/app';

export interface BatchProgress {
    isRunning: boolean;
    current: number;
    total: number;
    currentDate: string;
    phase: 'simulating' | 'saving' | 'done';
}

export const useFullSeasonSim = (
    teams: Team[],
    setTeams: React.Dispatch<React.SetStateAction<Team[]>>,
    schedule: Game[],
    setSchedule: React.Dispatch<React.SetStateAction<Game[]>>,
    myTeamId: string | null,
    currentSimDate: string,
    setCurrentSimDate: (date: string) => void,
    playoffSeries: PlayoffSeries[],
    setPlayoffSeries: React.Dispatch<React.SetStateAction<PlayoffSeries[]>>,
    transactions: Transaction[],
    setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>,
    forceSave: (overrides?: any) => Promise<void>,
    session: any,
    isGuestMode: boolean,
    userTactics: GameTactics | null,
    depthChart: DepthChart | null | undefined,
    tendencySeed: string | undefined,
    hofId?: string | null,
    onHofSubmitted?: () => void,
    simSettings?: SimSettings,
    coachingData?: LeagueCoachingData | null,
    seasonConfig?: SeasonConfig,
    offseasonPhase?: OffseasonPhase,
    leagueTradeBlocks?: LeagueTradeBlocks,
    leaguePickAssets?: LeaguePickAssets | null,
    leagueTradeOffers?: LeagueTradeOffers,
    leagueGMProfiles?: LeagueGMProfiles,
) => {
    const seasonShort = seasonConfig?.seasonShort ?? DEFAULT_SEASON_CONFIG.seasonShort;
    const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
    const cancelTokenRef = useRef({ cancelled: false });

    const handleSimulateSeason = useCallback(async (stopDate?: string) => {
        if (!myTeamId || !userTactics) return;

        // ★ blocking Key Date 클리핑: 오프시즌 중 로터리/드래프트 날짜 전에 자동 정지
        let effectiveStopDate = stopDate;
        if (offseasonPhase !== null && offseasonPhase !== undefined && seasonConfig?.keyDates) {
            const blockingDates: string[] = [];
            if (offseasonPhase === 'POST_FINALS') blockingDates.push(seasonConfig.keyDates.draftLottery);
            if (offseasonPhase === 'POST_LOTTERY') blockingDates.push(seasonConfig.keyDates.rookieDraft);

            for (const blockDate of blockingDates) {
                const dayBefore = new Date(blockDate);
                dayBefore.setDate(dayBefore.getDate() - 1);
                const clipDate = dayBefore.toISOString().split('T')[0];
                if (!effectiveStopDate || clipDate < effectiveStopDate) {
                    effectiveStopDate = clipDate;
                }
            }
        }

        cancelTokenRef.current = { cancelled: false };
        setBatchProgress({
            isRunning: true,
            current: 0,
            total: 0,
            currentDate: currentSimDate,
            phase: 'simulating',
        });

        try {
            if (simSettings) applyTradeSimSettings(simSettings);

            // 1. 딥 클론 1회
            const workingTeams: Team[] = JSON.parse(JSON.stringify(teams));
            const workingSchedule: Game[] = JSON.parse(JSON.stringify(schedule));
            const workingPlayoffSeries: PlayoffSeries[] = JSON.parse(JSON.stringify(playoffSeries));

            // 2. 배치 실행
            const result: BatchSeasonResult = await runBatchSeason(
                workingTeams,
                workingSchedule,
                workingPlayoffSeries,
                myTeamId,
                userTactics,
                depthChart ?? null,
                tendencySeed,
                session?.user?.id,
                (current, total, date) => {
                    setBatchProgress(prev =>
                        prev ? { ...prev, current, total, currentDate: date } : null
                    );
                },
                cancelTokenRef.current,
                simSettings,
                coachingData,
                seasonConfig,
                effectiveStopDate,
                leagueTradeBlocks,
                leaguePickAssets,
                leagueTradeOffers,
                leagueGMProfiles,
            );

            // 3. DB 저장
            setBatchProgress(prev => prev ? { ...prev, phase: 'saving' } : null);
            if (!isGuestMode && session?.user?.id) {
                if (result.allGameResultsToSave.length > 0) {
                    await bulkSaveGameResults(result.allGameResultsToSave);
                }
                if (result.allPlayoffResultsToSave.length > 0) {
                    await Promise.all(result.allPlayoffResultsToSave.map(r => savePlayoffGameResult(r)));
                }
                // 중복 방지용 사전 계산 (병렬 DB 쿼리)
                const myRegGames = result.finalSchedule.filter(g => !g.isPlayoff && (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId));
                const isMySeasonDone = myRegGames.length > 0 && myRegGames.every(g => g.played);
                const finalsSeries = result.finalPlayoffSeries.find(s => s.round === 4 && s.finished && s.winnerId);
                const myPlayoffSeries = result.finalPlayoffSeries.filter(s =>
                    s.finished && (s.higherSeedId === myTeamId || s.lowerSeedId === myTeamId)
                );
                const firstPlayoffGame = result.finalSchedule
                    .filter(g => g.isPlayoff && g.played)
                    .sort((a, b) => a.date.localeCompare(b.date))[0];
                const playoffSince = firstPlayoffGame?.date ?? result.finalDate;

                const [
                    alreadySentAward, alreadySentRegChamp, alreadySentSeasonReview,
                    alreadyFmvp, alreadyChamp, alreadyStageReview,
                ] = await Promise.all([
                    hasMessageOfType(session.user.id, myTeamId, 'SEASON_AWARDS'),
                    hasMessageOfType(session.user.id, myTeamId, 'REG_SEASON_CHAMPION'),
                    hasMessageOfType(session.user.id, myTeamId, 'SEASON_REVIEW'),
                    finalsSeries ? hasMessageOfType(session.user.id, myTeamId, 'FINALS_MVP') : Promise.resolve(false),
                    finalsSeries ? hasMessageOfType(session.user.id, myTeamId, 'PLAYOFF_CHAMPION') : Promise.resolve(false),
                    myPlayoffSeries.length > 0 ? hasMessageOfType(session.user.id, myTeamId, 'PLAYOFF_STAGE_REVIEW', playoffSince) : Promise.resolve(false),
                ]);

                // SEASON_AWARDS / REG_SEASON_CHAMPION 중복 방지 필터 (각각 독립적으로 체크)
                result.allMessages = result.allMessages.filter(m =>
                    (m.type !== 'SEASON_AWARDS' || !alreadySentAward) &&
                    (m.type !== 'REG_SEASON_CHAMPION' || !alreadySentRegChamp)
                );

                // 유저 팀 82경기 완료 시 시즌 리뷰 메시지 추가
                if (isMySeasonDone) {
                    if (!alreadySentSeasonReview) {
                        const myTeam = result.finalTeams.find(t => t.id === myTeamId);
                        if (myTeam) {
                            // 정규시즌 종료일을 날짜로 사용 (플레이오프까지 진행해도 정규시즌 리뷰는 정규시즌 마지막 경기 날짜에 도착)
                            const lastRegDate = myRegGames
                                .filter(g => g.played)
                                .sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? result.finalDate;
                            const allTx = [...result.transactions, ...transactions];
                            const content = buildSeasonReviewContent(myTeam, result.finalTeams, allTx, result.finalSchedule);
                            result.allMessages.push({
                                user_id: session.user.id,
                                team_id: myTeamId,
                                date: lastRegDate,
                                type: 'SEASON_REVIEW',
                                title: `[시즌 보고서] ${seasonShort} 정규시즌 리뷰`,
                                content,
                            });
                            const ownerLetter = buildOwnerLetterContent(myTeam, result.finalTeams, result.finalSchedule);
                            result.allMessages.push({
                                user_id: session.user.id,
                                team_id: myTeamId,
                                date: lastRegDate,
                                type: 'OWNER_LETTER',
                                title: `[서신] ${ownerLetter.title}`,
                                content: ownerLetter,
                            });
                        }
                    }
                }

                // 파이널(round 4) 우승/준우승 시 명예의 전당 자동 등록
                if (hofId) {
                    const round4Series = result.finalPlayoffSeries.find(s =>
                        s.round === 4 && s.finished &&
                        (s.higherSeedId === myTeamId || s.lowerSeedId === myTeamId)
                    );
                    if (round4Series) {
                        const myTeamForHof = result.finalTeams.find(t => t.id === myTeamId);
                        if (myTeamForHof) {
                            const alreadyHof = await checkUserHasSubmitted(hofId);
                            if (!alreadyHof) {
                                const allTx = [...result.transactions, ...transactions];
                                const { totalScore, breakdown } = calculateHallOfFameScore(
                                    myTeamForHof, result.finalTeams, allTx, result.finalSchedule, result.finalPlayoffSeries
                                );
                                const roster = createRosterSnapshot(myTeamForHof);
                                const email = session?.user?.email ? maskEmail(session.user.email) : undefined;
                                const hofResult = await submitHallOfFameEntry(session.user.id, myTeamId, hofId, totalScore, breakdown, roster, email);
                                if (hofResult.success || hofResult.alreadySubmitted) {
                                    onHofSubmitted?.();
                                    const seriesResult: 'WON' | 'LOST' = round4Series.winnerId === myTeamId ? 'WON' : 'LOST';
                                    const totalGames = myTeamForHof.wins + myTeamForHof.losses || 82;
                                    const hofContent: HofQualificationContent = {
                                        result: seriesResult, round: 4,
                                        teamId: myTeamId,
                                        teamName: myTeamForHof.name, totalScore,
                                        breakdown: { season_score: breakdown.season_score, ptDiff_score: breakdown.ptDiff_score, stat_score: breakdown.stat_score, playoff_score: breakdown.playoff_score },
                                        conference: myTeamForHof.conference || '',
                                        wins: myTeamForHof.wins,
                                        losses: myTeamForHof.losses,
                                        pct: (myTeamForHof.wins / totalGames).toFixed(3).replace(/^0/, ''),
                                        allTeamsStats: computeAllTeamsStats(result.finalTeams, result.finalSchedule),
                                        rosterStats: buildRosterStats(myTeamForHof),
                                    };
                                    result.allMessages.push({
                                        user_id: session.user.id, team_id: myTeamId, date: result.finalDate,
                                        type: 'HOF_QUALIFICATION',
                                        title: seriesResult === 'WON' ? '[명예의 전당] 챔피언십 우승' : '[명예의 전당] 파이널 준우승',
                                        content: hofContent,
                                    });
                                }
                            }
                        }
                    }
                }

                // 파이널 MVP + 플레이오프 우승 보고서
                if (finalsSeries) {
                    if (!alreadyFmvp) {
                        const finalsGames = result.allPlayoffResultsToSave.filter(r => r.series_id === finalsSeries.id);
                        if (finalsGames.length > 0) {
                            const mvpResult = selectFinalsMvp(finalsGames, finalsSeries.winnerId!);
                            if (mvpResult) {
                                const winnerTeam = result.finalTeams.find(t => t.id === finalsSeries.winnerId);
                                const loserId = finalsSeries.winnerId === finalsSeries.higherSeedId ? finalsSeries.lowerSeedId : finalsSeries.higherSeedId;
                                const loserTeam = result.finalTeams.find(t => t.id === loserId);
                                const winnerWins = finalsSeries.winnerId === finalsSeries.higherSeedId ? finalsSeries.higherSeedWins : finalsSeries.lowerSeedWins;
                                const loserWins = finalsSeries.winnerId === finalsSeries.higherSeedId ? finalsSeries.lowerSeedWins : finalsSeries.higherSeedWins;
                                const fmvpContent: FinalsMvpContent = {
                                    mvpPlayerId: mvpResult.mvp.playerId,
                                    mvpPlayerName: mvpResult.mvp.playerName,
                                    mvpTeamId: finalsSeries.winnerId!,
                                    mvpTeamName: winnerTeam?.name || 'Unknown',
                                    opponentTeamId: loserId,
                                    opponentTeamName: loserTeam?.name || 'Unknown',
                                    seriesScore: `${winnerWins}-${loserWins}`,
                                    stats: mvpResult.mvp,
                                    leaderboard: mvpResult.leaderboard,
                                };
                                result.allMessages.push({
                                    user_id: session.user.id,
                                    team_id: myTeamId,
                                    date: result.finalDate,
                                    type: 'FINALS_MVP',
                                    title: `[속보] 파이널 MVP 발표`,
                                    content: fmvpContent,
                                });
                            }
                        }
                    }
                    if (!alreadyChamp) {
                        const champTeam = result.finalTeams.find(t => t.id === finalsSeries.winnerId);
                        if (champTeam) {
                            const champContent = buildPlayoffChampionContent(champTeam, result.finalTeams, result.finalSchedule, result.finalPlayoffSeries);
                            result.allMessages.push({
                                user_id: session.user.id,
                                team_id: myTeamId,
                                date: result.finalDate,
                                type: 'PLAYOFF_CHAMPION',
                                title: `[속보] ${seasonShort} 플레이오프 우승: ${champTeam.name}`,
                                content: champContent,
                            });
                        }
                    }
                }

                // 플레이오프 라운드별 리뷰 메시지
                if (myPlayoffSeries.length > 0 && !alreadyStageReview) {
                    const myTeamForStage = result.finalTeams.find(t => t.id === myTeamId);
                    if (myTeamForStage) {
                        const sortedSeries = [...myPlayoffSeries].sort((a, b) => a.round - b.round);
                        for (const series of sortedSeries) {
                            const lastSeriesGame = result.finalSchedule
                                .filter(g => g.seriesId === series.id && g.played)
                                .sort((a, b) => b.date.localeCompare(a.date))[0];
                            const stageDate = lastSeriesGame?.date ?? result.finalDate;
                            const content = buildPlayoffStageContent(myTeamForStage, result.finalTeams, series, result.finalSchedule, result.finalPlayoffSeries);
                            // 시리즈 통합 스탯 — allPlayoffResultsToSave에서 메모리 내 필터링 (DB 재조회 불필요)
                            const seriesResults = result.allPlayoffResultsToSave.filter(r => r.series_id === series.id);
                            if (seriesResults.length > 0) {
                                content.seriesPlayerStats = aggregateSeriesBoxScores(seriesResults, myTeamId);
                            }
                            result.allMessages.push({
                                user_id: session.user.id,
                                team_id: myTeamId,
                                date: stageDate,
                                type: 'PLAYOFF_STAGE_REVIEW',
                                title: `[플레이오프 보고서] ${content.roundName}`,
                                content,
                            });
                        }
                    }
                }

                // 경기 보고서 메시지 bulk insert
                if (result.allMessages.length > 0) {
                    await bulkSendMessages(result.allMessages);
                }
                // 플레이오프 상태 저장
                if (result.finalPlayoffSeries.length > 0) {
                    const currentRound = Math.max(...result.finalPlayoffSeries.map(s => s.round));
                    const isFinished = result.finalPlayoffSeries.some((s: any) => s.round === 4 && s.finished);
                    const championId = isFinished
                        ? result.finalPlayoffSeries.find((s: any) => s.round === 4)?.winnerId
                        : undefined;
                    await savePlayoffState(
                        session.user.id, myTeamId, result.finalPlayoffSeries,
                        currentRound, isFinished, championId
                    );
                }
            }

            // 4. React state 1회 commit
            setTeams(result.finalTeams);
            setSchedule(result.finalSchedule);
            setPlayoffSeries(result.finalPlayoffSeries);
            setCurrentSimDate(result.finalDate);
            if (result.transactions.length > 0) {
                setTransactions(prev => [...result.transactions, ...prev]);
            }

            // 5. 체크포인트 저장
            if (!isGuestMode) {
                await forceSave({
                    currentSimDate: result.finalDate,
                    teams: result.finalTeams,
                    schedule: result.finalSchedule,
                    withSnapshot: true,
                });
            }

            setBatchProgress({
                isRunning: false,
                current: result.userGameCount,
                total: result.userGameCount,
                currentDate: result.finalDate,
                phase: 'done',
            });

            // 3초 후 progress 제거
            setTimeout(() => setBatchProgress(null), 3000);

            return result;
        } catch (e) {
            console.error('Batch season simulation error:', e);
            setBatchProgress(null);
        }
    }, [
        teams, schedule, playoffSeries, myTeamId, currentSimDate,
        userTactics, depthChart, tendencySeed, session, isGuestMode,
        setTeams, setSchedule, setPlayoffSeries, setCurrentSimDate,
        setTransactions, forceSave, hofId, onHofSubmitted, simSettings, seasonConfig,
    ]);

    const handleCancelBatch = useCallback(() => {
        cancelTokenRef.current.cancelled = true;
    }, []);

    return {
        handleSimulateSeason,
        batchProgress,
        handleCancelBatch,
    };
};
