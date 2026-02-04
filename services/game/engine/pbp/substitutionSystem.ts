
import { TeamState, LivePlayer, GameState } from './pbpTypes';
import { formatTime } from './timeEngine';
import { calculatePlayerArchetypes } from './archetypeSystem';

const SCORE_DIFF_THRESHOLD = 25; // 가비지 타임 기준 점수차
const FATIGUE_SAFETY_THRESHOLD = 15; // [Safety] 최소 생존 한계선 (부상 방지)

enum LineupType {
    STARTERS = 'STARTERS',
    BENCH = 'BENCH',
    GARBAGE = 'GARBAGE',
    FLUID = 'FLUID' // [New] 개별 컨디션 기반 유동적 로테이션
}

/**
 * Calculates the fatigue threshold based on Rotation Flexibility Slider (0-10).
 * 0 (Strict): ~20% (Only sub when almost dead)
 * 5 (Normal): ~45%
 * 10 (Deep): ~72% (Sub earlier to keep fresh, but not too aggressive to force platoon swaps)
 */
function getDynamicFatigueThreshold(flexibility: number): number {
    // If Strict (0-3), ignore fatigue mostly, just stick to safety net + small buffer
    if (flexibility <= 3) return 20;
    
    // Linear scale for Normal to Deep
    // Flex 4 -> 30%
    // Flex 10 -> 72%
    // Slope = (72 - 30) / (10 - 4) = 7
    const base = 30;
    const extra = (flexibility - 4) * 7;
    return Math.min(72, Math.round(base + extra));
}

/**
 * Helper: Recalculate archetypes for the players on court based on their CURRENT condition.
 * Fatigue reduces archetype effectiveness.
 */
function updateLineupArchetypes(team: TeamState) {
    team.onCourt.forEach(p => {
        // Recalculate using current condition
        p.archetypes = calculatePlayerArchetypes(p.attr, p.currentCondition);
    });
}

/**
 * Checks and executes substitutions based on Slider-based Rotation Logic.
 * INCLUDES SAFETY OVERRIDE for critically tired players.
 * Now updates archetypes after sub.
 */
export function handleSubstitutions(state: GameState) {
    if (!state.isDeadBall) return;
    
    // Run for both teams
    const homeSubbed = processTeamRotation(state.home, state);
    const awaySubbed = processTeamRotation(state.away, state);
    
    // If substitutions happened, recalculate archetype scores for active players
    if (homeSubbed) updateLineupArchetypes(state.home);
    if (awaySubbed) updateLineupArchetypes(state.away);
}

/**
 * Check if a rotation is REQUIRED right now.
 */
export function isRotationNeeded(team: TeamState, state: GameState): boolean {
    const flexibility = team.tactics.sliders.rotationFlexibility ?? 5;
    const dynamicThreshold = getDynamicFatigueThreshold(flexibility);
    const minutesLimits = team.tactics.minutesLimits || {};

    // 1. [Priority 1] Minute Limit Check
    // If ANY player on court has exceeded their set limit, force a sub.
    const hasLimitViolation = team.onCourt.some(p => {
        const limit = minutesLimits[p.playerId];
        // Allow small buffer (0.5 min) to prevent rapid toggling
        return limit !== undefined && p.mp >= (limit + 0.5);
    });
    if (hasLimitViolation) return true;

    // 2. Safety Check: Is anyone dying on the court? (< 15%)
    const hasCriticalPlayer = team.onCourt.some(p => p.currentCondition < FATIGUE_SAFETY_THRESHOLD && p.health !== 'Injured');
    if (hasCriticalPlayer) return true;

    // 3. Tactical Fatigue Check (Deep Rotation):
    // If "Deep" (Flexibility >= 7), sub individual players who hit the threshold.
    if (flexibility >= 7) {
        // Find players who are below the performance threshold
        const hasTiredPlayer = team.onCourt.some(p => p.currentCondition < dynamicThreshold && p.health !== 'Injured');
        if (hasTiredPlayer) {
            // Only trigger if we have a fresher replacement on bench
            const betterOptionExists = team.bench.some(b => b.currentCondition > (dynamicThreshold + 5) && b.health !== 'Injured');
            if (betterOptionExists) return true;
        }
    }

    // 4. Standard Time-based Rotation Logic (For Strict/Normal)
    const targetType = determineLineupType(team, state, flexibility);
    
    // If we are in FLUID mode (Deep), we rely on checks 1, 2, 3 above.
    // determineLineupType will return FLUID for Deep settings, so we skip the rigid check below.
    if (targetType === LineupType.FLUID) return false; 

    const starterIds = Object.values(team.tactics.starters);
    const currentStartersOnCourt = team.onCourt.filter(p => starterIds.includes(p.playerId)).length;

    // Garbage Time Check
    if (targetType === LineupType.GARBAGE && currentStartersOnCourt > 0) return true;

    // Rigid Template Checks (Only for Strict/Normal)
    if (targetType === LineupType.BENCH && currentStartersOnCourt >= 3) return true;
    if (targetType === LineupType.STARTERS && currentStartersOnCourt < 3) return true;

    return false;
}

// Returns true if a substitution occurred
function processTeamRotation(team: TeamState, state: GameState): boolean {
    const flexibility = team.tactics.sliders.rotationFlexibility ?? 5; 
    const minutesLimits = team.tactics.minutesLimits || {};
    
    const targetType = determineLineupType(team, state, flexibility);
    const dynamicThreshold = getDynamicFatigueThreshold(flexibility);
    
    // Pools
    const allPlayers = [...team.onCourt, ...team.bench];
    const starterIds = Object.values(team.tactics.starters);
    
    // Setup Selection Arrays
    let selected: LivePlayer[] = [];
    const selectedIds = new Set<string>();

    // -------------------------------------------------------------------------
    // Helper: Fitness Checks
    // -------------------------------------------------------------------------
    const isUnderLimit = (p: LivePlayer) => {
        const limit = minutesLimits[p.playerId];
        // If limit is 0, they should never play unless emergency
        if (limit === 0) return false;
        if (limit === undefined) return true;
        return p.mp < limit;
    };

    // Strict Mode: Lenient fitness
    // Fluid Mode: Strict fitness (must be > threshold)
    const isTacticallyFit = (p: LivePlayer, threshold: number) => 
        p.health !== 'Injured' && 
        p.currentCondition >= threshold &&
        isUnderLimit(p);

    // Bare minimum to play
    const isPhysicallyAlive = (p: LivePlayer) => 
        p.health !== 'Injured' && 
        p.currentCondition >= FATIGUE_SAFETY_THRESHOLD;


    // -------------------------------------------------------------------------
    // STRATEGY 1: FLUID ROTATION (Deep / Individual)
    // -------------------------------------------------------------------------
    if (targetType === LineupType.FLUID) {
        // Start with current on-court players
        selected = [...team.onCourt];
        selectedIds.clear();
        selected.forEach(p => selectedIds.add(p.playerId));
        
        let changesMade = false;

        // A. SUB OUT: Remove Tired Players or Over-Limit Players
        // Iterate backwards to safely splice
        for (let i = selected.length - 1; i >= 0; i--) {
            const p = selected[i];
            const isTired = p.currentCondition < dynamicThreshold;
            const isOverLimit = !isUnderLimit(p);
            
            if (isTired || isOverLimit) {
                // Find Replacement from Bench
                // Criteria: Healthy, Not Tired (Threshold + buffer), Under Limit, Best OVR
                const candidates = team.bench
                    .filter(b => 
                        !selectedIds.has(b.playerId) && 
                        isTacticallyFit(b, dynamicThreshold + 5) // +5 buffer so we don't sub in someone who gets tired in 1 min
                    )
                    .sort((a, b) => b.ovr - a.ovr);
                
                if (candidates.length > 0) {
                    const sub = candidates[0];
                    selected.splice(i, 1); // Remove tired
                    selected.push(sub);    // Add fresh
                    selectedIds.delete(p.playerId);
                    selectedIds.add(sub.playerId);
                    changesMade = true;
                    
                    // Log specific reason
                    const reason = isOverLimit ? " (시간 제한)" : " (체력 안배)";
                    state.logs.push({
                        quarter: state.quarter,
                        timeRemaining: formatTime(state.gameClock),
                        teamId: team.id,
                        type: 'info',
                        text: `[교체] OUT: ${p.playerName}${reason}, IN: ${sub.playerName}`
                    });
                }
            }
        }

        // B. SUB IN: Check if any Key Starters on bench are Fresh and ready to return
        // (Only if they aren't already selected)
        const restingStarters = team.bench.filter(b => 
            starterIds.includes(b.playerId) && 
            !selectedIds.has(b.playerId) &&
            isTacticallyFit(b, dynamicThreshold + 8) // Needs to be very fresh to bump someone else
        );

        restingStarters.forEach(starter => {
            // Find someone on court to bump
            // Prioritize bumping: Bench players, or Tired Starters (though Tired Starters should have been removed in step A)
            // Sort current lineup by: IsBench (desc), Fatigue (asc - most tired first), OVR (asc)
            const bumpCandidates = selected
                .filter(p => !starterIds.includes(p.playerId)) // Try to replace bench players first
                .sort((a, b) => a.currentCondition - b.currentCondition || a.ovr - b.ovr);
            
            if (bumpCandidates.length > 0) {
                const toRemove = bumpCandidates[0];
                
                // Only swap if Starter is actually better or fresher
                selected = selected.filter(p => p.playerId !== toRemove.playerId);
                selected.push(starter);
                selectedIds.add(starter.playerId);
                selectedIds.delete(toRemove.playerId);
                changesMade = true;

                state.logs.push({
                    quarter: state.quarter,
                    timeRemaining: formatTime(state.gameClock),
                    teamId: team.id,
                    type: 'info',
                    text: `[교체] OUT: ${toRemove.playerName}, IN: ${starter.playerName} (주전 복귀)`
                });
            }
        });

        // If we made changes via the logic above, we need to update the actual team state
        if (changesMade) {
            team.onCourt = selected;
            team.bench = allPlayers.filter(p => !selectedIds.has(p.playerId));
            return true;
        }
        return false;
    }


    // -------------------------------------------------------------------------
    // STRATEGY 2: RIGID ROTATION (Strict / Normal)
    // -------------------------------------------------------------------------
    if (targetType === LineupType.STARTERS) {
        // Try to field all Starters
        starterIds.forEach(id => {
            const p = allPlayers.find(pl => pl.playerId === id);
            // In Strict mode, we play starters even if tired (unless Dead < 20%)
            // But we respect Minute Limits
            if (p && isPhysicallyAlive(p) && isUnderLimit(p)) {
                 selected.push(p);
                 selectedIds.add(p.playerId);
            }
        });
        
        // Fill gaps with best bench
        if (selected.length < 5) {
             const benchPool = allPlayers
                .filter(p => !selectedIds.has(p.playerId) && isPhysicallyAlive(p))
                .sort((a, b) => b.ovr - a.ovr);
             
             for (const p of benchPool) {
                 if (selected.length >= 5) break;
                 selected.push(p);
                 selectedIds.add(p.playerId);
             }
        }
    } 
    else if (targetType === LineupType.BENCH) {
        // Force Bench unit
        const benchPool = allPlayers
            .filter(p => !starterIds.includes(p.playerId) && isTacticallyFit(p, 40)) // Moderate threshold for bench
            .sort((a, b) => b.ovr - a.ovr);
            
        for (const p of benchPool) {
            if (selected.length >= 5) break;
            selected.push(p);
            selectedIds.add(p.playerId);
        }
        
        // Fill gaps with Starters if bench depleted
        if (selected.length < 5) {
             const starterPool = allPlayers
                .filter(p => starterIds.includes(p.playerId) && !selectedIds.has(p.playerId) && isPhysicallyAlive(p))
                .sort((a, b) => b.currentCondition - a.currentCondition); // Freshest first
             
             for (const p of starterPool) {
                 if (selected.length >= 5) break;
                 selected.push(p);
                 selectedIds.add(p.playerId);
             }
        }
    } 
    else if (targetType === LineupType.GARBAGE) {
        // Worst players
        const garbagePool = allPlayers
            .filter(p => isPhysicallyAlive(p))
            .sort((a, b) => a.ovr - b.ovr); // Lowest OVR first
        
        for (const p of garbagePool) {
            if (selected.length >= 5) break;
            selected.push(p);
            selectedIds.add(p.playerId);
        }
    }

    // [Final Safety Net] If we still don't have 5 players (everyone injured/limited)
    if (selected.length < 5) {
        const emergencyPool = allPlayers
            .filter(p => !selectedIds.has(p.playerId) && p.health !== 'Injured')
            .sort((a, b) => b.currentCondition - a.currentCondition);
        
        for (const p of emergencyPool) {
            if (selected.length >= 5) break;
            selected.push(p);
            selectedIds.add(p.playerId);
        }
    }

    // Apply Rigid Substitution
    const onCourtIds = new Set(team.onCourt.map(p => p.playerId));
    const newCourtIds = new Set(selected.map(p => p.playerId));

    // Calculate changes
    const toSubOut = team.onCourt.filter(p => !newCourtIds.has(p.playerId));
    const toSubIn = selected.filter(p => !onCourtIds.has(p.playerId));
    
    if (toSubOut.length > 0) {
        toSubOut.forEach((outP, idx) => {
            const inP = toSubIn[idx];
            if (inP) {
                // Update Arrays
                team.onCourt = team.onCourt.filter(p => p.playerId !== outP.playerId);
                team.onCourt.push(inP);
                team.bench = team.bench.filter(p => p.playerId !== inP.playerId);
                team.bench.push(outP);

                // Add Log
                state.logs.push({
                    quarter: state.quarter,
                    timeRemaining: formatTime(state.gameClock),
                    teamId: team.id,
                    type: 'info',
                    text: `[교체] OUT: ${outP.playerName}, IN: ${inP.playerName}`
                });
            }
        });
        return true;
    }
    
    return false;
}

function determineLineupType(team: TeamState, state: GameState, flexibility: number): LineupType {
    const { quarter, gameClock, home, away } = state;
    const scoreDiff = Math.abs(home.score - away.score);

    // 1. Garbage Time Rule (Absolute)
    if (quarter === 4 && gameClock <= 300 && scoreDiff >= SCORE_DIFF_THRESHOLD) {
        return LineupType.GARBAGE;
    }

    // 2. Fluid Mode (Deep Rotation)
    // If flexibility is high (>= 7), use fluid logic instead of rigid blocks
    if (flexibility >= 7) {
        return LineupType.FLUID;
    }

    // 3. Rigid Timeline (Strict/Normal)
    // Q1 & Q3: Starters start. Sit late.
    if (quarter === 1 || quarter === 3) {
        let benchEntryTime = 180; // 3:00 (Normal)
        if (flexibility <= 3) benchEntryTime = 60; // 1:00 (Strict)
        
        if (gameClock > benchEntryTime) return LineupType.STARTERS;
        return LineupType.BENCH;
    }

    // Q2 & Q4: Bench starts. Starters return.
    if (quarter === 2 || quarter === 4) {
        let starterReturnTime = 360; // 6:00 (Normal)
        if (flexibility <= 3) starterReturnTime = 480; // 8:00 (Strict)

        // Clutch Override (Always Starters in close Q4)
        if (quarter === 4 && scoreDiff < 15 && gameClock < 300) {
            return LineupType.STARTERS;
        }

        if (gameClock > starterReturnTime) return LineupType.BENCH;
        return LineupType.STARTERS;
    }

    return LineupType.STARTERS;
}
