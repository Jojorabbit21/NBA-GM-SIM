
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
    
    // [Garbage Time Logic - Hysteresis Implementation]
    // Goal: Prevent flickering (starters <-> bench) when score hovers around the threshold.
    // Logic: Define 'Enter' threshold (High) and 'Exit' threshold (Low).
    // If Diff > Enter: Force Garbage.
    // If Diff <= Exit: Force Starters.
    // If Exit < Diff <= Enter: Maintain current state (Check who is on court).

    let isGarbageTime = false;
    let enterThreshold = 999; // Default: Unreachable
    let exitThreshold = -1;   // Default: Unreachable

    if (state.quarter >= 4) {
        const t = state.gameClock; // Time remaining in seconds
        
        if (t < 300 && t >= 240) {
            // 5:00 ~ 4:00 remaining: > 20 pts (Standard)
            enterThreshold = 20; 
            exitThreshold = 20;
        } else if (t < 240 && t >= 120) {
            // 4:00 ~ 2:00 remaining: Enter > 20, Exit <= 12
            enterThreshold = 20;
            exitThreshold = 12;
        } else if (t < 120 && t >= 60) {
            // 2:00 ~ 1:00 remaining: Enter > 15, Exit <= 8
            enterThreshold = 15;
            exitThreshold = 8;
        } else if (t < 60) {
            // < 1:00 remaining: Enter > 100 (Lock state), Exit <= 6
            enterThreshold = 100; // Almost impossible to re-enter garbage if starters are back
            exitThreshold = 6;
        }
    }

    if (scoreDiff > enterThreshold) {
        // Gap is huge, enforce garbage time
        isGarbageTime = true;
    } else if (scoreDiff <= exitThreshold) {
        // Gap is closed, force starters back
        isGarbageTime = false;
    } else {
        // [Buffer Zone] Maintain Status Quo
        // We infer the "Current State" by checking if starters are currently playing.
        // If 3 or more starters are on court, we assume we are in "Win Mode" (Not Garbage).
        // If less than 3 starters, we assume we are in "Garbage Mode".
        const starterCount = teamState.onCourt.filter(p => p.isStarter).length;
        isGarbageTime = starterCount < 3;
    }

    let finalRequiredIds: string[] = [];

    if (isGarbageTime) {
        // [Garbage Time Selection Logic]
        // Goal: Protect Starters. Prioritize Deep Bench (3rd) -> Reserves (Out of Rotation) -> Regular Bench.
        
        const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
        const usedIds = new Set<string>();

        // 1. Identify "Depth Status" for all players
        // 0: Starter, 1: Bench, 2: Third, -1: Reserve (Not in chart)
        const depthMap = new Map<string, number>();
        const allChartIds = new Set<string>();

        if (teamState.depthChart) {
            Object.values(teamState.depthChart).forEach(row => {
                if (row[0]) { depthMap.set(row[0], 0); allChartIds.add(row[0]); }
                if (row[1]) { depthMap.set(row[1], 1); allChartIds.add(row[1]); }
                if (row[2]) { depthMap.set(row[2], 2); allChartIds.add(row[2]); }
            });
        }

        // 2. Filter Available Players (Healthy, Not Fouled Out)
        const allAvailable = [...teamState.onCourt, ...teamState.bench].filter(p => 
            p.health === 'Healthy' && 
            p.pf < 6
        );

        // 3. Fill each position slot
        for (const pos of POSITIONS) {
            let candidate: LivePlayer | undefined;
            const dRow = teamState.depthChart?.[pos as keyof DepthChart] || [];

            // Priority A: Specific 3rd Stringer (Depth 2)
            const thirdId = dRow[2];
            if (thirdId && !usedIds.has(thirdId)) {
                candidate = allAvailable.find(p => p.playerId === thirdId);
            }

            // Priority B: Specific Position Reserve (Not in Chart, Matches Position)
            // Sort by OVR ASC (Play the raw prospects first)
            if (!candidate) {
                const posReserves = allAvailable.filter(p => 
                    !allChartIds.has(p.playerId) && // Is Reserve
                    p.position === pos &&           // Matches Position
                    !usedIds.has(p.playerId)
                ).sort((a, b) => a.ovr - b.ovr);
                
                if (posReserves.length > 0) candidate = posReserves[0];
            }

            // Priority C: Specific Bench (Depth 1) - Only if we ran out of scrubs
            if (!candidate) {
                const benchId = dRow[1];
                if (benchId && !usedIds.has(benchId)) {
                    candidate = allAvailable.find(p => p.playerId === benchId);
                }
            }

            // Priority D: Any Reserve (Best fit leftover)
            if (!candidate) {
                const anyReserves = allAvailable.filter(p => 
                    !allChartIds.has(p.playerId) && 
                    !usedIds.has(p.playerId)
                ).sort((a, b) => a.ovr - b.ovr);
                if (anyReserves.length > 0) candidate = anyReserves[0];
            }

            // Priority E: Any Bench (Best fit leftover)
            if (!candidate) {
                const anyBench = allAvailable.filter(p => 
                    depthMap.get(p.playerId) === 1 && 
                    !usedIds.has(p.playerId)
                ).sort((a, b) => a.ovr - b.ovr);
                if (anyBench.length > 0) candidate = anyBench[0];
            }

            // Priority F: Keep current player (Stability) or Force Starter (Emergency)
            if (!candidate) {
                // Try to find ANYONE not used
                candidate = allAvailable.find(p => !usedIds.has(p.playerId));
            }

            if (candidate) {
                finalRequiredIds.push(candidate.playerId);
                usedIds.add(candidate.playerId);
            }
        }

    } else {
        // [Standard Rotation Logic]
        // Follow the Rotation Map (User Strategy)
        const map = teamState.tactics.rotationMap;
        const scheduledIds: string[] = [];
        if (map) {
             Object.entries(map).forEach(([pid, m]) => {
                 if (m[currentMinute]) scheduledIds.push(pid);
             });
        }

        scheduledIds.forEach(pid => {
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

            // Ensure 5 players (Emergency Fill if pool was empty or map was malformed)
            while (teamState.onCourt.length < 5 && teamState.bench.length > 0) {
                 const filler = teamState.bench.find(p => p.health === 'Healthy' && p.pf < 6) || teamState.bench[0];
                 const idx = teamState.bench.indexOf(filler);
                 teamState.bench.splice(idx, 1);
                 teamState.onCourt.push(filler);
                 
                 if (!state.rotationHistory[filler.playerId]) state.rotationHistory[filler.playerId] = [];
                 state.rotationHistory[filler.playerId].push({ in: currentTotalSec, out: currentTotalSec });
                 
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
    const available = team.bench.filter(p => p.health === 'Healthy' && p.pf < 6 && !p.isShutdown);
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
