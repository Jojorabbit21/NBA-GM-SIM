import { GameState, TeamState, LivePlayer } from './pbpTypes';
import { DepthChart } from '../../../../types';

export interface SubRequest {
    outPlayer: LivePlayer;
    inPlayer: LivePlayer;
    reason: string;
}

const MIN_STINT_SECONDS = 180; // 3 minutes
const HARD_FLOOR = 20; // Condition below 20 -> Shutdown
const RED_ZONE_FLOOR = 60; // Condition below 60 -> Needs Recovery

export function checkSubstitutions(state: GameState, team: TeamState): SubRequest[] {
    const { tactics } = team;
    const { minutesLimits, sliders } = tactics;
    const flexibility = sliders.rotationFlexibility ?? 5;
    
    // Mode determination
    const isStrict = flexibility <= 3;
    const isNormal = flexibility > 3 && flexibility <= 7;
    const isDeep = flexibility > 7;

    const scoreDiff = Math.abs(state.home.score - state.away.score);
    const isGarbage = state.quarter >= 4 && state.gameClock < 300 && scoreDiff > 20;
    const isClutch = state.quarter >= 4 && state.gameClock < 300 && scoreDiff <= 10;

    // Max burn allowed per stint (Condition drop)
    const maxBurn = 12 + (flexibility * 1.5); 

    const requests: SubRequest[] = [];
    const bench = team.bench.filter(p => p.health !== 'Injured' && !p.isShutdown && !p.needsDeepRecovery);

    // Helper to find best sub
    const findSub = (pos: string, excludeIds: string[]) => {
        // 1. Check Depth Chart
        if (team.depthChart) {
            const row = team.depthChart[pos as keyof DepthChart] || [];
            for (const id of row) {
                if (!id) continue;
                const candidate = bench.find(b => b.playerId === id && !excludeIds.includes(b.playerId));
                if (candidate) return candidate;
            }
        }
        
        // 2. Fallback: Best available matching position
        let candidates = bench.filter(b => b.position === pos && !excludeIds.includes(b.playerId));
        if (candidates.length === 0) {
            // 3. Fallback: Best available any position
            candidates = bench.filter(b => !excludeIds.includes(b.playerId));
        }
        
        return candidates.sort((a, b) => b.ovr - a.ovr)[0];
    };

    const currentOnCourtIds = team.onCourt.map(p => p.playerId);

    team.onCourt.forEach(p => {
        let shouldSub = false;
        let reason = '';
        
        const stintDuration = p.lastSubInTime - state.gameClock;
        // Ignore lock at start of quarter to allow immediate subs
        const isStintLocked = state.gameClock !== 720 && state.gameClock !== 300 && stintDuration < MIN_STINT_SECONDS;
        const energyConsumed = p.conditionAtSubIn - p.currentCondition;

        // --- Priority 1: Emergencies (Override Lock) ---
        if (p.health === 'Injured') { 
            shouldSub = true; reason = '부상'; 
        } else if (p.pf >= 6) { 
            shouldSub = true; reason = '퇴장'; 
        } else if (p.currentCondition <= HARD_FLOOR) { 
            shouldSub = true; reason = '탈진(Shutdown)';
            p.isShutdown = true; 
        } 
        
        // --- Priority 2: Voluntary Checks (Respect Lock) ---
        else if (!isStintLocked) {
             // Red Zone Recovery check
             if (p.currentCondition < RED_ZONE_FLOOR) {
                 shouldSub = true; reason = '체력 저하';
                 p.needsDeepRecovery = true;
             }
             // Garbage Time
             else if (isGarbage && p.isStarter) { shouldSub = true; reason = '가비지 타임'; }
            
             // Minutes Limit
             else if (minutesLimits[p.playerId] !== undefined && p.mp >= minutesLimits[p.playerId] + 0.5) {
                 shouldSub = true; reason = '시간 제한';
             }

             // [NEW] Staggered Rotation Logic (Strict/Normal Only)
             // Force starters out at start of Q2 & Q4 to ensure they rest after playing Q1/Q3.
             // This prevents them from playing 20+ minutes straight.
             else if (!isDeep && !isClutch && p.isStarter) {
                 const isStartOfQ2 = state.quarter === 2 && state.gameClock > 600; // First 2 mins of Q2
                 const isStartOfQ4 = state.quarter === 4 && state.gameClock > 600; // First 2 mins of Q4
                 
                 if (isStartOfQ2 || isStartOfQ4) {
                     shouldSub = true; reason = '로테이션(Stagger)';
                 }
             }

             // Stint Limit (Delta) - Only Non-Strict
             else if (!isClutch && !isStrict && energyConsumed >= maxBurn) {
                 shouldSub = true; reason = '로테이션(Stint)';
             }
        }
        
        if (shouldSub) {
            const sub = findSub(p.position, [...currentOnCourtIds, ...requests.map(r => r.inPlayer.playerId)]);
            if (sub) {
                requests.push({ outPlayer: p, inPlayer: sub, reason });
            }
        }
    });

    // Check for "Must Play" players on bench (Starters resting too long in non-garbage)
    if (!isGarbage) {
        bench.forEach(b => {
            if (b.isStarter && !b.isShutdown && !b.needsDeepRecovery && b.pf < 6 && b.health === 'Healthy') {
                
                // [NEW] Staggered Re-entry Logic
                // If it's the start of Q2/Q4 (Stagger time), DO NOT bring starters back yet.
                // Let the bench play for at least a few minutes.
                if (!isDeep && (state.quarter === 2 || state.quarter === 4) && state.gameClock > 480) { // Wait until 8:00 mark
                    return; 
                }

                // Strict Mode: Starters MUST be in during certain windows
                // Force them back in Q4 Clutch or mid-quarters
                if (isStrict) {
                    const isClosing = state.gameClock < 480; // Last 8 mins
                    const spotOccupier = team.onCourt.find(o => o.position === b.position && !o.isStarter);
                    
                    if (spotOccupier && !requests.some(r => r.outPlayer === spotOccupier)) {
                        if (isClosing) {
                             requests.push({ outPlayer: spotOccupier, inPlayer: b, reason: '주전 투입(Closer)' });
                        } else if (b.currentCondition > 85 && spotOccupier.currentCondition < 90) {
                             requests.push({ outPlayer: spotOccupier, inPlayer: b, reason: '주전 복귀' });
                        }
                    }
                }
                // Normal Mode: Energy recovered enough?
                else if (b.currentCondition >= 90 || (b.currentCondition >= 80 && isClutch)) {
                     const spotOccupier = team.onCourt.find(o => o.position === b.position && !o.isStarter);
                     if (spotOccupier && !requests.some(r => r.outPlayer === spotOccupier)) {
                         // Check if occupier is tired
                         if (spotOccupier.conditionAtSubIn - spotOccupier.currentCondition > 5) {
                             requests.push({ outPlayer: spotOccupier, inPlayer: b, reason: '주전 복귀' });
                         }
                     }
                }
            }
        });
    }

    return requests;
}