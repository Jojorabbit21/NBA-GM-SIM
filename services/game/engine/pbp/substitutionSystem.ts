
import { TeamState, LivePlayer, GameState } from './pbpTypes';
import { formatTime } from './timeEngine';
import { calculatePlayerArchetypes } from './archetypeSystem';

const SCORE_DIFF_THRESHOLD = 25; // 가비지 타임 기준 점수차
const FATIGUE_SAFETY_THRESHOLD = 15; // [Safety] 최소 생존 한계선 (부상 방지)
const AUTO_MAX_MINUTES = 38; // [Safety] Strict 모드여도 이 시간을 넘기면 교체 고려

enum LineupType {
    STARTERS = 'STARTERS',
    BENCH = 'BENCH',
    GARBAGE = 'GARBAGE',
    FLUID = 'FLUID' // [New] 개별 컨디션 기반 유동적 로테이션
}

/**
 * Calculates the fatigue threshold based on Rotation Flexibility Slider (0-10).
 * 0 (Strict): ~60% (Previously 20% - Increased to prevent exhaustion)
 * 5 (Normal): ~70%
 * 10 (Deep): ~80%
 */
function getDynamicFatigueThreshold(flexibility: number): number {
    // Linear scale
    // Flex 0 -> 60% (Don't let them drop below 60 even in strict)
    // Flex 5 -> 70%
    // Flex 10 -> 80%
    const base = 60;
    const extra = flexibility * 2; 
    return Math.min(85, base + extra);
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

    // 1. [Priority 1] Minute Limit Check (Manual + Auto Cap)
    const hasLimitViolation = team.onCourt.some(p => {
        const manualLimit = minutesLimits[p.playerId];
        
        // A. Manual Limit Check
        if (manualLimit !== undefined && p.mp >= (manualLimit + 0.5)) return true;

        // B. Auto Soft Cap (38 min) for Strict Mode protection
        // Only enforce if no manual limit is set and score isn't super close in Q4 last minute
        const isClutch = state.quarter >= 4 && state.gameClock < 120 && Math.abs(state.home.score - state.away.score) <= 5;
        if (!isClutch && manualLimit === undefined && p.mp >= AUTO_MAX_MINUTES) return true;

        return false;
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
        const manualLimit = minutesLimits[p.playerId];
        
        // 1. Manual Limit
        if (manualLimit === 0) return false; // Should not play
        if (manualLimit !== undefined) return p.mp < manualLimit;

        // 2. Auto Cap (38m) - Prevent exhaustion even in Strict mode
        // Allow Clutch override only if condition is decent (> 40)
        const isClutch = state.quarter >= 4 && state.gameClock < 300 && Math.abs(state.home.score - state.away.score) <= 10;
        if (isClutch && p.currentCondition > 40) return true;
        
        return p.mp < AUTO_MAX_MINUTES;
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
                const candidates = team.bench
                    .filter(b => 
                        !selectedIds.has(b.playerId) && 
                        isTacticallyFit(b, dynamicThreshold + 5) // +5 buffer
                    )
                    .sort((a, b) => {
                        // [Updated] Deep Rotation Sorting Strategy
                        // If "Deep", prioritize players who have played LESS (mp asc).
                        // This forces the rotation to go deeper (11th, 12th man) before returning to starters.
                        if (flexibility >= 7) {
                            // Primary: Minutes Played (Low to High)
                            if (Math.abs(a.mp - b.mp) > 2) return a.mp - b.mp;
                            // Secondary: Condition (High to Low)
                            return b.currentCondition - a.currentCondition;
                        }
                        // Default: Best Player Available (OVR)
                        return b.ovr - a.ovr;
                    });
                
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
        // [Updated] In "Deep" mode, we DISABLE this aggressive starter return logic.
        if (flexibility < 7) {
            const restingStarters = team.bench.filter(b => 
                starterIds.includes(b.playerId) && 
                !selectedIds.has(b.playerId) &&
                isTacticallyFit(b, dynamicThreshold + 8) 
            );

            restingStarters.forEach(starter => {
                // Find someone on court to bump
                // Prioritize bumping: Bench players, or Tired Starters
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
        }

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
            
            // In Strict mode, enforce soft limit (38m) and fatigue floor (60%)
            // If they are dangerously tired or overplayed, don't put them back in
            if (p && isPhysicallyAlive(p) && isUnderLimit(p)) {
                 // Even starters shouldn't play if they are < 60% condition in Strict
                 if (p.currentCondition > 60) {
                     selected.push(p);
                     selectedIds.add(p.playerId);
                 }
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
                .filter(p => starterIds.includes(p.playerId) && !selectedIds.has(p.playerId) && isPhysicallyAlive(p) && isUnderLimit(p))
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

        // Clutch Override (Always Starters in close Q4 if not dead tired)
        if (quarter === 4 && scoreDiff < 15 && gameClock < 300) {
            return LineupType.STARTERS;
        }

        if (gameClock > starterReturnTime) return LineupType.BENCH;
        return LineupType.STARTERS;
    }

    return LineupType.STARTERS;
}
