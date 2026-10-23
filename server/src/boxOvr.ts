// boxOvr.ts — stamp each box-score row with the player's fixed OVR at save time, so the
// final-game screen can render OVR badges without a second roster fetch.
import { calculatePlayerOvr } from './shared/utils/ovrUtils.ts';

export function stampBoxOvr<T extends { playerId: string }>(box: T[] | null | undefined, ...rosters: any[][]): (T & { ovr?: number })[] {
    const byId = new Map<string, any>();
    for (const r of rosters) for (const p of r ?? []) byId.set(String(p.id), p);
    return (box ?? []).map(b => {
        const p = byId.get(String(b.playerId));
        return p ? { ...b, ovr: calculatePlayerOvr(p) } : b;
    });
}
