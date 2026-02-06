import { GameState, TeamState, LivePlayer } from './pbpTypes';
import { PbpLog } from '../../../../types';

// --- Constants ---
const SCORE_DIFF_GARBAGE = 20;
const HARD_FLOOR = 20; // Players must be subbed out below this
const RED_ZONE_FLOOR = 30; // Players should be subbed out
const RED_ZONE_RECOVERY_TARGET = 65; // Must recover to this before returning
const MIN_STINT_SECONDS = 120; // Minimum time on court (2 mins) to avoid yo-yo subs

// --- Helper: Max Energy Burn per Stint ---
function getMaxEnergyBurn(flexibility: number): number {
    // Flexibility 0 (Strict): 20 energy burn allowed (Long stints)
    // Flexibility 10 (Deep): 8 energy burn allowed (Short stints)
    return 20 - (flexibility * 1.2); 
}

// --- Helper: Strict Schedule ---
// Defines fixed rotation points for Strict Mode
function getStrictSchedule(flexibility: number) {
    // Strictness affects how rigid the schedule is.
    // Assuming simple fixed points for now.
    // Q1/Q3: Starters play until X minutes remaining.
    // Q2/Q4: Starters return at Y minutes remaining.
    
    // Flex 0: Starters play 10 mins in Q1/Q3. Rest 2 mins.
    // Flex 3: Starters play 8 mins in Q1/Q3. Rest 4 mins.
    const starterStintMins = 10 - flexibility; 
    const q1q3Out = (12 - starterStintMins) * 60; // Seconds remaining when sub out
    
    const q2q4In = (starterStintMins) * 60; // Seconds remaining when sub in
    
    return { q1q3Out, q2q4In };
}

// --- Helper: Calculate Absolute Time ---
function getAbsoluteTime(state: GameState): number {
    const q = state.quarter;
    const elapsedInQuarter = (q > 4 ? 300 : 720) - state.gameClock;
    const prevQuarters = (Math.min(q, 5) - 1) * 720 + Math.max(0, q - 5) * 300;
    return prevQuarters + elapsedInQuarter;
}

// --- Main Rotation Logic ---

export function processTeamRotation(team: TeamState, state: GameState): boolean {
    const flexibility = team.tactics.sliders.rotationFlexibility ?? 5;
    const isStrict = flexibility <= 3;
    const isNormal = flexibility >= 4 && flexibility <= 7;
    const maxBurn = getMaxEnergyBurn(flexibility);
    const minutesLimits = team.tactics.minutesLimits || {};
    const scoreDiff = Math.abs(state.home.score - state.away.score);
    const isGarbage = state.quarter === 4 && state.gameClock < 300 && scoreDiff >= SCORE_DIFF_GARBAGE;
    const isClutch = state.quarter === 4 && state.gameClock < 300 && scoreDiff <= 10;

    let changesMade = false;
    const strictSched = getStrictSchedule(flexibility);

    // 1. Check players ON COURT for sub-out conditions
    // Using a copy to modify the original array safely during iteration if needed, 
    // though swap modifies array in place. Iterate backwards or use a list of swaps.
    const toSubOut: { player: LivePlayer, reason: string }[] = [];

    team.onCourt.forEach(p => {
        let shouldSub = false;
        let reason = '';
        
        // Duration since last sub in (gameClock counts down)
        // If lastSubInTime = 720 and gameClock = 700, duration = 20s
        const stintDuration = p.lastSubInTime - state.gameClock;
        const isStintLocked = state.gameClock !== 720 && stintDuration < MIN_STINT_SECONDS;
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
                if ((state.quarter === 1 || state.quarter === 3) && state.gameClock <= strictSched.q1q3Out) {
                    shouldSub = true; reason = `체력 안배(Q${state.quarter} Limit)`;
                }
                else if ((state.quarter === 2 || state.quarter === 4) && state.gameClock > strictSched.q2q4In) {
                    // Logic check: Wait, Strict mode usually forces starters IN at start of Q1/Q3. 
                    // And OUT at end of Q1/Q3? 
                    // q1q3Out is "Seconds remaining when sub out". e.g. 120s (2 mins left).
                    // If Clock <= 120, sub out. Correct.
                    
                    // q2q4In is "Seconds remaining when sub in". e.g. 600s (10 mins left).
                    // If Clock > 600, starters should be resting (they played end of Q1).
                    // So if Starter is ON COURT and Clock > 600 in Q2, sub out.
                    shouldSub = true; reason = `체력 안배(Q${state.quarter} Rest)`;
                }
            }

            // [NORMAL MODE] Start of Quarter Forced Rest
            else if (isNormal && state.gameClock === 720 && p.isStarter) {
                const fatigueThreshold = 35 + (flexibility - 4) * 5;
                if (p.currentCondition < fatigueThreshold) {
                    shouldSub = true; reason = '체력 안배(Start Q)';
                }
            }

            // Stint Limit (Delta) - Only Non-Strict
            else if (!isClutch && !isStrict && energyConsumed >= maxBurn) {
                 shouldSub = true; reason = '로테이션(Stint)';
            }
        }
        
        if (shouldSub) {
            toSubOut.push({ player: p, reason });
        }
    });

    toSubOut.forEach(item => {
        const replacement = findReplacement(team, item.player, isGarbage, minutesLimits);
        if (replacement) {
            executeSwap(team, item.player, replacement, state, item.reason);
            changesMade = true;
        }
    });

    // 2. Check for bringing Starters BACK IN
    // Only if not garbage time
    if (!isGarbage) {
        if (checkStartersReturn(team, state, flexibility, strictSched, isClutch)) {
            changesMade = true;
        }
    }

    return changesMade;
}

// --- Selection Logic ---

function findReplacement(
    team: TeamState, 
    outgoing: LivePlayer, 
    isGarbage: boolean, 
    minutesLimits: Record<string, number>
): LivePlayer | null {
    // Candidates from Bench
    let candidates = team.bench.filter(p => p.health !== 'Injured' && p.pf < 6 && !p.isShutdown);

    if (isGarbage) {
        // Prioritize non-starters, low OVR
        candidates = candidates.filter(p => !p.isStarter);
        return candidates.sort((a, b) => a.ovr - b.ovr)[0] || null;
    }

    // Filter out tired players
    candidates = candidates.filter(p => {
        if (p.needsDeepRecovery && p.currentCondition < RED_ZONE_RECOVERY_TARGET) return false;
        if (p.currentCondition < RED_ZONE_FLOOR) return false;
        
        // Check Minutes Limit
        const limit = minutesLimits[p.playerId];
        if (limit !== undefined && p.mp >= limit) return false;
        
        return true;
    });

    // 1. Position Match (Depth Chart Priority)
    // Check Depth Chart if available
    if (team.depthChart) {
        // Find outgoing player's position index in chart
        // A player might be listed in multiple positions, or none.
        // We look for the best fit defined by Depth Chart.
        // Simple fallback: Find a bench player who shares the same primary position
        // Priority: 1. Depth Chart Backup for this position. 2. Same Position. 3. Best OVR.
        
        // Fallback Logic:
        const samePos = candidates.filter(p => p.position === outgoing.position);
        if (samePos.length > 0) {
            // Sort by Depth Rank (if we knew it) or OVR
            return samePos.sort((a, b) => b.ovr - a.ovr)[0];
        }
    }

    // 2. Best OVR fallback
    if (candidates.length > 0) {
        return candidates.sort((a, b) => b.ovr - a.ovr)[0];
    }

    return null;
}

function executeSwap(
    team: TeamState, 
    outPlayer: LivePlayer, 
    inPlayer: LivePlayer, 
    state: GameState, 
    reason: string
) {
    // 1. Remove OutPlayer from Court
    const outIdx = team.onCourt.findIndex(p => p.playerId === outPlayer.playerId);
    if (outIdx === -1) return; // Safety check
    
    // 2. Remove InPlayer from Bench
    const inIdx = team.bench.findIndex(p => p.playerId === inPlayer.playerId);
    if (inIdx === -1) return; // Safety check

    // 3. Swap Arrays
    team.onCourt.splice(outIdx, 1);
    team.bench.splice(inIdx, 1);
    
    team.onCourt.push(inPlayer);
    team.bench.push(outPlayer);

    // 4. Update Player State
    // OutPlayer: 
    // Log Rotation Segment
    const absoluteTime = getAbsoluteTime(state);
    if (!state.rotationHistory[outPlayer.playerId]) state.rotationHistory[outPlayer.playerId] = [];
    
    const quarterStartAbsolute = (Math.min(state.quarter, 5) - 1) * 720 + Math.max(0, state.quarter - 5) * 300;
    const qLen = state.quarter > 4 ? 300 : 720;
    const entryElapsed = qLen - outPlayer.lastSubInTime;
    const entryAbsolute = quarterStartAbsolute + entryElapsed;
    
    // Just push the segment.
    state.rotationHistory[outPlayer.playerId].push({ in: entryAbsolute, out: absoluteTime });

    // InPlayer:
    inPlayer.lastSubInTime = state.gameClock;
    inPlayer.conditionAtSubIn = inPlayer.currentCondition;

    // 5. Log PBP
    state.logs.push({
        quarter: state.quarter,
        timeRemaining: `${Math.floor(state.gameClock / 60)}:${(state.gameClock % 60).toString().padStart(2, '0')}`,
        teamId: team.id,
        text: `교체: ${inPlayer.playerName} IN, ${outPlayer.playerName} OUT (${reason})`,
        type: 'info'
    });
}

function checkStartersReturn(
    team: TeamState, 
    state: GameState, 
    flexibility: number, 
    strictSched: { q1q3Out: number, q2q4In: number },
    isClutch: boolean
): boolean {
    const isStrict = flexibility <= 3;
    let changes = false;

    // Strict Mode: Force Starters back at scheduled time
    if (isStrict) {
        // Q2/Q4: Time to bring starters back?
        if ((state.quarter === 2 || state.quarter === 4) && state.gameClock <= strictSched.q2q4In) {
            // Find Starters on Bench
            const startersOnBench = team.bench.filter(b => b.isStarter && b.health !== 'Injured' && b.pf < 6 && !b.isShutdown);
            
            startersOnBench.forEach(starter => {
                // Find someone on court to replace (Bench player)
                const benchOnCourt = team.onCourt.find(p => !p.isStarter);
                if (benchOnCourt) {
                    executeSwap(team, benchOnCourt, starter, state, '주전 복귀');
                    changes = true;
                }
            });
        }
    }
    
    // Clutch Mode: Bring best players
    if (isClutch) {
        // Simple check: Are any starters on bench?
        const startersOnBench = team.bench.filter(b => b.isStarter && b.health !== 'Injured' && b.pf < 6 && !b.isShutdown);
        startersOnBench.forEach(starter => {
             // Find worst player on court
             const candidates = [...team.onCourt].sort((a, b) => a.ovr - b.ovr); // Low OVR first
             const worst = candidates[0];
             
             if (starter.ovr > worst.ovr + 5) { // Significant upgrade
                 executeSwap(team, worst, starter, state, '클러치 라인업');
                 changes = true;
             }
        });
    }

    return changes;
}