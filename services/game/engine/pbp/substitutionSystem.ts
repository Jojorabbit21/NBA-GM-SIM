
import { TeamState, LivePlayer, GameState } from './pbpTypes';
import { formatTime } from './timeEngine';

const SCORE_DIFF_THRESHOLD = 25; // 가비지 타임 기준 점수차
const FATIGUE_SAFETY_THRESHOLD = 15; // [Safety] 최소 생존 한계선 (부상 방지)

enum LineupType {
    STARTERS = 'STARTERS',
    BENCH = 'BENCH',
    GARBAGE = 'GARBAGE'
}

/**
 * Calculates the fatigue threshold based on Rotation Flexibility Slider (0-10).
 * 0 (Strict): ~20% (Only sub when almost dead)
 * 5 (Normal): ~50%
 * 10 (Deep): ~80% (Aggressive subs to keep fresh legs)
 */
function getDynamicFatigueThreshold(flexibility: number): number {
    // If Strict (0-3), ignore fatigue mostly, just stick to safety net + small buffer
    if (flexibility <= 3) return 20;
    
    // Linear scale from 4 to 10 mapped to 40% -> 80%
    // flexibility 4 -> 40%
    // flexibility 10 -> 80%
    // Slope = (80-40) / (10-4) = 40/6 = ~6.6
    const base = 40;
    const extra = (flexibility - 4) * 6.6;
    return Math.min(80, Math.round(base + extra));
}

/**
 * Checks and executes substitutions based on Slider-based Rotation Logic.
 * INCLUDES SAFETY OVERRIDE for critically tired players.
 */
export function handleSubstitutions(state: GameState) {
    if (!state.isDeadBall) return;
    
    // Run for both teams
    processTeamRotation(state.home, state);
    processTeamRotation(state.away, state);
}

/**
 * Check if a rotation is REQUIRED right now.
 * Triggers if:
 * 1. Garbage time mismatch
 * 2. [Priority 1] User Defined Minute Limit Reached
 * 3. [Priority 2] Safety (Exhaustion)
 * 4. [Priority 3] Tactical Fatigue (Deep Rotation)
 * 5. Rotation timeline mismatch
 */
export function isRotationNeeded(team: TeamState, state: GameState): boolean {
    const flexibility = team.tactics.sliders.rotationFlexibility ?? 5;
    const dynamicThreshold = getDynamicFatigueThreshold(flexibility);
    const minutesLimits = team.tactics.minutesLimits || {};

    // 1. [Priority 1] Minute Limit Check
    // If ANY player on court has exceeded their set limit, force a sub.
    // Allow a small buffer (0.5 min) to prevent instant sub-back loops if logic is tight
    const hasLimitViolation = team.onCourt.some(p => {
        const limit = minutesLimits[p.playerId];
        // Check if limit exists AND player has exceeded it
        return limit !== undefined && p.mp >= limit;
    });
    if (hasLimitViolation) return true;

    // 2. Safety Check: Is anyone dying on the court? (< 15%)
    const hasCriticalPlayer = team.onCourt.some(p => p.currentCondition < FATIGUE_SAFETY_THRESHOLD && p.health !== 'Injured');
    if (hasCriticalPlayer) return true;

    // 3. Tactical Fatigue Check:
    // If playing "Deep" (Flexibility > 7), strictly enforce the fatigue threshold.
    if (flexibility >= 7) {
        const hasTiredPlayer = team.onCourt.some(p => p.currentCondition < dynamicThreshold && p.health !== 'Injured');
        if (hasTiredPlayer) {
            // Only trigger if we actually have a valid sub on the bench who is fresher
            const betterOptionExists = team.bench.some(b => b.currentCondition > dynamicThreshold && b.health !== 'Injured');
            if (betterOptionExists) return true;
        }
    }

    // 4. Standard Time-based Rotation Logic
    const targetType = determineLineupType(team, state, flexibility);
    const starterIds = Object.values(team.tactics.starters);
    const currentStartersOnCourt = team.onCourt.filter(p => starterIds.includes(p.playerId)).length;

    // If it's GARBAGE time, but we still have starters -> Need rotation
    if (targetType === LineupType.GARBAGE && currentStartersOnCourt > 0) return true;

    // If it's BENCH time, but we have 3+ starters -> Need rotation
    if (targetType === LineupType.BENCH && currentStartersOnCourt >= 3) return true;

    // If it's STARTER time, but we have < 3 starters -> Need rotation
    if (targetType === LineupType.STARTERS && currentStartersOnCourt < 3) return true;

    return false;
}

function processTeamRotation(team: TeamState, state: GameState) {
    const flexibility = team.tactics.sliders.rotationFlexibility ?? 5; 
    const minutesLimits = team.tactics.minutesLimits || {};
    
    // 1. Determine Target Lineup Type purely based on Time & Slider
    const targetType = determineLineupType(team, state, flexibility);
    const dynamicThreshold = getDynamicFatigueThreshold(flexibility);
    
    // 2. Identify Pools
    const allPlayers = [...team.onCourt, ...team.bench];
    const starterIds = Object.values(team.tactics.starters);
    
    // 3. Selection Logic
    let selected: LivePlayer[] = [];
    const selectedIds = new Set<string>();

    // [Check] Has player reached their user-defined minute limit?
    const isUnderLimit = (p: LivePlayer) => {
        const limit = minutesLimits[p.playerId];
        // If no limit set, they are always "under limit"
        if (limit === undefined) return true;
        // Strict check: if current MP >= limit, they are NOT available
        return p.mp < limit;
    };

    // Helper: Is player fit to play based on current TACTICS + LIMITS?
    // In DEEP mode, this rejects players below 80%. In STRICT mode, allows down to 20%.
    // ALWAYS rejects players over minute limit.
    const isTacticallyFit = (p: LivePlayer) => 
        p.health !== 'Injured' && 
        p.currentCondition >= dynamicThreshold &&
        isUnderLimit(p);

    // Helper: Is player fit to play based on SAFETY + LIMITS? (Fallback)
    const isPhysicallyAlive = (p: LivePlayer) => 
        p.health !== 'Injured' && 
        p.currentCondition >= FATIGUE_SAFETY_THRESHOLD &&
        isUnderLimit(p);

    if (targetType === LineupType.STARTERS) {
        // A. Try to fill with Tactically Fit Starters
        starterIds.forEach(id => {
            const p = allPlayers.find(pl => pl.playerId === id);
            if (p) {
                // Determine foul limit
                let foulLimit = 6;
                if (state.quarter <= 2) foulLimit = 3;
                else if (state.quarter <= 3) foulLimit = 4;

                // Check Fitness & Limits & Fouls
                if (isTacticallyFit(p) && p.pf < foulLimit) {
                    selected.push(p);
                    selectedIds.add(p.playerId);
                }
            }
        });

        // B. Fill gaps with best Tactically Fit Bench
        // This handles cases where Starters are over Minutes Limit
        if (selected.length < 5) {
            const benchPool = allPlayers
                .filter(p => !selectedIds.has(p.playerId) && isTacticallyFit(p))
                .sort((a, b) => b.ovr - a.ovr);
            
            for (const p of benchPool) {
                if (selected.length >= 5) break;
                selected.push(p);
                selectedIds.add(p.playerId);
            }
        }
        
        // C. Fallback: If we still lack players (e.g. Deep rotation but everyone is at 75%)
        // Pick Starters who are at least Physically Alive (ignoring Deep threshold, but respecting Limits)
        if (selected.length < 5) {
            const tiredStarters = allPlayers
                .filter(p => starterIds.includes(p.playerId) && !selectedIds.has(p.playerId) && isPhysicallyAlive(p))
                .sort((a, b) => b.currentCondition - a.currentCondition); // Least tired first
            
            for (const p of tiredStarters) {
                if (selected.length >= 5) break;
                selected.push(p);
                selectedIds.add(p.playerId);
            }
        }

    } else if (targetType === LineupType.BENCH) {
        // Force Bench
        
        // A. Pick Tactically Fit Bench Players (Respecting Limits)
        const benchPool = allPlayers
            .filter(p => !starterIds.includes(p.playerId) && isTacticallyFit(p))
            .sort((a, b) => b.ovr - a.ovr);

        for (const p of benchPool) {
            if (selected.length >= 5) break;
            selected.push(p);
            selectedIds.add(p.playerId);
        }

        // B. Fill with Fit Starters if bench is empty/injured/over-limit
        if (selected.length < 5) {
            const starterPool = allPlayers
                .filter(p => starterIds.includes(p.playerId) && !selectedIds.has(p.playerId) && isTacticallyFit(p))
                .sort((a, b) => b.currentCondition - a.currentCondition);
            
            for (const p of starterPool) {
                if (selected.length >= 5) break;
                selected.push(p);
                selectedIds.add(p.playerId);
            }
        }
    } else if (targetType === LineupType.GARBAGE) {
        // Lowest OVR players who are Alive (Respecting Limits if possible)
        const garbagePool = allPlayers
            .filter(p => isPhysicallyAlive(p))
            .sort((a, b) => a.ovr - b.ovr); // Ascending OVR
        
        for (const p of garbagePool) {
            if (selected.length >= 5) break;
            selected.push(p);
            selectedIds.add(p.playerId);
        }
    }

    // [Final Safety Net] If we still don't have 5 players 
    // (everyone injured or over minutes limits)
    // We MUST ignore minutes limits to field a team.
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

    // 4. Apply Substitutions
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
                let reason = "";
                const limit = minutesLimits[outP.playerId];
                
                if (limit !== undefined && outP.mp >= limit) reason = " (시간 제한)";
                else if (outP.currentCondition < FATIGUE_SAFETY_THRESHOLD) reason = " (체력 고갈)";
                else if (outP.currentCondition < dynamicThreshold && flexibility >= 7) reason = " (체력 안배)";

                state.logs.push({
                    quarter: state.quarter,
                    timeRemaining: formatTime(state.gameClock),
                    teamId: team.id,
                    type: 'info',
                    text: `[교체] OUT: ${outP.playerName}${reason}, IN: ${inP.playerName}`
                });
            }
        });
    }
}

function determineLineupType(team: TeamState, state: GameState, flexibility: number): LineupType {
    const { quarter, gameClock, home, away } = state;
    const scoreDiff = Math.abs(home.score - away.score);

    // 1. Garbage Time Rule (Absolute)
    if (quarter === 4 && gameClock <= 300 && scoreDiff >= SCORE_DIFF_THRESHOLD) {
        return LineupType.GARBAGE;
    }

    // 2. Rotation Timeline based on Slider (0: Strict, 5: Normal, 10: Deep)
    
    // Q1 & Q3: Starters start the game. When do they sit?
    if (quarter === 1 || quarter === 3) {
        // Strict (0-3): Play full quarter (0:00) or sit very late (1:00)
        // Normal (4-6): Sit at 3:00 remaining
        // Deep (7-10): Sit at 5:00 remaining
        
        let benchEntryTime = 180; // 3:00
        if (flexibility <= 3) benchEntryTime = 0; // Don't sit in Q1/Q3
        else if (flexibility >= 7) benchEntryTime = 300; // 5:00

        if (gameClock > benchEntryTime) return LineupType.STARTERS;
        return LineupType.BENCH;
    }

    // Q2 & Q4: Bench starts. When do Starters return?
    if (quarter === 2 || quarter === 4) {
        // Strict (0-3): Starters return early (8:00 remaining)
        // Normal (4-6): Starters return mid (6:00 remaining)
        // Deep (7-10): Starters return late (4:00 remaining)

        let starterReturnTime = 360; // 6:00
        if (flexibility <= 3) starterReturnTime = 480; // 8:00
        else if (flexibility >= 7) starterReturnTime = 240; // 4:00

        // In Q4 Clutch, force starters regardless of slider if game is close
        if (quarter === 4 && scoreDiff < 15 && gameClock < 300) {
            return LineupType.STARTERS;
        }

        if (gameClock > starterReturnTime) return LineupType.BENCH;
        return LineupType.STARTERS;
    }

    return LineupType.STARTERS;
}
