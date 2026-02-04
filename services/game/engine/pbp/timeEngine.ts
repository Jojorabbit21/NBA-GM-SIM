import { GameState } from './pbpTypes';
import { TacticalSliders } from '../../../../types';

const QUARTER_LENGTH = 720; // 12 mins
const AVG_POSSESSION_TIME = 14; 

/**
 * Calculates how much time a possession takes based on:
 * - Pace slider
 * - Strategy (SevenSeconds vs Grind)
 * - Game situation (2-for-1, Clutch)
 * 
 * NOTE: Currently implements basic randomization. Will be enhanced with tactics later.
 */
export function calculatePossessionTime(
    state: GameState, 
    sliders: TacticalSliders
): number {
    const { gameClock, shotClock } = state;
    
    // Base time: 14 seconds average (Gaussian-ish distribution 10~18)
    let timeTaken = Math.floor(Math.random() * 8) + 10;
    
    // Simple Pace Adjustment
    // Slider 1-10. 5 is neutral. 
    // Higher pace = Less time taken.
    const paceMod = (sliders.pace - 5) * -0.8;
    timeTaken += paceMod;

    // Hard clamps
    if (timeTaken < 4) timeTaken = 4; // Unlikely to be faster than 4s
    if (timeTaken > 24) timeTaken = 24; // Shot clock violation limit

    // End of quarter/game logic
    if (timeTaken > gameClock) {
        timeTaken = gameClock; // Cannot exceed remaining time
    }
    
    return Math.round(timeTaken);
}

export function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}