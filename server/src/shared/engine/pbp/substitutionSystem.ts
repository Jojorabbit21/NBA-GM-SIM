
import { GameState, TeamState, LivePlayer, EjectionReason, isOut } from './pbpTypes.ts';


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

type PlayerImportance = 'star' | 'rotation' | 'bench';

interface FoulTroubleAction {
    shouldBench: boolean;
    returnMinute: number | null;
    reason: string;
}

const HARD_FLOOR = 20;

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
// Player Importance Classification
// ─────────────────────────────────────────────────────────────

function classifyPlayerImportance(team: TeamState, player: LivePlayer): PlayerImportance {
    const allPlayers = [...team.onCourt, ...team.bench];
    const sortedOvr = allPlayers.map(p => p.ovr).sort((a, b) => b - a);
    const top3Threshold = sortedOvr[Math.min(2, sortedOvr.length - 1)];

    if (player.ovr >= top3Threshold && player.isStarter) return 'star';
    if (player.isStarter) return 'rotation';
    return 'bench';
}

// ─────────────────────────────────────────────────────────────
// Foul Trouble Decision Matrix
// ─────────────────────────────────────────────────────────────

export function evaluateFoulTroubleAction(
    state: GameState, team: TeamState, player: LivePlayer, currentMinute: number
): FoulTroubleAction {
    const quarter = state.quarter;
    const fouls = player.pf;
    const importance = classifyPlayerImportance(team, player);
    const isClutch = currentMinute >= 42;
    const halfEnd = 24;

    if (quarter === 4) {
        if (fouls === 5 && importance === 'star' && !isClutch) {
            return {
                shouldBench: true,
                returnMinute: Math.min(45, currentMinute + 3),
                reason: `파울 트러블 (${fouls}반칙, 잠시 휴식)`
            };
        }
        if (fouls === 5 && importance === 'bench') {
            return { shouldBench: true, returnMinute: null, reason: `파울 트러블 (${fouls}반칙)` };
        }
        return { shouldBench: false, returnMinute: null, reason: '' };
    }

    if (quarter === 3) {
        if (fouls >= 5) {
            if (importance === 'star') {
                return {
                    shouldBench: true,
                    returnMinute: currentMinute + 4,
                    reason: `파울 트러블 (${fouls}반칙, 단기 휴식)`
                };
            }
            return { shouldBench: true, returnMinute: null, reason: `파울 트러블 (${fouls}반칙)` };
        }
        if (fouls >= 4) {
            return {
                shouldBench: true,
                returnMinute: currentMinute + 6,
                reason: `파울 트러블 (${fouls}반칙)`
            };
        }
        return { shouldBench: false, returnMinute: null, reason: '' };
    }

    if (quarter === 2) {
        if (fouls >= 5) {
            if (importance === 'star') {
                return { shouldBench: true, returnMinute: halfEnd, reason: `파울 트러블 (${fouls}반칙, 후반 투입)` };
            }
            return { shouldBench: true, returnMinute: null, reason: `파울 트러블 (${fouls}반칙)` };
        }
        if (fouls >= 4) {
            return { shouldBench: true, returnMinute: halfEnd, reason: `파울 트러블 (${fouls}반칙, 하프타임까지 휴식)` };
        }
        if (fouls >= 3) {
            if (importance === 'bench') {
                return { shouldBench: true, returnMinute: null, reason: `파울 트러블 (${fouls}반칙)` };
            }
            return { shouldBench: true, returnMinute: currentMinute + 6, reason: `파울 트러블 (${fouls}반칙)` };
        }
        return { shouldBench: false, returnMinute: null, reason: '' };
    }

    if (quarter === 1) {
        if (fouls >= 4) {
            if (importance === 'star') {
                return { shouldBench: true, returnMinute: halfEnd, reason: `파울 트러블 (${fouls}반칙, 후반 투입)` };
            }
            return { shouldBench: true, returnMinute: null, reason: `파울 트러블 (${fouls}반칙)` };
        }
        if (fouls >= 3) {
            if (importance === 'bench') {
                return { shouldBench: true, returnMinute: null, reason: `파울 트러블 (${fouls}반칙)` };
            }
            return { shouldBench: true, returnMinute: halfEnd, reason: `파울 트러블 (${fouls}반칙, 후반 투입)` };
        }
        if (fouls >= 2) {
            return { shouldBench: true, returnMinute: currentMinute + 6, reason: `파울 트러블 (${fouls}반칙)` };
        }
        return { shouldBench: false, returnMinute: null, reason: '' };
    }

    return { shouldBench: false, returnMinute: null, reason: '' };
}

// ─────────────────────────────────────────────────────────────
// V2 Substitution Check
// ─────────────────────────────────────────────────────────────

export function checkSubstitutionsV2(
    state: GameState, team: TeamState, currentMinute: number
): SubRequestV2[] {
    const { tactics } = team;
    const scoreDiff = Math.abs(state.home.score - state.away.score);

    const isClutch = state.quarter === 4 && currentMinute >= 42;
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
        const isScheduled = tactics.rotationMap?.[p.playerId]?.[currentMinute];

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
        if (p.currentCondition <= effectiveFloor && bestAltCondition >= p.currentCondition + SHUTDOWN_MIN_GAIN) {
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

        const ignoreFoul = playerConfig?.foulPolicy === 'ignore';
        if (!isScheduled && !ignoreFoul) {
            const action = evaluateFoulTroubleAction(state, team, p, currentMinute);
            if (action.shouldBench) {
                requests.push({
                    outPlayer: p,
                    reason: action.reason,
                    exitType: action.returnMinute !== null ? 'temporary' : 'permanent',
                    returnMinute: action.returnMinute,
                    benchReason: 'foul_trouble'
                });
                return;
            }
        }
    });

    return requests;
}
