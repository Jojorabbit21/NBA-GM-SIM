import { useEffect } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';
import { mapRawPlayerToRuntimePlayer } from '../../services/dataMapper';
import type { Player } from '../../types';

// [2026-11-23] Quick Game player pools — the only server read in the whole Quick Game flow.
// Fetched once per pool and kept in the in-memory query cache (staleTime Infinity, not persisted to localStorage).
// current = active players of the multi pool, alltime = legends with custom_overrides applied (prime version).
export type QuickPoolType = 'current' | 'alltime';

const COLS = 'id, name, position, height, weight, base_team_id, draft_year, base_attributes, tendencies, ovr_base, ovr_custom';
export interface QuickPoolData {
    players: Player[];
    /** player id → real team slug (meta_players.base_team_id). Runtime Player has no team field. */
    teamOf: Record<string, string>;
}
const EMPTY: QuickPoolData = { players: [], teamOf: {} };

async function fetchPool(type: QuickPoolType): Promise<QuickPoolData> {
    let q = supabase.from('meta_players').select(COLS).eq('in_multi_pool', true);
    q = type === 'current' ? q.or('retired.is.null,retired.eq.false') : q.eq('include_alltime', true);
    const { data, error } = await q.order('id').range(0, 1999);
    if (error) throw error;
    const rows = (data ?? []) as any[];
    const teamOf: Record<string, string> = {};
    for (const r of rows) if (r.base_team_id) teamOf[String(r.id)] = String(r.base_team_id);
    // forceHealthy = true → fixed OVR (ovr_base / ovr_custom) and no injuries
    return { players: rows.map(r => mapRawPlayerToRuntimePlayer(r, type === 'alltime', true)), teamOf };
}

const poolQuery = (type: QuickPoolType) => ({
    queryKey: ['quickGamePool', type] as const,
    queryFn: () => fetchPool(type),
    staleTime: Infinity,
});

/** 풀 전환 중에는 직전 풀을 그대로 보여 준다(placeholderData) — 로더로 바뀌는 깜빡임 없음. isSwitching = 새 풀 받는 중 */
export function useQuickPlayerPool(type: QuickPoolType) {
    const { data = EMPTY, isLoading, isError, isPlaceholderData, refetch } = useQuery({
        ...poolQuery(type),
        placeholderData: keepPreviousData,
    });
    return { ...data, isLoading, isError, isSwitching: isPlaceholderData, refetch };
}

/** 화면 진입 시 다른 풀을 미리 받아 둔다 — 올타임 토글을 켜는 순간 이미 캐시에 있다 */
export function usePrefetchQuickPool(type: QuickPoolType) {
    const qc = useQueryClient();
    useEffect(() => { void qc.prefetchQuery(poolQuery(type)); }, [qc, type]);
}
