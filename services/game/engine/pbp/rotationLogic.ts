
import { GameState, TeamState, LivePlayer } from './pbpTypes';
import { DepthChart } from '../../../../types';
import { formatTime } from './timeEngine';

export interface SubRequest {
    outPlayer: LivePlayer;
    inPlayer: LivePlayer;
    reason: string;
}

// Check standard rotation map and garbage time
export function checkAndApplyRotation(state: GameState, teamState: TeamState, currentTotalSec: number) {
    const currentMinute = Math.min(47, Math.floor(currentTotalSec / 60));
    
    const scoreDiff = Math.abs(state.home.score - state.away.score);
    const isGarbageTime = state.quarter >= 4 && state.gameClock < 300 && scoreDiff > 20;

    let finalRequiredIds: string[] = [];

    if (isGarbageTime) {
        // Garbage Time Logic: Prioritize Bench & 3rd String
        const garbageCandidates = new Set<string>();
        const allAvailable = [...teamState.onCourt, ...teamState.bench].filter(p => p.health === 'Healthy' && p.pf < 6);

        if (teamState.depthChart) {
            Object.values(teamState.depthChart).forEach(row => {
                const thirdStringId = row[2]; 
                if (thirdStringId && allAvailable.some(p => p.playerId === thirdStringId)) {
                    garbageCandidates.add(thirdStringId);
                }
            });
        }
        // Fill rest with lowest OVR
        allAvailable.sort((a, b) => a.ovr - b.ovr);

        for (const candId of garbageCandidates) {
            if (finalRequiredIds.length >= 5) break;
            finalRequiredIds.push(candId);
        }
        for (const p of allAvailable) {
            if (finalRequiredIds.length >= 5) break;
            if (!finalRequiredIds.includes(p.playerId)) finalRequiredIds.push(p.playerId);
        }

    } else {
        // Standard Rotation Map Logic
        const map = teamState.tactics.rotationMap;
        if (!map || Object.keys(map).length === 0) return; // No map set

        const shouldBeOnIds = Object.entries(map).filter(([_, m]) => m[currentMinute]).map(([pid]) => pid);

        shouldBeOnIds.forEach(pid => {
            const p = [...teamState.onCourt, ...teamState.bench].find(lp => lp.playerId === pid);
            
            // If intended player is unavailable (Injured/Fouled Out), find sub from Depth Chart
            if (!p || p.health === 'Injured' || p.pf >= 6) {
                const pos = p?.position || 'SF';
                const row = teamState.depthChart?.[pos as keyof DepthChart] || [];
                const nextId = row.find(id => {
                    if (!id || id === pid) return false;
                    const cand = [...teamState.onCourt, ...teamState.bench].find(lp => lp.playerId === id);
                    return cand && cand.health === 'Healthy' && cand.pf < 6;
                });
                if (nextId) finalRequiredIds.push(nextId);
            } else {
                finalRequiredIds.push(pid);
            }
        });
    }

    // Execute Changes
    if (finalRequiredIds.length > 0) {
        const currentOnCourtIds = teamState.onCourt.map(p => p.playerId);
        const needsUpdate = finalRequiredIds.some(id => !currentOnCourtIds.includes(id)) || currentOnCourtIds.some(id => !finalRequiredIds.includes(id));

        if (needsUpdate) {
            const toRemove = teamState.onCourt.filter(p => !finalRequiredIds.includes(p.playerId));
            const toAdd = teamState.bench.filter(p => finalRequiredIds.includes(p.playerId));

            // Swap Arrays
            toRemove.forEach(p => {
                const idx = teamState.onCourt.indexOf(p);
                if (idx > -1) {
                    teamState.onCourt.splice(idx, 1);
                    teamState.bench.push(p);
                    // Close stats segment
                    const hist = state.rotationHistory[p.playerId];
                    if (hist && hist.length > 0) hist[hist.length - 1].out = currentTotalSec;
                }
            });

            toAdd.forEach(p => {
                const idx = teamState.bench.indexOf(p);
                if (idx > -1) {
                    teamState.bench.splice(idx, 1);
                    teamState.onCourt.push(p);
                    // Open stats segment
                    if (!state.rotationHistory[p.playerId]) state.rotationHistory[p.playerId] = [];
                    state.rotationHistory[p.playerId].push({ in: currentTotalSec, out: currentTotalSec });
                    
                    // Reset Sub-in context
                    p.lastSubInTime = state.gameClock;
                    p.conditionAtSubIn = p.currentCondition;
                }
            });

            // Ensure 5 players (Emergency Fill)
            while (teamState.onCourt.length < 5 && teamState.bench.length > 0) {
                 const filler = teamState.bench.find(p => p.health === 'Healthy' && p.pf < 6) || teamState.bench[0];
                 const idx = teamState.bench.indexOf(filler);
                 teamState.bench.splice(idx, 1);
                 teamState.onCourt.push(filler);
                 
                 // [Fix] Safety check
                 if (!state.rotationHistory[filler.playerId]) state.rotationHistory[filler.playerId] = [];
                 state.rotationHistory[filler.playerId].push({ in: currentTotalSec, out: currentTotalSec });
                 
                 // Log forced filler
                 toAdd.push(filler);
            }
            
            // Log rotation with detailed names
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
}

// Force a specific substitution (Injury/Foul out)
export function forceSubstitution(state: GameState, team: TeamState, outPlayer: LivePlayer, reason: string) {
    const currentTotalSec = ((state.quarter - 1) * 720) + (720 - state.gameClock);
    
    // Find replacement from Depth Chart
    const available = team.bench.filter(p => p.health === 'Healthy' && p.pf < 6);
    let inPlayer: LivePlayer | undefined;

    if (team.depthChart) {
        const row = team.depthChart[outPlayer.position as keyof DepthChart] || [];
        for (const id of row) {
            if (!id || id === outPlayer.playerId) continue;
            const cand = available.find(p => p.playerId === id);
            if (cand) {
                inPlayer = cand;
                break;
            }
        }
    }
    
    // Fallback: Best OVR same pos -> Best OVR any pos
    if (!inPlayer) inPlayer = available.find(p => p.position === outPlayer.position);
    if (!inPlayer) inPlayer = available.sort((a,b) => b.ovr - a.ovr)[0];

    if (inPlayer) {
        const outIdx = team.onCourt.indexOf(outPlayer);
        const inIdx = team.bench.indexOf(inPlayer);
        
        if (outIdx > -1 && inIdx > -1) {
            team.onCourt.splice(outIdx, 1);
            team.bench.push(outPlayer);
            
            team.bench.splice(inIdx, 1);
            team.onCourt.push(inPlayer);
            
            // Update History
            const histOut = state.rotationHistory[outPlayer.playerId];
            if (histOut && histOut.length > 0) histOut[histOut.length - 1].out = currentTotalSec;
            
            // [Fix] Safety check
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
