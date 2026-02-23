
import { GameState, TeamState, LivePlayer } from './pbpTypes';
import { DepthChart } from '../../../../types';
import { formatTime } from './timeEngine';

export interface SubRequest {
    outPlayer: LivePlayer;
    inPlayer: LivePlayer;
    reason: string;
}

/**
 * 1. RES(로테이션 제외) 멤버 중 대체 자원 찾기
 * 정렬 기준: 1. 동일 포지션 > 2. OVR 높은 순 > 3. 체력(Condition) 높은 순
 * [Update] 탈진(Shutdown) 상태인 선수는 1차적으로 배제함.
 */
function findResCandidate(team: TeamState, targetPosition: string, excludeIds: Set<string>, allowShutdown: boolean = false): LivePlayer | null {
    const candidates = team.bench.filter(p => 
        p.health === 'Healthy' && 
        p.pf < 6 && 
        !excludeIds.has(p.playerId) &&
        (allowShutdown || !p.isShutdown) // 기본적으로 셧다운 선수는 제외, 급하면 포함
    );

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
        // 1. 동일 포지션 우선
        const aPosMatch = a.position === targetPosition ? 1 : 0;
        const bPosMatch = b.position === targetPosition ? 1 : 0;
        if (aPosMatch !== bPosMatch) return bPosMatch - aPosMatch;

        // 2. OVR 높은 순
        if (b.ovr !== a.ovr) return b.ovr - a.ovr;

        // 3. 체력 높은 순
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
