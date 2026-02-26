
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
    const isGarbage = state.quarter >= 4 && state.gameClock < 300 && scoreDiff > 20;

    const requests: SubRequestV2[] = [];

    team.onCourt.forEach(p => {
        // 이미 benchReason이 있는 선수는 스킵 (중복 처리 방지)
        if (p.benchReason) return;

        const isScheduled = tactics.rotationMap?.[p.playerId]?.[currentMinute];

        // --- Priority 1: 영구 긴급 (맵 무시) ---
        if (p.health === 'Injured') {
            requests.push({ outPlayer: p, reason: '부상', exitType: 'permanent', benchReason: 'injury' });
            return;
        }
        if (p.pf >= 6) {
            requests.push({ outPlayer: p, reason: '6반칙 퇴장', exitType: 'permanent', benchReason: 'foul_out' });
            return;
        }

        // --- Priority 2: 탈진 (임시, 맵 설정 시 무시) ---
        if (p.currentCondition <= HARD_FLOOR) {
            if (isScheduled) {
                // 유저가 명시적으로 스케줄 → 계속 기용
            } else {
                p.isShutdown = true;
                requests.push({
                    outPlayer: p, reason: '탈진(Shutdown)', exitType: 'temporary',
                    returnMinute: null, benchReason: 'shutdown'
                });
                return;
            }
        }

        // --- Priority 3: 파울 트러블 (매트릭스 기반, 맵 설정 시 무시) ---
        if (!isScheduled) {
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

        // --- Priority 4: 가비지 타임 ---
        if (isGarbage && p.isStarter && !isScheduled) {
            requests.push({ outPlayer: p, reason: '가비지 타임', exitType: 'permanent', benchReason: 'garbage' });
        }
    });

    return requests;
}
