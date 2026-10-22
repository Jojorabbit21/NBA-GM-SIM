/**
 * lineupBuilder.ts — AI 감독 C2: 라인업(주전 5인 + 뎁스차트 + 커버 목록) 결정 (서버 전용, 계획: docs/plan/ai-coach-plan.md)
 *
 * 원칙 (사용자 확정 2026-10-21~22)
 *  - 입력은 **자기 팀 로스터뿐**(상대 팀 미반영, 외부 데이터 없음). 상대를 반영하는 건 공격 전술뿐이다.
 *  - 기본은 능력치(OVR). **능력이 비슷할 때만** 조합이 나은 쪽을 고른다 — 조합 보너스가 OVR 2점 안팎이라
 *    실력 차가 큰 선수를 조합 때문에 벤치로 보내지 않는다.
 *  - 조합 조건(판정은 팀 안의 상대 순위): 볼 핸들러 1명+, 슈터 2명+, 림 보호 1명+.
 *  - **고유 포지션 우선, 공급이 모자랄 때만 인접 포지션** — PF 슬롯에 윙/가드를 넣어 PostUp/PnR_Roll 풀을 독점하는 편법을
 *    AI가 스스로 쓰지 않게(docs/engine/pf-slot-stacking-issue.md). 포지션 불일치는 "어색함 비용"(고유 0 / 한 칸 1 / 두 칸 3 /
 *    세 칸+ 10)으로 매기고 가중치 MISMATCH_WEIGHT(30)를 곱해 사실상 우선순위로 만든다(스타가 아무리 강해도 한 칸 이동은
 *    OVR 30점 손해). 그래서 PG가 없는 로스터는 가장 핸들러에 가까운 SG가 PG를 맡고, 나머지 SG가 그만큼 더 뛰는 구조가 된다.
 *  - 순수 함수, 결정론(동점은 id 순).
 *
 * 2026-10-22 개정: 슬롯별 후보가 없을 때 결과 배열이 밀리고(후보 없는 슬롯 건너뛰기), 앞 슬롯이 후보를 다 쓰면 주전이 전부 비던
 * 문제를 없앴다 — 슬롯 인덱스로 직접 저장하고, "비워 둠" 선택지(큰 감점)와 탐욕 폴백을 둬서 가용 선수가 5명 이상이면 항상
 * 5명이 채워진다. 커버 목록(cover) 추가: 슬롯마다 그 자리를 뛸 수 있는 선수를 적합도 순으로(로테이션 단계의 입력).
 */
import type { Player } from '../../../types.ts';
import type { DepthChart } from '../../../types/tactics.ts';
import { computeRawSkills } from './rosterEvaluator.ts';

export type Slot = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export const SLOTS: Slot[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const SLOT_INDEX: Record<Slot, number> = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 };

/** 포지션 불일치 비용(슬롯 거리별). 고유 포지션 = 0 */
const DISTANCE_COST = [0, 1, 3, 10, 10];
/** 어색함 1점당 OVR 감점 — 크게 둬서 "고유 포지션 우선"을 사실상 순서로 만든다 */
const MISMATCH_WEIGHT = 30;
/** 슬롯당 탐색 후보 수(어색함 오름차순 → OVR 내림차순 상위) — 4^5 = 1,024조합 상한. 가용 선수가 6명 이하면 전원을 후보로 */
const CANDIDATES_PER_SLOT = 4;
/** 슬롯을 비우는 선택지의 감점(가용 선수 5명 미만일 때만 실제로 선택됨) */
const EMPTY_PENALTY = 1000;
/** 커버 목록에 올리는 최대 어색함 비용(두 칸 떨어진 선수까지) */
const COVER_MAX_COST = 3;

/** 조합 보너스(OVR 점 단위) */
const BONUS_HANDLER = 2;          // 팀 내 핸들링 상위 HANDLER_TOP명 중 1명 이상이 주전
const BONUS_PER_SHOOTER = 1.5;    // 팀 내 3점 상위 SHOOTER_TOP명 중 주전 인원 × 1.5, 최대 SHOOTER_NEED명까지
const BONUS_RIM = 2;              // 팀 내 림 보호 상위 RIM_TOP명 중 1명 이상이 주전
/**
 * 슬롯 핵심 능력 보너스 — PG 슬롯은 팀 내 핸들링 상위(HANDLER_TOP) 선수가, C 슬롯은 림 보호 상위(RIM_TOP) 선수가 맡을 때.
 * 위 핸들러·림 보호 보너스는 "주전 5명 중 누구든" 만족하면 되므로 포지션 공급이 모자랄 때(PG 없음 등) 최고 핸들러가 SG 자리에
 * 서든 PG 자리에 서든 점수가 같다 — 그러면 핸들링이 약한 선수가 PG를 맡을 수 있다(2026-10-22 시험에서 발견).
 * 고유 포지션이 있는 정상 로스터에서는 거의 항상 이미 만족돼 있어 순위를 바꾸지 않는다.
 */
const BONUS_SLOT_ANCHOR = 1.5;
const HANDLER_TOP = 2;
const SHOOTER_TOP = 4;
const SHOOTER_NEED = 2;
const RIM_TOP = 2;

/** 라인업 탐색에 필요한 선수 정보(computeRawSkills 결과를 요약) — 시험에서는 가상 선수를 직접 만들어 넣는다 */
export interface Cand {
    id: string;
    name: string;
    position: string;
    ovr: number;
    handler: number;   // archetype handler
    three: number;     // 3점 3개 서브존 평균
    rimProt: number;   // archetype rimProtector
}

export interface LineupResult {
    /** 슬롯별 주전 id. 가용 선수가 5명 미만이면 남는 슬롯은 '' */
    starters: Record<Slot, string>;
    depthChart: DepthChart;
    /**
     * 슬롯마다 그 자리를 뛸 수 있는 선수(주전·백업 포함 전원)를 어색함 오름차순 → OVR 내림차순으로.
     * cost = 어색함 비용(0 고유 / 1 한 칸 / 3 두 칸). COVER_MAX_COST 이하만. 로테이션 단계가 백업이 비는 시간을 메울 때 쓴다.
     */
    cover: Record<Slot, { id: string; cost: number }[]>;
    /** 선택된 조합의 점수 내역 */
    score: { total: number; ovrSum: number; handler: number; shooters: number; rim: number; anchor: number; mismatch: number };
    /** 조합 보너스 없이(OVR+포지션만) 뽑았을 때와 달라진 슬롯 — 조합 판단이 실제로 개입한 곳 */
    changedFromOvrOrder: { slot: Slot; ovrPick: string | null; pick: string }[];
    /** 조합 조건 충족 여부 */
    has: { handler: boolean; shooters: number; rim: boolean };
    /** 가용한 고유 포지션 선수가 한 명도 없는 슬롯(포지션 공급 부족) — 인접 포지션 선수가 대신 맡는다 */
    shortage: Slot[];
    notes: string[];
}

const byOvr = (a: Cand, b: Cand) => (b.ovr - a.ovr) || a.id.localeCompare(b.id);

/** 선수가 슬롯을 맡을 때의 어색함 비용 */
function fitCost(c: Cand, slot: Slot): number {
    const ni = SLOT_INDEX[c.position as Slot];
    if (ni === undefined) return DISTANCE_COST[2];
    return DISTANCE_COST[Math.abs(ni - SLOT_INDEX[slot])];
}

function topIds(cands: Cand[], key: 'handler' | 'three' | 'rimProt', n: number): Set<string> {
    return new Set([...cands].sort((a, b) => (b[key] - a[key]) || a.id.localeCompare(b.id)).slice(0, n).map(c => c.id));
}

interface Found { picks: (Cand | null)[]; total: number; ovrSum: number; h: number; sh: number; r: number; an: number; mismatch: number }

/**
 * 슬롯별 후보로 모든 조합을 한 번 훑어, 조합 보너스를 넣은 최고 라인업(withBonus)과 넣지 않은 최고 라인업(base, 비교용)을 같이 구한다.
 * 후보는 슬롯마다 어색함 오름차순 → OVR 내림차순 상위 K명(가용 선수가 6명 이하면 전원). 같은 선수가 두 슬롯에 들어가는 조합은 제외.
 * 가용 선수가 5명 미만일 때만 "슬롯 비움" 선택지(큰 감점)를 둔다. 후보 제한 때문에 완전한 배정이 없으면 호출자가 탐욕 폴백으로 채운다.
 */
function search(pool: Cand[], sets: { handlers: Set<string>; shooters: Set<string>; rims: Set<string> }): { withBonus: Found | null; base: Found | null } {
    const K = pool.length <= 6 ? pool.length : CANDIDATES_PER_SLOT;
    const allowEmpty = pool.length < SLOTS.length;
    const isH = pool.map(c => sets.handlers.has(c.id)), isS = pool.map(c => sets.shooters.has(c.id)), isR = pool.map(c => sets.rims.has(c.id));
    // 슬롯별 후보 = 풀 인덱스 배열(+ 비움 -1)
    const lists: number[][] = SLOTS.map(slot => {
        const idx = pool.map((_, k) => k).sort((a, b) => (fitCost(pool[a], slot) - fitCost(pool[b], slot)) || byOvr(pool[a], pool[b])).slice(0, K);
        if (allowEmpty) idx.push(-1);
        return idx;
    });

    let bestB: Found | null = null, bestA: Found | null = null;
    const pick: number[] = [];
    const keyOf = (f: number[]) => f.map(k => (k < 0 ? '' : pool[k].id)).join(',');
    const consider = (cur: Found | null, cand: Found, candKey: () => string): Found | null =>
        !cur || cand.total > cur.total + 1e-9 || (Math.abs(cand.total - cur.total) <= 1e-9 && candKey() < keyOf(cur.picks.map(c => (c ? pool.indexOf(c) : -1)))) ? cand : cur;

    const walk = (i: number, used: number, ovrSum: number, mismatch: number, empties: number, shooters: number, hasH: boolean, hasR: boolean) => {
        if (i === SLOTS.length) {
            const base = ovrSum - MISMATCH_WEIGHT * mismatch - EMPTY_PENALTY * empties;
            const h = hasH ? BONUS_HANDLER : 0, sh = Math.min(SHOOTER_NEED, shooters) * BONUS_PER_SHOOTER, r = hasR ? BONUS_RIM : 0;
            const an = ((pick[0] >= 0 && isH[pick[0]]) ? BONUS_SLOT_ANCHOR : 0) + ((pick[4] >= 0 && isR[pick[4]]) ? BONUS_SLOT_ANCHOR : 0);
            const picks = pick.map(k => (k < 0 ? null : pool[k]));
            const fb: Found = { picks, total: base + h + sh + r + an, ovrSum, h, sh, r, an, mismatch };
            const fa: Found = { picks, total: base, ovrSum, h: 0, sh: 0, r: 0, an: 0, mismatch };
            bestB = consider(bestB, fb, () => keyOf(pick));
            bestA = consider(bestA, fa, () => keyOf(pick));
            return;
        }
        for (const k of lists[i]) {
            if (k >= 0 && (used & (1 << k))) continue;
            pick.push(k);
            if (k < 0) walk(i + 1, used, ovrSum, mismatch, empties + 1, shooters, hasH, hasR);
            else walk(i + 1, used | (1 << k), ovrSum + pool[k].ovr, mismatch + fitCost(pool[k], SLOTS[i]), empties, shooters + (isS[k] ? 1 : 0), hasH || isH[k], hasR || isR[k]);
            pick.pop();
        }
    };
    walk(0, 0, 0, 0, 0, 0, false, false);
    return { withBonus: bestB, base: bestA };
}

/** 후보 제한으로 빈 슬롯이 남았는데 쓰지 않은 가용 선수가 있으면, 슬롯 순서대로 어색함이 가장 작은 선수로 채운다 */
function completeGreedy(picks: (Cand | null)[], pool: Cand[]): (Cand | null)[] {
    const out = [...picks];
    const used = new Set(out.filter((c): c is Cand => !!c).map(c => c.id));
    SLOTS.forEach((slot, i) => {
        if (out[i]) return;
        const c = pool.filter(x => !used.has(x.id)).sort((a, b) => (fitCost(a, slot) - fitCost(b, slot)) || byOvr(a, b))[0];
        if (c) { out[i] = c; used.add(c.id); }
    });
    return out;
}

export function buildLineup(roster: Player[]): LineupResult {
    const pool: Cand[] = roster
        .filter(p => p.health !== 'Injured')
        .map(p => {
            const { skills, archetypes, ovr } = computeRawSkills(p);
            return {
                id: String(p.id), name: p.name, position: p.position, ovr,
                handler: archetypes.handler, three: skills.three, rimProt: archetypes.rimProtector,
            };
        });
    return buildLineupFromCandidates(pool);
}

/** 가용(건강한) 선수 목록으로 라인업을 정한다 — 순수 탐색 부분 */
export function buildLineupFromCandidates(pool: Cand[]): LineupResult {
    const sets = { handlers: topIds(pool, 'handler', HANDLER_TOP), shooters: topIds(pool, 'three', SHOOTER_TOP), rims: topIds(pool, 'rimProt', RIM_TOP) };

    const { withBonus: found, base } = search(pool, sets);
    const picks: (Cand | null)[] = completeGreedy(found?.picks ?? SLOTS.map(() => null), pool);
    const starters = Object.fromEntries(SLOTS.map((s, i) => [s, picks[i]?.id ?? ''])) as Record<Slot, string>;

    // 뎁스차트: 주전 다음은 슬롯별 어색함이 작은 순 → OVR 순. depth 1을 전 슬롯 먼저 채운 뒤 depth 2.
    // 고유 포지션과 한 칸 차이까지만 — 그보다 멀면 빈칸(아무나로 채우면 C가 PG 백업이 됨). 빈칸은 경기 직전 repairAiTactics가 메운다.
    const depthChart: DepthChart = { PG: [null, null, null], SG: [null, null, null], SF: [null, null, null], PF: [null, null, null], C: [null, null, null] };
    const used = new Set<string>();
    SLOTS.forEach(s => { if (starters[s]) { depthChart[s][0] = starters[s]; used.add(starters[s]); } });
    for (let depth = 1; depth <= 2; depth++) {
        for (const maxCost of [0, 1]) {   // 고유 포지션을 먼저, 부족하면 한 칸 차이
            for (const s of SLOTS) {
                if (depthChart[s][depth]) continue;
                const c = pool.filter(x => !used.has(x.id) && fitCost(x, s) <= maxCost).sort((a, b) => (fitCost(a, s) - fitCost(b, s)) || byOvr(a, b))[0];
                if (c) { depthChart[s][depth] = c.id; used.add(c.id); }
            }
        }
    }

    const cover = Object.fromEntries(SLOTS.map(s => [s,
        pool.map(c => ({ id: c.id, cost: fitCost(c, s), ovr: c.ovr }))
            .filter(x => x.cost <= COVER_MAX_COST)
            .sort((a, b) => (a.cost - b.cost) || (b.ovr - a.ovr) || a.id.localeCompare(b.id))
            .map(({ id, cost }) => ({ id, cost })),
    ])) as Record<Slot, { id: string; cost: number }[]>;

    const changedFromOvrOrder = SLOTS
        .map((s, i) => ({ slot: s, ovrPick: base?.picks[i]?.id ?? null, pick: starters[s] }))
        .filter(x => x.ovrPick !== x.pick);

    const chosen = picks.filter((c): c is Cand => !!c);
    const has = {
        handler: chosen.some(c => sets.handlers.has(c.id)),
        shooters: chosen.filter(c => sets.shooters.has(c.id)).length,
        rim: chosen.some(c => sets.rims.has(c.id)),
    };
    const shortage = SLOTS.filter(s => !pool.some(c => c.position === s));
    const nameOf = (id: string | null) => pool.find(c => c.id === id)?.name ?? '-';
    const notes = [
        `주전: ${SLOTS.map(s => `${s} ${nameOf(starters[s] || null)}`).join(' · ')}`,
        `조합: 핸들러 ${has.handler ? 'O' : 'X'} · 슈터 ${has.shooters}명 · 림보호 ${has.rim ? 'O' : 'X'}`,
        ...changedFromOvrOrder.map(c => `조합 반영: ${c.slot} ${nameOf(c.ovrPick)} → ${nameOf(c.pick)}`),
        ...shortage.map(s => `포지션 공급 부족: ${s} — ${nameOf(starters[s] || null)}(${picks[SLOTS.indexOf(s)]?.position ?? '-'})가 대신 맡음`),
    ];

    return {
        starters,
        depthChart,
        cover,
        score: { total: found?.total ?? 0, ovrSum: found?.ovrSum ?? 0, handler: found?.h ?? 0, shooters: found?.sh ?? 0, rim: found?.r ?? 0, anchor: found?.an ?? 0, mismatch: found?.mismatch ?? 0 },
        changedFromOvrOrder,
        has,
        shortage,
        notes,
    };
}
