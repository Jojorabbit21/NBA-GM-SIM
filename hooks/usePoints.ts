// usePoints.ts — 포인트 지갑·원장 조회 훅 (2026-11-08)
// 로비 프로필 영역(PointsWallet)이 사용. 구매·지급 뒤에는 POINTS_WALLET_KEY / POINTS_LEDGER_KEY 로 무효화한다.
// 계획: docs/plan/points-system-plan.md, 서비스: services/points/pointsService.ts
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchLedger, fetchOwnedItems, fetchShopItems, fetchWallet } from '../services/points/pointsService';
import { fetchCourtLoadout, fetchCourtPaint, loadoutStyle } from '../services/points/courtLoadout';
import type { CourtStyle } from '../types/points';

export const POINTS_WALLET_KEY = (userId: string | null | undefined) => ['pointsWallet', userId ?? null] as const;
export const POINTS_LEDGER_KEY = (userId: string | null | undefined, limit: number) => ['pointsLedger', userId ?? null, limit] as const;
export const SHOP_ITEMS_KEY = ['shopItems'] as const;
export const OWNED_ITEMS_KEY = (userId: string | null | undefined) => ['ownedItems', userId ?? null] as const;

/** 상점 카탈로그(활성 상품). 자주 안 바뀌므로 10분 stale. 카탈로그는 로그인 유저만 읽을 수 있어서(RLS) enabled 로 막을 수 있다 */
export function useShopItems(enabled = true) {
    return useQuery({ queryKey: SHOP_ITEMS_KEY, enabled, staleTime: 10 * 60_000, queryFn: fetchShopItems });
}

/** 보유 아이템 — 구매 후 OWNED_ITEMS_KEY 무효화 */
export function useOwnedItems(userId: string | null | undefined) {
    return useQuery({
        queryKey: OWNED_ITEMS_KEY(userId),
        enabled: !!userId,
        staleTime: 60_000,
        queryFn: () => fetchOwnedItems(userId!),
    });
}

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

export const COURT_PAINT_KEY = (userId: string | null | undefined) => ['courtPaint', userId ?? null] as const;
export const COURT_LOADOUT_KEY = (userId: string | null | undefined) => ['courtLoadout', userId ?? null] as const;

/** [2026-11-18] 한 계정의 장착 정보 + 그걸로 정한 코트 모습. userId 가 없으면(AI 팀) 기본 코트. 장착 후 COURT_LOADOUT_KEY 무효화 */
export function useCourtLoadout(userId: string | null | undefined) {
    const q = useQuery({
        queryKey: COURT_LOADOUT_KEY(userId),
        enabled: !!userId,
        staleTime: 5 * 60_000,
        queryFn: () => fetchCourtLoadout(userId!),
    });
    // [2026-11-18] 칠(플로어마다 따로) — 칠하기·지우기 후 COURT_PAINT_KEY 무효화
    const pq = useQuery({
        queryKey: COURT_PAINT_KEY(userId),
        enabled: !!userId,
        staleTime: 5 * 60_000,
        queryFn: () => fetchCourtPaint(userId!),
    });
    const entries = userId ? q.data : null;
    const paints = userId ? pq.data : null;
    const style: CourtStyle = useMemo(() => loadoutStyle(entries, paints), [entries, paints]);
    return { ...q, style, paints };
}
