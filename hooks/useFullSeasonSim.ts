/**
 * 시즌 전체 시뮬레이션 훅 (테스트 전용)
 * 프로그레스 상태 관리 + 취소 토큰 + 배치 결과 커밋.
 */

import { useState, useRef, useCallback } from 'react';
import { Team, Game, PlayoffSeries, Transaction, GameTactics, DepthChart } from '../types';
import { LeagueCoachingData } from '../types/coaching';
import { SimSettings } from '../types/simSettings';
import { applyTradeSimSettings } from '../services/tradeEngine/tradeConfig';
import { runBatchSeason, BatchSeasonResult } from '../services/simulation/batchSeasonService';
import { bulkSaveGameResults } from '../services/queries';
import { savePlayoffState } from '../services/playoffService';
import { bulkSendMessages, hasMessageOfType } from '../services/messageService';
import { buildSeasonReviewContent, buildOwnerLetterContent } from '../services/reportGenerator';
import { calculateHallOfFameScore, createRosterSnapshot, maskEmail } from '../utils/hallOfFameScorer';
import { submitHallOfFameEntry, checkUserHasSubmitted } from '../services/hallOfFameService';
import { HofQualificationContent } from '../types/message';
import { SeasonConfig, DEFAULT_SEASON_CONFIG } from '../utils/seasonConfig';

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
) => {
    const seasonShort = seasonConfig?.seasonShort ?? DEFAULT_SEASON_CONFIG.seasonShort;
    const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
    const cancelTokenRef = useRef({ cancelled: false });

    const handleSimulateSeason = useCallback(async () => {
        if (!myTeamId || !userTactics) return;

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
                seasonConfig
            );

            // 3. DB 저장
            setBatchProgress(prev => prev ? { ...prev, phase: 'saving' } : null);
            if (!isGuestMode && session?.user?.id) {
                if (result.allGameResultsToSave.length > 0) {
                    await bulkSaveGameResults(result.allGameResultsToSave);
                }
                if (result.allPlayoffResultsToSave.length > 0) {
                    await bulkSaveGameResults(result.allPlayoffResultsToSave);
                }
                // 유저 팀 82경기 완료 시 시즌 리뷰 메시지 추가
                const myRegGames = result.finalSchedule.filter(g => !g.isPlayoff && (g.homeTeamId === myTeamId || g.awayTeamId === myTeamId));
                const isMySeasonDone = myRegGames.length > 0 && myRegGames.every(g => g.played);
                if (isMySeasonDone) {
                    const alreadySent = await hasMessageOfType(session.user.id, myTeamId, 'SEASON_REVIEW');
                    if (!alreadySent) {
                        const myTeam = result.finalTeams.find(t => t.id === myTeamId);
                        if (myTeam) {
                            const allTx = [...result.transactions, ...transactions];
                            const content = buildSeasonReviewContent(myTeam, result.finalTeams, allTx, result.finalSchedule);
                            result.allMessages.push({
                                user_id: session.user.id,
                                team_id: myTeamId,
                                date: result.finalDate,
                                type: 'SEASON_REVIEW',
                                title: `[시즌 보고서] ${seasonShort} 정규시즌 리뷰`,
                                content,
                            });
                            const ownerLetter = buildOwnerLetterContent(myTeam, result.finalTeams, result.finalSchedule);
                            result.allMessages.push({
                                user_id: session.user.id,
                                team_id: myTeamId,
                                date: result.finalDate,
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
                                    const hofContent: HofQualificationContent = {
                                        result: seriesResult, round: 4, teamName: myTeamForHof.name, totalScore,
                                        breakdown: { season_score: breakdown.season_score, ptDiff_score: breakdown.ptDiff_score, stat_score: breakdown.stat_score, playoff_score: breakdown.playoff_score },
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
