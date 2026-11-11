import { SIM_CONFIG } from '../../config/constants';
import type { LivePlayer, TeamState } from './pbpTypes';
import { calculateScoringGravity } from './usageSystem';
import { calculateMatchupGap, MATCHUP_GAP_SCALE, MATCHUP_GAP_HIT_WEIGHT, shotDefenseRating } from './flowEngine';

/**
 * [2026-11-11] 매치업 배정 (MATCHUP_ASSIGN) — server 미러: server/src/shared/engine/pbp/matchupAssign.ts
 *
 * 대인 수비의 "누가 누구를 막나"를 공격권마다 매치업 표 하나로 만든다. possessionHandler의 7곳이 이 표를 읽는다:
 * 1차 수비수 / PnR 스크리너 수비수 / 스위치(스크리너의 수비수가 넘겨받음) / 스크린에 걸리는 핸들러 수비수(롤·팝) /
 * 블리츠 패스아웃 수신자의 수비수 / 프레스 운반자 수비수 / 헬프 킥아웃 대상(헬퍼가 막던 공격수).
 * 대상 아님: 지역방어 위치(앵커), 포스트 크로스매치, 헬프·트랩·림 프로텍터 후보 풀, 스토퍼(휴면, 표보다 먼저).
 *
 * 1) 기본 = 같은 코트 슬롯(position)의 수비수 — 이전 포지션 조회와 동일.
 * 2) ENABLED + 대인방어 공격: 상대 코트 위 득점 위협(calculateScoringGravity) 1위에게, 슬롯 ±ADJACENT_RANGE 수비수 중
 *    적합도(matchupFit) 최고를 붙이고 밀려난 수비수는 그 수비수가 막던 공격수에게 간다(맞교환).
 *    맞교환으로 그 공격수 쪽이 손해 보는 만큼(득점 위협 비율로 가중)을 빼고도 이득일 때만 바꾼다. 대가(체력·헬프 제외) 없음.
 *    지역방어 공격은 위치가 수비수를 정하므로 1)만.
 * 스크린 스위치는 그대로 작동(배정을 깨는 공격 수단) — 미스매치는 calculateMatchupGap이 처리, 다음 공격에 배정 복원.
 * 상세·측정: docs/history/dev-log.md 2026-11-11 (매치업 배정).
 */
export const MATCHUP_ASSIGN = {
    ENABLED: true,
    /** 배정 후보 = 위협 선수 슬롯 ± 이 값 (PG1 SG2 SF3 PF4 C5) */
    ADJACENT_RANGE: 1,
} as const;

/** 공격수 playerId → 배정 수비수 */
export type MatchupTable = Map<string, LivePlayer>;

const SLOT_INDEX: Record<string, number> = { PG: 1, SG: 2, SF: 3, PF: 4, C: 5 };

/**
 * 수비수 D가 공격수 X를 막을 때의 억제력 — 엔진 슛 판정과 같은 등급(shotDefenseRating)·수비 계수·방해 계수·
 * 매치업 격차 규칙을 X의 존 성향(zonePref)으로 가중 평균. 3점·미드 = 풀업 방해, 림·페인트 = 레이업 방해.
 */
export function matchupFit(D: LivePlayer, X: LivePlayer): number {
    const S = SIM_CONFIG.SHOOTING;
    const C = SIM_CONFIG.SHOT_DEFENSE.CONTEST;
    const zp = X.zonePref;
    const inside = zp.itp + zp.ra;
    const total = zp.three + zp.mid + inside;
    if (!(total > 0)) return 0;
    const term = (zone: 'Rim' | 'Mid' | '3PT', contest: number, coeff: number) =>
        shotDefenseRating(D, zone) * contest * coeff
        - Math.max(-1, Math.min(1, calculateMatchupGap(X, D, zone) / MATCHUP_GAP_SCALE)) * MATCHUP_GAP_HIT_WEIGHT;
    return (zp.three * term('3PT', C.Pullup, S.THREE_DEF_COEFF)
        + zp.mid * term('Mid', C.Pullup, S.MID_DEF_COEFF)
        + inside * term('Rim', C.Layup, S.INSIDE_DEF_COEFF)) / total;
}

/** 공격권 시작 시 1회 — isZone이면 위치(같은 슬롯)만, 대인방어면 위협 1위 배정까지. Math.random 미사용. */
export function buildMatchupTable(offTeam: TeamState, defTeam: TeamState, isZone: boolean): MatchupTable {
    const table: MatchupTable = new Map();
    for (const o of offTeam.onCourt) {
        const d = defTeam.onCourt.find(p => p.position === o.position);
        if (d) table.set(o.playerId, d);
    }
    if (MATCHUP_ASSIGN.ENABLED && !isZone) assignTopThreat(table, offTeam, defTeam);
    return table;
}

/** 표에서 수비수 defender가 맡은 공격수(candidates 중) — 헬프 킥아웃 대상 */
export function findAssignedAttacker(table: MatchupTable, candidates: LivePlayer[], defender: LivePlayer): LivePlayer | undefined {
    return candidates.find(o => table.get(o.playerId)?.playerId === defender.playerId);
}

function assignTopThreat(table: MatchupTable, offTeam: TeamState, defTeam: TeamState): void {
    if (offTeam.onCourt.length === 0 || defTeam.onCourt.length === 0) return;
    const io = offTeam.tactics.sliders.insideOut;
    const gravity = new Map(offTeam.onCourt.map(p => [p.playerId, calculateScoringGravity(p, io)] as const));
    const grav = (p: LivePlayer) => gravity.get(p.playerId) ?? 0;
    const top = offTeam.onCourt.reduce((best, p) => grav(p) > grav(best) ? p : best, offTeam.onCourt[0]);

    const current = table.get(top.playerId);
    if (!current) return;
    const topSlot = SLOT_INDEX[top.position] ?? 3;
    let best: LivePlayer | undefined;
    let bestFit = -Infinity;
    for (const d of defTeam.onCourt) {
        if (Math.abs((SLOT_INDEX[d.position] ?? 3) - topSlot) > MATCHUP_ASSIGN.ADJACENT_RANGE) continue;
        const fit = matchupFit(d, top);
        if (fit > bestFit) { best = d; bestFit = fit; }
    }
    if (!best || best.playerId === current.playerId) return;

    const chosen = best;
    const holder = offTeam.onCourt.find(o => o.playerId !== top.playerId && table.get(o.playerId)?.playerId === chosen.playerId);
    const gain = bestFit - matchupFit(current, top);
    const loss = holder
        ? (matchupFit(chosen, holder) - matchupFit(current, holder)) * (grav(holder) / Math.max(1, grav(top)))
        : 0;
    if (gain - loss <= 0) return;
    table.set(top.playerId, chosen);
    if (holder) table.set(holder.playerId, current);
}
