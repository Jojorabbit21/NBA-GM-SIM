
import { GameState, TeamState, LivePlayer } from './pbpTypes.ts';

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
            if (p.health === 'Injured' || p.pf >= 6) return;
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

    const isGarbage = state.quarter >= 4 && state.gameClock < 150 && scoreDiff >= 15
        && !team.garbageApplied;

    if (isGarbage) {
        team.garbageApplied = true;
        return team.onCourt
            .filter(p => {
                if (p.health === 'Injured' || p.pf >= 6) return false;
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

    if (state.quarter >= 4 && scoreDiff >= 15) {
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
        if (p.pf >= 6) {
            requests.push({ outPlayer: p, reason: '6반칙 퇴장', exitType: 'permanent', benchReason: 'foul_out' });
            return;
        }

        const restThreshold = playerConfig?.restThreshold ?? 0;
        const effectiveFloor = Math.max(HARD_FLOOR, restThreshold);
        if (p.currentCondition <= effectiveFloor) {
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
