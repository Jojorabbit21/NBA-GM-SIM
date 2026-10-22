
import { GameState, TeamState, LivePlayer, RotationOverride, isOut } from './pbpTypes.ts';
import { DepthChart, RotationOutReason } from '../../types.ts';
import { formatTime } from './timeEngine.ts';
import { evaluateFoulTroubleAction, SHUTDOWN_MIN_GAIN } from './substitutionSystem.ts';
import { assignCourtSlots, snapshotSlots, pickBestFive, vacancyFit } from './slotAssignment.ts';
import { planSuccession } from './rotationSuccession.ts';

export interface SubRequest {
    outPlayer: LivePlayer;
    inPlayer: LivePlayer;
    reason: string;
}

// [2026-10-18] 로테이션 맵에 구멍(분당 출전 예정 5명 미만)이 있을 때의 비상 보충 파라미터.
// 이전 규칙("코트 위 우선 > OVR")은 쉬어야 할 구간에도 코트 위 최고 OVR 선수를 계속 남겨 에이스 출전이 과다해졌다.
// 시뮬 검증(docs/history/dev-log.md 2026-10-18): 보너스 4는 교체 진동이 현행보다 악화, 8 이상부터 안정.
const FALLBACK_ONCOURT_BONUS = 8;       // 체력 점수에 더하는 코트 위 가산점 (진동 방지 히스테리시스 폭)
const FALLBACK_MIN_STINT_SEC = 120;     // 투입 후 이 시간 안에는 폴백이 내보내지 않음
const FALLBACK_MIN_REST_SEC = 120;      // 교체 아웃 후 이 시간 안에는 폴백이 다시 투입하지 않음
// [2026-10-22] 빈 시간 보충 시 비어 있는 슬롯에 맞는 선수를 우선 — 슬롯 어색함 1점당 체력 점수 이만큼 감점
// (인접 포지션 = −10, 두 칸 = −30, 세 칸 = −100). 이전엔 슬롯을 전혀 보지 않아 보충 선수가 SF 2명·SG 0명 등을 만들었다.
const FALLBACK_SLOT_FIT_WEIGHT = 10;

const POSITION_ADJACENCY: Record<string, string[]> = {
    PG: ['SG'],
    SG: ['PG', 'SF'],
    SF: ['SG', 'PF'],
    PF: ['SF', 'C'],
    C:  ['PF'],
};

function getDepthChartCandidates(
    depthChart: DepthChart | undefined,
    targetPosition: string,
    excludeIds: Set<string>
): Map<string, number> {
    const rankMap = new Map<string, number>();
    if (!depthChart) return rankMap;

    const posKey = targetPosition as keyof DepthChart;
    const chart = depthChart[posKey];
    if (chart) {
        chart.forEach((pid, idx) => {
            if (pid && !excludeIds.has(pid)) {
                rankMap.set(pid, idx);
            }
        });
    }

    const adjacent = POSITION_ADJACENCY[targetPosition] || [];
    adjacent.forEach(adjPos => {
        const adjChart = depthChart[adjPos as keyof DepthChart];
        if (adjChart) {
            adjChart.forEach((pid, idx) => {
                if (pid && !excludeIds.has(pid) && !rankMap.has(pid)) {
                    rankMap.set(pid, 10 + idx);
                }
            });
        }
    });

    return rankMap;
}

function findResCandidate(team: TeamState, targetPosition: string, excludeIds: Set<string>, allowShutdown: boolean = false): LivePlayer | null {
    const candidates = team.bench.filter(p =>
        p.health === 'Healthy' &&
        !isOut(p) &&
        !excludeIds.has(p.playerId) &&
        (allowShutdown || !p.isShutdown)
    );

    if (candidates.length === 0) return null;

    const depthRanks = getDepthChartCandidates(team.depthChart, targetPosition, excludeIds);

    candidates.sort((a, b) => {
        const aRank = depthRanks.get(a.playerId) ?? Infinity;
        const bRank = depthRanks.get(b.playerId) ?? Infinity;
        if (aRank !== bRank) return aRank - bRank;

        const aPosMatch = a.position === targetPosition ? 1 : 0;
        const bPosMatch = b.position === targetPosition ? 1 : 0;
        if (aPosMatch !== bPosMatch) return bPosMatch - aPosMatch;

        if (b.ovr !== a.ovr) return b.ovr - a.ovr;

        return b.currentCondition - a.currentCondition;
    });

    return candidates[0];
}

export function transferSchedule(team: TeamState, sourceId: string | null, targetId: string | null, currentMinute: number) {
    if (!sourceId || !targetId || !team.tactics.rotationMap) return;

    if (!team.tactics.rotationMap[sourceId]) team.tactics.rotationMap[sourceId] = Array(48).fill(false);
    if (!team.tactics.rotationMap[targetId]) team.tactics.rotationMap[targetId] = Array(48).fill(false);

    const sourceMap = team.tactics.rotationMap[sourceId];
    const targetMap = team.tactics.rotationMap[targetId];

    for (let i = currentMinute; i < 48; i++) {
        if (sourceMap[i]) {
            targetMap[i] = true;
            sourceMap[i] = false;
        }
    }
}

/**
 * 영구 이탈(부상·퇴장 등)한 선수의 남은 출전 시간을 이어받을 사람을 정한다.
 * [2026-10-22] 경기 전 부상 처리와 같은 함수(rotationSuccession.planSuccession)를 쓴다 — 이전에는 이 함수가 따로 한 칸씩
 * 올리기만 하고 후임의 건강·그 분의 중복 출전을 확인하지 않았다(transferSchedule로 OR 병합 → 겹치는 분에 인원 감소).
 */
function applyRotationSuccession(team: TeamState, outPlayer: LivePlayer, currentMinute: number) {
    if (!team.tactics.rotationMap) return;

    const players = [...team.onCourt, ...team.bench].map(p => {
        let tier: 0 | 1 | 2 | 3;
        if (p.playerId === outPlayer.playerId || isOut(p)) tier = 3;
        else if (p.health === 'Injured') tier = 2;
        else if (p.health !== 'Healthy' || p.isShutdown || p.benchReason) tier = 1;
        else tier = 0;
        return { id: p.playerId, ovr: p.ovr, nativePosition: p.nativePosition ?? p.position, tier, returnDate: p.returnDate };
    });

    planSuccession({
        outIds: [outPlayer.playerId],
        fromMinute: currentMinute,
        rotationMap: team.tactics.rotationMap,
        depthChart: team.depthChart,
        players,
    });
}

export function checkAndApplyRotation(state: GameState, teamState: TeamState, currentTotalSec: number) {
    const currentMinute = Math.min(47, Math.floor(currentTotalSec / 60));

    const map = teamState.tactics.rotationMap;
    const validSelectedIds = new Set<string>();

    if (map) {
         Object.entries(map).forEach(([pid, m]) => {
             if (m[currentMinute]) {
                 const p = [...teamState.onCourt, ...teamState.bench].find(lp => lp.playerId === pid);
                 if (p && p.health === 'Healthy' && !isOut(p)) {
                     validSelectedIds.add(pid);
                 }
             }
         });
    }

    if (validSelectedIds.size < 5) {
        // 1단계: 건강하고 탈진하지 않은 선수 우선
        //  - benchReason(파울 트러블/탈진 임시 벤치) 보유자와 방금 내려온 선수는 제외 (모자라면 아래에서 완화)
        const lastSeg = (pid: string) => { const h = state.rotationHistory[pid]; return h && h.length ? h[h.length - 1] : null; };
        const justRested = (p: LivePlayer) => {
            if (teamState.onCourt.includes(p)) return false;
            const l = lastSeg(p.playerId);
            return !!l && l.out >= 0 && l.out !== l.in && currentTotalSec - l.out < FALLBACK_MIN_REST_SEC;
        };
        const needCount = 5 - validSelectedIds.size;
        let allAvailable = [...teamState.onCourt, ...teamState.bench].filter(p =>
            p.health === 'Healthy' && !isOut(p) && !p.isShutdown && !validSelectedIds.has(p.playerId)
            && !p.benchReason && !justRested(p)
        );
        if (allAvailable.length < needCount) {
            allAvailable = [...teamState.onCourt, ...teamState.bench].filter(p =>
                p.health === 'Healthy' && !isOut(p) && !p.isShutdown && !validSelectedIds.has(p.playerId)
            );
        }

        if (validSelectedIds.size + allAvailable.length < 5) {
            const tiredPlayers = [...teamState.onCourt, ...teamState.bench].filter(p =>
                p.health === 'Healthy' && !isOut(p) && p.isShutdown && !validSelectedIds.has(p.playerId)
            );
            allAvailable = [...allAvailable, ...tiredPlayers];
        }

        if (validSelectedIds.size + allAvailable.length < 5) {
            const injuredPlayers = [...teamState.onCourt, ...teamState.bench].filter(p =>
                p.health === 'Injured' && !isOut(p) && !validSelectedIds.has(p.playerId)
            );
            allAvailable.push(...injuredPlayers);
        }

        // 정렬: 체력 점수(현재 체력 + 코트 위 가산점) > OVR. 투입 직후 선수는 최소 출전 시간 동안 보호.
        const fallbackScore = (p: LivePlayer) => {
            const onCourt = teamState.onCourt.includes(p);
            let score = p.currentCondition + (onCourt ? FALLBACK_ONCOURT_BONUS : 0);
            if (onCourt) {
                const l = lastSeg(p.playerId);
                if (l && l.out < 0 && currentTotalSec - l.in < FALLBACK_MIN_STINT_SEC) score += 1000;
            }
            return score;
        };
        allAvailable.sort((a, b) => {
            const d = fallbackScore(b) - fallbackScore(a);
            if (Math.abs(d) > 1e-9) return d;
            return b.ovr - a.ovr;
        });

        // [2026-10-22] 한 명씩 고르며 매번 "남은 빈 슬롯에 맞는가"를 반영(위 정렬은 동점 정리·초기 순서용)
        const everyone = [...teamState.onCourt, ...teamState.bench];
        const remaining = [...allAvailable];
        while (validSelectedIds.size < 5 && remaining.length > 0) {
            const selectedPlayers = everyone.filter(p => validSelectedIds.has(p.playerId));
            let bestIdx = 0, bestScore = -Infinity;
            remaining.forEach((p, i) => {
                const score = fallbackScore(p) - FALLBACK_SLOT_FIT_WEIGHT * vacancyFit(p, selectedPlayers, teamState.depthChart);
                if (score > bestScore + 1e-9) { bestScore = score; bestIdx = i; }
            });
            validSelectedIds.add(remaining[bestIdx].playerId);
            remaining.splice(bestIdx, 1);
        }
    }

    let finalRequiredIds: string[] = Array.from(validSelectedIds);
    if (finalRequiredIds.length > 5) {
        // [2026-10-22] OVR 상위 5명만 남기던 방식 → 슬롯을 가장 잘 채우는 5명(동점이면 OVR 합). 하나뿐인 C가 잘리는 것 방지
        const cands = finalRequiredIds
            .map(id => [...teamState.onCourt, ...teamState.bench].find(p => p.playerId === id))
            .filter((p): p is LivePlayer => !!p);
        finalRequiredIds = pickBestFive(cands, teamState.depthChart, snapshotSlots(teamState)).map(p => p.playerId);
    }

    const currentOnCourtIds = teamState.onCourt.map(p => p.playerId);
    const needsUpdate = finalRequiredIds.some(id => !currentOnCourtIds.includes(id)) ||
                        currentOnCourtIds.some(id => !finalRequiredIds.includes(id));

    if (needsUpdate && finalRequiredIds.length === 5) {
        const slotsBefore = snapshotSlots(teamState);
        const toRemove = teamState.onCourt.filter(p => !finalRequiredIds.includes(p.playerId));
        const toAdd = teamState.bench.filter(p => finalRequiredIds.includes(p.playerId));

        toRemove.forEach(p => {
            const idx = teamState.onCourt.indexOf(p);
            if (idx > -1) {
                teamState.onCourt.splice(idx, 1);
                teamState.bench.push(p);
                const hist = state.rotationHistory[p.playerId];
                if (hist && hist.length > 0) {
                    hist[hist.length - 1].out = currentTotalSec;
                    hist[hist.length - 1].outReason = 'normal';
                }
            }
        });

        toAdd.forEach(p => {
            const idx = teamState.bench.indexOf(p);
            if (idx > -1) {
                teamState.bench.splice(idx, 1);
                teamState.onCourt.push(p);
                if (!state.rotationHistory[p.playerId]) state.rotationHistory[p.playerId] = [];
                state.rotationHistory[p.playerId].push({ in: currentTotalSec, out: -1 });
                p.lastSubInTime = state.gameClock;
                p.conditionAtSubIn = p.currentCondition;
            }
        });
        // [2026-10-22] 슬롯 재배정 — 이전엔 들어온 선수에게 뎁스차트 첫 등재 슬롯을 붙여 PG 2명 등이 생겼다(slotAssignment.ts)
        assignCourtSlots(teamState, slotsBefore);

        if (toRemove.length > 0 || toAdd.length > 0) {
             const inNames = toAdd.map(p => p.playerName).join(', ');
             const outNames = toRemove.map(p => p.playerName).join(', ');

             state.logs.push({
                quarter: state.quarter,
                timeRemaining: formatTime(state.gameClock),
                teamId: teamState.id,
                text: `교체: IN [${inNames}] OUT [${outNames}]`,
                type: 'info'
            });
        }
    }
}

export function forceSubstitution(state: GameState, team: TeamState, outPlayer: LivePlayer, reason: string, outReason?: RotationOutReason) {
    const currentTotalSec = ((state.quarter - 1) * 720) + (720 - state.gameClock);
    const currentMinute = Math.min(47, Math.floor(currentTotalSec / 60));

    applyRotationSuccession(team, outPlayer, currentMinute);

    let available = team.bench.filter(p => p.health === 'Healthy' && !isOut(p) && !p.isShutdown);
    if (available.length === 0) {
        available = team.bench.filter(p => p.health === 'Healthy' && !isOut(p));
    }
    if (available.length === 0) {
        available = team.bench.filter(p => !isOut(p));
    }

    let inPlayer: LivePlayer | undefined;

    if (team.tactics.rotationMap) {
        for (const p of available) {
             if (team.tactics.rotationMap[p.playerId] && team.tactics.rotationMap[p.playerId][currentMinute]) {
                 inPlayer = p;
                 break;
             }
        }
    }

    if (!inPlayer) {
        const excludeIds = new Set<string>([outPlayer.playerId, ...team.onCourt.map(p => p.playerId)]);
        inPlayer = findResCandidate(team, outPlayer.position, excludeIds, false) || undefined;
        if (!inPlayer) {
             inPlayer = findResCandidate(team, outPlayer.position, excludeIds, true) || undefined;
        }
    }

    if (!inPlayer && available.length > 0) {
        inPlayer = available.sort((a, b) => b.ovr - a.ovr)[0];
    }

    if (inPlayer) {
        const outIdx = team.onCourt.indexOf(outPlayer);
        const inIdx = team.bench.indexOf(inPlayer);

        if (outIdx > -1 && inIdx > -1) {
            const slotsBefore = snapshotSlots(team);
            team.onCourt.splice(outIdx, 1);
            team.bench.push(outPlayer);

            team.bench.splice(inIdx, 1);
            team.onCourt.push(inPlayer);
            assignCourtSlots(team, slotsBefore);   // 1:1이면 나간 선수 슬롯 승계(slotAssignment.ts)

            const histOut = state.rotationHistory[outPlayer.playerId];
            if (histOut && histOut.length > 0) {
                histOut[histOut.length - 1].out = currentTotalSec;
                histOut[histOut.length - 1].outReason = outReason;
            }

            if (!state.rotationHistory[inPlayer.playerId]) state.rotationHistory[inPlayer.playerId] = [];
            state.rotationHistory[inPlayer.playerId].push({ in: currentTotalSec, out: currentTotalSec });

            state.logs.push({
                quarter: state.quarter,
                timeRemaining: formatTime(state.gameClock),
                teamId: team.id,
                text: `교체: IN [${inPlayer.playerName}] OUT [${outPlayer.playerName}] (${reason})`,
                type: 'info'
            });
        }
    }
}

export function benchWithOverride(
    state: GameState, team: TeamState, outPlayer: LivePlayer,
    reason: 'foul_trouble' | 'shutdown',
    currentMinute: number, returnMinute: number | null
): void {
    const map = team.tactics.rotationMap;
    if (!map) return;

    const originalSlots = Array(48).fill(false) as boolean[];
    if (map[outPlayer.playerId]) {
        for (let i = currentMinute; i < 48; i++) {
            originalSlots[i] = map[outPlayer.playerId][i];
        }
    }

    const excludeIds = new Set<string>([outPlayer.playerId, ...team.onCourt.map(p => p.playerId)]);
    // [2026-10-22] 탈진 교체의 대체자는 지금 선수보다 체력이 SHUTDOWN_MIN_GAIN 이상 높은 선수만(substitutionSystem과 같은 조건)
    if (reason === 'shutdown') {
        for (const b of team.bench) {
            if (b.currentCondition < outPlayer.currentCondition + SHUTDOWN_MIN_GAIN) excludeIds.add(b.playerId);
        }
    }
    let filler = findResCandidate(team, outPlayer.position, excludeIds, false);
    if (!filler) filler = findResCandidate(team, outPlayer.position, excludeIds, true);
    if (!filler) return;

    const effectiveReturn = returnMinute ?? 48;
    if (!map[filler.playerId]) map[filler.playerId] = Array(48).fill(false);
    if (!map[outPlayer.playerId]) map[outPlayer.playerId] = Array(48).fill(false);

    for (let i = currentMinute; i < effectiveReturn; i++) {
        if (map[outPlayer.playerId][i]) {
            map[filler.playerId][i] = true;
            map[outPlayer.playerId][i] = false;
        }
    }

    if (returnMinute !== null && returnMinute < 48) {
        const orig = state.originalRotationMap[outPlayer.playerId];
        if (orig) {
            for (let i = returnMinute; i < 48; i++) {
                map[outPlayer.playerId][i] = orig[i];
            }
        }
    }

    state.activeOverrides.push({
        outPlayerId: outPlayer.playerId,
        fillerPlayerId: filler.playerId,
        reason,
        fromMinute: currentMinute,
        toMinute: effectiveReturn,
        originalSlots,
        active: true,
    });

    outPlayer.benchReason = reason;
    outPlayer.benchedAtMinute = currentMinute;
    outPlayer.benchedAtQuarter = state.quarter;
    outPlayer.scheduledReturnMinute = returnMinute ?? undefined;

    const currentTotalSec = ((state.quarter - 1) * 720) + (720 - state.gameClock);
    const outIdx = team.onCourt.indexOf(outPlayer);
    const inIdx = team.bench.indexOf(filler);

    if (outIdx > -1 && inIdx > -1) {
        const slotsBefore = snapshotSlots(team);
        team.onCourt.splice(outIdx, 1);
        team.bench.push(outPlayer);
        team.bench.splice(inIdx, 1);
        team.onCourt.push(filler);
        assignCourtSlots(team, slotsBefore);   // 1:1이면 나간 선수 슬롯 승계(slotAssignment.ts)

        const histOut = state.rotationHistory[outPlayer.playerId];
        if (histOut && histOut.length > 0) {
            histOut[histOut.length - 1].out = currentTotalSec;
            histOut[histOut.length - 1].outReason = reason;
        }
        if (!state.rotationHistory[filler.playerId]) state.rotationHistory[filler.playerId] = [];
        state.rotationHistory[filler.playerId].push({ in: currentTotalSec, out: currentTotalSec });
        filler.lastSubInTime = state.gameClock;
        filler.conditionAtSubIn = filler.currentCondition;

        const reasonText = reason === 'foul_trouble'
            ? `파울 트러블 (${outPlayer.pf}반칙)` : '탈진(Shutdown)';
        state.logs.push({
            quarter: state.quarter,
            timeRemaining: formatTime(state.gameClock),
            teamId: team.id,
            text: `교체: IN [${filler.playerName}] OUT [${outPlayer.playerName}] (${reasonText})`,
            type: 'info'
        });
    }
}

export function checkTemporaryReturns(
    state: GameState, team: TeamState, currentMinute: number
): void {
    if (!state.activeOverrides || !team.tactics.rotationMap) return;

    for (const override of state.activeOverrides) {
        if (!override.active) continue;

        const player = team.bench.find(p => p.playerId === override.outPlayerId);
        if (!player) {
            // [Fix 2026-10-17] activeOverrides is shared by both teams — skip the other team's overrides.
            const onCourtPlayer = team.onCourt.find(p => p.playerId === override.outPlayerId);
            if (!onCourtPlayer) continue;
            override.active = false;
            onCourtPlayer.benchReason = null;
            onCourtPlayer.benchedAtMinute = undefined;
            onCourtPlayer.benchedAtQuarter = undefined;
            onCourtPlayer.scheduledReturnMinute = undefined;
            continue;
        }

        if (player.health === 'Injured' || isOut(player)) {
            override.active = false;
            player.benchReason = null;
            continue;
        }

        let shouldReturn = false;

        if (override.reason === 'foul_trouble') {
            if (player.scheduledReturnMinute !== undefined && currentMinute >= player.scheduledReturnMinute) {
                const recheck = evaluateFoulTroubleAction(state, team, player, currentMinute);
                if (recheck.shouldBench && recheck.returnMinute !== null) {
                    override.toMinute = recheck.returnMinute;
                    player.scheduledReturnMinute = recheck.returnMinute;
                    continue;
                }
                shouldReturn = !recheck.shouldBench;
            }
        } else if (override.reason === 'shutdown') {
            const returnThreshold = team.tactics.playerTactics?.[player.playerId]?.returnThreshold ?? 70;
            if (!player.isShutdown && player.currentCondition > returnThreshold) {
                const orig = state.originalRotationMap[player.playerId];
                if (orig && orig[currentMinute]) {
                    shouldReturn = true;
                } else if (orig && orig.slice(currentMinute).some(Boolean)) {
                    restorePlayerMap(state, team, player, currentMinute);
                    restoreFillerMap(state, team, override, currentMinute);
                    override.active = false;
                    player.benchReason = null;
                    player.benchedAtMinute = undefined;
                    player.benchedAtQuarter = undefined;
                    player.scheduledReturnMinute = undefined;
                    state.logs.push({
                        quarter: state.quarter,
                        timeRemaining: formatTime(state.gameClock),
                        teamId: team.id,
                        text: `${player.playerName} 복귀 준비 (체력 회복)`,
                        type: 'info'
                    });
                    continue;
                }
            }
        }

        if (!shouldReturn) continue;

        restorePlayerMap(state, team, player, currentMinute);
        restoreFillerMap(state, team, override, currentMinute);

        override.active = false;
        player.benchReason = null;
        player.benchedAtMinute = undefined;
        player.benchedAtQuarter = undefined;
        player.scheduledReturnMinute = undefined;

        const reasonText = override.reason === 'foul_trouble' ? '파울 트러블 해소' : '체력 회복';
        state.logs.push({
            quarter: state.quarter,
            timeRemaining: formatTime(state.gameClock),
            teamId: team.id,
            text: `${player.playerName} 복귀 준비 (${reasonText})`,
            type: 'info'
        });
    }
}

function restorePlayerMap(
    state: GameState, team: TeamState, player: LivePlayer, currentMinute: number
): void {
    const map = team.tactics.rotationMap;
    const orig = state.originalRotationMap[player.playerId];
    if (!map || !orig) return;
    if (!map[player.playerId]) map[player.playerId] = Array(48).fill(false);
    for (let i = currentMinute; i < 48; i++) {
        map[player.playerId][i] = orig[i];
    }
}

function restoreFillerMap(
    state: GameState, team: TeamState, override: RotationOverride, currentMinute: number
): void {
    const map = team.tactics.rotationMap;
    if (!map) return;
    const filler = [...team.onCourt, ...team.bench].find(p => p.playerId === override.fillerPlayerId);
    if (filler && map[filler.playerId]) {
        const fillerOrig = state.originalRotationMap[filler.playerId];
        for (let i = currentMinute; i < 48; i++) {
            map[filler.playerId][i] = fillerOrig ? fillerOrig[i] : false;
        }
    }
}

export function handleFillerExit(
    state: GameState, team: TeamState, exitedFiller: LivePlayer, currentMinute: number
): void {
    if (!state.activeOverrides) return;

    const override = state.activeOverrides.find(
        o => o.active && o.fillerPlayerId === exitedFiller.playerId
    );
    if (!override) return;

    const originalPlayer = [...team.onCourt, ...team.bench].find(
        p => p.playerId === override.outPlayerId
    );

    if (originalPlayer && originalPlayer.health === 'Healthy' && !isOut(originalPlayer)) {
        if (override.reason === 'shutdown' && !originalPlayer.isShutdown && originalPlayer.currentCondition > 70) {
            restorePlayerMap(state, team, originalPlayer, currentMinute);
            override.active = false;
            originalPlayer.benchReason = null;
            originalPlayer.benchedAtMinute = undefined;
            originalPlayer.benchedAtQuarter = undefined;
            originalPlayer.scheduledReturnMinute = undefined;
            return;
        }
        if (override.reason === 'foul_trouble') {
            const action = evaluateFoulTroubleAction(state, team, originalPlayer, currentMinute);
            if (!action.shouldBench) {
                restorePlayerMap(state, team, originalPlayer, currentMinute);
                override.active = false;
                originalPlayer.benchReason = null;
                originalPlayer.benchedAtMinute = undefined;
                originalPlayer.benchedAtQuarter = undefined;
                originalPlayer.scheduledReturnMinute = undefined;
                return;
            }
        }
    }

    const excludeIds = new Set<string>([
        exitedFiller.playerId,
        override.outPlayerId,
        ...team.onCourt.map(p => p.playerId)
    ]);
    let newFiller = findResCandidate(team, exitedFiller.position, excludeIds, false);
    if (!newFiller) newFiller = findResCandidate(team, exitedFiller.position, excludeIds, true);

    if (newFiller) {
        const map = team.tactics.rotationMap;
        if (map) {
            if (!map[newFiller.playerId]) map[newFiller.playerId] = Array(48).fill(false);
            for (let i = currentMinute; i < override.toMinute; i++) {
                if (map[exitedFiller.playerId]?.[i]) {
                    map[newFiller.playerId][i] = true;
                }
            }
        }
        override.fillerPlayerId = newFiller.playerId;
    } else {
        override.active = false;
    }
}

export function executeGarbageSubstitution(
    state: GameState, team: TeamState, outPlayers: LivePlayer[]
): void {
    const currentTotalSec = ((state.quarter - 1) * 720) + (720 - state.gameClock);
    const currentMinute = Math.min(47, Math.floor(currentTotalSec / 60));

    const available = team.bench
        .filter(p => p.health === 'Healthy' && !isOut(p)
            && team.tactics.playerTactics?.[p.playerId]?.garbagePolicy !== 'bench')
        .sort((a, b) => a.ovr - b.ovr);

    const usedIds = new Set<string>();
    const outNames: string[] = [];
    const inNames: string[] = [];
    const slotsBefore = snapshotSlots(team);

    for (const outP of outPlayers) {
        let inP = available.find(p => !usedIds.has(p.playerId) && p.position === outP.position);
        if (!inP) inP = available.find(p => !usedIds.has(p.playerId));
        if (!inP) break;

        const outIdx = team.onCourt.indexOf(outP);
        const inIdx = team.bench.indexOf(inP);
        if (outIdx === -1 || inIdx === -1) continue;

        team.onCourt.splice(outIdx, 1);
        team.bench.push(outP);
        team.bench.splice(team.bench.indexOf(inP), 1);
        team.onCourt.push(inP);

        // [Fix 2026-10-17] Sync rotationMap with the swap. Without this, checkAndApplyRotation (same step)
        // rebuilds the lineup from the map and puts outP straight back, and the garbage request repeats
        // every possession (visible as constant in/out flicker in the rotation chart).
        const map = team.tactics.rotationMap;
        if (map) {
            if (!map[outP.playerId]) map[outP.playerId] = Array(48).fill(false);
            if (!map[inP.playerId]) map[inP.playerId] = Array(48).fill(false);
            for (let i = currentMinute; i < 48; i++) {
                map[outP.playerId][i] = false;
                map[inP.playerId][i] = true;
            }
        }

        const histOut = state.rotationHistory[outP.playerId];
        if (histOut && histOut.length > 0) {
            histOut[histOut.length - 1].out = currentTotalSec;
            histOut[histOut.length - 1].outReason = 'garbage';
        }
        if (!state.rotationHistory[inP.playerId]) state.rotationHistory[inP.playerId] = [];
        state.rotationHistory[inP.playerId].push({ in: currentTotalSec, out: currentTotalSec });

        usedIds.add(inP.playerId);
        outNames.push(outP.playerName);
        inNames.push(inP.playerName);
    }
    // [2026-10-22] 일괄 교체 후 슬롯 재배정(이전: 짝지은 나간 선수 슬롯을 하나씩 승계)
    assignCourtSlots(team, slotsBefore);

    if (inNames.length > 0) {
        state.logs.push({
            quarter: state.quarter,
            timeRemaining: formatTime(state.gameClock),
            teamId: team.id,
            text: `교체: IN [${inNames.join(', ')}] OUT [${outNames.join(', ')}]`,
            type: 'info'
        });
    }
}
