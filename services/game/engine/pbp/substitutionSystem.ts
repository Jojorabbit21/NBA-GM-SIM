
import { TeamState, LivePlayer, GameState } from './pbpTypes';
import { formatTime } from './timeEngine';
import { calculatePlayerArchetypes } from './archetypeSystem';
import { DepthChart } from '../../../../types';

const SCORE_DIFF_GARBAGE = 25; // 25+ pts diff in Q4 = Garbage
const MIN_STINT_SECONDS = 120; // Minimum 2 minutes lock (Relaxed from 3)

// Safety Nets
const HARD_FLOOR = 20; // < 20% -> Shutdown
const RED_ZONE_FLOOR = 30; // < 30% -> Bench until 65%
const RED_ZONE_RECOVERY_TARGET = 65; 

enum RotationMode {
    STRICT = 'STRICT',   // 0-3
    NORMAL = 'NORMAL',   // 4-7
    DEEP = 'DEEP'        // 8-10
}

/**
 * Determines Rotation Mode based on Slider (0-10)
 */
function getRotationMode(flexibility: number): RotationMode {
    if (flexibility <= 3) return RotationMode.STRICT;
    if (flexibility >= 8) return RotationMode.DEEP;
    return RotationMode.NORMAL;
}

/**
 * Calculates Maximum Energy Burn allowed per Stint based on flexibility.
 * Strict: 25 (~13m)
 * Normal: 17 (~8.5m)
 * Deep: 10 (~5m)
 */
function getMaxEnergyBurn(flexibility: number): number {
    if (flexibility <= 3) return 25; // Strict: Allow draining 25% (e.g. 100->75)
    if (flexibility >= 8) return 10; // Deep: Only allow 10% drain (e.g. 100->90)
    return 17; // Normal: ~17% drain
}

/**
 * Updates archetypes for players on court.
 */
function updateLineupArchetypes(team: TeamState) {
    team.onCourt.forEach(p => {
        p.archetypes = calculatePlayerArchetypes(p.attr, p.currentCondition);
    });
}

/**
 * Main Entry Point for Substitutions
 */
export function handleSubstitutions(state: GameState) {
    if (!state.isDeadBall) return;
    
    const homeSubbed = processTeamRotation(state.home, state);
    const awaySubbed = processTeamRotation(state.away, state);
    
    if (homeSubbed) updateLineupArchetypes(state.home);
    if (awaySubbed) updateLineupArchetypes(state.away);
}

/**
 * Check if substitution is needed.
 * Updated Logic:
 * 1. Check Safety Nets (Hard Floor / Red Zone)
 * 2. Check Garbage / Injury
 * 3. Check Clutch Time (Skip Stint Limit if clutch)
 * 4. Check Stint Limit (Delta > MaxBurn)
 */
export function isRotationNeeded(team: TeamState, state: GameState): boolean {
    const flexibility = team.tactics.sliders.rotationFlexibility ?? 5;
    const maxBurn = getMaxEnergyBurn(flexibility);
    const minutesLimits = team.tactics.minutesLimits || {};
    const scoreDiff = Math.abs(state.home.score - state.away.score);
    const isGarbage = state.quarter === 4 && state.gameClock < 300 && scoreDiff >= SCORE_DIFF_GARBAGE;
    const isClutch = state.quarter === 4 && state.gameClock < 300 && scoreDiff <= 10;

    for (const p of team.onCourt) {
        // 1. Injury / Ejection
        if (p.health === 'Injured' || p.pf >= 6) return true;

        // 2. Safety Nets (Apply even in Clutch)
        if (p.currentCondition <= HARD_FLOOR) return true; // Shutdown
        if (p.currentCondition < RED_ZONE_FLOOR) return true; // Red Zone

        // 3. Garbage Time (Pull starters)
        if (isGarbage && p.isStarter) return true;

        // 4. Stint Lock (Protect minimum minutes unless emergency above)
        const stintDuration = p.lastSubInTime - state.gameClock;
        if (stintDuration < MIN_STINT_SECONDS) continue; 

        // 5. Minutes Limit (Hard Cap)
        const limit = minutesLimits[p.playerId];
        if (limit !== undefined && p.mp >= limit + 0.5) return true;

        // 6. Stint Limit Check (Delta)
        // If Clutch time, IGNORE stint limit (allow them to play through fatigue unless < 20%)
        if (!isClutch) {
            const energyConsumed = p.conditionAtSubIn - p.currentCondition;
            if (energyConsumed >= maxBurn) return true;
        }
    }

    return false;
}

function processTeamRotation(team: TeamState, state: GameState): boolean {
    const flexibility = team.tactics.sliders.rotationFlexibility ?? 5;
    const maxBurn = getMaxEnergyBurn(flexibility);
    const minutesLimits = team.tactics.minutesLimits || {};
    const scoreDiff = Math.abs(state.home.score - state.away.score);
    const isGarbage = state.quarter === 4 && state.gameClock < 300 && scoreDiff >= SCORE_DIFF_GARBAGE;
    const isClutch = state.quarter === 4 && state.gameClock < 300 && scoreDiff <= 10;

    let changesMade = false;
    
    team.onCourt.forEach(p => {
        let shouldSub = false;
        let reason = '';
        
        const stintDuration = p.lastSubInTime - state.gameClock;
        const isStintLocked = stintDuration < MIN_STINT_SECONDS;
        const energyConsumed = p.conditionAtSubIn - p.currentCondition;

        // --- Priority 1: Emergencies (Override Lock) ---
        if (p.health === 'Injured') { 
            shouldSub = true; reason = '부상'; 
        } else if (p.pf >= 6) { 
            shouldSub = true; reason = '퇴장'; 
        } else if (p.currentCondition <= HARD_FLOOR) { 
            shouldSub = true; reason = '탈진(Shutdown)';
            p.isShutdown = true; // Mark as Shutdown
        } else if (p.currentCondition < RED_ZONE_FLOOR) { 
            shouldSub = true; reason = '체력 저하(RedZone)';
            p.needsDeepRecovery = true; // Mark for Deep Recovery
        }
        
        // --- Priority 2: Voluntary Checks (Respect Lock) ---
        else if (!isStintLocked) {
             // Garbage Time
            if (isGarbage && p.isStarter) { shouldSub = true; reason = '가비지 타임'; }
            
            // Minutes Limit
            else if (minutesLimits[p.playerId] !== undefined && p.mp >= minutesLimits[p.playerId] + 0.5) {
                 shouldSub = true; reason = '시간 제한';
            }

            // Stint Limit (Delta)
            // Skip if Clutch (Ace stays in)
            else if (!isClutch && energyConsumed >= maxBurn) {
                 shouldSub = true; reason = '로테이션(Stint)';
            }
        }
        
        if (shouldSub) {
            const replacement = findReplacement(team, p, isGarbage);
            if (replacement) {
                executeSwap(team, p, replacement, state, reason);
                changesMade = true;
            }
        }
    });

    // Check for bringing Starters BACK IN
    if (!isGarbage) {
        checkStartersReturn(team, state, flexibility, maxBurn, isClutch);
    }

    return changesMade;
}

/**
 * Finds the best replacement based on Depth Chart hierarchy AND Safety Nets.
 */
function findReplacement(
    team: TeamState, 
    current: LivePlayer, 
    isGarbage: boolean
): LivePlayer | null {
    if (!team.depthChart) return null;

    // 1. Identify Position
    const posKeys: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
    let positionKey: keyof DepthChart = 'PG';
    let currentDepthIndex = -1;

    for (const key of posKeys) {
        const idx = team.depthChart[key].indexOf(current.playerId);
        if (idx !== -1) {
            positionKey = key;
            currentDepthIndex = idx;
            break;
        }
    }
    
    // Fallback
    if (currentDepthIndex === -1) {
        const rawPos = current.position.split('/')[0] as keyof DepthChart;
        if (team.depthChart[rawPos]) positionKey = rawPos;
    }

    const depthList = team.depthChart[positionKey];
    
    // 2. Define Candidate Order
    let candidateIds: (string|null)[] = [];

    if (isGarbage) {
        candidateIds = [depthList[2], depthList[1]]; 
    } else {
        // Standard Logic: Starter -> Bench -> Third
        if (currentDepthIndex === 0) candidateIds = [depthList[1], depthList[2]];
        else if (currentDepthIndex === 1) candidateIds = [depthList[0], depthList[2]];
        else candidateIds = [depthList[1], depthList[0]];
    }

    // 3. Evaluate Candidates with Safety Nets
    for (const id of candidateIds) {
        if (!id) continue;
        const candidate = team.bench.find(b => b.playerId === id);
        
        if (candidate) {
            // [Safety Nets Check]
            if (candidate.health === 'Injured') continue;
            if (candidate.pf >= 6) continue;
            if (candidate.isShutdown) continue; // Locked out
            if (candidate.needsDeepRecovery && candidate.currentCondition < RED_ZONE_RECOVERY_TARGET) continue; // Locked until 65%

            // Reset RedZone flag if recovered
            if (candidate.needsDeepRecovery && candidate.currentCondition >= RED_ZONE_RECOVERY_TARGET) {
                candidate.needsDeepRecovery = false;
            }

            return candidate;
        }
    }

    // 4. Emergency Fallback (Best available bench player)
    const bestBench = team.bench
        .filter(b => 
            b.health !== 'Injured' && 
            b.pf < 6 && 
            !b.isShutdown && 
            (!b.needsDeepRecovery || b.currentCondition >= RED_ZONE_RECOVERY_TARGET)
        )
        .sort((a, b) => b.currentCondition - a.currentCondition)[0];
    
    if (bestBench) {
        // Clear flag if selected
        if (bestBench.needsDeepRecovery) bestBench.needsDeepRecovery = false;
        return bestBench;
    }

    return null;
}

/**
 * Executes the swap.
 */
function executeSwap(team: TeamState, outP: LivePlayer, inP: LivePlayer, state: GameState, reason: string) {
    team.onCourt = team.onCourt.filter(p => p.playerId !== outP.playerId);
    team.onCourt.push(inP);
    
    // [Fix] Set entry snapshot
    inP.lastSubInTime = state.gameClock;
    inP.conditionAtSubIn = inP.currentCondition;
    
    team.bench = team.bench.filter(p => p.playerId !== inP.playerId);
    team.bench.push(outP);

    state.logs.push({
        quarter: state.quarter,
        timeRemaining: formatTime(state.gameClock),
        teamId: team.id,
        type: 'info',
        text: `[교체] OUT: ${outP.playerName} (${reason}), IN: ${inP.playerName}`
    });
}

/**
 * Check if starters on bench are ready to return.
 * Now primarily driven by "Did they recover enough?" rather than rigid time windows.
 */
function checkStartersReturn(
    team: TeamState, 
    state: GameState, 
    flexibility: number, 
    maxBurn: number,
    isClutch: boolean
) {
    const minutesLimits = team.tactics.minutesLimits || {};
    
    // In Deep mode, we aggressively rotate, so we check frequently.
    // In Strict mode, we only swap back if highly recovered.

    // Minimum Recovery Requirement to re-enter:
    // They should have recovered enough to play at least 50% of a max stint.
    // e.g. Deep (10) -> Need to have recovered 5 energy? 
    // Or simpler: Current condition > ConditionAtSubOut + RecoveryDelta?
    // Let's use absolute condition: Must be > 80% generally, or > 90% for Deep?
    
    // Simplified Return Logic:
    // 1. Is Starter?
    // 2. Not Shutdown/Injured/FouledOut.
    // 3. Condition > 85 (Strict) / 90 (Normal) / 95 (Deep)? 
    //    Actually, Deep players play short bursts, so they exit high (90) and return high (95).
    //    Strict players exit low (75) and return lower (85).
    
    const returnThreshold = 100 - maxBurn + 3; // e.g. Deep(10) -> 93. Strict(25) -> 78.

    const startersOnBench = team.bench.filter(b => b.isStarter && b.health !== 'Injured' && b.pf < 6 && !b.isShutdown);
    
    startersOnBench.forEach(starter => {
        // Red Zone Check
        if (starter.needsDeepRecovery && starter.currentCondition < RED_ZONE_RECOVERY_TARGET) return;
        if (starter.needsDeepRecovery) starter.needsDeepRecovery = false; // Recovered

        // Condition Check
        // In Clutch, lower the threshold to get stars back in (e.g. 60)
        const effectiveThreshold = isClutch ? 60 : returnThreshold;
        if (starter.currentCondition < effectiveThreshold) return;

        // Check Limit
        if (minutesLimits[starter.playerId] !== undefined && starter.mp >= minutesLimits[starter.playerId]) return;

        // Find who to replace (Backup)
        // Similar to findReplacement but looking at OnCourt
        const posKeys: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
        let myPos: keyof DepthChart = 'PG';
        if (team.depthChart) {
            for (const key of posKeys) {
                if (team.depthChart[key][0] === starter.playerId) {
                    myPos = key;
                    break;
                }
            }
        }
        
        // Target specific backup slots
        const backupId = team.depthChart ? team.depthChart[myPos][1] : null;
        const thirdId = team.depthChart ? team.depthChart[myPos][2] : null;
        
        const occupant = team.onCourt.find(p => p.playerId === backupId || p.playerId === thirdId);

        if (occupant) {
             // Avoid rapid swaps (Min Stint)
             if ((occupant.lastSubInTime - state.gameClock) >= MIN_STINT_SECONDS) {
                 executeSwap(team, occupant, starter, state, '주전 복귀');
             }
        } else {
             // Fallback: Swap with lowest OVR non-starter
             const worstNonStarter = team.onCourt
                .filter(p => !p.isStarter)
                .sort((a, b) => a.ovr - b.ovr)[0];
             
             if (worstNonStarter && (worstNonStarter.lastSubInTime - state.gameClock) >= MIN_STINT_SECONDS) {
                  executeSwap(team, worstNonStarter, starter, state, '주전 복귀');
             }
        }
    });
}
