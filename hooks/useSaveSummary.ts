import { useQuery } from '@tanstack/react-query';
import { loadSaveSummary } from '../services/persistence';
import type { SaveSummary } from '../types/app';

export function useSaveSummary(userId: string | undefined) {
    return useQuery<SaveSummary | null>({
        queryKey: ['saveSummary', userId],
        queryFn:  () => loadSaveSummary(userId!),
        enabled:  !!userId,
        staleTime: 30_000,
        retry: 1,
    });
}
