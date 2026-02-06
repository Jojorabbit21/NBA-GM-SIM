
import { GameState, TeamState, LivePlayer } from './pbpTypes';
import { DepthChart } from '../../../../types';

export interface SubRequest {
    outPlayer: LivePlayer;
    inPlayer: LivePlayer;
    reason: string;
}

const MIN_STINT_SECONDS = 180; // 3 minutes
const HARD_FLOOR = 20; // Condition below 20 -> Shutdown (Emergency)

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

    // [Dynamic Red Zone] Fatigue check threshold
    // Strict: Ignored (Only Hard Floor applies)
    // Normal (4) ~ Deep (10): Ranges from 30 to 40
    let redZoneFloor = 0;
    if (!isStrict) {
        // Map 4->30, 10->40. Slope = 1.66
        redZoneFloor = 30 + ((flexibility - 4) * 1.6);
    }

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
             // Red Zone Recovery check (Only Normal/Deep)
             if (!isStrict && p.currentCondition < redZoneFloor) {
                 shouldSub = true; reason = '체력 저하';
                 p.needsDeepRecovery = true;
             }
             // Garbage Time
             else if (isGarbage && p.isStarter) { shouldSub = true; reason = '가비지 타임'; }
            
             // Minutes Limit
             else if (minutesLimits[p.playerId] !== undefined && p.mp >= minutesLimits[p.playerId] + 0.5) {
                 shouldSub = true; reason = '시간 제한';
             }

             // [Staggered Rotation] Force starters out at start of Q2 & Q4
             // Normal/Strict modes only. Deep mode handles flow naturally.
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
        // [New] Dynamic Stagger Lock Calculation
        // Determines how long the bench plays in Q2/Q4 before Starters are allowed back.
        let staggerLockSeconds = 0;
        
        if (isStrict) {
            // Flexibility 1 (Extreme Strict) -> 6 mins lock (Bench plays 6 mins)
            // Flexibility 2 -> 5 mins lock
            // Flexibility 3 -> 4 mins lock
            staggerLockSeconds = (7 - flexibility) * 60; 
        } else if (isNormal) {
            // Normal (Flex 4-7) -> Fixed 4 mins lock (Bench plays 4 mins)
            staggerLockSeconds = 240; 
        }
        // Deep: No lock, fluid rotation

        const currentQTime = 720 - state.gameClock;
        const isLockedPeriod = (state.quarter === 2 || state.quarter === 4) && currentQTime < staggerLockSeconds;

        bench.forEach(b => {
            if (b.isStarter && !b.isShutdown && !b.needsDeepRecovery && b.pf < 6 && b.health === 'Healthy') {
                
                // If in locked period (early Q2/Q4), do not bring starters back yet
                if (isLockedPeriod) return;

                // Strict Mode: Starters MUST be in unless disqualified
                // Once the lock period is over, force them back immediately.
                if (isStrict) {
                    const spotOccupier = team.onCourt.find(o => o.position === b.position && !o.isStarter);
                    
                    // If a bench player is holding the spot, swap immediately
                    if (spotOccupier && !requests.some(r => r.outPlayer === spotOccupier)) {
                        requests.push({ outPlayer: spotOccupier, inPlayer: b, reason: '주전 복귀(Strict)' });
                    }
                }
                // Normal Mode: Organic Re-entry
                // Removed condition-based auto return (90+).
                // Starters return only if:
                // 1. It's Clutch time
                // 2. Or implicitly via Sub-Out logic (when Bench player hits Stint Limit/Fatigue, they ask for a sub, and findSub picks the Starter)
                else if (isNormal) {
                     const spotOccupier = team.onCourt.find(o => o.position === b.position && !o.isStarter);
                     
                     if (spotOccupier && !requests.some(r => r.outPlayer === spotOccupier)) {
                         if (isClutch && b.currentCondition >= 80) {
                             requests.push({ outPlayer: spotOccupier, inPlayer: b, reason: '주전 투입(Closer)' });
                         }
                     }
                }
            }
        });
    }

    return requests;
}
