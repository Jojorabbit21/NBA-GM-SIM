
/**
 * multiDraftEngine.ts — 드래프트 순수 로직
 * Deno Edge Function과 클라이언트가 공용으로 사용하는 순수 함수들.
 * DB/React 의존 없음.
 */

export interface PickOrderEntry {
    userId: string;
    teamId: string;
}

/** Snake 드래프트 순서 생성 */
export function generateSnakePickOrder(
    members: PickOrderEntry[],
    totalRounds: number
): PickOrderEntry[] {
    const order: PickOrderEntry[] = [];
    for (let r = 0; r < totalRounds; r++) {
        const round = r % 2 === 0 ? [...members] : [...members].reverse();
        order.push(...round);
    }
    return order;
}

/** Mulberry32 시드 기반 셔플 — start-draft에서 팀/멤버 순서를 결정론적으로 섞는다 */
export function seededShuffle<T>(arr: T[], seed: string): T[] {
    const result = [...arr];
    let s = hashString(seed);
    for (let i = result.length - 1; i > 0; i--) {
        s = mulberry32(s);
        const j = Math.floor((s / 0xFFFFFFFF) * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function hashString(str: string): number {
    let h = 0;
    for (const c of str) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
    return h >>> 0;
}

function mulberry32(a: number): number {
    let t = a + 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
}

/** 현재 차례 유저의 자동 픽 — OVR 최고 미선발 선수 반환 */
export function getBestAvailableId(
    poolPlayers: { id: string; ovr: number }[],
    draftedIds: string[]
): string | null {
    const drafted = new Set(draftedIds);
    const best = poolPlayers
        .filter(p => !drafted.has(p.id))
        .sort((a, b) => b.ovr - a.ovr)[0];
    return best?.id ?? null;
}
