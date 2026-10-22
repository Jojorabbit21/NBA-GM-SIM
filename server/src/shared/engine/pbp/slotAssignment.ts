/**
 * slotAssignment.ts — 코트 슬롯(PG·SG·SF·PF·C) 배정 규칙 (client 미러: services/game/engine/pbp/slotAssignment.ts)
 *
 * [2026-10-22] 코트에는 항상 PG·SG·SF·PF·C 다섯 슬롯이 하나씩 있다. LivePlayer.position은 "지금 맡은 슬롯"이고,
 * 엔진의 매치업(같은 슬롯끼리 수비)·PnR 롤/팝 자격·포스트업 풀 등이 이 값을 쓴다. 이전에는 교체 경로마다 슬롯을
 * 정하는 규칙이 달라(로테이션 맵 교체 = 뎁스차트 첫 등재 슬롯, 긴급 교체 = 나간 선수 슬롯 승계) 코트에 PG 2명·SG 0명
 * 같은 상태가 생겼다(실측: Pro Basketball League 저장 전술 120경기, 공격권 11.3%). 모든 교체 경로가 이 함수 하나로
 * 슬롯을 정한다.
 *
 * 규칙: 코트 위 선수(최대 5명)를 다섯 슬롯에 배치하는 모든 경우(5! = 120)를 비교해 "어색함" 합이 가장 낮은 배치.
 *   - 뎁스차트에 그 슬롯의 **주전**으로 등재 → 0 (유저/AI가 의도한 배치 존중 — 일부러 SF를 PF 주전에 둔 경우 등)
 *   - 그 슬롯의 백업·써드로 등재, 또는 고유 포지션 = 슬롯 → 0.6 (이동 감점보다 커야 주전이 돌아왔을 때 자기 슬롯을
 *     되찾는다 — 같은 C 둘 중 커버하던 백업이 C에 남고 복귀한 주전 C가 PF로 밀리던 경우, 2026-10-22 시험)
 *   - 고유 포지션과 한 칸 차이 → 1, 두 칸 → 3, 세 칸 이상 → 10
 *   - 코트에 계속 있던 선수가 슬롯을 옮김 → +0.5 (승계 원칙: 1:1 교체면 들어온 선수가 나간 선수 슬롯을 받는다.
 *     단 8인 로테이션의 "커버 후 복귀"처럼 옮기는 게 훨씬 자연스러우면 옮김 — 0이면 그 경우가 꼬이고, 크면 매치업이 자주 흔들림)
 *   - 동점: 기존 슬롯을 더 많이 유지하는 배치 → 선수 id 사전순 첫 배치(결정론).
 * 판단(매치업 등)은 계속 슬롯 기준이다 — 고유 포지션은 배정에만 쓴다(고유 포지션 게이팅은 PF 슬롯 이슈 때 기각,
 * docs/engine/pf-slot-stacking-issue.md).
 */
import type { LivePlayer, TeamState } from './pbpTypes.ts';
import type { DepthChart } from '../../types.ts';

export const COURT_SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
export type Slot = typeof COURT_SLOTS[number];

/** 슬롯 배정에 필요한 최소 필드 — LivePlayer와 (후임 선정용) 경량 객체가 모두 만족한다 */
export type SlotPlayer = Pick<LivePlayer, 'playerId' | 'ovr' | 'position'> & { nativePosition?: string };
const SLOT_INDEX: Record<string, number> = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 };

/** 슬롯 이동 감점(계속 코트에 있던 선수) */
const MOVE_PENALTY = 0.5;
/** 고유 포지션과 슬롯의 거리별 어색함(거리 0 = 고유 포지션 일치는 NATURAL_COST) */
const DISTANCE_COST = [0, 1, 3, 10, 10];
/** 뎁스 백업·써드 등재 또는 고유 포지션 일치 */
const NATURAL_COST = 0.6;

/** 슬롯 → 그 슬롯 뎁스차트에서의 순번(0 = 주전) */
export function listedSlots(playerId: string, depthChart?: DepthChart): Map<string, number> {
    const out = new Map<string, number>();
    if (!depthChart) return out;
    for (const s of COURT_SLOTS) {
        const idx = depthChart[s]?.indexOf(playerId) ?? -1;
        if (idx >= 0) out.set(s, idx);
    }
    return out;
}

function nativeOf(p: SlotPlayer): string {
    return p.nativePosition ?? p.position;
}

export function slotCost(p: SlotPlayer, slot: Slot, listed: Map<string, number>, prevSlot: string | undefined): number {
    let c: number;
    const depthIdx = listed.get(slot);
    if (depthIdx === 0) {
        c = 0;
    } else {
        const ni = SLOT_INDEX[nativeOf(p)];
        const dist = ni === undefined ? 2 : Math.abs(ni - SLOT_INDEX[slot]);
        c = dist === 0 ? NATURAL_COST : DISTANCE_COST[dist];
        if (depthIdx !== undefined) c = Math.min(c, NATURAL_COST);
    }
    if (prevSlot !== undefined && prevSlot !== slot) c += MOVE_PENALTY;
    return c;
}

/**
 * 주어진 선수들(≤5)에게 서로 다른 슬롯을 배정했을 때의 최소 어색함과 그 배치.
 * prevSlots: 코트에 계속 있던 선수의 직전 슬롯(들어온 선수는 없음).
 */
export function bestSlotAssignment(
    players: SlotPlayer[],
    depthChart: DepthChart | undefined,
    prevSlots: Map<string, string>,
): { cost: number; slots: Map<string, Slot> } {
    const ordered = [...players].sort((a, b) => a.playerId.localeCompare(b.playerId));
    const listed = ordered.map(p => listedSlots(p.playerId, depthChart));
    const costs = ordered.map((p, i) => COURT_SLOTS.map(s => slotCost(p, s, listed[i], prevSlots.get(p.playerId))));

    let bestCost = Infinity, bestKept = -1;
    let best: number[] = [];
    const cur: number[] = [];
    const used = [false, false, false, false, false];
    const walk = (i: number, acc: number) => {
        if (acc > bestCost) return;
        if (i === ordered.length) {
            const kept = ordered.reduce((n, p, k) => n + (prevSlots.get(p.playerId) === COURT_SLOTS[cur[k]] ? 1 : 0), 0);
            // 동점이면 기존 슬롯을 더 많이 유지, 그래도 같으면 먼저 찾은 배치(슬롯 순서 사전순)
            if (acc < bestCost - 1e-9 || (Math.abs(acc - bestCost) <= 1e-9 && kept > bestKept)) {
                bestCost = acc; bestKept = kept; best = [...cur];
            }
            return;
        }
        for (let s = 0; s < COURT_SLOTS.length; s++) {
            if (used[s]) continue;
            used[s] = true; cur.push(s);
            walk(i + 1, acc + costs[i][s]);
            cur.pop(); used[s] = false;
        }
    };
    walk(0, 0);

    const slots = new Map<string, Slot>();
    ordered.forEach((p, k) => { if (best[k] !== undefined) slots.set(p.playerId, COURT_SLOTS[best[k]]); });
    return { cost: bestCost === Infinity ? 0 : bestCost, slots };
}

/** 지금 코트 위 선수들의 슬롯 스냅샷 — 교체 직전에 찍어 두고 assignCourtSlots에 넘긴다 */
export function snapshotSlots(team: TeamState): Map<string, string> {
    return new Map(team.onCourt.map(p => [p.playerId, p.position]));
}

/**
 * 교체 직후 호출: 코트 위 전원에게 슬롯을 다시 배정한다.
 * before: 교체 직전 snapshotSlots(team) — 여기 있고 지금도 코트에 있는 선수만 "계속 있던 선수"로 본다.
 */
export function assignCourtSlots(team: TeamState, before: Map<string, string> = new Map()): void {
    if (team.onCourt.length === 0) return;
    const prev = new Map<string, string>();
    for (const p of team.onCourt) {
        const s = before.get(p.playerId);
        if (s !== undefined) prev.set(p.playerId, s);
    }
    const { slots } = bestSlotAssignment(team.onCourt, team.depthChart, prev);
    for (const p of team.onCourt) {
        const s = slots.get(p.playerId);
        if (s) p.position = s;
    }
}

/**
 * 후보 중 5명을 고를 때 슬롯을 가장 잘 채우는 조합 — 한 분에 6명 이상 예정됐을 때(로테이션 맵 과다 편성).
 * 어색함 최소, 동점이면 OVR 합 큰 조합, 그래도 같으면 id 사전순. 후보 ≤ 5면 그대로.
 */
export function pickBestFive<T extends SlotPlayer>(
    candidates: T[],
    depthChart: DepthChart | undefined,
    prevSlots: Map<string, string>,
): T[] {
    if (candidates.length <= 5) return candidates;
    const sorted = [...candidates].sort((a, b) => a.playerId.localeCompare(b.playerId));
    let best: T[] = sorted.slice(0, 5);
    let bestCost = Infinity, bestOvr = -Infinity;
    const pick: T[] = [];
    const choose = (start: number) => {
        if (pick.length === 5) {
            const { cost } = bestSlotAssignment(pick, depthChart, prevSlots);
            const ovr = pick.reduce((s, p) => s + p.ovr, 0);
            if (cost < bestCost - 1e-9 || (Math.abs(cost - bestCost) <= 1e-9 && ovr > bestOvr)) {
                bestCost = cost; bestOvr = ovr; best = [...pick];
            }
            return;
        }
        for (let i = start; i <= sorted.length - (5 - pick.length); i++) {
            pick.push(sorted[i]); choose(i + 1); pick.pop();
        }
    };
    choose(0);
    return best;
}

/**
 * 빈 시간 보충 후보 정렬용: 이미 정해진 선수들로 채워지지 않은 슬롯에 이 선수가 얼마나 잘 맞는가(0이 최적).
 * 이미 정해진 선수들의 슬롯은 각자 최선 배치로 가정한다.
 */
export function vacancyFit(p: SlotPlayer, selected: SlotPlayer[], depthChart: DepthChart | undefined): number {
    const { slots } = bestSlotAssignment(selected.slice(0, 5), depthChart, new Map());
    const taken = new Set(slots.values());
    const listed = listedSlots(p.playerId, depthChart);
    let bestFit = Infinity;
    for (const s of COURT_SLOTS) {
        if (taken.has(s)) continue;
        bestFit = Math.min(bestFit, slotCost(p, s, listed, undefined));
    }
    return bestFit === Infinity ? 0 : bestFit;
}
