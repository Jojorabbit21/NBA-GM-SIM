
import { GameState, TeamState, LivePlayer, RotationOverride } from './pbpTypes.ts';
import { DepthChart } from '../../types.ts';
import { formatTime } from './timeEngine.ts';
import { evaluateFoulTroubleAction } from './substitutionSystem.ts';

export interface SubRequest {
    outPlayer: LivePlayer;
    inPlayer: LivePlayer;
    reason: string;
}

const POSITION_ADJACENCY: Record<string, string[]> = {
    PG: ['SG'],
    SG: ['PG', 'SF'],
    SF: ['SG', 'PF'],
    PF: ['SF', 'C'],
    C:  ['PF'],
};

function getSlotPosition(playerId: string, depthChart?: DepthChart): string | null {
    if (!depthChart) return null;
    for (const pos of ['PG', 'SG', 'SF', 'PF', 'C'] as const) {
        if (depthChart[pos]?.includes(playerId)) return pos;
    }
    return null;
}

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
        p.pf < 6 &&
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

function applyRotationSuccession(team: TeamState, outPlayer: LivePlayer, currentMinute: number) {
    if (!team.depthChart || !team.tactics.rotationMap) return;

    const positions: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
    let rolePos: keyof DepthChart | null = null;
    let depthIndex: number = -1;

    for (const pos of positions) {
        const chart = team.depthChart[pos];
        const idx = chart.indexOf(outPlayer.playerId);
        if (idx !== -1) {
            rolePos = pos;
            depthIndex = idx;
            break;
        }
    }

    if (!rolePos) return;

    const chart = team.depthChart[rolePos];
    const starterId = chart[0];
    const benchId = chart[1];
    const thirdId = chart[2];

    const excludeIds = new Set<string>([outPlayer.playerId]);
    team.onCourt.forEach(p => excludeIds.add(p.playerId));

    if (depthIndex === 0) {
        if (benchId && thirdId) {
            transferSchedule(team, benchId, thirdId, currentMinute);
        }
        if (benchId) {
            transferSchedule(team, starterId, benchId, currentMinute);
        } else if (thirdId) {
            transferSchedule(team, starterId, thirdId, currentMinute);
        } else {
            const res = findResCandidate(team, rolePos, excludeIds);
            if (res) transferSchedule(team, starterId, res.playerId, currentMinute);
        }
    } else if (depthIndex === 1) {
        if (thirdId) {
            transferSchedule(team, benchId, thirdId, currentMinute);
        } else {
            const res = findResCandidate(team, rolePos, excludeIds);
            if (res) transferSchedule(team, benchId, res.playerId, currentMinute);
        }
    } else if (depthIndex === 2) {
        const res = findResCandidate(team, rolePos, excludeIds);
        if (res) transferSchedule(team, thirdId, res.playerId, currentMinute);
    }

    if (team.tactics.rotationMap[outPlayer.playerId]) {
        for (let i = currentMinute; i < 48; i++) {
            team.tactics.rotationMap[outPlayer.playerId][i] = false;
        }
    }
}

export function checkAndApplyRotation(state: GameState, teamState: TeamState, currentTotalSec: number) {
    const currentMinute = Math.min(47, Math.floor(currentTotalSec / 60));

    const map = teamState.tactics.rotationMap;
    const validSelectedIds = new Set<string>();

    if (map) {
         Object.entries(map).forEach(([pid, m]) => {
             if (m[currentMinute]) {
                 const p = [...teamState.onCourt, ...teamState.bench].find(lp => lp.playerId === pid);
                 if (p && p.health === 'Healthy' && p.pf < 6) {
                     validSelectedIds.add(pid);
                 }
             }
         });
    }

    if (validSelectedIds.size < 5) {
        let allAvailable = [...teamState.onCourt, ...teamState.bench].filter(p =>
            p.health === 'Healthy' && p.pf < 6 && !p.isShutdown && !validSelectedIds.has(p.playerId)
        );

        if (validSelectedIds.size + allAvailable.length < 5) {
            const tiredPlayers = [...teamState.onCourt, ...teamState.bench].filter(p =>
                p.health === 'Healthy' && p.pf < 6 && p.isShutdown && !validSelectedIds.has(p.playerId)
            );
            allAvailable = [...allAvailable, ...tiredPlayers];
        }

        if (validSelectedIds.size + allAvailable.length < 5) {
            const injuredPlayers = [...teamState.onCourt, ...teamState.bench].filter(p =>
                p.health === 'Injured' && p.pf < 6 && !validSelectedIds.has(p.playerId)
            );
            allAvailable.push(...injuredPlayers);
        }

        allAvailable.sort((a, b) => {
            const aOnCourt = teamState.onCourt.includes(a) ? 1 : 0;
            const bOnCourt = teamState.onCourt.includes(b) ? 1 : 0;
            if (aOnCourt !== bOnCourt) return bOnCourt - aOnCourt;

            if (b.ovr !== a.ovr) return b.ovr - a.ovr;
            return b.currentCondition - a.currentCondition;
        });

        for (const p of allAvailable) {
            if (validSelectedIds.size >= 5) break;
            validSelectedIds.add(p.playerId);
        }
    }

    let finalRequiredIds: string[] = Array.from(validSelectedIds);
    if (finalRequiredIds.length > 5) {
        const sorted = finalRequiredIds.map(id =>
            [...teamState.onCourt, ...teamState.bench].find(p => p.playerId === id)
        ).filter(p => p).sort((a, b) => b!.ovr - a!.ovr);
        finalRequiredIds = sorted.slice(0, 5).map(p => p!.playerId);
    }

    const currentOnCourtIds = teamState.onCourt.map(p => p.playerId);
    const needsUpdate = finalRequiredIds.some(id => !currentOnCourtIds.includes(id)) ||
                        currentOnCourtIds.some(id => !finalRequiredIds.includes(id));

    if (needsUpdate && finalRequiredIds.length === 5) {
        const toRemove = teamState.onCourt.filter(p => !finalRequiredIds.includes(p.playerId));
        const toAdd = teamState.bench.filter(p => finalRequiredIds.includes(p.playerId));

        toRemove.forEach(p => {
            const idx = teamState.onCourt.indexOf(p);
            if (idx > -1) {
                teamState.onCourt.splice(idx, 1);
                teamState.bench.push(p);
                const hist = state.rotationHistory[p.playerId];
                if (hist && hist.length > 0) hist[hist.length - 1].out = currentTotalSec;
            }
        });

        toAdd.forEach(p => {
            const idx = teamState.bench.indexOf(p);
            if (idx > -1) {
                teamState.bench.splice(idx, 1);
                teamState.onCourt.push(p);
                p.position = getSlotPosition(p.playerId, teamState.depthChart) || p.position;
                if (!state.rotationHistory[p.playerId]) state.rotationHistory[p.playerId] = [];
                state.rotationHistory[p.playerId].push({ in: currentTotalSec, out: -1 });
                p.lastSubInTime = state.gameClock;
                p.conditionAtSubIn = p.currentCondition;
            }
        });

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

export function forceSubstitution(state: GameState, team: TeamState, outPlayer: LivePlayer, reason: string) {
    const currentTotalSec = ((state.quarter - 1) * 720) + (720 - state.gameClock);
    const currentMinute = Math.min(47, Math.floor(currentTotalSec / 60));

    applyRotationSuccession(team, outPlayer, currentMinute);

    let available = team.bench.filter(p => p.health === 'Healthy' && p.pf < 6 && !p.isShutdown);
    if (available.length === 0) {
        available = team.bench.filter(p => p.health === 'Healthy' && p.pf < 6);
    }
    if (available.length === 0) {
        available = team.bench.filter(p => p.pf < 6);
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
            team.onCourt.splice(outIdx, 1);
            team.bench.push(outPlayer);

            team.bench.splice(inIdx, 1);
            team.onCourt.push(inPlayer);
            inPlayer.position = outPlayer.position;

            const histOut = state.rotationHistory[outPlayer.playerId];
            if (histOut && histOut.length > 0) histOut[histOut.length - 1].out = currentTotalSec;

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
        team.onCourt.splice(outIdx, 1);
        team.bench.push(outPlayer);
        team.bench.splice(inIdx, 1);
        team.onCourt.push(filler);
        filler.position = outPlayer.position;

        const histOut = state.rotationHistory[outPlayer.playerId];
        if (histOut && histOut.length > 0) histOut[histOut.length - 1].out = currentTotalSec;
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
            override.active = false;
            continue;
        }

        if (player.health === 'Injured' || player.pf >= 6) {
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

    if (originalPlayer && originalPlayer.health === 'Healthy' && originalPlayer.pf < 6) {
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
        .filter(p => p.health === 'Healthy' && p.pf < 6)
        .sort((a, b) => a.ovr - b.ovr);

    const usedIds = new Set<string>();
    const outNames: string[] = [];
    const inNames: string[] = [];

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
        inP.position = outP.position;

        const histOut = state.rotationHistory[outP.playerId];
        if (histOut && histOut.length > 0) histOut[histOut.length - 1].out = currentTotalSec;
        if (!state.rotationHistory[inP.playerId]) state.rotationHistory[inP.playerId] = [];
        state.rotationHistory[inP.playerId].push({ in: currentTotalSec, out: currentTotalSec });

        usedIds.add(inP.playerId);
        outNames.push(outP.playerName);
        inNames.push(inP.playerName);
    }

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
