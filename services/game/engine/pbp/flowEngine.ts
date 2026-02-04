import { GameState, PossessionResult, TeamState, LivePlayer } from './pbpTypes';
import { calculatePossessionTime } from './timeEngine';

/**
 * Simulates a single possession.
 * Currently uses RANDOM logic as a placeholder for the advanced tactical engine.
 */
export function resolvePossession(state: GameState): PossessionResult {
    const attTeam = state.possession === 'home' ? state.home : state.away;
    const defTeam = state.possession === 'home' ? state.away : state.home;
    
    // 1. Calculate Time
    const timeTaken = calculatePossessionTime(state, attTeam.tactics.sliders);
    
    // 2. Select Actor (Random for now)
    const actor = getRandomPlayer(attTeam.onCourt);
    
    // 3. Determine Outcome (Random Weights)
    const roll = Math.random();
    
    // 3-A. Turnover (15%)
    if (roll < 0.15) {
        const stealer = Math.random() < 0.5 ? getRandomPlayer(defTeam.onCourt) : undefined;
        return {
            type: 'turnover',
            player: actor,
            secondaryPlayer: stealer,
            timeTaken,
            logText: stealer 
                ? `${stealer.playerName}의 스틸! ${actor.playerName}의 턴오버.`
                : `${actor.playerName}, 패스 미스로 턴오버.`,
            nextPossession: state.possession === 'home' ? 'away' : 'home'
        };
    }
    
    // 3-B. Shot Attempt (85%)
    const shotRoll = Math.random();
    const is3Pt = Math.random() < 0.4; // 40% chance of 3PT
    const makeProb = is3Pt ? 0.36 : 0.50; // Base %
    
    if (shotRoll < makeProb) {
        // MADE SHOT
        const assister = Math.random() < 0.6 ? getRandomPlayer(attTeam.onCourt, actor.playerId) : undefined;
        const points = is3Pt ? 3 : 2;
        
        return {
            type: 'score',
            points,
            player: actor,
            secondaryPlayer: assister,
            timeTaken,
            logText: `${actor.playerName}, ${points}점 슛 성공! ${assister ? `(${assister.playerName} 어시스트)` : ''}`,
            nextPossession: state.possession === 'home' ? 'away' : 'home'
        };
    } else {
        // MISSED SHOT
        // Rebound Logic (75% Def Reb, 25% Off Reb)
        const isOffReb = Math.random() < 0.25;
        const rebounder = isOffReb 
            ? getRandomPlayer(attTeam.onCourt) 
            : getRandomPlayer(defTeam.onCourt);
            
        return {
            type: 'miss',
            player: actor,
            rebounder: rebounder,
            timeTaken,
            logText: `${actor.playerName}, ${is3Pt ? '3점' : '2점'}슛 실패. 리바운드: ${rebounder.playerName} (${isOffReb ? '공격' : '수비'}).`,
            nextPossession: isOffReb ? 'keep' : (state.possession === 'home' ? 'away' : 'home')
        };
    }
}

// Helper: Pick random player from array, optionally excluding one
function getRandomPlayer(players: LivePlayer[], excludeId?: string): LivePlayer {
    if (!players || players.length === 0) throw new Error("No players on court");
    let pool = players;
    if (excludeId) {
        pool = players.filter(p => p.playerId !== excludeId);
        if (pool.length === 0) pool = players;
    }
    return pool[Math.floor(Math.random() * pool.length)];
}