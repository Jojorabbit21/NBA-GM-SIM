
import { TeamState, LivePlayer, GameState } from './pbpTypes';
import { formatTime } from './timeEngine';
import { calculatePlayerArchetypes } from './archetypeSystem';
import { DepthChart } from '../../../../types';

const SCORE_DIFF_GARBAGE = 25; // 25+ pts diff in Q4 = Garbage
const CRITICAL_FATIGUE = 15; // Bare minimum to stay on court
const MIN_STINT_SECONDS = 180; // Minimum 3 minutes on court before voluntary sub
const HYSTERESIS_BUFFER = 8; // Player needs Threshold + 8% to re-enter (Ping-pong prevention)

enum RotationMode {
    STRICT = 'STRICT',   // 1-3: Minutes > Fatigue
    NORMAL = 'NORMAL',   // 4-7: Balanced
    DEEP = 'DEEP'        // 8-10: Fatigue > Minutes
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
 * Gets Fatigue Threshold based on specific slider value rules.
 * STRICT: 20/30/40%
 * NORMAL: 45/50/55/60%
 * DEEP: 65/70/75%
 */
function getFatigueThreshold(flexibility: number): number {
    switch (flexibility) {
        // Strict
        case 0: return 20; // Fallback
        case 1: return 20;
        case 2: return 30;
        case 3: return 40;
        // Normal
        case 4: return 45;
        case 5: return 50;
        case 6: return 55;
        case 7: return 60;
        // Deep
        case 8: return 65;
        case 9: return 70;
        case 10: return 75;
        default: return 50;
    }
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
 */
export function isRotationNeeded(team: TeamState, state: GameState): boolean {
    const flexibility = team.tactics.sliders.rotationFlexibility ?? 5;
    const mode = getRotationMode(flexibility);
    const fatigueThreshold = getFatigueThreshold(flexibility);
    const minutesLimits = team.tactics.minutesLimits || {};
    const scoreDiff = Math.abs(state.home.score - state.away.score);
    const isGarbage = state.quarter === 4 && state.gameClock < 300 && scoreDiff >= SCORE_DIFF_GARBAGE;

    // Check each player on court
    for (const p of team.onCourt) {
        // 1. Injury / Ejection (Always sub, ignore stint)
        if (p.health === 'Injured' || p.pf >= 6) return true;

        // 2. Critical Fatigue (Safety Net)
        if (p.currentCondition < CRITICAL_FATIGUE) return true;

        // 3. Garbage Time (Pull starters)
        if (isGarbage && p.isStarter) return true;

        // 4. Minimum Stint Check (Stability)
        // If not critical/garbage/injured, enforce minimum play time
        const stintDuration = p.lastSubInTime - state.gameClock;
        if (stintDuration < MIN_STINT_SECONDS) continue; // Keep them on court

        // 5. Minutes Limit Reached
        const limit = minutesLimits[p.playerId];
        if (limit !== undefined && p.mp >= limit + 0.5) return true;

        // 6. Fatigue Logic per Mode
        if (p.currentCondition < fatigueThreshold) {
            if (mode === RotationMode.STRICT) {
                // Strict: Only sub if below threshold AND minutes limit reached (or critical)
                // (Critical handled above). If limit not reached, stay in unless dangerous.
                if (limit !== undefined && p.mp >= limit) return true;
                // If no limit, Strict tries to keep them in until critical or scheduled rest
            } else {
                // Normal/Deep: Sub if below threshold regardless of minutes (unless clutch)
                return true;
            }
        }

        // 7. Scheduled Rest (Strict/Normal)
        if (isScheduledRest(p, state.quarter, state.gameClock, mode)) return true;
    }

    return false;
}

/**
 * Checks if a starter should be resting based on Quarter/Time rules.
 * 
 * STRICT:
 * - Q1/Q3: Play Full (0-12m) -> No rest needed.
 * - Q2/Q4: Rest first 6m (12:00-6:00 remaining).
 * 
 * NORMAL:
 * - Q1/Q3: Play 6-8m (Rest 4-6m). -> Rest if clock < 4:00 (approx)
 * - Q2/Q4: Rest first 6m (12:00-6:00).
 */
function isScheduledRest(player: LivePlayer, quarter: number, gameClock: number, mode: RotationMode): boolean {
    if (!player.isStarter) return false; // Bench doesn't have "scheduled" rest in this sense
    
    // Time remaining: 720 (12:00) -> 0 (0:00)

    if (mode === RotationMode.STRICT) {
        // Rest first 6 mins of Q2 & Q4 (Clock 720 -> 360)
        if ((quarter === 2 || quarter === 4) && gameClock > 360) return true;
        return false;
    } 
    else if (mode === RotationMode.NORMAL) {
        // Q1/Q3: Rest last 4-5 mins (Clock < 300)
        if ((quarter === 1 || quarter === 3) && gameClock < 300) return true;
        // Q2/Q4: Rest first 6 mins (Clock > 360)
        if ((quarter === 2 || quarter === 4) && gameClock > 360) return true;
        return false;
    }
    
    return false; // DEEP handles via fatigue mostly
}


function processTeamRotation(team: TeamState, state: GameState): boolean {
    const flexibility = team.tactics.sliders.rotationFlexibility ?? 5;
    const mode = getRotationMode(flexibility);
    const fatigueThreshold = getFatigueThreshold(flexibility);
    const minutesLimits = team.tactics.minutesLimits || {};
    const scoreDiff = Math.abs(state.home.score - state.away.score);
    const isGarbage = state.quarter === 4 && state.gameClock < 300 && scoreDiff >= SCORE_DIFF_GARBAGE;

    let changesMade = false;
    
    // Find players to sub OUT
    const toSubOut: LivePlayer[] = [];
    
    team.onCourt.forEach(p => {
        let shouldSub = false;
        let reason = '';
        
        // Calculate Stint Duration
        const stintDuration = p.lastSubInTime - state.gameClock;
        const isStintLocked = stintDuration < MIN_STINT_SECONDS;

        // Emergency (Overrides Stint Lock)
        if (p.health === 'Injured') { shouldSub = true; reason = '부상'; }
        else if (p.pf >= 6) { shouldSub = true; reason = '퇴장'; }
        else if (p.currentCondition < CRITICAL_FATIGUE) { shouldSub = true; reason = '체력 고갈'; }
        
        // Voluntary Checks (Respected Stint Lock)
        else if (!isStintLocked) {
             // Garbage Time
            if (isGarbage && p.isStarter) { shouldSub = true; reason = '가비지 타임'; }
            
            // Minutes Limit
            else if (minutesLimits[p.playerId] !== undefined && p.mp >= minutesLimits[p.playerId] + 0.5) {
                 shouldSub = true; reason = '시간 제한';
            }

            // Logic by Mode
            else if (mode === RotationMode.STRICT) {
                // Strict: Time > Fatigue.
                // Check scheduled rest (Q2/Q4 start)
                if (isScheduledRest(p, state.quarter, state.gameClock, mode)) {
                    shouldSub = true; reason = '로테이션(휴식)';
                }
                // Only sub for fatigue if limit reached or extremely tired (handled by critical)
            } 
            else {
                // Normal / Deep: Fatigue > Time
                if (p.currentCondition < fatigueThreshold) {
                    shouldSub = true; reason = '체력 안배';
                }
                // Normal schedule check
                if (mode === RotationMode.NORMAL && isScheduledRest(p, state.quarter, state.gameClock, mode)) {
                     shouldSub = true; reason = '로테이션(휴식)';
                }
            }
        }
        
        // Prevent subbing out if no valid replacement exists (checked in swap logic)
        if (shouldSub) {
            const replacement = findReplacement(team, p, mode, isGarbage, fatigueThreshold);
            if (replacement) {
                // Execute Swap
                executeSwap(team, p, replacement, state, reason);
                changesMade = true;
            }
        }
    });

    // Check for bringing Starters BACK IN
    // (Only if not garbage time and they are rested enough)
    if (!isGarbage) {
        checkStartersReturn(team, state, mode, fatigueThreshold);
    }

    return changesMade;
}

/**
 * Finds the best replacement based on Depth Chart hierarchy.
 */
function findReplacement(
    team: TeamState, 
    current: LivePlayer, 
    mode: RotationMode, 
    isGarbage: boolean, 
    fatigueThreshold: number
): LivePlayer | null {
    if (!team.depthChart) return null;

    // 1. Identify Position & Current Depth
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
    
    // If player not in depth chart (weird), try fallback by position string
    if (currentDepthIndex === -1) {
        const rawPos = current.position.split('/')[0] as keyof DepthChart;
        if (team.depthChart[rawPos]) positionKey = rawPos;
    }

    const depthList = team.depthChart[positionKey];
    
    // 2. Define Candidate Order based on Context
    let candidateIds: (string|null)[] = [];

    if (isGarbage) {
        // Garbage: Third > Bench > Starter (Avoid starter)
        candidateIds = [depthList[2], depthList[1]]; 
    } else {
        // Regular Game
        // Current is Starter (0) -> Look for Bench (1) -> Third (2)
        // Current is Bench (1) -> Look for Third (2) -> Starter (0) [if rested]
        // Current is Third (2) -> Look for Bench (1) -> Starter (0)

        if (currentDepthIndex === 0) {
            // Starter coming out
            candidateIds = [depthList[1]];
            // Normal/Deep can use Third stringers
            if (mode !== RotationMode.STRICT) candidateIds.push(depthList[2]);
        } else if (currentDepthIndex === 1) {
            // Bench coming out
            if (mode === RotationMode.DEEP) candidateIds = [depthList[2], depthList[0]]; // Try Third first in Deep if tired
            else candidateIds = [depthList[0], depthList[2]]; // Try Starter first
        } else {
            // Third coming out
            candidateIds = [depthList[1], depthList[0]];
        }
    }

    // 3. Evaluate Candidates
    for (const id of candidateIds) {
        if (!id) continue;
        const candidate = team.bench.find(b => b.playerId === id);
        
        // Validation
        if (candidate && candidate.health !== 'Injured' && candidate.pf < 6) {
            if (isGarbage) return candidate;

            // Hysteresis Check: Candidate must be significantly recovered
            // e.g. Threshold 75 -> Need > 83 to come back in
            if (candidate.currentCondition >= fatigueThreshold + HYSTERESIS_BUFFER) {
                return candidate;
            }
        }
    }

    // 4. Emergency Fallback (Out of Position)
    // If no one in position map is available, pick best condition bench player
    // ONLY in Normal/Deep or Critical situations
    if (mode !== RotationMode.STRICT || current.currentCondition < CRITICAL_FATIGUE) {
        const bestBench = team.bench
            .filter(b => b.health !== 'Injured' && b.pf < 6)
            .sort((a, b) => b.currentCondition - a.currentCondition)[0];
        
        if (bestBench && bestBench.currentCondition > current.currentCondition + 10) {
            return bestBench;
        }
    }

    return null;
}

/**
 * Executes the swap in TeamState arrays.
 */
function executeSwap(team: TeamState, outP: LivePlayer, inP: LivePlayer, state: GameState, reason: string) {
    team.onCourt = team.onCourt.filter(p => p.playerId !== outP.playerId);
    team.onCourt.push(inP);
    
    // [Fix] Set entry time for new player
    inP.lastSubInTime = state.gameClock;
    
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
 * Logic to bring starters back in according to schedule.
 */
function checkStartersReturn(team: TeamState, state: GameState, mode: RotationMode, fatigueThreshold: number) {
    // Only applies to Strict/Normal schedules primarily
    // Deep manages via fatigue mostly, but we ensure starters get minutes
    
    const minutesLimits = team.tactics.minutesLimits || {};
    
    // Determine if it's "Starter Time"
    let isStarterTime = false;
    
    // Q2/Q4 last 6 mins is usually starter time
    if ((state.quarter === 2 || state.quarter === 4) && state.gameClock < 360) isStarterTime = true;
    
    // Q1/Q3 is starter time (unless rested in Normal)
    if (state.quarter === 1 || state.quarter === 3) {
        if (mode === RotationMode.STRICT) isStarterTime = true;
        else if (state.gameClock > 300) isStarterTime = true; // First 7 mins
    }

    if (!isStarterTime) return;

    // Check if any Starter is on Bench and ready
    const startersOnBench = team.bench.filter(b => b.isStarter && b.health !== 'Injured' && b.pf < 6);
    
    startersOnBench.forEach(starter => {
        // Check Limit
        if (minutesLimits[starter.playerId] !== undefined && starter.mp >= minutesLimits[starter.playerId]) return;
        
        // Check Condition (Must be recovered enough, e.g. > Threshold + Hysteresis)
        const readyCondition = Math.max(60, fatigueThreshold + HYSTERESIS_BUFFER);
        if (starter.currentCondition < readyCondition) return;

        // Find who is occupying their spot
        const posKeys: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
        let myPos: keyof DepthChart = 'PG';
        
        // Identify Starter's Position from Depth Chart
        if (team.depthChart) {
            for (const key of posKeys) {
                if (team.depthChart[key][0] === starter.playerId) {
                    myPos = key;
                    break;
                }
            }
        }

        // Find the player currently on court in that position (or backup)
        // We look for players in the same depth chart column (Index 1 or 2)
        const occupantId1 = team.depthChart ? team.depthChart[myPos][1] : null;
        const occupantId2 = team.depthChart ? team.depthChart[myPos][2] : null;
        
        const occupant = team.onCourt.find(p => p.playerId === occupantId1 || p.playerId === occupantId2);
        
        if (occupant) {
            // Check occupant stint duration to avoid rapid swaps
            const stint = occupant.lastSubInTime - state.gameClock;
            if (stint >= MIN_STINT_SECONDS) {
                 executeSwap(team, occupant, starter, state, '주전 복귀');
            }
        } else {
            // If explicit backup not found (scrambled lineup), swap with lowest OVR non-starter
            const worstNonStarter = team.onCourt
                .filter(p => !p.isStarter)
                .sort((a, b) => a.ovr - b.ovr)[0];
            
            if (worstNonStarter) {
                 const stint = worstNonStarter.lastSubInTime - state.gameClock;
                 if (stint >= MIN_STINT_SECONDS) {
                      executeSwap(team, worstNonStarter, starter, state, '주전 복귀');
                 }
            }
        }
    });
}
