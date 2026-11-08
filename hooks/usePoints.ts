// usePoints.ts — 포인트 지갑·원장 조회 훅 (2026-11-08)
// 로비 프로필 영역(PointsWallet)이 사용. 구매·지급 뒤에는 POINTS_WALLET_KEY / POINTS_LEDGER_KEY 로 무효화한다.
// 계획: docs/plan/points-system-plan.md, 서비스: services/points/pointsService.ts
import { useQuery } from '@tanstack/react-query';
import { fetchLedger, fetchWallet } from '../services/points/pointsService';

export const POINTS_WALLET_KEY = (userId: string | null | undefined) => ['pointsWallet', userId ?? null] as const;
export const POINTS_LEDGER_KEY = (userId: string | null | undefined, limit: number) => ['pointsLedger', userId ?? null, limit] as const;

export function useWallet(userId: string | null | undefined) {
    return useQuery({
        queryKey: POINTS_WALLET_KEY(userId),
        enabled: !!userId,
        staleTime: 60_000,
        queryFn: () => fetchWallet(userId!),
    });
}

/** 최근 내역 N건(최신순). 로비는 5건만 보여준다. */
export function useRecentLedger(userId: string | null | undefined, limit: number, enabled = true) {
    return useQuery({
        queryKey: POINTS_LEDGER_KEY(userId, limit),
        enabled: !!userId && enabled,
        staleTime: 60_000,
        queryFn: () => fetchLedger(userId!, undefined, limit),
    });
}
