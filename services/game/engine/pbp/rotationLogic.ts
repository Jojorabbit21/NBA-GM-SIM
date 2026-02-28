
import { GameState, TeamState, LivePlayer, RotationOverride } from './pbpTypes';
import { DepthChart } from '../../../../types';
import { formatTime } from './timeEngine';
import { evaluateFoulTroubleAction } from './substitutionSystem';

export interface SubRequest {
    outPlayer: LivePlayer;
    inPlayer: LivePlayer;
    reason: string;
}

/** 포지션 인접성 맵: 해당 포지션을 대체할 수 있는 인접 포지션 */
const POSITION_ADJACENCY: Record<string, string[]> = {
    PG: ['SG'],
    SG: ['PG', 'SF'],
    SF: ['SG', 'PF'],
    PF: ['SF', 'C'],
    C:  ['PF'],
};

/**
 * 뎁스차트에서 특정 포지션의 대체자 후보를 순서대로 반환
 * 반환: Map<playerId, rank> — rank가 낮을수록 우선순위 높음
 *   동일 포지션: rank 0~2 / 인접 포지션: rank 10~12
 */
function getDepthChartCandidates(
    depthChart: DepthChart | undefined,
    targetPosition: string,
    excludeIds: Set<string>
): Map<string, number> {
    const rankMap = new Map<string, number>();
    if (!depthChart) return rankMap;

    // 1. 동일 포지션 뎁스차트 (rank 0, 1, 2)
    const posKey = targetPosition as keyof DepthChart;
    const chart = depthChart[posKey];
    if (chart) {
        chart.forEach((pid, idx) => {
            if (pid && !excludeIds.has(pid)) {
                rankMap.set(pid, idx);
            }
        });
    }

    // 2. 인접 포지션 뎁스차트 (rank 10, 11, 12 — 동일 포지션보다 항상 뒤)
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

/**
 * 1. RES(로테이션 제외) 멤버 중 대체 자원 찾기
 * 정렬 기준: 1. 뎁스차트 순위 > 2. 동일 포지션 > 3. OVR 높은 순 > 4. 체력 높은 순
 * [Update] 탈진(Shutdown) 상태인 선수는 1차적으로 배제함.
 */
function findResCandidate(team: TeamState, targetPosition: string, excludeIds: Set<string>, allowShutdown: boolean = false): LivePlayer | null {
    const candidates = team.bench.filter(p =>
        p.health === 'Healthy' &&
        p.pf < 6 &&
        !excludeIds.has(p.playerId) &&
        (allowShutdown || !p.isShutdown)
    );

    if (candidates.length === 0) return null;

    // 뎁스차트 기반 우선순위 (없으면 빈 Map → 기존 로직으로 fallback)
    const depthRanks = getDepthChartCandidates(team.depthChart, targetPosition, excludeIds);

    candidates.sort((a, b) => {
        // 1. 뎁스차트 순위 (낮을수록 우선, 없으면 Infinity)
        const aRank = depthRanks.get(a.playerId) ?? Infinity;
        const bRank = depthRanks.get(b.playerId) ?? Infinity;
        if (aRank !== bRank) return aRank - bRank;

        // 2. 동일 포지션 우선 (뎁스차트에 없는 선수들 간 비교)
        const aPosMatch = a.position === targetPosition ? 1 : 0;
        const bPosMatch = b.position === targetPosition ? 1 : 0;
        if (aPosMatch !== bPosMatch) return bPosMatch - aPosMatch;

        // 3. OVR 높은 순
        if (b.ovr !== a.ovr) return b.ovr - a.ovr;

        // 4. 체력 높은 순
        return b.currentCondition - a.currentCondition;
    });

    return candidates[0];
}

/**
 * 로테이션 맵(스케줄) 승계 (Source -> Target)
 * Source의 남은 출전 시간을 Target에게 모두 넘기고, Source는 0분으로 만듦
 */
export function transferSchedule(team: TeamState, sourceId: string | null, targetId: string | null, currentMinute: number) {
    if (!sourceId || !targetId || !team.tactics.rotationMap) return;
    
    // 맵 초기화 확인
    if (!team.tactics.rotationMap[sourceId]) team.tactics.rotationMap[sourceId] = Array(48).fill(false);
    if (!team.tactics.rotationMap[targetId]) team.tactics.rotationMap[targetId] = Array(48).fill(false);

    const sourceMap = team.tactics.rotationMap[sourceId];
    const targetMap = team.tactics.rotationMap[targetId];

    // 현재 시점부터 경기 끝까지 스케줄 이전
    for (let i = currentMinute; i < 48; i++) {
        if (sourceMap[i]) {
            targetMap[i] = true;
            sourceMap[i] = false;
        }
    }
}

/**
 * 2. 승계 로직 (Succession Logic) - 지시 사항 엄수
 */
function applyRotationSuccession(team: TeamState, outPlayer: LivePlayer, currentMinute: number) {
    if (!team.depthChart || !team.tactics.rotationMap) return;

    // 포지션 및 뎁스 파악
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

    // 뎁스차트에 없는 선수(RES)가 아웃된 경우 -> 승계 로직 불필요
    if (!rolePos) return; 

    const chart = team.depthChart[rolePos];
    const starterId = chart[0];
    const benchId = chart[1];
    const thirdId = chart[2];

    const excludeIds = new Set<string>([outPlayer.playerId]);
    team.onCourt.forEach(p => excludeIds.add(p.playerId));

    // --- CASE 1: 주전(Starter) 아웃 ---
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
    }
    // --- CASE 2: 벤치(Bench) 아웃 ---
    else if (depthIndex === 1) {
        if (thirdId) {
            transferSchedule(team, benchId, thirdId, currentMinute);
        } else {
            const res = findResCandidate(team, rolePos, excludeIds);
            if (res) transferSchedule(team, benchId, res.playerId, currentMinute);
        }
    }
    // --- CASE 3: 써드(Third) 아웃 ---
    else if (depthIndex === 2) {
        const res = findResCandidate(team, rolePos, excludeIds);
        if (res) transferSchedule(team, thirdId, res.playerId, currentMinute);
    }
    
    // 아웃된 선수의 잔여 시간 비움
    if (team.tactics.rotationMap[outPlayer.playerId]) {
        for (let i = currentMinute; i < 48; i++) {
            team.tactics.rotationMap[outPlayer.playerId][i] = false;
        }
    }
}


/**
 * 3. 정기 로테이션 체크 및 적용
 */
export function checkAndApplyRotation(state: GameState, teamState: TeamState, currentTotalSec: number) {
    const currentMinute = Math.min(47, Math.floor(currentTotalSec / 60));
    
    // 1. 로테이션 맵 확인
    const map = teamState.tactics.rotationMap;
    const validSelectedIds = new Set<string>();

    if (map) {
         Object.entries(map).forEach(([pid, m]) => {
             if (m[currentMinute]) {
                 const p = [...teamState.onCourt, ...teamState.bench].find(lp => lp.playerId === pid);
                 // 출전 가능 상태: 건강함 + 파울 6개 미만 + (사용자가 명시한 경우 Shutdown 무시하고 뜀)
                 if (p && p.health === 'Healthy' && p.pf < 6) {
                     validSelectedIds.add(pid);
                 }
             }
         });
    }

    // 2. [Fallback] 5명이 안 채워졌을 때 (비상 상황)
    if (validSelectedIds.size < 5) {
        // 1단계: 건강하고 탈진하지 않은 선수 우선
        let allAvailable = [...teamState.onCourt, ...teamState.bench].filter(p => 
            p.health === 'Healthy' && p.pf < 6 && !p.isShutdown && !validSelectedIds.has(p.playerId)
        );

        // 2단계(비상): 인원이 부족하면 탈진한 선수라도 포함 (기권패 방지)
        if (validSelectedIds.size + allAvailable.length < 5) {
            const tiredPlayers = [...teamState.onCourt, ...teamState.bench].filter(p => 
                p.health === 'Healthy' && p.pf < 6 && p.isShutdown && !validSelectedIds.has(p.playerId)
            );
            allAvailable = [...allAvailable, ...tiredPlayers];
        }

        // 안정성 정렬: 코트 위 선수 우선 > OVR > 체력
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

    // 3. 실제 교체 실행 (OVR 순 5명 컷)
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

    // 반드시 5명이 확보된 경우에만 교체 실행 (안전장치)
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
                if (!state.rotationHistory[p.playerId]) state.rotationHistory[p.playerId] = [];
                state.rotationHistory[p.playerId].push({ in: currentTotalSec, out: currentTotalSec });
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

/**
 * 4. 강제 교체 (부상/퇴장)
 */
export function forceSubstitution(state: GameState, team: TeamState, outPlayer: LivePlayer, reason: string) {
    const currentTotalSec = ((state.quarter - 1) * 720) + (720 - state.gameClock);
    const currentMinute = Math.min(47, Math.floor(currentTotalSec / 60));

    // 1. 승계 로직 실행
    applyRotationSuccession(team, outPlayer, currentMinute);

    // 2. 즉시 교체 대상 찾기
    // 건강하고 파울 아웃되지 않은 선수 중, 셧다운되지 않은 선수 우선
    let available = team.bench.filter(p => p.health === 'Healthy' && p.pf < 6 && !p.isShutdown);
    // 비상시: 셧다운된 선수라도 데려옴
    if (available.length === 0) {
        available = team.bench.filter(p => p.health === 'Healthy' && p.pf < 6);
    }
    
    let inPlayer: LivePlayer | undefined;
    
    // A. 맵에서 대체자 찾기
    if (team.tactics.rotationMap) {
        for (const p of available) {
             if (team.tactics.rotationMap[p.playerId] && team.tactics.rotationMap[p.playerId][currentMinute]) {
                 inPlayer = p;
                 break;
             }
        }
    }

    // B. 맵에 없다면 RES 로직 (Shutdown 고려)
    if (!inPlayer) {
        const excludeIds = new Set<string>([outPlayer.playerId, ...team.onCourt.map(p => p.playerId)]);
        // 1차: 정상 선수 중 찾기
        inPlayer = findResCandidate(team, outPlayer.position, excludeIds, false) || undefined;
        // 2차: 없으면 탈진 선수라도 찾기
        if (!inPlayer) {
             inPlayer = findResCandidate(team, outPlayer.position, excludeIds, true) || undefined;
        }
    }

    // C. 최후의 수단: 아무나 (OVR 순)
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

            // 기록
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

// ─────────────────────────────────────────────────────────────
// 5. 임시 벤치 (파울 트러블 / 탈진) — 맵 보존 + 자동 복귀
// ─────────────────────────────────────────────────────────────

/**
 * 임시 벤치: 원본 맵을 보존하면서 대체자에게 일시적으로 슬롯을 넘김.
 * forceSubstitution과 달리 승계 로직(applyRotationSuccession)을 호출하지 않음.
 * returnMinute 이후의 원본 맵 슬롯은 그대로 유지 → 자동 복귀.
 */
export function benchWithOverride(
    state: GameState, team: TeamState, outPlayer: LivePlayer,
    reason: 'foul_trouble' | 'shutdown',
    currentMinute: number, returnMinute: number | null
): void {
    const map = team.tactics.rotationMap;
    if (!map) return;

    // 1. outPlayer 잔여 스케줄 스냅샷 (복원용)
    const originalSlots = Array(48).fill(false) as boolean[];
    if (map[outPlayer.playerId]) {
        for (let i = currentMinute; i < 48; i++) {
            originalSlots[i] = map[outPlayer.playerId][i];
        }
    }

    // 2. 대체자 탐색
    const excludeIds = new Set<string>([outPlayer.playerId, ...team.onCourt.map(p => p.playerId)]);
    let filler = findResCandidate(team, outPlayer.position, excludeIds, false);
    if (!filler) filler = findResCandidate(team, outPlayer.position, excludeIds, true);
    if (!filler) return; // 뎁스 소진 → 벤치 불가, 계속 기용

    // 3. 맵 전이: outPlayer → filler (returnMinute까지만)
    const effectiveReturn = returnMinute ?? 48;
    if (!map[filler.playerId]) map[filler.playerId] = Array(48).fill(false);
    if (!map[outPlayer.playerId]) map[outPlayer.playerId] = Array(48).fill(false);

    for (let i = currentMinute; i < effectiveReturn; i++) {
        if (map[outPlayer.playerId][i]) {
            map[filler.playerId][i] = true;
            map[outPlayer.playerId][i] = false;
        }
    }

    // 4. returnMinute 이후: 원본 맵에서 복원 (★ 핵심 차이점)
    if (returnMinute !== null && returnMinute < 48) {
        const orig = state.originalRotationMap[outPlayer.playerId];
        if (orig) {
            for (let i = returnMinute; i < 48; i++) {
                map[outPlayer.playerId][i] = orig[i];
            }
        }
    }

    // 5. 오버라이드 스택에 기록
    state.activeOverrides.push({
        outPlayerId: outPlayer.playerId,
        fillerPlayerId: filler.playerId,
        reason,
        fromMinute: currentMinute,
        toMinute: effectiveReturn,
        originalSlots,
        active: true,
    });

    // 6. 선수 메타데이터 설정
    outPlayer.benchReason = reason;
    outPlayer.benchedAtMinute = currentMinute;
    outPlayer.benchedAtQuarter = state.quarter;
    outPlayer.scheduledReturnMinute = returnMinute ?? undefined;

    // 7. 물리적 스왑 + 히스토리 + 로그
    const currentTotalSec = ((state.quarter - 1) * 720) + (720 - state.gameClock);
    const outIdx = team.onCourt.indexOf(outPlayer);
    const inIdx = team.bench.indexOf(filler);

    if (outIdx > -1 && inIdx > -1) {
        team.onCourt.splice(outIdx, 1);
        team.bench.push(outPlayer);
        team.bench.splice(inIdx, 1);
        team.onCourt.push(filler);

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

// ─────────────────────────────────────────────────────────────
// 6. 임시 벤치 선수 자동 복귀 체크 (매 포세션)
// ─────────────────────────────────────────────────────────────

/**
 * checkAndApplyRotation 이전에 호출.
 * 임시 벤치 선수의 복귀 조건 충족 시 맵 복원 → checkAndApplyRotation이 물리적 투입 처리.
 */
export function checkTemporaryReturns(
    state: GameState, team: TeamState, currentMinute: number
): void {
    if (!state.activeOverrides || !team.tactics.rotationMap) return;

    for (const override of state.activeOverrides) {
        if (!override.active) continue;

        const player = team.bench.find(p => p.playerId === override.outPlayerId);
        if (!player) {
            // 선수가 벤치에 없음 (이미 다른 경로로 처리됨)
            override.active = false;
            continue;
        }

        // 영구 퇴장 사유 발생 시 즉시 비활성화
        if (player.health === 'Injured' || player.pf >= 6) {
            override.active = false;
            player.benchReason = null;
            continue;
        }

        let shouldReturn = false;

        if (override.reason === 'foul_trouble') {
            // 예정 분에 도달하면 복귀 판정
            if (player.scheduledReturnMinute !== undefined && currentMinute >= player.scheduledReturnMinute) {
                // 복귀 전 재평가: 상황이 변했을 수 있음
                const recheck = evaluateFoulTroubleAction(state, team, player, currentMinute);
                if (recheck.shouldBench && recheck.returnMinute !== null) {
                    // 아직 위험 → 연장
                    override.toMinute = recheck.returnMinute;
                    player.scheduledReturnMinute = recheck.returnMinute;
                    continue;
                }
                shouldReturn = !recheck.shouldBench;
            }
        } else if (override.reason === 'shutdown') {
            // 체력 회복 + 셧다운 해제되면 복귀
            if (!player.isShutdown && player.currentCondition > 70) {
                const orig = state.originalRotationMap[player.playerId];
                if (orig && orig[currentMinute]) {
                    // 원본 맵에서 지금 출전 예정 → 즉시 복귀
                    shouldReturn = true;
                } else if (orig && orig.slice(currentMinute).some(Boolean)) {
                    // 지금은 아니지만 이후 슬롯 있음 → 맵만 복원, 투입은 rotation 체크가 처리
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

        // ★ 맵 복원
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
        // 실제 물리적 투입은 checkAndApplyRotation이 맵 기반으로 처리
    }
}

/**
 * 원본 맵 복원 (임시 벤치 해제 시)
 */
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

/**
 * Filler의 상속 슬롯 제거 — filler 원본 맵으로 복원
 */
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

// ─────────────────────────────────────────────────────────────
// 7. Filler가 추가 퇴장하는 경우 (체인 전이)
// ─────────────────────────────────────────────────────────────

/**
 * 영구 퇴장(부상/6파울)으로 forceSubstitution 호출 전에 실행.
 * 퇴장하는 선수가 다른 선수의 filler였으면 체인을 관리.
 */
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

    // 원래 선수가 복귀 가능한지 체크
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

    // 원래 선수 복귀 불가 → 새 대체자 탐색
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
        // 뎁스 완전 소진 — fallback이 처리
        override.active = false;
    }
}
