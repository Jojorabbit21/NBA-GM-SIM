
import { GameState, TeamState, LivePlayer, EjectionReason, isOut } from './pbpTypes.ts';
import { isOvertimeClutch } from './periodRules.ts';


// [2026-10-07] 퇴장 사유별 교체 로그 문구 (`교체: IN [..] OUT [..] (사유)`)
const EJECTION_REASON_TEXT: Record<EjectionReason, string> = {
    foul_out:  '6반칙 퇴장',
    technical: '테크니컬 퇴장',
    flagrant:  '플래그런트 퇴장',
    fight:     '싸움 퇴장',
};
// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface SubRequestV2 {
    outPlayer: LivePlayer;
    reason: string;
    exitType: 'permanent' | 'temporary';
    returnMinute?: number | null;
    benchReason: 'foul_trouble' | 'shutdown' | 'injury' | 'foul_out' | 'garbage' | null;
}

interface FoulTroubleAction {
    shouldBench: boolean;
    returnMinute: number | null;
    reason: string;
}

export const HARD_FLOOR = 20;

// [2026-10-22] 탈진 교체 기준을 "쓸 수 있는 벤치 선수 수"에 따라 낮춘다. 쓸 수 있는 벤치 = 건강하고, 퇴장·탈진·임시 벤치가 아니고,
// 코트에 없는 선수. 벤치가 얇은데 20%에서 계속 빼면 지친 대체자와 번갈아 들락거리거나(체력 회복 기준이 70%라 한 번 탈진하면 오래
// 못 돌아옴) 바꿀 사람이 없어도 탈진 플래그만 켜진다. 사람이 부족할수록 지친 채로 버티게 한다(성능 페널티는 기존 체력 시스템 그대로).
//   쓸 수 있는 벤치 3명 이상: ×1 (기준 20%, 지금과 같음) / 2명: ×0.75 (15%) / 1명: ×0.5 (10%) / 0명: ×0 (빼지 않음)
export function shutdownFloorScale(usableBench: number): number {
    if (usableBench >= 3) return 1;
    if (usableBench === 2) return 0.75;
    if (usableBench === 1) return 0.5;
    return 0;
}
/** 탈진 교체는 대체자의 체력이 지금 선수보다 이만큼 이상 높을 때만(18%인 선수를 22%로 바꿔봐야 의미가 없다) */
export const SHUTDOWN_MIN_GAIN = 15;

// ─────────────────────────────────────────────────────────────
// Foul Trouble Decision Matrix
// ─────────────────────────────────────────────────────────────
// [2026-10-23] 4파울부터만, 주전/벤치 구분 없이 적용한다. 복귀 시각은 항상 정해져 있다(경기 끝까지 벤치 = 영구 벤치는 없음 —
// 영구 이탈은 부상·퇴장 전용). 3파울 이하는 벤치로 빼지 않고 파울 회피(SIM_CONFIG.FOUL_TROUBLE.PROB_MOD)만으로 버틴다.
//   Q1·Q2 4파울+ → 후반 시작(24분)까지 휴식
//   Q3 4파울     → 6분 휴식
//   Q3 5파울     → 4Q 시작(36분)까지 휴식
//   Q4 5파울     → 클러치(42분) 전이면 3분 휴식(최대 45분), 클러치면 계속 출전
//   Q4 4파울 / 연장 → 계속 출전
// 판정은 파울이 새로 늘었을 때 한 번만 한다(checkSubstitutionsV2의 foulCheckedPf) — 쿼터가 바뀌었다고 복귀한 선수를 같은 파울
// 수로 다시 빼지 않는다(이전: 복귀 시각에 재평가해 "1Q 2파울 6분 휴식"이 6분씩 계속 연장됨).
// ─────────────────────────────────────────────────────────────

export function evaluateFoulTroubleAction(
    state: GameState, player: LivePlayer, currentMinute: number
): FoulTroubleAction {
    const quarter = state.quarter;
    const fouls = player.pf;
    let returnMinute: number | null = null;
    let note = '';
    if (quarter <= 2 && fouls >= 4) { returnMinute = 24; note = '후반 투입'; }
    else if (quarter === 3 && fouls >= 5) { returnMinute = 36; note = '4쿼터 투입'; }
    else if (quarter === 3 && fouls === 4) { returnMinute = currentMinute + 6; note = '6분 휴식'; }
    else if (quarter === 4 && fouls >= 5 && currentMinute < 42) { returnMinute = Math.min(45, currentMinute + 3); note = '잠시 휴식'; }

    if (returnMinute === null || returnMinute <= currentMinute) return { shouldBench: false, returnMinute: null, reason: '' };
    return { shouldBench: true, returnMinute, reason: `파울 트러블 (${fouls}반칙, ${note})` };
}

// ─────────────────────────────────────────────────────────────
// V2 Substitution Check
// ─────────────────────────────────────────────────────────────

export function checkSubstitutionsV2(
    state: GameState, team: TeamState, currentMinute: number
): SubRequestV2[] {
    const { tactics } = team;
    const scoreDiff = Math.abs(state.home.score - state.away.score);

    const isClutch = state.quarter >= 4 && currentMinute >= 42;   // [2026-10-26] 연장 포함(연장 분 = 43~47)
    if (isClutch) {
        const clutchRequests: SubRequestV2[] = [];

        team.onCourt.forEach(p => {
            if (p.benchReason) return;
            const cfg = tactics.playerTactics?.[p.playerId];
            if (cfg?.clutchPolicy === 'must-bench') {
                clutchRequests.push({
                    outPlayer: p,
                    reason: '클러치 보호(벤치)',
                    exitType: 'permanent',
                    returnMinute: null,
                    benchReason: 'garbage',
                });
            }
        });

        team.bench.forEach(p => {
            if (p.health === 'Injured' || isOut(p)) return;
            const cfg = tactics.playerTactics?.[p.playerId];
            if (cfg?.clutchPolicy === 'must-play') {
                if (!tactics.rotationMap![p.playerId]) {
                    tactics.rotationMap![p.playerId] = Array(48).fill(false);
                }
                for (let i = currentMinute; i < 48; i++) {
                    tactics.rotationMap![p.playerId][i] = true;
                }
                const swapCandidates = team.onCourt
                    .filter(c => tactics.playerTactics?.[c.playerId]?.clutchPolicy !== 'must-play')
                    .sort((a, b) => a.ovr - b.ovr);
                const swap = swapCandidates[0];
                if (swap && tactics.rotationMap![swap.playerId]) {
                    for (let i = currentMinute; i < 48; i++) {
                        tactics.rotationMap![swap.playerId][i] = false;
                    }
                }
            }
        });

        if (clutchRequests.length > 0) return clutchRequests;
    }

    const isGarbage = state.simSettings.garbageTimeEnabled !== false
        && state.quarter >= 4 && state.gameClock < 150 && scoreDiff >= 15
        && !team.garbageApplied;

    if (isGarbage) {
        team.garbageApplied = true;
        return team.onCourt
            .filter(p => {
                if (p.health === 'Injured' || isOut(p)) return false;
                const cfg = tactics.playerTactics?.[p.playerId];
                return cfg?.garbagePolicy !== 'play';
            })
            .map(p => ({
                outPlayer: p,
                reason: '가비지 타임',
                exitType: 'permanent' as const,
                benchReason: 'garbage' as const,
            }));
    }

    const requests: SubRequestV2[] = [];

    if (state.simSettings.garbageTimeEnabled !== false && state.quarter >= 4 && scoreDiff >= 15) {
        team.onCourt.forEach(p => {
            if (p.benchReason) return;
            const cfg = tactics.playerTactics?.[p.playerId];
            if (cfg?.garbagePolicy === 'bench') {
                requests.push({
                    outPlayer: p,
                    reason: '가비지타임 미출전',
                    exitType: 'permanent',
                    returnMinute: null,
                    benchReason: 'garbage',
                });
            }
        });
    }

    team.onCourt.forEach(p => {
        if (p.benchReason) return;

        const playerConfig = tactics.playerTactics?.[p.playerId];

        if (p.health === 'Injured' && p.injuredThisGame) {
            requests.push({ outPlayer: p, reason: '부상', exitType: 'permanent', benchReason: 'injury' });
            return;
        }
        if (isOut(p)) {
            // [2026-10-07] pf=6은 테크니컬 2회/플래그런트 2/싸움 퇴장의 마커로도 쓰이므로 사유 문구를 ejectionReason으로 분기
            requests.push({ outPlayer: p, reason: EJECTION_REASON_TEXT[p.ejectionReason ?? 'foul_out'], exitType: 'permanent', benchReason: 'foul_out' });
            return;
        }

        const restThreshold = playerConfig?.restThreshold ?? 0;
        // [2026-10-22] 쓸 수 있는 벤치 수에 따라 기준 완화 + 대체자가 확실히 나을 때만 교체(shutdownFloorScale / SHUTDOWN_MIN_GAIN)
        const usableBench = team.bench.filter(b => b.health === 'Healthy' && !isOut(b) && !b.isShutdown && !b.benchReason);
        const effectiveFloor = Math.max(HARD_FLOOR, restThreshold) * shutdownFloorScale(usableBench.length);
        const bestAltCondition = usableBench.reduce((m, b) => Math.max(m, b.currentCondition), -Infinity);
        // [2026-10-26] 연장 마지막 2분(클러치)엔 주전을 탈진 교체하지 않는다
        const otClutchStarter = isOvertimeClutch(state) && p.gs === 1;
        if (!otClutchStarter && p.currentCondition <= effectiveFloor && bestAltCondition >= p.currentCondition + SHUTDOWN_MIN_GAIN) {
            p.isShutdown = true;
            requests.push({
                outPlayer: p,
                reason: restThreshold > HARD_FLOOR ? `휴식(${restThreshold}% 임계치)` : '탈진(Shutdown)',
                exitType: 'temporary',
                returnMinute: null,
                benchReason: 'shutdown',
            });
            return;
        }
        // [2026-10-23] 파울 트러블: 로테이션 표에 있는 분에도 판정한다(이전엔 표에 없는 분에만 판정 → 표대로 나갈 때 사유만 붙고
        // 3파울에도 계속 뛰었다). 적용 여부는 foulPolicy만으로 정한다. 파울이 새로 늘었을 때 한 번만 판정 — 벤치가 성공하면
        // benchForFoulTrouble이 foulCheckedPf를 갱신하고, 대신 뛸 사람이 없어 실패하면 다음 공격권에 다시 시도한다.
        const ignoreFoul = playerConfig?.foulPolicy === 'ignore';
        if (!ignoreFoul && p.pf > (p.foulCheckedPf ?? 0)) {
            const action = evaluateFoulTroubleAction(state, p, currentMinute);
            if (action.shouldBench) {
                requests.push({
                    outPlayer: p,
                    reason: action.reason,
                    exitType: 'temporary',
                    returnMinute: action.returnMinute,
                    benchReason: 'foul_trouble'
                });
                return;
            }
            p.foulCheckedPf = p.pf;
        }
    });

    return requests;
}
