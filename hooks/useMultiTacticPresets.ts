import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    fetchTacticPresets, upsertTacticPreset, renameTacticPreset, deleteTacticPreset, normalizePresetName,
    type MultiTacticPreset, type TacticPresetKind, type TacticPresetSlot, type TacticPresetData,
} from '../services/multi/tacticPresets';

/** 멀티 리그 개인 전술 프리셋(뎁스/팀 각 3슬롯). [2026-10-18]
 *  뎁스 탭·팀 탭 프리셋 바가 같은 queryKey를 공유 — fetch 1회. 쓰기 성공 시 캐시를 직접 갱신. */
export function useMultiTacticPresets(roomId: string | null | undefined, userId: string | null | undefined) {
    const queryClient = useQueryClient();
    const queryKey = ['multiTacticPresets', roomId, userId] as const;

    const query = useQuery({
        queryKey,
        enabled: !!roomId && !!userId,
        staleTime: Infinity,
        queryFn: () => fetchTacticPresets(roomId!, userId!),
    });

    const patchCache = useCallback((fn: (list: MultiTacticPreset[]) => MultiTacticPreset[]) => {
        queryClient.setQueryData<MultiTacticPreset[]>(['multiTacticPresets', roomId, userId], prev => fn(prev ?? []));
    }, [queryClient, roomId, userId]);

    const save = useCallback(async (kind: TacticPresetKind, slot: TacticPresetSlot, name: string, data: TacticPresetData) => {
        if (!roomId || !userId) return { error: 'roomId/userId missing' };
        const res = await upsertTacticPreset(roomId, userId, kind, slot, name, data);
        if (!res.error) {
            const row: MultiTacticPreset = { kind, slot, name: normalizePresetName(name), data, updatedAt: new Date().toISOString() };
            patchCache(list => [...list.filter(p => !(p.kind === kind && p.slot === slot)), row]);
        }
        return res;
    }, [roomId, userId, patchCache]);

    const rename = useCallback(async (kind: TacticPresetKind, slot: TacticPresetSlot, name: string) => {
        if (!roomId || !userId) return { error: 'roomId/userId missing' };
        const res = await renameTacticPreset(roomId, userId, kind, slot, name);
        if (!res.error) {
            const safeName = normalizePresetName(name);
            patchCache(list => list.map(p => (p.kind === kind && p.slot === slot ? { ...p, name: safeName } : p)));
        }
        return res;
    }, [roomId, userId, patchCache]);

    const remove = useCallback(async (kind: TacticPresetKind, slot: TacticPresetSlot) => {
        if (!roomId || !userId) return { error: 'roomId/userId missing' };
        const res = await deleteTacticPreset(roomId, userId, kind, slot);
        if (!res.error) patchCache(list => list.filter(p => !(p.kind === kind && p.slot === slot)));
        return res;
    }, [roomId, userId, patchCache]);

    return { presets: query.data ?? [], isLoading: query.isPending && !!roomId && !!userId, loadError: query.error, save, rename, remove };
}
