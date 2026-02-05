
import { TeamState, LivePlayer, GameState } from './pbpTypes';
import { formatTime } from './timeEngine';
import { calculatePlayerArchetypes } from './archetypeSystem';
import { DepthChart } from '../../../../types';

const SCORE_DIFF_GARBAGE = 25; // 25+ pts diff in Q4 = Garbage
const MIN_STINT_SECONDS = 60; // Reduced lock to 1 min to allow quicker corrections

// Safety Nets
const HARD_FLOOR = 20; // < 20% -> Shutdown
const RED_ZONE_FLOOR = 30; // < 30% -> Bench until 65%
const RED_ZONE_RECOVERY_TARGET = 65; 

// Position Compatibility Map (Fallback logic)
const POS_COMPATIBILITY: Record<string, string[]> = {
    'PG': ['PG', 'SG'],
    'SG': ['SG', 'PG', 'SF'],
    'SF': ['SF', 'SG', 'PF'],
    'PF': ['PF', 'SF', 'C'],
    'C':  ['C', 'PF']
};

enum RotationMode {
    STRICT = 'STRICT',   // 0-3
    NORMAL = 'NORMAL',   // 4-7
    DEEP = 'DEEP'        // 8-10
}

function getMaxEnergyBurn(flexibility: number): number {
    if (flexibility <= 3) return 100; // Strict: Infinite burn (controlled by schedule)
    if (flexibility >= 8) return 10; // Deep: Short stints
    return 17; // Normal
}

/**
 * Returns specific timing thresholds based on Strict Level (1-3)
 * @param flexibility 1, 2, or 3
 */
function getStrictSchedule(flexibility: number) {
    if (flexibility <= 1) {
        // Level 1: Q1/3 Full (12m), Q2/4 Last 7m
        return { q1q3Out: 0, q2q4In: 420 }; 
    } else if (flexibility === 2) {
        // Level 2: Q1/3 10m (Out at 2:00), Q2/4 Last 7m
        return { q1q3Out: 120, q2q4In: 420 };
    } else {
        // Level 3: Q1/3 8m (Out at 4:00), Q2/4 Last 6m
        return { q1q3Out: 240, q2q4In: 360 };
    }
}

function updateLineupArchetypes(team: TeamState) {
    team.onCourt.forEach(p => {
        p.archetypes = calculatePlayerArchetypes(p.attr, p.currentCondition);
    });
}

export function handleSubstitutions(state: GameState) {
    if (!state.isDeadBall) return;
    
    const homeSubbed = processTeamRotation(state.home, state);
    const awaySubbed = processTeamRotation(state.away, state);
    
    if (homeSubbed) updateLineupArchetypes(state.home);
    if (awaySubbed) updateLineupArchetypes(state.away);
}

export function isRotationNeeded(team: TeamState, state: GameState): boolean {
    const flexibility = team.tactics.sliders.rotationFlexibility ?? 5;
    const isStrict = flexibility <= 3;
    const maxBurn = getMaxEnergyBurn(flexibility);
    const minutesLimits = team.tactics.minutesLimits || {};
    const scoreDiff = Math.abs(state.home.score - state.away.score);
    const isGarbage = state.quarter === 4 && state.gameClock < 300 && scoreDiff >= SCORE_DIFF_GARBAGE;
    const isClutch = state.quarter === 4 && state.gameClock < 300 && scoreDiff <= 10;

    // [STRICT MODE SCHEDULER CHECK]
    if (isStrict && !isClutch) {
        const schedule = getStrictSchedule(flexibility);
        
        // Q1 & Q3: Check if it's time to sub OUT starters (e.g. at 2:00 mark)
        if ((state.quarter === 1 || state.quarter === 3) && state.gameClock <= schedule.q1q3Out) {
             if (team.onCourt.some(p => p.isStarter)) return true;
        }

        // Q2 & Q4: Check if starters should be RESTING (Before entry time)
        if ((state.quarter === 2 || state.quarter === 4) && state.gameClock > schedule.q2q4In) {
             if (team.onCourt.some(p => p.isStarter)) return true;
        }
    }

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

        // 6. Stint Limit Check (Delta) - ONLY for Non-Strict
        if (!isClutch && !isStrict) {
            const energyConsumed = p.conditionAtSubIn - p.currentCondition;
            if (energyConsumed >= maxBurn) return true;
        }
    }

    // [STRICT MODE RETURN CHECK]
    if (isStrict && !isGarbage) {
        const schedule = getStrictSchedule(flexibility);
        
        let shouldStartersBeIn = false;
        
        // Q1/Q3: Should be IN if clock > cutoff
        if (state.quarter === 1 || state.quarter === 3) {
            if (state.gameClock > schedule.q1q3Out) shouldStartersBeIn = true;
        }
        // Q2/Q4: Should be IN if clock <= entry time
        else if (state.quarter === 2 || state.quarter === 4) {
            if (state.gameClock <= schedule.q2q4In) shouldStartersBeIn = true;
        }

        if (shouldStartersBeIn) {
            const startersOnBench = team.bench.some(b => 
                b.isStarter && b.health !== 'Injured' && b.pf < 6 && !b.isShutdown && 
                (!b.needsDeepRecovery || b.currentCondition >= RED_ZONE_RECOVERY_TARGET)
            );
            if (startersOnBench) return true; // Bring them back!
        }
    }

    return false;
}

function processTeamRotation(team: TeamState, state: GameState): boolean {
    const flexibility = team.tactics.sliders.rotationFlexibility ?? 5;
    const isStrict = flexibility <= 3;
    const maxBurn = getMaxEnergyBurn(flexibility);
    const minutesLimits = team.tactics.minutesLimits || {};
    const scoreDiff = Math.abs(state.home.score - state.away.score);
    const isGarbage = state.quarter === 4 && state.gameClock < 300 && scoreDiff >= SCORE_DIFF_GARBAGE;
    const isClutch = state.quarter === 4 && state.gameClock < 300 && scoreDiff <= 10;

    let changesMade = false;
    
    // [STRICT MODE] Schedule Config
    const strictSched = getStrictSchedule(flexibility);

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
            p.isShutdown = true; 
        } else if (p.currentCondition < RED_ZONE_FLOOR) { 
            shouldSub = true; reason = '체력 저하(RedZone)';
            p.needsDeepRecovery = true; 
        }
        
        // --- Priority 2: Voluntary Checks (Respect Lock) ---
        else if (!isStintLocked) {
             // Garbage Time
            if (isGarbage && p.isStarter) { shouldSub = true; reason = '가비지 타임'; }
            
            // Minutes Limit
            else if (minutesLimits[p.playerId] !== undefined && p.mp >= minutesLimits[p.playerId] + 0.5) {
                 shouldSub = true; reason = '시간 제한';
            }

            // [STRICT MODE] Scheduled Sub-Out
            else if (isStrict && p.isStarter && !isClutch) {
                // Q1/Q3 Time Limit Check
                if ((state.quarter === 1 || state.quarter === 3) && state.gameClock <= strictSched.q1q3Out) {
                    shouldSub = true; reason = `체력 안배(Q${state.quarter} Limit)`;
                }
                // Q2/Q4 Rest Period Check
                else if ((state.quarter === 2 || state.quarter === 4) && state.gameClock > strictSched.q2q4In) {
                    shouldSub = true; reason = `체력 안배(Q${state.quarter} Rest)`;
                }
            }

            // Stint Limit (Delta) - Only Non-Strict
            else if (!isClutch && !isStrict && energyConsumed >= maxBurn) {
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

function findReplacement(
    team: TeamState, 
    current: LivePlayer, 
    isGarbage: boolean
): LivePlayer | null {
    if (!team.depthChart) return null;

    // 1. Identify Position Key
    const posKeys: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
    let positionKey: keyof DepthChart = 'PG';
    
    let found = false;
    for (const key of posKeys) {
        if (team.depthChart[key].includes(current.playerId)) {
            positionKey = key;
            found = true;
            break;
        }
    }
    if (!found) {
        const rawPos = current.position.split('/')[0] as keyof DepthChart;
        if (team.depthChart[rawPos]) positionKey = rawPos;
    }

    const depthList = team.depthChart[positionKey];
    
    // 2. Define Candidate Order
    let candidateIds: (string|null)[] = [];
    const currentIndex = depthList.indexOf(current.playerId);

    if (isGarbage) {
        candidateIds = [depthList[2], depthList[1]]; 
    } else {
        if (currentIndex === 0) candidateIds = [depthList[1], depthList[2]];
        else if (currentIndex === 1) candidateIds = [depthList[0], depthList[2]];
        else candidateIds = [depthList[1], depthList[0]];
    }

    const isValid = (c: LivePlayer) => {
        if (c.health === 'Injured') return false;
        if (c.pf >= 6) return false;
        if (c.isShutdown) return false;
        if (c.needsDeepRecovery && c.currentCondition < RED_ZONE_RECOVERY_TARGET) return false;
        return true;
    };

    // 3. Check Candidates from Depth Chart first
    for (const id of candidateIds) {
        if (!id) continue;
        const candidate = team.bench.find(b => b.playerId === id);
        
        if (candidate && isValid(candidate)) {
            if (candidate.needsDeepRecovery && candidate.currentCondition >= RED_ZONE_RECOVERY_TARGET) {
                candidate.needsDeepRecovery = false;
            }
            return candidate;
        }
    }

    // 4. Emergency Fallback: Strict Position Matching
    const compatiblePositions = POS_COMPATIBILITY[positionKey] || [positionKey];
    
    const validBench = team.bench
        .filter(b => {
            const bPos = b.position.split('/')[0];
            return (bPos === positionKey || compatiblePositions.includes(bPos)) && isValid(b);
        })
        .sort((a, b) => b.currentCondition - a.currentCondition);
    
    if (validBench.length > 0) {
        const best = validBench[0];
        if (best.needsDeepRecovery) best.needsDeepRecovery = false;
        return best;
    }

    // 5. Absolute Last Resort
    const anyBench = team.bench
        .filter(b => isValid(b))
        .sort((a, b) => b.currentCondition - a.currentCondition);

    if (anyBench.length > 0) return anyBench[0];

    return null;
}

function executeSwap(team: TeamState, outP: LivePlayer, inP: LivePlayer, state: GameState, reason: string) {
    team.onCourt = team.onCourt.filter(p => p.playerId !== outP.playerId);
    team.onCourt.push(inP);
    
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
 * [UPDATED] Strict Mode now uses granular scheduling.
 */
function checkStartersReturn(
    team: TeamState, 
    state: GameState, 
    flexibility: number, 
    maxBurn: number,
    isClutch: boolean
) {
    const minutesLimits = team.tactics.minutesLimits || {};
    const isStrict = flexibility <= 3;
    const strictSched = getStrictSchedule(flexibility);

    // Normal/Deep Mode Threshold
    const normalReturnThreshold = 100 - maxBurn + 3;

    const startersOnBench = team.bench.filter(b => b.isStarter && b.health !== 'Injured' && b.pf < 6 && !b.isShutdown);
    
    startersOnBench.forEach(starter => {
        // Red Zone Check
        if (starter.needsDeepRecovery && starter.currentCondition < RED_ZONE_RECOVERY_TARGET) return;
        if (starter.needsDeepRecovery) starter.needsDeepRecovery = false;

        // Condition / Schedule Check
        if (isStrict) {
            // [STRICT MODE] Scheduled Return Check
            let isTime = false;

            if (state.quarter === 1 || state.quarter === 3) {
                // Should stay IN until the cutoff. If they are out before cutoff, bring them back.
                if (state.gameClock > strictSched.q1q3Out) isTime = true;
            } else if (state.quarter === 2 || state.quarter === 4) {
                // Return after the entry time (e.g. 7:00 mark)
                if (state.gameClock <= strictSched.q2q4In) isTime = true;
            }

            if (!isTime && !isClutch) return; // Not time yet
        } else {
            // Normal/Deep Mode: Rely on recovery threshold
            const effectiveThreshold = isClutch ? 60 : normalReturnThreshold;
            if (starter.currentCondition < effectiveThreshold) return;
        }

        // Check Limit
        if (minutesLimits[starter.playerId] !== undefined && starter.mp >= minutesLimits[starter.playerId]) return;

        // Find who to replace (Backup at SAME Position)
        const posKeys: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
        let starterPos: keyof DepthChart = 'PG';
        
        if (team.depthChart) {
            for (const key of posKeys) {
                if (team.depthChart[key][0] === starter.playerId) {
                    starterPos = key;
                    break;
                }
            }
        } else {
             starterPos = starter.position.split('/')[0] as keyof DepthChart;
        }

        // Priority: Direct Backup > Compatible Position > Anyone
        const directBackupIds = team.depthChart ? [team.depthChart[starterPos][1], team.depthChart[starterPos][2]] : [];
        const compatiblePositions = POS_COMPATIBILITY[starterPos] || [];

        let target = team.onCourt.find(p => directBackupIds.includes(p.playerId));
        
        if (!target) {
            target = team.onCourt.find(p => 
                !p.isStarter && 
                (p.position.split('/')[0] === starterPos || compatiblePositions.includes(p.position.split('/')[0]))
            );
        }

        // Fallback
        if (!target) {
             target = team.onCourt
                .filter(p => !p.isStarter)
                .sort((a, b) => a.ovr - b.ovr)[0];
        }

        if (target) {
             // Avoid rapid swaps (Min Stint), unless clutch or Strict Schedule
             // In Strict, if schedule dictates, we swap regardless of min stint lock
             const ignoreLock = isClutch || isStrict; 
             if (ignoreLock || (target.lastSubInTime - state.gameClock) >= MIN_STINT_SECONDS) {
                 const reason = isStrict ? '주전 투입(Scheduled)' : '주전 복귀';
                 executeSwap(team, target, starter, state, reason);
             }
        }
    });
}
