
import { GameState, TeamState, LivePlayer } from './pbpTypes';
import { DepthChart } from '../../../../types';

export interface SubRequest {
    outPlayer: LivePlayer;
    inPlayer: LivePlayer;
    reason: string;
}

const HARD_FLOOR = 20; // Condition below 20 -> Shutdown (Emergency)

export function checkSubstitutions(state: GameState, team: TeamState): SubRequest[] {
    const { tactics } = team;
    
    // NOTE: This system is now primarily an EMERGENCY handler.
    // Routine rotation is handled by `checkManualRotation` in main.ts which enforces the Rotation Chart.
    // This function only handles forced removals due to injury, fouls, or severe fatigue (Shutdown).
    
    const scoreDiff = Math.abs(state.home.score - state.away.score);
    const isGarbage = state.quarter >= 4 && state.gameClock < 300 && scoreDiff > 20;
    
    // [New] Check if player is scheduled in rotation map for current minute
    // If mapped, we IGNORE fatigue shutdown. (User's command is law)
    const currentTotalSec = ((state.quarter - 1) * 720) + (720 - state.gameClock);
    const currentMinute = Math.min(47, Math.floor(currentTotalSec / 60));

    const requests: SubRequest[] = [];
    
    // Pool of available bench players (Healthy and not Shutdown)
    const availableBench = team.bench.filter(p => p.health !== 'Injured' && !p.isShutdown && p.pf < 6);

    // Helper to find best sub
    const findSub = (pos: string, excludeIds: string[]) => {
        // 1. Check Depth Chart
        if (team.depthChart) {
            const row = team.depthChart[pos as keyof DepthChart] || [];
            for (const id of row) {
                if (!id) continue;
                const candidate = availableBench.find(b => b.playerId === id && !excludeIds.includes(b.playerId));
                if (candidate) return candidate;
            }
        }
        
        // 2. Fallback: Best available matching position
        let candidates = availableBench.filter(b => b.position === pos && !excludeIds.includes(b.playerId));
        if (candidates.length === 0) {
            // 3. Fallback: Best available any position
            candidates = availableBench.filter(b => !excludeIds.includes(b.playerId));
        }
        
        return candidates.sort((a, b) => b.ovr - a.ovr)[0];
    };

    const currentOnCourtIds = team.onCourt.map(p => p.playerId);

    team.onCourt.forEach(p => {
        let shouldSub = false;
        let reason = '';

        // Check if user has explicitly scheduled this player right now
        const isScheduled = tactics.rotationMap && 
                            tactics.rotationMap[p.playerId] && 
                            tactics.rotationMap[p.playerId][currentMinute];

        // --- Priority 1: Emergencies (Override Lock & Chart) ---
        if (p.health === 'Injured') { 
            shouldSub = true; reason = '부상'; 
        } else if (p.pf >= 6) { 
            shouldSub = true; reason = '6반칙 퇴장'; // Updated text
        } 
        // --- Priority 2: Fatigue Shutdown (Only if NOT scheduled) ---
        else if (p.currentCondition <= HARD_FLOOR) { 
            if (isScheduled) {
                // User wants them to play despite exhaustion. Let them play.
                shouldSub = false; 
            } else {
                shouldSub = true; reason = '탈진(Shutdown)';
                p.isShutdown = true; 
            }
        } 
        
        // --- Priority 3: Garbage Time ---
        else if (isGarbage && p.isStarter) { 
            // Even in garbage time, if user scheduled a starter, they stay.
            if (!isScheduled) {
                shouldSub = true; reason = '가비지 타임'; 
            }
        }
        
        if (shouldSub) {
            const sub = findSub(p.position, [...currentOnCourtIds, ...requests.map(r => r.inPlayer.playerId)]);
            if (sub) {
                requests.push({ outPlayer: p, inPlayer: sub, reason });
            }
        }
    });

    return requests;
}
