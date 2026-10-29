// useTraining.ts — 트레이닝 세션 조회 훅 [2026-10-29] (services/multi/trainingService.ts)
import { useQuery } from '@tanstack/react-query';
import { fetchTrainingStatus, fetchTrainingLog, fetchTrainingResult } from '../services/multi/trainingService';

export const trainingStatusKey = (roomId: string | undefined | null) => ['trainingStatus', roomId] as const;
export const trainingLogKey = (roomId: string | undefined | null, teamId: string | undefined | null) => ['trainingLog', roomId, teamId] as const;

export function useTrainingStatus(roomId: string | undefined | null) {
    return useQuery({
        queryKey: trainingStatusKey(roomId),
        enabled: !!roomId,
        // 가상 하루(20~40분) 안에서 시간대가 바뀌므로 30초마다 다시 본다
        refetchInterval: 30_000,
        queryFn: () => fetchTrainingStatus(roomId!),
    });
}

export function useTrainingLog(roomId: string | undefined | null, teamId: string | undefined | null) {
    return useQuery({
        queryKey: trainingLogKey(roomId, teamId),
        enabled: !!roomId && !!teamId,
        queryFn: () => fetchTrainingLog(roomId!, teamId!),
    });
}

export function useTrainingResult(id: string | null) {
    return useQuery({
        queryKey: ['trainingResult', id],
        enabled: !!id,
        staleTime: Infinity,   // 결과는 바뀌지 않는다
        queryFn: () => fetchTrainingResult(id!),
    });
}
