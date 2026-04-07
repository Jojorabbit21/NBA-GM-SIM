
import { GameState, TeamState, LivePlayer } from './pbpTypes';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface SubRequestV2 {
    outPlayer: LivePlayer;
    reason: string;
    exitType: 'permanent' | 'temporary';
    returnMinute?: number | null;   // null = 복귀 없음, number = 자동 복귀 예정 분
    benchReason: 'foul_trouble' | 'shutdown' | 'injury' | 'foul_out' | 'garbage' | null;
}

type PlayerImportance = 'star' | 'rotation' | 'bench';

interface FoulTroubleAction {
    shouldBench: boolean;
    returnMinute: number | null;
    reason: string;
}

const HARD_FLOOR = 20; // Condition below 20 -> Shutdown (Emergency)

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
// quarter × foul_count × player_importance → action
//
// STAY   = 계속 기용
// REST_N = N분 휴식 후 자동 복귀
// HALF   = 전반 끝까지 휴식 (returnMinute = 24)
// GAME   = 경기 나머지 출전 안함 (returnMinute = null)
// BRIEF  = 3분만 휴식 후 복귀
// ─────────────────────────────────────────────────────────────

export function evaluateFoulTroubleAction(
    state: GameState, team: TeamState, player: LivePlayer, currentMinute: number
): FoulTroubleAction {
    const quarter = state.quarter;
    const fouls = player.pf;
    const importance = classifyPlayerImportance(team, player);
    const isClutch = currentMinute >= 42; // Q4 6:00 이하
    const halfEnd = 24;

    // ── Q4: 거의 벤치 안함 ──
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

    // ── Q3 ──
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

    // ── Q2 ──
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

    // ── Q1 ──
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
// V2 Substitution Check (Emergency + Foul Trouble Matrix)
// ─────────────────────────────────────────────────────────────

export function checkSubstitutionsV2(
    state: GameState, team: TeamState, currentMinute: number
): SubRequestV2[] {
    const { tactics } = team;
    const scoreDiff = Math.abs(state.home.score - state.away.score);

    // ── Priority 0: 클러치 정책 (Q4 마지막 6분, currentMinute >= 42) ──
    const isClutch = state.quarter === 4 && currentMinute >= 42;
    if (isClutch) {
        const clutchRequests: SubRequestV2[] = [];

        // must-bench: 코트 위 선수 중 필수 벤치 선수 → 영구 교체
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

        // must-play: 벤치에 있는 필수 투입 선수 → rotationMap 강제 활성화 (다음 포세션 투입)
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
                // 가장 OVR 낮은 비-must-play 코트 위 선수 슬롯 해제 (스왑 준비)
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

    // ── 가비지 타임: Q4 잔여 2:30 이내 + 15점차 이상 → 코트 위 5명 전원 일괄 교체 ──
    const isGarbage = state.quarter >= 4 && state.gameClock < 150 && scoreDiff >= 15
        && !team.garbageApplied;   // 이미 적용된 팀은 재실행 방지

    if (isGarbage) {
        team.garbageApplied = true;
        return team.onCourt
            .filter(p => {
                if (p.health === 'Injured' || p.pf >= 6) return false;
                const cfg = tactics.playerTactics?.[p.playerId];
                // 'play'(출전) → 가비지타임 멤버, 일괄 교체 대상에서 제외
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

    // ── 가비지타임 'bench'(미출전): Q4 + 15점차 이상이면 즉시 벤치 (트리거보다 일찍) ──
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
        // 이미 benchReason이 있는 선수는 스킵 (중복 처리 방지)
        if (p.benchReason) return;

        const playerConfig = tactics.playerTactics?.[p.playerId];
        const isScheduled = tactics.rotationMap?.[p.playerId]?.[currentMinute];

        // --- Priority 1: 영구 긴급 (맵 무시) ---
        if (p.health === 'Injured' && p.injuredThisGame) {
            requests.push({ outPlayer: p, reason: '부상', exitType: 'permanent', benchReason: 'injury' });
            return;
        }
        if (p.pf >= 6) {
            requests.push({ outPlayer: p, reason: '6반칙 퇴장', exitType: 'permanent', benchReason: 'foul_out' });
            return;
        }

        // --- Priority 2: 탈진 / 개인 휴식 임계치 (스케줄 무관, 무조건 임시 벤치) ---
        //     benchWithOverride가 맵을 보존하고, 체력 회복 시 checkTemporaryReturns가 원상 복구함.
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

        // --- Priority 3: 파울 트러블 (매트릭스 기반, 맵 설정 시 무시 / ignoreFoul 설정 시 무시) ---
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
