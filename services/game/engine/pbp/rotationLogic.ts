
import { GameState, TeamState, LivePlayer } from './pbpTypes';
import { DepthChart } from '../../../../types';
import { formatTime } from './timeEngine';

export interface SubRequest {
    outPlayer: LivePlayer;
    inPlayer: LivePlayer;
    reason: string;
}

// --- HELPER: Find Substitute from RES (Reserve) ---
function findResCandidate(team: TeamState, targetPosition: string, excludeIds: Set<string>): LivePlayer | null {
    // Candidates are healthy, not fouled out, and NOT currently assigned a role in Depth Chart 
    // (However, in this simplified context, anyone not in the active rotation logic is essentially RES for this moment)
    // We strictly look for players on the bench who are available.
    
    const candidates = team.bench.filter(p => 
        p.health === 'Healthy' && 
        p.pf < 6 && 
        !excludeIds.has(p.playerId)
    );

    if (candidates.length === 0) return null;

    // Sort Logic:
    // 1. Same Position
    // 2. Highest OVR
    // 3. Highest Condition
    candidates.sort((a, b) => {
        const aPosMatch = a.position === targetPosition ? 1 : 0;
        const bPosMatch = b.position === targetPosition ? 1 : 0;
        
        if (aPosMatch !== bPosMatch) return bPosMatch - aPosMatch;
        if (b.ovr !== a.ovr) return b.ovr - a.ovr;
        return b.currentCondition - a.currentCondition;
    });

    return candidates[0];
}

// --- CORE: Rotation Succession Logic ---
function applyRotationSuccession(team: TeamState, outPlayer: LivePlayer, currentMinute: number) {
    if (!team.depthChart || !team.tactics.rotationMap) return;

    // 1. Identify Depth
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

    if (!rolePos) return; // Player not in depth chart (RES), no succession needed

    const chart = team.depthChart[rolePos];
    const starterId = chart[0];
    const benchId = chart[1];
    const thirdId = chart[2];

    // Helper to move schedule from Source ID to Target ID
    const transferSchedule = (sourceId: string | null, targetId: string | null) => {
        if (!sourceId || !targetId || !team.tactics.rotationMap) return;
        
        // Ensure source map exists
        if (!team.tactics.rotationMap[sourceId]) return;
        
        // Ensure target map exists (create if not)
        if (!team.tactics.rotationMap[targetId]) {
            team.tactics.rotationMap[targetId] = Array(48).fill(false);
        }

        const sourceMap = team.tactics.rotationMap[sourceId];
        const targetMap = team.tactics.rotationMap[targetId];

        // Copy future minutes (currentMinute -> 47)
        for (let i = currentMinute; i < 48; i++) {
            targetMap[i] = sourceMap[i];
            sourceMap[i] = false; // Clear source
        }
    };

    // Helper to find RES player and assign Third's role
    const assignResToThird = (thirdSourceId: string | null) => {
        if (!thirdSourceId) return;
        
        // Find best RES player
        const excludeIds = new Set<string>();
        // Exclude current rotation players roughly... but strictly exclusion is handled by filtering active map
        // Here we just need a body.
        
        const resPlayer = findResCandidate(team, rolePos!, new Set([outPlayer.playerId]));
        if (resPlayer) {
            transferSchedule(thirdSourceId, resPlayer.playerId);
            // Optionally update depth chart here if we wanted to persist it, 
            // but for simulation runtime we just update the rotationMap.
        }
    };

    // 2. Execute Succession Chain
    // Depth 0: Starter
    // Depth 1: Bench
    // Depth 2: Third
    
    if (depthIndex === 0) {
        // Starter OUT.
        // 1. Bench takes Starter's Minutes.
        // 2. Third takes Bench's Minutes.
        // 3. RES takes Third's Minutes.
        
        // Chain needs to happen bottom-up to preserve the "hole" filling logic if we simply overwrite?
        // Actually, we need to move Bench's EXISTING schedule to Third FIRST, then overwrite Bench with Starter.
        
        // Step A: Move Bench -> Third (If Bench exists)
        if (benchId) {
             // If Third exists, Third takes Bench's old schedule
             if (thirdId) {
                 transferSchedule(benchId, thirdId);
             } else {
                 // If no Third, find RES to take Bench's old schedule
                 assignResToThird(benchId);
             }
        }
        
        // Step B: Move Starter -> Bench (If Bench exists)
        if (benchId) {
            transferSchedule(outPlayer.playerId, benchId);
        } else if (thirdId) {
            // No Bench, but Third exists? Third takes Starter directly
            transferSchedule(outPlayer.playerId, thirdId);
        } else {
            // No Bench, No Third? Find RES to take Starter directly
            const resPlayer = findResCandidate(team, rolePos, new Set([outPlayer.playerId]));
            if (resPlayer) transferSchedule(outPlayer.playerId, resPlayer.playerId);
        }

    } else if (depthIndex === 1) {
        // Bench OUT.
        // 1. Third takes Bench's Minutes.
        if (thirdId) {
            transferSchedule(outPlayer.playerId, thirdId);
        } else {
             assignResToThird(outPlayer.playerId);
        }

    } else if (depthIndex === 2) {
        // Third OUT.
        // 1. RES takes Third's Minutes.
        assignResToThird(outPlayer.playerId);
    }
    
    // Clear outPlayer's remaining map to be safe
    if (team.tactics.rotationMap[outPlayer.playerId]) {
        const map = team.tactics.rotationMap[outPlayer.playerId];
        for (let i = currentMinute; i < 48; i++) map[i] = false;
    }
}


// Check standard rotation map and apply STRICTLY
export function checkAndApplyRotation(state: GameState, teamState: TeamState, currentTotalSec: number) {
    // 0 to 47 minute index
    const currentMinute = Math.min(47, Math.floor(currentTotalSec / 60));
    
    // 1. [Absolute Priority] Read User's Rotation Map
    const map = teamState.tactics.rotationMap;
    const validSelectedIds = new Set<string>();

    if (map) {
         Object.entries(map).forEach(([pid, m]) => {
             // If user checked this minute
             if (m[currentMinute]) {
                 // Verify availability (Must be Healthy and NOT fouled out)
                 const p = [...teamState.onCourt, ...teamState.bench].find(lp => lp.playerId === pid);
                 if (p && p.health === 'Healthy' && p.pf < 6) {
                     validSelectedIds.add(pid);
                 }
             }
         });
    }

    // 2. [Fallback] Fill gaps ONLY if map has < 5 players (User error or Injury/Foul)
    // Logic: Just pick the highest energy players available to fill the roster.
    if (validSelectedIds.size < 5) {
        const allAvailable = [...teamState.onCourt, ...teamState.bench].filter(p => 
            p.health === 'Healthy' && p.pf < 6 && !validSelectedIds.has(p.playerId)
        );

        // Sort by Fatigue (Freshest first)
        allAvailable.sort((a, b) => b.currentCondition - a.currentCondition);

        for (const p of allAvailable) {
            if (validSelectedIds.size >= 5) break;
            validSelectedIds.add(p.playerId);
        }
    }

    // 3. [Safety] If user selected > 5, cut down to 5 based on OVR
    let finalRequiredIds: string[] = [];
    if (validSelectedIds.size > 5) {
        const sorted = Array.from(validSelectedIds).map(id => 
            [...teamState.onCourt, ...teamState.bench].find(p => p.playerId === id)
        ).filter(p => p).sort((a, b) => b!.ovr - a!.ovr);
        
        finalRequiredIds = sorted.slice(0, 5).map(p => p!.playerId);
    } else {
        finalRequiredIds = Array.from(validSelectedIds);
    }

    // 4. Execute Substitution if Lineup Changed
    const currentOnCourtIds = teamState.onCourt.map(p => p.playerId);
    // Compare sets to see if change is needed
    const needsUpdate = finalRequiredIds.some(id => !currentOnCourtIds.includes(id)) || 
                        currentOnCourtIds.some(id => !finalRequiredIds.includes(id));

    if (needsUpdate && finalRequiredIds.length === 5) {
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
                
                // Update Stability trackers
                p.lastSubInTime = state.gameClock;
                p.conditionAtSubIn = p.currentCondition;
            }
        });
        
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

// Force a specific substitution (Injury/Foul out)
// [Update] Added Rotation Succession Logic Call
export function forceSubstitution(state: GameState, team: TeamState, outPlayer: LivePlayer, reason: string) {
    const currentTotalSec = ((state.quarter - 1) * 720) + (720 - state.gameClock);
    const currentMinute = Math.min(47, Math.floor(currentTotalSec / 60));

    // 1. Apply Succession Logic (Update future map based on depth chart)
    applyRotationSuccession(team, outPlayer, currentMinute);

    // 2. Perform Immediate Substitution
    // Find best replacement currently available (Since we just updated the map, the map might technically handle it next tick,
    // but forceSubstitution implies immediate action is needed now).
    // We prioritize the player who was just promoted via succession logic if possible, otherwise standard fallback.

    const available = team.bench.filter(p => p.health === 'Healthy' && p.pf < 6);
    const excludeIds = new Set<string>([outPlayer.playerId]);
    
    // Attempt to find who is scheduled NOW (after succession update)
    let inPlayer: LivePlayer | undefined;
    
    if (team.tactics.rotationMap) {
        for (const p of available) {
             if (team.tactics.rotationMap[p.playerId] && team.tactics.rotationMap[p.playerId][currentMinute]) {
                 inPlayer = p;
                 break;
             }
        }
    }

    // Fallback if map didn't yield a result (or succession logic didn't cover immediate minute)
    if (!inPlayer) {
        // 1. Same Position
        let candidates = available.filter(p => p.position === outPlayer.position && !excludeIds.has(p.playerId));
        // 2. Any Position
        if (candidates.length === 0) {
            candidates = available.filter(p => !excludeIds.has(p.playerId));
        }
        // Sort by OVR
        candidates.sort((a, b) => b.ovr - a.ovr);
        inPlayer = candidates[0];
    }

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
