/**
 * 시즌 전체 시뮬레이션 훅 (테스트 전용)
 * 프로그레스 상태 관리 + 취소 토큰 + 배치 결과 커밋.
 */

import { useState, useRef, useCallback } from 'react';
import { Team, Game, PlayoffSeries, Transaction, GameTactics, DepthChart } from '../types';
import { runBatchSeason, BatchSeasonResult } from '../services/simulation/batchSeasonService';
import { bulkSaveGameResults } from '../services/queries';
import { savePlayoffState } from '../services/playoffService';

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
    setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>,
    forceSave: (overrides?: any) => Promise<void>,
    session: any,
    isGuestMode: boolean,
    userTactics: GameTactics | null,
    depthChart: DepthChart | null | undefined,
    tendencySeed: string | undefined,
) => {
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
                cancelTokenRef.current
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
        setTransactions, forceSave,
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
