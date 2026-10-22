/**
 * rotationSuccession.ts — 나간 선수의 로테이션 출전 시간을 누가 이어받는가 (server 미러: server/src/shared/engine/pbp/rotationSuccession.ts)
 *
 * [2026-10-22] 이전에는 같은 일을 하는 코드가 두 곳에 서로 다르게 있었다.
 *   - 경기 전(initializer 3.5): 후임에게 시간을 덧붙이기만 함 → 백업이 48분 풀타임, 후임이 그 분에 이미 뛰면 겹쳐서 그 분에
 *     4명만 예정(실측: GS 리브스 24→48분, 로테이션 표 총합 231분 / 240분), 선발은 이 처리보다 먼저 별도 규칙(OVR 순)으로 정해져
 *     표와 어긋남(CLE 허드슨/스트릭랜드).
 *   - 경기 중(rotationLogic.applyRotationSuccession): 한 칸씩 올리지만 후임의 건강·중복 출전을 확인하지 않음.
 * 이 함수 하나가 둘 다 처리한다. 로테이션 맵(rotationMap: 선수별 48분 출전 여부)을 직접 갱신한다.
 *
 * 규칙 (docs/plan/ai-coach-plan.md, 사용자 확정 2026-10-22)
 *  하드 규칙은 하나뿐: 매 분 나가기 전 예정 인원(최대 5)을 유지한다. 나머지는 전부 선호(점수)이며 후보를 막는 문턱이 아니다 —
 *  출전 시간 상한 같은 하드 제한을 두면 건강한 선수가 5~6명일 때 규칙끼리 충돌한다.
 *  1) 역할 승계(waterfall): 같은 슬롯 뎁스차트에서 건강한 선수를 순서대로 세워 주전 역할·백업 역할·써드 역할(= 원래 그 순번
 *     선수의 출전 패턴)을 한 칸씩 위로 올린다. 백업이 주전 역할을 맡으면 백업의 원래 시간은 써드에게 넘어간다(백업 48분 방지).
 *  2) 남은 구멍 메우기: 승계 후에도 그 분의 예정 인원이 모자라면, 그 분에 쉬고 있는 선수 중 점수가 가장 낮은 선수가 맡는다.
 *       점수 = 자리 적합도(slotAssignment.vacancyFit: 뎁스 주전 0 / 백업·고유 0.6 / 한 칸 1 / 두 칸 3 / 세 칸+ 10)
 *            + LOAD_WEIGHT × 이미 예정된 분(많이 뛰는 선수일수록 불리 → "인접 포지션 비주전 > 주전 연장 > 두 칸 이상 떨어진 선수" 순이 자연히 나옴)
 *            + 컨디션 단계 페널티(TIER_PENALTY: 탈진·임시 벤치 +20, 부상 +100 → 건강한 선수가 없을 때만 선택됨, 부상은 복귀가 빠른 순)
 *            − 직전 분에도 같은 자리를 메운 선수 우대(CONTINUITY_BONUS, 들락거림 방지)
 *  선발도 이 결과 표의 0분 출전자로 정한다(initializer) — 별도 OVR 규칙으로 채우지 않는다.
 *
 *  메우는 대상은 "나간 선수 때문에 줄어든 분"만이다: 목표 인원 = min(5, 처리 전 그 분의 예정 인원). 사용자가 원래부터 비워 둔
 *  분(예정 5명 미만)은 건드리지 않는다(런타임 폴백 몫).
 */
import type { DepthChart } from '../../../../types';
import { COURT_SLOTS, vacancyFit, type Slot, type SlotPlayer } from './slotAssignment';

/**
 * 0 정상 / 1 탈진·임시 벤치 / 2 부상(경증 우선, 마지막 수단) / 3 퇴장·방금 이탈 등 완전 불가(후보에서 제외).
 * outIds(시간을 비워야 하는 선수)와 tier는 별개다: 경기 전 부상자는 outIds이면서 tier 2(건강한 선수가 모자랄 때만 다시 투입),
 * 경기 중 방금 이탈한 선수는 outIds이면서 tier 3.
 */
export type SuccessionTier = 0 | 1 | 2 | 3;

export interface SuccessionPlayer {
    id: string;
    ovr: number;
    nativePosition: string;
    tier: SuccessionTier;
    /** tier 2 정렬용(ISO 날짜, 빠를수록 가벼운 부상). 없으면 OVR로 */
    returnDate?: string;
}

export interface SuccessionResult {
    /** 승계한 선수 id → 새로 맡은 분 수 */
    promoted: { id: string; slot: Slot; role: number; minutes: number }[];
    /** 구멍 메우기로 채운 (분, 선수) */
    filled: { minute: number; id: string; score: number }[];
    /** 후보가 없어 못 채운 분 (건강·탈진·부상 후보가 모두 이미 예정된 경우 = 로스터 전체가 5명 미만) */
    unfilled: number[];
}

/** 이미 예정된 분 1분당 점수 가산 — 48분 풀타임이면 약 2.9점(두 칸 떨어진 선수 3점과 비슷) */
const LOAD_WEIGHT = 0.06;
const TIER_PENALTY: Record<SuccessionTier, number> = { 0: 0, 1: 20, 2: 100, 3: Infinity };
/** 부상 후보끼리 복귀가 빠른 순 정렬용 순위당 가산 */
const INJURY_RANK_STEP = 0.5;
/** 직전 분에 같은 구멍을 메운 선수 우대 */
const CONTINUITY_BONUS = 0.4;

const countsAt = (map: Record<string, boolean[]>, known: Set<string>): number[] =>
    Array.from({ length: 48 }, (_, m) => {
        let n = 0;
        for (const id of known) if (map[id]?.[m]) n++;
        return n;
    });

/** 선수의 "소속 슬롯": 뎁스차트에서 주전으로 등재된 슬롯, 없으면 처음 등재된 슬롯 */
function ownerSlot(id: string, depthChart: DepthChart | undefined): Slot | null {
    if (!depthChart) return null;
    for (const s of COURT_SLOTS) if (depthChart[s]?.[0] === id) return s;
    for (const s of COURT_SLOTS) if (depthChart[s]?.includes(id)) return s;
    return null;
}

/**
 * outIds 선수들의 fromMinute 이후 출전 시간을 이어받을 사람을 정해 map을 직접 갱신한다.
 * map의 키는 선수 id, 값은 48칸 출전 여부. players에 없는 id(유령)는 건드리지 않고 인원 계산에서도 제외한다.
 */
export function planSuccession(opts: {
    outIds: readonly string[];
    fromMinute: number;
    rotationMap: Record<string, boolean[]>;
    depthChart: DepthChart | undefined;
    players: readonly SuccessionPlayer[];
}): SuccessionResult {
    const { fromMinute, rotationMap: map, depthChart } = opts;
    const players = [...opts.players].sort((a, b) => a.id.localeCompare(b.id));
    const byId = new Map(players.map(p => [p.id, p]));
    const known = new Set(byId.keys());
    const outSet = new Set(opts.outIds.filter(id => byId.has(id)));
    const result: SuccessionResult = { promoted: [], filled: [], unfilled: [] };
    if (outSet.size === 0) return result;

    const ensure = (id: string) => (map[id] ??= Array(48).fill(false));
    const before = countsAt(map, known);

    // ── 1) 슬롯별 역할 승계 ──
    for (const slot of COURT_SLOTS) {
        const chart = depthChart?.[slot] ?? [];
        const listed: string[] = [];
        for (const id of chart) {
            if (id && byId.has(id) && ownerSlot(id, depthChart) === slot && !listed.includes(id)) listed.push(id);
        }
        if (!listed.some(id => outSet.has(id))) continue;

        const patterns = listed.map(id => (map[id] ?? Array(48).fill(false)).slice(fromMinute) as boolean[]);
        const chain = listed.filter(id => !outSet.has(id) && byId.get(id)!.tier === 0);

        // 나간 선수 시간 비우기 → 건강한 선수가 순서대로 역할을 한 칸씩 올려 받음
        for (const id of listed) if (outSet.has(id)) for (let m = fromMinute; m < 48; m++) ensure(id)[m] = false;
        chain.forEach((id, j) => {
            const arr = ensure(id);
            let gained = 0;
            for (let m = fromMinute; m < 48; m++) {
                const v = patterns[j][m - fromMinute];
                if (v && !arr[m]) gained++;
                arr[m] = v;
            }
            if (id !== listed[j] || gained > 0) result.promoted.push({ id, slot, role: j, minutes: patterns[j].filter(Boolean).length });
        });
    }
    // 소속 슬롯이 없는 나간 선수(뎁스차트에 없음) → 시간만 비움, 구멍은 2)가 메움
    for (const id of outSet) for (let m = fromMinute; m < 48; m++) if (map[id]) map[id][m] = false;

    // ── 2) 남은 구멍 메우기 ──
    const injuredRank = new Map(
        players.filter(p => p.tier === 2)
            .sort((a, b) => (a.returnDate ?? '9999').localeCompare(b.returnDate ?? '9999') || b.ovr - a.ovr || a.id.localeCompare(b.id))
            .map((p, i) => [p.id, i]),
    );
    const slotPlayer = (p: SuccessionPlayer): SlotPlayer => ({ playerId: p.id, ovr: p.ovr, position: p.nativePosition, nativePosition: p.nativePosition });
    let prevFillers = new Set<string>();
    for (let m = fromMinute; m < 48; m++) {
        const target = Math.min(5, before[m]);
        const scheduled = () => players.filter(p => map[p.id]?.[m]);
        const fillers = new Set<string>();
        while (scheduled().length < target) {
            const onNow = scheduled();
            const onSlot = onNow.map(slotPlayer);
            let best: { p: SuccessionPlayer; score: number } | null = null;
            for (const p of players) {
                if (p.tier === 3 || map[p.id]?.[m]) continue;
                const load = (map[p.id] ?? []).reduce((n, v) => n + (v ? 1 : 0), 0);
                let score = vacancyFit(slotPlayer(p), onSlot, depthChart)
                    + LOAD_WEIGHT * load
                    + TIER_PENALTY[p.tier]
                    + (p.tier === 2 ? INJURY_RANK_STEP * (injuredRank.get(p.id) ?? 0) : 0)
                    - (prevFillers.has(p.id) ? CONTINUITY_BONUS : 0);
                // 동점: OVR 높은 쪽 → id 사전순(players가 id 정렬되어 먼저 나온 쪽 유지)
                if (!best || score < best.score - 1e-9 || (Math.abs(score - best.score) <= 1e-9 && p.ovr > best.p.ovr)) best = { p, score };
            }
            if (!best) { result.unfilled.push(m); break; }
            ensure(best.p.id)[m] = true;
            fillers.add(best.p.id);
            result.filled.push({ minute: m, id: best.p.id, score: best.score });
        }
        prevFillers = fillers;
    }
    return result;
}
