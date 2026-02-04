
import { TeamState, LivePlayer, GameState } from './pbpTypes';
import { formatTime } from './timeEngine';

// Emergency Low Condition Threshold
const CRITICAL_FATIGUE = 50; 
const SCORE_DIFF_THRESHOLD = 20; // Blowout definition

enum LineupType {
    STARTERS = 'STARTERS',
    BENCH = 'BENCH',
    HYBRID = 'HYBRID', // Mixed
    GARBAGE = 'GARBAGE' // End of game blowout
}

/**
 * Checks and executes substitutions based on Advanced Rotation Logic.
 */
export function handleSubstitutions(state: GameState) {
    if (!state.isDeadBall) return;
    
    // Run for both teams
    processTeamRotation(state.home, state, 'home');
    processTeamRotation(state.away, state, 'away');
}

function processTeamRotation(team: TeamState, state: GameState, teamSide: 'home' | 'away') {
    const { quarter, gameClock } = state;
    const flexibility = team.tactics.sliders.rotationFlexibility ?? 5; 
    
    // 1. Determine Target Lineup Type
    const targetType = determineLineupType(team, state, flexibility);
    
    // 2. Identify Current State
    const allPlayers = [...team.onCourt, ...team.bench];
    const starterIds = Object.values(team.tactics.starters); // User defined starters
    
    // 3. Selection Logic based on Lineup Type
    let selected: LivePlayer[] = [];
    const selectedIds = new Set<string>();

    if (targetType === LineupType.STARTERS) {
        // [Fixed] Priority: The specific 5 players the user set as starters.
        // Do NOT force positional balance (e.g. 2G, 2F, 1C) if user didn't set it that way.
        
        // A. Try to put in all defined starters first
        starterIds.forEach(id => {
            const p = allPlayers.find(pl => pl.playerId === id);
            if (p) {
                // Check health
                if (p.currentCondition > CRITICAL_FATIGUE && p.pf < 6) {
                    selected.push(p);
                    selectedIds.add(p.playerId);
                }
            }
        });

        // B. If a starter is tired/fouled out, fill with best available bench
        if (selected.length < 5) {
            const availableBench = allPlayers
                .filter(p => !selectedIds.has(p.playerId) && p.pf < 6 && p.currentCondition > CRITICAL_FATIGUE)
                .sort((a, b) => b.ovr - a.ovr); // Highest OVR bench
            
            for (const p of availableBench) {
                if (selected.length >= 5) break;
                selected.push(p);
                selectedIds.add(p.playerId);
            }
        }

    } else if (targetType === LineupType.BENCH) {
        // Priority: Best Bench players > Tired Starters
        
        const benchPool = allPlayers
            .filter(p => !starterIds.includes(p.playerId) && p.pf < 6 && p.currentCondition > CRITICAL_FATIGUE)
            .sort((a, b) => b.ovr - a.ovr);

        // Fill with bench
        for (const p of benchPool) {
            if (selected.length >= 5) break;
            selected.push(p);
            selectedIds.add(p.playerId);
        }

        // Fill remaining spots with freshest starters if bench is thin
        if (selected.length < 5) {
            const starterPool = allPlayers
                .filter(p => starterIds.includes(p.playerId) && !selectedIds.has(p.playerId) && p.pf < 6)
                .sort((a, b) => b.currentCondition - a.currentCondition); // Freshest first
            
            for (const p of starterPool) {
                if (selected.length >= 5) break;
                selected.push(p);
                selectedIds.add(p.playerId);
            }
        }
    
    } else if (targetType === LineupType.GARBAGE) {
        // Priority: Lowest OVR players
        const garbagePool = allPlayers
            .filter(p => p.pf < 6)
            .sort((a, b) => a.ovr - b.ovr); // Lowest first
        
        for (const p of garbagePool) {
            if (selected.length >= 5) break;
            selected.push(p);
            selectedIds.add(p.playerId);
        }

    } else {
        // HYBRID: Best 5 players available regardless of role
        // Usually mix of starters and 6th man
        const bestPool = allPlayers
            .filter(p => p.pf < 6 && p.currentCondition > CRITICAL_FATIGUE)
            .sort((a, b) => b.ovr - a.ovr);

        for (const p of bestPool) {
            if (selected.length >= 5) break;
            selected.push(p);
            selectedIds.add(p.playerId);
        }
    }

    // Failsafe: If we somehow don't have 5 (e.g. everyone fouled out), fill with anyone
    if (selected.length < 5) {
        const remaining = allPlayers.filter(p => !selectedIds.has(p.playerId));
        for (const p of remaining) {
            if (selected.length >= 5) break;
            selected.push(p);
            selectedIds.add(p.playerId);
        }
    }

    // 4. Apply Substitutions
    const onCourtIds = new Set(team.onCourt.map(p => p.playerId));
    const newCourtIds = new Set(selected.map(p => p.playerId));

    // Identify changes
    const toSubOut = team.onCourt.filter(p => !newCourtIds.has(p.playerId));
    const toSubIn = selected.filter(p => !onCourtIds.has(p.playerId));

    if (toSubOut.length > 0) {
        // Perform Swap
        toSubOut.forEach((outP, idx) => {
            const inP = toSubIn[idx];
            if (inP) {
                team.bench.push(outP);
                team.onCourt = team.onCourt.filter(p => p.playerId !== outP.playerId);
                team.onCourt.push(inP);
                team.bench = team.bench.filter(p => p.playerId !== inP.playerId);

                state.logs.push({
                    quarter: state.quarter,
                    timeRemaining: formatTime(state.gameClock),
                    teamId: team.id,
                    type: 'info',
                    text: `[교체] OUT: ${outP.playerName}, IN: ${inP.playerName}`
                });
            }
        });
    }
}

function determineLineupType(team: TeamState, state: GameState, flexibility: number): LineupType {
    const { quarter, gameClock, home, away } = state;
    const scoreDiff = Math.abs(home.score - away.score);

    // 1. Garbage Time Rule
    if (quarter === 4 && gameClock <= 360 && scoreDiff >= SCORE_DIFF_THRESHOLD) {
        return LineupType.GARBAGE;
    }

    // 2. Normal Rotation Strategy
    // 0-3: Strict (Thibodeau) - Ride Starters
    // 4-6: Normal (Standard NBA)
    // 7-10: Deep (Spurs/Warriors) - More Bench
    
    const isStrict = flexibility <= 3;
    const isDeep = flexibility >= 7;

    // Q1 & Q3 Logic
    if (quarter === 1 || quarter === 3) {
        // Start with Starters
        if (gameClock > 300) return LineupType.STARTERS; // First 7 mins always Starters

        // End of Quarter Logic
        if (isStrict) {
            return LineupType.STARTERS; // Play full quarter
        } else if (isDeep) {
            return LineupType.BENCH; // Bench comes in at 5:00 remaining
        } else {
            // Normal: Hybrid/Bench mix near end
            return LineupType.HYBRID;
        }
    }

    // Q2 & Q4 Logic (Non-Garbage)
    if (quarter === 2 || quarter === 4) {
        let returnTime = 360; // Default: Return at 6:00
        if (isStrict) returnTime = 480; // Return early at 8:00
        if (isDeep) returnTime = 240; // Return late at 4:00

        if (gameClock > returnTime) {
            return LineupType.BENCH;
        } else {
            return LineupType.STARTERS; // Closing lineup
        }
    }

    return LineupType.STARTERS; // Fallback
}
