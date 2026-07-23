
/**
 * multiDraftEngine.ts — 드래프트 순수 로직
 * Deno Edge Function과 클라이언트가 공용으로 사용하는 순수 함수들.
 * DB/React 의존 없음.
 */

export interface PickOrderEntry {
    userId: string;
    teamId: string;
    isAi?: boolean;   // AI 팀 여부 — draft-cron이 즉시 자동픽에 사용
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

/** 선형 드래프트 순서 생성 — 매 라운드 동일한 순서 */
export function generateLinearPickOrder(
    members: PickOrderEntry[],
    totalRounds: number
): PickOrderEntry[] {
    const order: PickOrderEntry[] = [];
    for (let r = 0; r < totalRounds; r++) {
        order.push(...members);
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

/**
 * 현재 차례 유저의 자동 픽 — 우선순위: 1) 높은 OVR, 2) 포지션 정합성.
 * OVR 내림차순으로 훑되, 이미 로스터에 같은 포지션이 2명 이상이면 건너뛰고
 * 그 다음으로 OVR이 높은 "다른 포지션" 선수를 선택한다.
 * (모든 남은 선수가 포지션 제한에 걸리는 극단적 경우엔 순수 최고 OVR로 폴백)
 */
export function getBestAvailableId(
    poolPlayers: { id: string; ovr: number; position: string }[],
    draftedIds: string[],
    teamPositions: string[] = []
): string | null {
    const drafted = new Set(draftedIds);
    const available = poolPlayers
        .filter(p => !drafted.has(p.id))
        .sort((a, b) => b.ovr - a.ovr);
    if (available.length === 0) return null;

    const positionCounts: Record<string, number> = {};
    for (const pos of teamPositions) positionCounts[pos] = (positionCounts[pos] ?? 0) + 1;

    const fitByPosition = available.find(p => (positionCounts[p.position] ?? 0) < 2);
    return (fitByPosition ?? available[0]).id;
}
