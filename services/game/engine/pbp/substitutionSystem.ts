
import { TeamState, LivePlayer, GameState } from './pbpTypes';
import { formatTime } from './timeEngine';

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
    
    // 1. Calculate Dynamic Fatigue Threshold based on Slider (0-10)
    // 0 (Strict) -> 25 (Play until dead)
    // 5 (Normal) -> 47.5
    // 10 (Deep) -> 70 (Quick sub)
    const criticalFatigue = 25 + (flexibility * 4.5);

    // 2. Determine Target Lineup Type based on Timeline
    const targetType = determineLineupType(team, state, flexibility);
    
    // 3. Identify Current State
    const allPlayers = [...team.onCourt, ...team.bench];
    const starterIds = Object.values(team.tactics.starters); // User defined starters
    
    // 4. Selection Logic based on Lineup Type
    let selected: LivePlayer[] = [];
    const selectedIds = new Set<string>();

    if (targetType === LineupType.STARTERS) {
        // Priority: The specific 5 players the user set as starters.
        
        // A. Try to put in all defined starters first
        starterIds.forEach(id => {
            const p = allPlayers.find(pl => pl.playerId === id);
            if (p) {
                // Check health & fouling
                // HUGE Weight on Starters: Only sit if below DYNAMIC critical threshold or fouled out
                if (p.currentCondition > criticalFatigue && p.pf < 6) {
                    selected.push(p);
                    selectedIds.add(p.playerId);
                }
            }
        });

        // B. If a starter is tired/fouled out, fill with best available bench
        if (selected.length < 5) {
            const availableBench = allPlayers
                .filter(p => !selectedIds.has(p.playerId) && p.pf < 6 && p.currentCondition > criticalFatigue)
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
            .filter(p => !starterIds.includes(p.playerId) && p.pf < 6 && p.currentCondition > criticalFatigue)
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
            .filter(p => p.pf < 6 && p.currentCondition > criticalFatigue)
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

    // 5. Apply Substitutions
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

    // 2. Timeline Definition based on Flexibility (0-10)
    
    if (quarter === 1 || quarter === 3) {
        // Q1/Q3 Logic: Start with Starters
        // Determine "Bench Entry Time" (When do we switch to Bench?)
        
        let benchEntryTime = 120; // Default Normal (2:00 remaining)
        
        if (flexibility <= 3) { // STRICT (0-3)
            benchEntryTime = 0; // Never switch to bench in Q1/Q3 (play full 12m)
        } else if (flexibility >= 7) { // DEEP (7-10)
            benchEntryTime = 300; // Switch early at 5:00 remaining
        } else { // NORMAL (4-6)
            benchEntryTime = 120; // Switch at 2:00 remaining
        }
        
        if (gameClock > benchEntryTime) return LineupType.STARTERS;
        return LineupType.BENCH;
    }

    if (quarter === 2 || quarter === 4) {
        // Q2/Q4 Logic: Start with Bench
        // Determine "Starter Return Time" (When do starters come back?)
        
        let starterReturnTime = 360; // Default Normal (6:00 remaining)
        
        if (flexibility <= 3) { // STRICT (0-3)
            starterReturnTime = 540; // Return early at 9:00 remaining (only 3m bench rest)
        } else if (flexibility >= 7) { // DEEP (7-10)
            starterReturnTime = 240; // Return late at 4:00 remaining
        } else { // NORMAL (4-6)
            starterReturnTime = 360; // Return at 6:00 remaining
        }

        if (gameClock > starterReturnTime) return LineupType.BENCH;
        return LineupType.STARTERS;
    }

    return LineupType.STARTERS; // Fallback
}
