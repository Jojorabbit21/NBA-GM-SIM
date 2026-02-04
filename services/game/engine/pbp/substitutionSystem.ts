
import { TeamState, LivePlayer, GameState } from './pbpTypes';
import { PbpLog } from '../../../../types';
import { formatTime } from './timeEngine';

const FATIGUE_THRESHOLD_OUT = 70; // Condition below this -> Sub Out
const FATIGUE_THRESHOLD_IN = 85;  // Condition above this -> Sub In
const SUB_COOLDOWN = 120; // Seconds between sub checks to prevent spam

let lastHomeSubTime = 720;
let lastAwaySubTime = 720;

/**
 * Checks and executes substitutions for both teams during dead balls.
 */
export function handleSubstitutions(state: GameState) {
    // Only sub on dead balls
    if (!state.isDeadBall) return;
    
    // Simple cooldown check (prevent subs every single dead ball)
    // In a real engine, this would be more complex.
    const canHomeSub = Math.abs(lastHomeSubTime - state.gameClock) > 60 || state.gameClock === 720;
    const canAwaySub = Math.abs(lastAwaySubTime - state.gameClock) > 60 || state.gameClock === 720;

    if (canHomeSub) processTeamSubs(state.home, state);
    if (canAwaySub) processTeamSubs(state.away, state);
}

function processTeamSubs(team: TeamState, state: GameState) {
    const onCourt = team.onCourt;
    const bench = team.bench;
    let subMade = false;

    // 1. Check for tired players
    // We iterate backwards to safely splice if needed, though we are swapping
    for (let i = 0; i < onCourt.length; i++) {
        const player = onCourt[i];
        
        // Condition check
        if (player.currentCondition < FATIGUE_THRESHOLD_OUT) {
            // Find replacement
            const sub = findBestSub(bench, player.position);
            if (sub && sub.currentCondition > FATIGUE_THRESHOLD_IN) {
                // Execute Swap
                team.bench = team.bench.filter(p => p.playerId !== sub.playerId);
                team.onCourt[i] = sub;
                team.bench.push(player); // Player goes to bench

                state.logs.push({
                    quarter: state.quarter,
                    timeRemaining: formatTime(state.gameClock),
                    teamId: team.id,
                    type: 'info',
                    text: `[교체] OUT: ${player.playerName} (${player.position}), IN: ${sub.playerName}`
                });
                subMade = true;
            }
        }
    }
}

// Find best player on bench with matching position (or general if not found)
function findBestSub(bench: LivePlayer[], position: string): LivePlayer | null {
    // 1. Try Exact Position
    const candidates = bench.filter(p => p.position === position);
    if (candidates.length > 0) {
        return candidates.reduce((prev, current) => (prev.ovr > current.ovr) ? prev : current);
    }
    
    // 2. Try General Position (G/F/C)
    let broadPos = [];
    if (['PG', 'SG'].includes(position)) broadPos = ['PG', 'SG'];
    else if (['SF', 'PF'].includes(position)) broadPos = ['SF', 'PF'];
    else broadPos = ['C', 'PF'];
    
    const broadCandidates = bench.filter(p => broadPos.includes(p.position));
    if (broadCandidates.length > 0) {
        return broadCandidates.reduce((prev, current) => (prev.ovr > current.ovr) ? prev : current);
    }

    // 3. Just best available
    if (bench.length > 0) {
        return bench.reduce((prev, current) => (prev.ovr > current.ovr) ? prev : current);
    }

    return null;
}
