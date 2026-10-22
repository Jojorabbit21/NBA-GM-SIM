/**
 * rotationBuilder.ts — AI 감독 C3: 로테이션(48분 출전표) 생성 (서버 전용, 계획: docs/plan/ai-coach-plan.md)
 *
 * 입력은 **자기 팀 로스터와 라인업 결과뿐**(상대 팀 미반영, 외부 데이터 없음 — 사용자 확정 2026-10-22 "제안 D").
 * 출력은 엔진이 그대로 쓰는 rotationMap(선수 id → 48칸 출전 여부). 엔진 쪽 전제(슬롯 배정 통일, 부상 후임 선정 통일, 탈진 기준
 * 동적화 — dev-log 2026-10-22)가 이미 끝나 있어, 이 표의 "분당 5명"만 지키면 코트 슬롯은 엔진이 알아서 꼬이지 않게 배정한다.
 *
 * 방식: ① 선수별 목표 출전 시간(T)을 정하고 ② 매 분 "목표 대비 얼마나 뛰었는가"(페이스 부족분)로 코트에 설 5명을 고르는 스케줄러.
 *  ① 목표 시간
 *    - 로테이션 인원 N(5~10): 건강한 선수 수와 벤치 수준으로 결정(벤치가 얇으면 8명, 두꺼우면 9~10명). 선발 5명은 OVR 순, 그다음 벤치 OVR 순으로 순위를 매겨
 *      순위별 기본 시간표(TEMPLATES, 합 240분 = 5자리 × 48분)를 준다.
 *    - 보정: OVR이 로테이션 평균보다 높으면 더 오래(QUALITY_K) · 주전-벤치 격차가 크면 주전이 더 오래(벤치가 약하니까) ·
 *      체력이 낮은 선수(stamina 낮음/오늘 컨디션 낮음)는 상한 낮춤. 상한(CAP)은 물 채우기 방식으로 넘치는 시간을 다른 선수에게 분배.
 *  ② 스케줄러 (매 분)
 *    - 선수별 욕구 d = 페이스 부족분(목표×진행률 − 이미 뛴 분) + 연속 출전 유지 보너스(HYST) − 너무 긴 연속 출전/너무 짧은 휴식 페널티
 *      + 경기 시작·후반 시작에 선발 우대 + 4쿼터 종료 직전 강한 선수 우대 − 상한 초과 페널티.
 *    - 5명 선택: 슬롯별 후보 상위 4명으로 모든 조합을 훑어 Σd − SLOT_WEIGHT × Σ슬롯 어색함(엔진 slotCost와 같은 비용)이 최대인 조합.
 *      → 벤치 가드 한 명이 PG·SG를 번갈아 커버하고, 커버할 사람이 없으면 해당 주전이 더 뛴다(휴식을 포기하는 쪽이 어색한 선수를 세우는 것보다 싸다).
 *  하드 규칙은 "매 분 5명" 하나. 출전 시간 상한은 소프트(건강한 선수가 5~6명이면 상한이 규칙끼리 충돌).
 *  순수 함수, 결정론(동점은 id 순).
 */
import type { Player } from '../../../types.ts';
import type { DepthChart } from '../../../types/tactics.ts';
import { calculateOvr } from '../../../utils/ovrUtils.ts';
import { COURT_SLOTS, listedSlots, slotCost } from '../../../engine/pbp/slotAssignment.ts';
import type { LineupResult, Slot } from './lineupBuilder.ts';

export interface RotationPlayer {
    id: string;
    name: string;
    /** 고유 포지션 */
    position: string;
    ovr: number;
    /** 체력 능력치(0~99) */
    stamina: number;
    /** 경기 시작 컨디션(0~100) */
    condition: number;
}

export interface RotationResult {
    rotationMap: Record<string, boolean[]>;
    /** 선수별 실제 배정된 분 */
    minutes: Record<string, number>;
    /** 선수별 목표 분(스케줄러 입력) */
    targets: Record<string, number>;
    /** 선수별 연속 출전 구간 [시작분, 끝분(미포함)] */
    stints: Record<string, [number, number][]>;
    rotationSize: number;
    /** 분당 예정 인원이 5명이 아닌 분(가용 선수 5명 미만일 때만) */
    shortMinutes: number[];
    notes: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 상수 (근거: 주석 / 초안 — 시험으로 조정)
// ─────────────────────────────────────────────────────────────────────────────

/** 로테이션 인원별 순위 기본 시간표(선발 OVR 순 5명 → 벤치 OVR 순). 합 = 240분. 실제 NBA의 분배 형태를 따른 초안 */
const TEMPLATES: Record<number, number[]> = {
    5: [48, 48, 48, 48, 48],
    6: [40, 40, 40, 40, 40, 40],
    7: [38, 37, 36, 35, 34, 32, 28],
    8: [37, 36, 35, 34, 33, 25, 22, 18],
    9: [35, 34, 33, 32, 31, 24, 20, 17, 14],
    10: [34, 33, 32, 30, 29, 23, 19, 16, 13, 11],
};

/** 9번째/10번째를 쓰는 기준: 선발 평균 OVR보다 이 이상 낮지 않을 때 */
const NINTH_MAX_GAP = 13;
const TENTH_MAX_GAP = 12;
/** OVR 1점당 목표 시간 배율(±) */
const QUALITY_K = 0.006;
/** 주전-벤치(6~8번째) OVR 격차가 이 값을 넘으면 넘는 만큼 주전이 더 뜀(분/명), 한도 ±: 벤치가 약하면 주전이 오래, 벤치가 강하면 짧게 */
const DROPOFF_BASE_GAP = 7;
const DROPOFF_MAX_PLUS = 4;
const DROPOFF_MAX_MINUS = 2;

/**
 * 체력·컨디션을 목표 시간 자체에도 반영(상한에만 넣으면 목표가 상한 근처일 때 효과가 없다 — 2026-10-22 시험에서 stamina 45와 85가
 * 같은 34분이던 문제). stamina 80 기준 1점당 ±STAMINA_TARGET_K, 오늘 컨디션은 100 → 1.0, 낮을수록 줄여 CONDITION_FLOOR까지.
 */
const STAMINA_TARGET_K = 0.005;
const STAMINA_TARGET_MIN = 0.8;
const STAMINA_TARGET_MAX = 1.1;
const CONDITION_FLOOR = 0.75;

/** 지속 가능한 출전 시간 상한(분) = min(CAP_MAX, CAP_BASE + CAP_STAMINA × stamina) × 컨디션 계수 */
const CAP_BASE = 26;
const CAP_STAMINA = 0.18;
const CAP_MAX = 44;

/** 스케줄러 */
const HYST = 5;               // 지금 뛰는 선수 유지 보너스(분 단위 부족분과 같은 척도) — 클수록 교체가 드물고 연속 출전이 길다
const MAX_STINT = 11;         // 이 길이를 넘기면 연속 출전 페널티
const STINT_PENALTY = 2.5;    // 초과 1분당
const MIN_REST = 3;           // 교체로 나온 뒤 이 시간 안에 다시 들어가면 페널티
const REST_PENALTY = 4;
const START_BONUS = 100;      // 경기 시작(0분)·후반 시작(24분)에 선발 우대
const CLUTCH_FROM = 42;       // 4쿼터 종료 6분 전부터 강한 선수 우대
const CLUTCH_K = 0.5;         // (OVR − 로테이션 평균) 1점당
const OVERCAP_PENALTY = 3;    // 상한 초과 1분당
const SLOT_WEIGHT = 4;        // 슬롯 어색함 1점 = 부족분 4분
const CANDIDATES_PER_SLOT = 4;
/**
 * 엇갈린 휴식: 팀 OVR 상위 STAGGER_TOP명 중 STAGGER_MIN명 이상은 항상 코트에 둔다(모자란 1명당 STAGGER_WEIGHT 감점).
 * 이게 없으면 선발 5명이 같은 시간에 한꺼번에 쉬고 벤치 5명이 같이 뛴다 — 실제 농구는 스타를 엇갈려 쉬게 해서 벤치 라인업에도 스타가 남는다.
 */
const STAGGER_TOP = 3;
const STAGGER_MIN = 2;
const STAGGER_WEIGHT = 8;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

// ─────────────────────────────────────────────────────────────────────────────
// 목표 시간
// ─────────────────────────────────────────────────────────────────────────────

function sustainableCap(p: RotationPlayer): number {
    const condFactor = clamp(0.6 + 0.4 * (p.condition / 100), 0.8, 1.0);
    return Math.min(CAP_MAX, CAP_BASE + CAP_STAMINA * p.stamina) * condFactor;
}

/** 로테이션 인원 결정: 선발 5명 + 벤치에서 몇 명을 쓰는가 */
function chooseRotation(players: RotationPlayer[], starterIds: string[]): { starters: RotationPlayer[]; bench: RotationPlayer[] } {
    const byOvr = (a: RotationPlayer, b: RotationPlayer) => (b.ovr - a.ovr) || a.id.localeCompare(b.id);
    const starters = starterIds.map(id => players.find(p => p.id === id)).filter((p): p is RotationPlayer => !!p).sort(byOvr);
    const rest = players.filter(p => !starterIds.includes(p.id)).sort(byOvr);
    const H = players.length;
    if (H <= 7) return { starters, bench: rest };                      // 가용이 적으면 전원
    const starterAvg = avg(starters.map(p => p.ovr));
    let n = 8;
    if (rest[3] && rest[3].ovr >= starterAvg - NINTH_MAX_GAP) {
        n = 9;
        if (rest[4] && rest[4].ovr >= starterAvg - TENTH_MAX_GAP) n = 10;
    }
    return { starters, bench: rest.slice(0, n - starters.length) };
}

function computeTargets(starters: RotationPlayer[], bench: RotationPlayer[]): Record<string, number> {
    const all = [...starters, ...bench];
    const N = all.length;
    const tmpl = TEMPLATES[clamp(N, 5, 10)];
    const base = all.map((_, i) => tmpl[i] ?? 0);
    if (N < 5) return Object.fromEntries(all.map(p => [p.id, 48]));

    // 품질 보정 + 주전/벤치 격차 보정
    const meanOvr = avg(all.map(p => p.ovr));
    const gap = avg(starters.map(p => p.ovr)) - avg(bench.slice(0, 3).map(p => p.ovr));
    const shift = bench.length === 0 ? 0 : clamp(gap - DROPOFF_BASE_GAP, -DROPOFF_MAX_MINUS, DROPOFF_MAX_PLUS);
    const fatigueFactor = (p: RotationPlayer) =>
        clamp(1 + STAMINA_TARGET_K * (p.stamina - 80), STAMINA_TARGET_MIN, STAMINA_TARGET_MAX) * clamp(0.5 + 0.5 * (p.condition / 100), CONDITION_FLOOR, 1.0);
    let t = all.map((p, i) => Math.max(0, base[i] * (1 + QUALITY_K * (p.ovr - meanOvr)) * fatigueFactor(p) + (i < starters.length ? shift : -shift * starters.length / Math.max(1, bench.length))));
    const norm = (arr: number[]) => { const s = arr.reduce((a, b) => a + b, 0) || 1; return arr.map(x => (x * 240) / s); };
    t = norm(t);

    // 상한 — 물 채우기: 상한을 넘는 선수의 초과분을 상한 여유가 있는 선수에게 비례 분배
    const caps = all.map(sustainableCap);
    for (let iter = 0; iter < 8; iter++) {
        let excess = 0;
        const roomIdx: number[] = [];
        t = t.map((x, i) => { if (x > caps[i]) { excess += x - caps[i]; return caps[i]; } if (x < caps[i] - 1e-6) roomIdx.push(i); return x; });
        if (excess < 1e-6 || roomIdx.length === 0) break;
        const roomSum = roomIdx.reduce((s, i) => s + t[i], 0) || 1;
        roomIdx.forEach(i => { t[i] = Math.min(caps[i], t[i] + excess * (t[i] / roomSum)); });
    }
    return Object.fromEntries(all.map((p, i) => [p.id, t[i]]));
}

// ─────────────────────────────────────────────────────────────────────────────
// 스케줄러
// ─────────────────────────────────────────────────────────────────────────────

export function buildRotationFromInputs(
    healthyPlayers: RotationPlayer[],
    starterIds: string[],
    depthChart: DepthChart,
    allRosterIds: string[] = healthyPlayers.map(p => p.id),
): RotationResult {
    const { starters, bench } = chooseRotation(healthyPlayers, starterIds);
    const members = [...starters, ...bench];
    const targets = computeTargets(starters, bench);
    const rotationMap: Record<string, boolean[]> = Object.fromEntries(allRosterIds.map(id => [id, Array(48).fill(false)]));
    const notes: string[] = [];

    // 선수 5명 미만이면 스케줄링 의미 없음 — 있는 선수 전원 48분(나머지는 엔진 폴백)
    if (members.length < 5) {
        for (const p of members) rotationMap[p.id] = Array(48).fill(true);
        return finish(rotationMap, members, targets, notes, [...Array(48).keys()]);
    }

    const meanOvr = avg(members.map(p => p.ovr));
    const caps = new Map(members.map(p => [p.id, sustainableCap(p)]));
    const starterSet = new Set(starters.map(p => p.id));
    // 슬롯별 어색함: 엔진 slotCost와 같은 비용(뎁스차트 등재·고유 포지션 거리)
    const cost = members.map(p => {
        const listed = listedSlots(p.id, depthChart);
        const sp = { playerId: p.id, ovr: p.ovr, position: p.position, nativePosition: p.position };
        return COURT_SLOTS.map(s => slotCost(sp, s, listed, undefined));
    });

    const anchors = new Set([...members].sort((a, b) => (b.ovr - a.ovr) || a.id.localeCompare(b.id)).slice(0, STAGGER_TOP).map(p => p.id));
    const isAnchor = members.map(p => anchors.has(p.id));
    const played = new Map(members.map(p => [p.id, 0]));
    const stint = new Map(members.map(p => [p.id, 0]));
    const rest = new Map(members.map(p => [p.id, 99]));   // 마지막으로 코트를 나온 뒤 지난 분(경기 시작 전에는 충분히 쉰 것으로)
    const on = new Set<string>();
    const shortMinutes: number[] = [];

    for (let m = 0; m < 48; m++) {
        const d = members.map(p => {
            const id = p.id;
            let v = targets[id] * ((m + 0.5) / 48) - played.get(id)!;
            if (on.has(id)) {
                v += HYST;
                if (stint.get(id)! >= MAX_STINT) v -= (stint.get(id)! - MAX_STINT + 1) * STINT_PENALTY;
            } else if (rest.get(id)! < MIN_REST) {
                v -= REST_PENALTY;
            }
            if ((m === 0 || m === 24) && starterSet.has(id)) v += START_BONUS;
            if (m >= CLUTCH_FROM) v += CLUTCH_K * (p.ovr - meanOvr);
            const over = played.get(id)! - caps.get(id)!;
            if (over > 0) v -= (over + 1) * OVERCAP_PENALTY;
            return v;
        });

        // 슬롯별 후보 = (d − SLOT_WEIGHT × 어색함) 상위 N명, 모든 조합 훑기
        const lists = COURT_SLOTS.map((_, si) =>
            members.map((_, k) => k).sort((a, b) => (d[b] - SLOT_WEIGHT * cost[b][si]) - (d[a] - SLOT_WEIGHT * cost[a][si]) || members[a].id.localeCompare(members[b].id)).slice(0, CANDIDATES_PER_SLOT));
        let best = -Infinity; let bestPick: number[] = [];
        const pick: number[] = [];
        const walk = (si: number, used: number, score: number, anchorCount: number) => {
            if (si === COURT_SLOTS.length) {
                const total = score - STAGGER_WEIGHT * Math.max(0, STAGGER_MIN - anchorCount);
                if (total > best + 1e-9) { best = total; bestPick = [...pick]; }
                return;
            }
            for (const k of lists[si]) {
                if (used & (1 << k)) continue;
                pick.push(k);
                walk(si + 1, used | (1 << k), score + d[k] - SLOT_WEIGHT * cost[k][si], anchorCount + (isAnchor[k] ? 1 : 0));
                pick.pop();
            }
        };
        walk(0, 0, 0, 0);
        // 후보 제한으로 5명을 못 채우면(슬롯별 상위 4명이 겹치는 극단) 부족분 상위 선수로 채움
        if (bestPick.length < 5) {
            const chosen = new Set(bestPick);
            const order = members.map((_, k) => k).sort((a, b) => d[b] - d[a] || members[a].id.localeCompare(members[b].id));
            for (const k of order) { if (chosen.size >= 5) break; chosen.add(k); }
            bestPick = [...chosen];
        }

        const nowOn = new Set(bestPick.map(k => members[k].id));
        for (const p of members) {
            const id = p.id;
            if (nowOn.has(id)) {
                rotationMap[id][m] = true;
                played.set(id, played.get(id)! + 1);
                stint.set(id, on.has(id) ? stint.get(id)! + 1 : 1);
                rest.set(id, 0);
            } else {
                stint.set(id, 0);
                rest.set(id, rest.get(id)! + 1);
            }
        }
        on.clear(); nowOn.forEach(id => on.add(id));
        if (nowOn.size < 5) shortMinutes.push(m);
    }
    return finish(rotationMap, members, targets, notes, shortMinutes);
}

function finish(map: Record<string, boolean[]>, members: RotationPlayer[], targets: Record<string, number>, notes: string[], shortMinutes: number[]): RotationResult {
    const minutes: Record<string, number> = {};
    const stints: Record<string, [number, number][]> = {};
    for (const [id, arr] of Object.entries(map)) {
        minutes[id] = arr.filter(Boolean).length;
        const out: [number, number][] = [];
        let s = -1;
        arr.forEach((v, i) => { if (v && s < 0) s = i; if ((!v || i === 47) && s >= 0) { out.push([s, v ? 48 : i]); s = -1; } });
        stints[id] = out;
    }
    return { rotationMap: map, minutes, targets, stints, rotationSize: members.length, shortMinutes, notes };
}

/** 로스터 + 라인업 결과로 로테이션 생성. 부상 선수는 표에서 빠진다 */
export function buildRotation(roster: Player[], lineup: LineupResult): RotationResult {
    const healthy: RotationPlayer[] = roster.filter(p => p.health !== 'Injured').map(p => ({
        id: String(p.id), name: p.name, position: p.position, ovr: calculateOvr(p),
        stamina: p.stamina, condition: p.condition ?? 100,
    }));
    const starterIds = (['PG', 'SG', 'SF', 'PF', 'C'] as Slot[]).map(s => lineup.starters[s]).filter(Boolean);
    return buildRotationFromInputs(healthy, starterIds, lineup.depthChart, roster.map(p => String(p.id)));
}
