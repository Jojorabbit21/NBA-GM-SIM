
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
    
    // 2. Filter Available Players (Not fouled out, Not injured)
    // Note: In this engine, injured/fouled out players should ideally be removed from team.bench/onCourt lists beforehand or flagged.
    // Assuming available players are in onCourt + bench.
    
    const allPlayers = [...team.onCourt, ...team.bench];
    
    // 3. Define Roles based on OVR
    // Sort all players by OVR descending to identify hierarchy
    const sortedByOvr = [...allPlayers].sort((a, b) => b.ovr - a.ovr);
    
    // Starters are explicitly flagged.
    // Core Rotation: The top 4-5 players AFTER starters (usually OVR rank 6-10)
    // Garbage: The lowest rated players (usually OVR rank 11-15)
    
    const starters = allPlayers.filter(p => p.isStarter);
    const bench = allPlayers.filter(p => !p.isStarter).sort((a, b) => b.ovr - a.ovr);
    
    // Determine Rotation Size based on Slider (0: Tight 8-man, 10: Deep 11-man)
    // Base 8, max 12.
    const rotationSize = 8 + Math.floor(flexibility * 0.4); 
    const coreBenchCount = Math.max(3, rotationSize - 5); 
    
    const coreBenchIds = new Set(bench.slice(0, coreBenchCount).map(p => p.playerId));
    const garbageIds = new Set(bench.slice(coreBenchCount).map(p => p.playerId)); // Anyone below core is deep bench/garbage

    // 4. Calculate Deployment Score for each player
    const scoredPlayers = allPlayers.map(p => {
        let score = p.ovr; // Base score is OVR
        
        // --- A. Minutes Limit Constraint (Strict) ---
        const limit = team.tactics.minutesLimits?.[p.playerId];
        if (limit !== undefined && p.mp >= limit) {
            score -= 10000; // Massive penalty to force them out (unless no one else available)
        }

        // --- B. Fatigue Check ---
        // If tired, reduce score to favor fresher players
        if (p.currentCondition < CRITICAL_FATIGUE) {
            score -= 500; 
        } else if (p.currentCondition < 70) {
            score -= 50; // Mild penalty
        }

        // --- C. Role Context Weights ---
        
        if (targetType === LineupType.GARBAGE) {
            // In Garbage time, LOWEST OVR players get highest score
            // We invert the OVR logic effectively
            score = 100 - p.ovr; 
            if (p.isStarter) score -= 2000; // Starters must sit
            if (coreBenchIds.has(p.playerId)) score -= 1000; // Core bench sits
            // Garbage unit (Deep Bench) naturally gets higher priority here
        } 
        else {
            // NORMAL GAME FLOW (Starters, Bench, Hybrid)
            
            // 1. Prevent Garbage players from playing in competitive time
            if (garbageIds.has(p.playerId)) {
                score -= 2000; // Only play if literally everyone else is dead
            }

            if (targetType === LineupType.STARTERS) {
                if (p.isStarter) score += 500;
            } 
            else if (targetType === LineupType.BENCH) {
                // Favor Core Bench > Starters
                if (!p.isStarter && coreBenchIds.has(p.playerId)) score += 300;
                else if (p.isStarter) score -= 100; // Starters rest
            } 
            else if (targetType === LineupType.HYBRID) {
                // Best available mix (usually Starters + Top 1-2 Bench)
                if (p.isStarter) score += 200;
                if (coreBenchIds.has(p.playerId)) score += 150;
            }
        }
        
        return { player: p, score };
    });

    // 5. Select Top 5 based on Score
    scoredPlayers.sort((a, b) => b.score - a.score);

    // Positional Balance Logic (Simple)
    // We need at least 1 Guard, 1 Forward, 1 Big if possible from the top candidates
    const selected: LivePlayer[] = [];
    const selectedIds = new Set<string>();

    const pool = scoredPlayers;
    
    // Helper to pick best available fitting a condition
    const pickBest = (filterFn: (p: LivePlayer) => boolean) => {
        for (const item of pool) {
            if (!selectedIds.has(item.player.playerId) && filterFn(item.player)) {
                selected.push(item.player);
                selectedIds.add(item.player.playerId);
                return;
            }
        }
    };

    // Try to fill standard composition (G, G, F, F, C) roughly
    pickBest(p => p.position.includes('G')); // PG/SG
    pickBest(p => p.position.includes('G')); 
    pickBest(p => p.position.includes('F')); // SF/PF
    pickBest(p => p.position.includes('F'));
    pickBest(p => p.position === 'C' || p.position === 'PF'); // Big

    // Fill remaining spots if position requirements couldn't be met perfectly
    for (const item of pool) {
        if (selected.length >= 5) break;
        if (!selectedIds.has(item.player.playerId)) {
            selected.push(item.player);
            selectedIds.add(item.player.playerId);
        }
    }

    // 6. Execute Substitutions
    const onCourtIds = new Set(team.onCourt.map(p => p.playerId));
    const newCourtIds = new Set(selected.map(p => p.playerId));

    const toSubOut = team.onCourt.filter(p => !newCourtIds.has(p.playerId));
    const toSubIn = selected.filter(p => !onCourtIds.has(p.playerId));

    // Sort In/Out to try and match positions for log readability (optional but nice)
    // Just simple swap logic here
    if (toSubOut.length > 0) {
        toSubOut.forEach((outP, idx) => {
            const inP = toSubIn[idx];
            if (inP) {
                // Update Arrays
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

    // 1. Garbage Time Rule (High Priority)
    // Condition: 4th Quarter, Last 6 minutes (360s), Score Diff >= 20
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
        // Start of Quarter: Usually Bench unit
        // When do starters return?
        
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
