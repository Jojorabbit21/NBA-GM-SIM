
import { TeamState, LivePlayer, GameState } from './pbpTypes';
import { formatTime } from './timeEngine';

const SCORE_DIFF_THRESHOLD = 25; // 가비지 타임 기준 점수차
const FATIGUE_SAFETY_THRESHOLD = 15; // [Safety] 체력이 이 값 미만이면 전술 무시하고 강제 교체

enum LineupType {
    STARTERS = 'STARTERS',
    BENCH = 'BENCH',
    GARBAGE = 'GARBAGE'
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
 * 2. Rotation timeline mismatch
 * 3. [NEW] Any player on court is critically exhausted (< 15%)
 */
export function isRotationNeeded(team: TeamState, state: GameState): boolean {
    // 1. Safety Check: Is anyone dying on the court?
    const hasExhaustedPlayer = team.onCourt.some(p => p.currentCondition < FATIGUE_SAFETY_THRESHOLD && p.health !== 'Injured');
    if (hasExhaustedPlayer) return true;

    // 2. Standard Rotation Logic
    const flexibility = team.tactics.sliders.rotationFlexibility ?? 5;
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
    
    // 1. Determine Target Lineup Type purely based on Time & Slider
    const targetType = determineLineupType(team, state, flexibility);
    
    // 2. Identify Pools
    const allPlayers = [...team.onCourt, ...team.bench];
    const starterIds = Object.values(team.tactics.starters);
    
    // 3. Selection Logic
    let selected: LivePlayer[] = [];
    const selectedIds = new Set<string>();

    // Helper: Is player fit to play? (Not injured AND Not exhausted)
    const isFit = (p: LivePlayer) => 
        p.health !== 'Injured' && p.currentCondition >= FATIGUE_SAFETY_THRESHOLD;

    if (targetType === LineupType.STARTERS) {
        // Force Starters
        starterIds.forEach(id => {
            const p = allPlayers.find(pl => pl.playerId === id);
            
            // Criteria: Must exist, Not Injured, AND Not Exhausted
            // Foul trouble logic remains
            if (p && isFit(p)) {
                let foulLimit = 6;
                if (state.quarter <= 2) foulLimit = 3;
                else if (state.quarter <= 3) foulLimit = 4;
                
                if (p.pf < foulLimit) {
                    selected.push(p);
                    selectedIds.add(p.playerId);
                }
            }
        });

        // Fill gaps with best Bench (who are fit)
        if (selected.length < 5) {
            const benchPool = allPlayers
                .filter(p => !selectedIds.has(p.playerId) && isFit(p))
                .sort((a, b) => b.ovr - a.ovr);
            
            for (const p of benchPool) {
                if (selected.length >= 5) break;
                selected.push(p);
                selectedIds.add(p.playerId);
            }
        }

    } else if (targetType === LineupType.BENCH) {
        // Force Bench
        // Logic: Remove starters, put in highest OVR bench players
        
        const benchPool = allPlayers
            .filter(p => !starterIds.includes(p.playerId) && isFit(p))
            .sort((a, b) => b.ovr - a.ovr); // Pure OVR based

        for (const p of benchPool) {
            if (selected.length >= 5) break;
            selected.push(p);
            selectedIds.add(p.playerId);
        }

        // Fill with Starters if bench is empty or exhausted (rare but possible)
        if (selected.length < 5) {
            const starterPool = allPlayers
                .filter(p => starterIds.includes(p.playerId) && !selectedIds.has(p.playerId) && isFit(p))
                .sort((a, b) => b.currentCondition - a.currentCondition); // Least tired starter
            
            for (const p of starterPool) {
                if (selected.length >= 5) break;
                selected.push(p);
                selectedIds.add(p.playerId);
            }
        }

    } else if (targetType === LineupType.GARBAGE) {
        // Lowest OVR players (ignoring fatigue slightly more leniently? No, safety first)
        const garbagePool = allPlayers
            .filter(p => p.health !== 'Injured') // Garbage time might allow tired players if no one else? Let's keep fit rule.
            .sort((a, b) => a.ovr - b.ovr); // Ascending OVR
        
        for (const p of garbagePool) {
            if (selected.length >= 5) break;
            selected.push(p);
            selectedIds.add(p.playerId);
        }
    }

    // [Safety Net] If we still don't have 5 players (everyone exhausted/injured),
    // force ANY living player even if tired (avoid crash), but prefer least tired.
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

                // Add Fatigue Alert Log if subbing out due to exhaustion
                let reason = "";
                if (outP.currentCondition < FATIGUE_SAFETY_THRESHOLD) reason = " (체력 고갈)";

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
