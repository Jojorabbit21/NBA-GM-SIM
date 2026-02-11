
import { GameState, TeamState, LivePlayer } from './pbpTypes';
import { DepthChart } from '../../../../types';
import { formatTime } from './timeEngine';

export interface SubRequest {
    outPlayer: LivePlayer;
    inPlayer: LivePlayer;
    reason: string;
}

// Helper: Find best available replacement from Depth Chart or Bench
function findBestReplacement(
    teamState: TeamState, 
    targetPos: string, 
    excludeIds: Set<string>
): string | null {
    // 1. Check Depth Chart for this position
    if (teamState.depthChart) {
        const row = teamState.depthChart[targetPos as keyof DepthChart] || [];
        for (const id of row) {
            if (!id || excludeIds.has(id)) continue;
            // Check if player is actually available (Healthy, not fouled out)
            const p = [...teamState.onCourt, ...teamState.bench].find(lp => lp.playerId === id);
            if (p && p.health === 'Healthy' && p.pf < 6) return id;
        }
    }

    // 2. Fallback: Find best OVR player with matching position from bench
    const posCandidates = teamState.bench.filter(p => 
        p.position === targetPos && 
        p.health === 'Healthy' && 
        p.pf < 6 && 
        !excludeIds.has(p.playerId)
    ).sort((a, b) => b.ovr - a.ovr);
    
    if (posCandidates.length > 0) return posCandidates[0].playerId;

    // 3. Last Resort: Find best OVR player ANY position
    const anyCandidates = teamState.bench.filter(p => 
        p.health === 'Healthy' && 
        p.pf < 6 && 
        !excludeIds.has(p.playerId)
    ).sort((a, b) => b.ovr - a.ovr);

    if (anyCandidates.length > 0) return anyCandidates[0].playerId;

    return null;
}

// Check standard rotation map and garbage time
export function checkAndApplyRotation(state: GameState, teamState: TeamState, currentTotalSec: number) {
    const currentMinute = Math.min(47, Math.floor(currentTotalSec / 60));
    const scoreDiff = Math.abs(state.home.score - state.away.score);
    
    // [Garbage Time Logic - Hysteresis Implementation]
    let isGarbageTime = false;
    let enterThreshold = 999; 
    let exitThreshold = -1;

    if (state.quarter >= 4) {
        const t = state.gameClock;
        if (t < 300 && t >= 240) { enterThreshold = 20; exitThreshold = 20; } 
        else if (t < 240 && t >= 120) { enterThreshold = 20; exitThreshold = 12; } 
        else if (t < 120 && t >= 60) { enterThreshold = 15; exitThreshold = 8; } 
        else if (t < 60) { enterThreshold = 100; exitThreshold = 6; }
    }

    if (scoreDiff > enterThreshold) {
        isGarbageTime = true;
    } else if (scoreDiff <= exitThreshold) {
        isGarbageTime = false;
    } else {
        // Buffer Zone: Check if starters are playing to infer intent
        const starterCount = teamState.onCourt.filter(p => p.isStarter).length;
        isGarbageTime = starterCount < 3;
    }

    let finalRequiredIds: string[] = [];
    const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

    if (isGarbageTime) {
        // [Garbage Time Selection Logic - Strict Priority]
        // 1. 3rd Stringer (Depth 2) -> Priority 1
        // 2. Reserve (Not in Chart) -> Priority 2
        // 3. Bench (Depth 1) -> Priority 3
        // 4. Starter (Depth 0) -> Priority 4 (Avoid)
        // Tie-breaker: Low OVR first (Give rookies minutes)
        
        const usedIds = new Set<string>();
        const depthMap = new Map<string, number>(); // ID -> Depth Index
        
        // Build Depth Map
        if (teamState.depthChart) {
            Object.values(teamState.depthChart).forEach(row => {
                if (row[0]) depthMap.set(row[0], 0); // Starter
                if (row[1]) depthMap.set(row[1], 1); // Bench
                if (row[2]) depthMap.set(row[2], 2); // 3rd
            });
        }

        const allAvailable = [...teamState.onCourt, ...teamState.bench].filter(p => 
            p.health === 'Healthy' && p.pf < 6
        );

        // Helper to get priority score
        const getPriorityScore = (p: LivePlayer) => {
            const depth = depthMap.get(p.playerId);
            if (depth === 2) return 1; // 3rd Stringer (Best for Garbage)
            if (depth === undefined) return 2; // Reserve (Good for Garbage)
            if (depth === 1) return 3; // Bench (Okay)
            if (depth === 0) return 4; // Starter (Avoid)
            return 2;
        };

        // Iterate Positions to find best garbage fit
        for (const pos of POSITIONS) {
            // Filter candidates for this position that aren't used
            let candidates = allAvailable.filter(p => 
                p.position === pos && !usedIds.has(p.playerId)
            );

            // Sort: Priority ASC (1->4), then OVR ASC (Low->High)
            candidates.sort((a, b) => {
                const pA = getPriorityScore(a);
                const pB = getPriorityScore(b);
                if (pA !== pB) return pA - pB;
                return a.ovr - b.ovr; // Play the scrubs
            });

            let selected = candidates.length > 0 ? candidates[0] : null;

            // Fallback: If no one matches position, grab the absolute best garbage candidate remaining
            if (!selected) {
                const leftovers = allAvailable.filter(p => !usedIds.has(p.playerId));
                leftovers.sort((a, b) => {
                    const pA = getPriorityScore(a);
                    const pB = getPriorityScore(b);
                    if (pA !== pB) return pA - pB;
                    return a.ovr - b.ovr;
                });
                if (leftovers.length > 0) selected = leftovers[0];
            }

            if (selected) {
                finalRequiredIds.push(selected.playerId);
                usedIds.add(selected.playerId);
            }
        }

    } else {
        // [Standard Rotation Logic - Intelligent Gap Filling]
        const map = teamState.tactics.rotationMap;
        const validSelectedIds = new Set<string>();

        // 1. Collect User Selections from Map
        if (map) {
             Object.entries(map).forEach(([pid, m]) => {
                 if (m[currentMinute]) {
                     // Verify availability
                     const p = [...teamState.onCourt, ...teamState.bench].find(lp => lp.playerId === pid);
                     if (p && p.health === 'Healthy' && p.pf < 6) {
                         validSelectedIds.add(pid);
                     }
                 }
             });
        }

        // 2. Intelligent Fill (if selected < 5)
        if (validSelectedIds.size < 5) {
            // Determine which positions are missing
            const coveredPositions = new Map<string, number>(); // Pos -> Count
            POSITIONS.forEach(pos => coveredPositions.set(pos, 0));

            validSelectedIds.forEach(id => {
                const p = [...teamState.onCourt, ...teamState.bench].find(lp => lp.playerId === id);
                if (p) {
                    // Approximate position match (simplified)
                    const mainPos = p.position.split('/')[0]; 
                    if (coveredPositions.has(mainPos)) {
                        coveredPositions.set(mainPos, (coveredPositions.get(mainPos) || 0) + 1);
                    }
                }
            });

            // Iterate positions and fill gaps
            for (const pos of POSITIONS) {
                if (validSelectedIds.size >= 5) break;
                
                // If this position is not covered (count 0), try to fill it
                if ((coveredPositions.get(pos) || 0) === 0) {
                    const fillId = findBestReplacement(teamState, pos, validSelectedIds);
                    if (fillId) {
                        validSelectedIds.add(fillId);
                        coveredPositions.set(pos, 1);
                    }
                }
            }

            // Still not 5? Fill with best OVR available regardless of position
            if (validSelectedIds.size < 5) {
                const leftovers = [...teamState.onCourt, ...teamState.bench]
                    .filter(p => p.health === 'Healthy' && p.pf < 6 && !validSelectedIds.has(p.playerId))
                    .sort((a, b) => b.ovr - a.ovr);
                
                for (const p of leftovers) {
                    if (validSelectedIds.size >= 5) break;
                    validSelectedIds.add(p.playerId);
                }
            }
        }

        // 3. Trim (if selected > 5) - Should rarely happen but safety first
        if (validSelectedIds.size > 5) {
            const sorted = Array.from(validSelectedIds).map(id => 
                [...teamState.onCourt, ...teamState.bench].find(p => p.playerId === id)
            ).filter(p => p).sort((a, b) => b!.ovr - a!.ovr);
            
            finalRequiredIds = sorted.slice(0, 5).map(p => p!.playerId);
        } else {
            finalRequiredIds = Array.from(validSelectedIds);
        }
    }

    // Execute Changes (Standardized)
    if (finalRequiredIds.length > 0) {
        const currentOnCourtIds = teamState.onCourt.map(p => p.playerId);
        const needsUpdate = finalRequiredIds.some(id => !currentOnCourtIds.includes(id)) || currentOnCourtIds.some(id => !finalRequiredIds.includes(id));

        if (needsUpdate) {
            // Identify players leaving and entering
            const toRemove = teamState.onCourt.filter(p => !finalRequiredIds.includes(p.playerId));
            const toAdd = teamState.bench.filter(p => finalRequiredIds.includes(p.playerId));

            // Perform Swaps
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
                    
                    p.lastSubInTime = state.gameClock;
                    p.conditionAtSubIn = p.currentCondition;
                }
            });

            // FINAL SAFETY NET: Ensure exactly 5 players
            // This handles cases where pool was totally empty (e.g. everyone injured)
            while (teamState.onCourt.length < 5 && teamState.bench.length > 0) {
                 const filler = teamState.bench.find(p => p.health === 'Healthy' && p.pf < 6) || teamState.bench[0];
                 const idx = teamState.bench.indexOf(filler);
                 teamState.bench.splice(idx, 1);
                 teamState.onCourt.push(filler);
                 
                 if (!state.rotationHistory[filler.playerId]) state.rotationHistory[filler.playerId] = [];
                 state.rotationHistory[filler.playerId].push({ in: currentTotalSec, out: currentTotalSec });
                 toAdd.push(filler);
            }
            
            // Log rotation
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
    
    // Find replacement using the smart helper
    const available = team.bench.filter(p => p.health === 'Healthy' && p.pf < 6 && !p.isShutdown);
    const excludeIds = new Set<string>([outPlayer.playerId]);
    
    const inPlayerId = findBestReplacement(team, outPlayer.position, excludeIds);
    const inPlayer = available.find(p => p.playerId === inPlayerId);

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
