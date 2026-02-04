
import { GameState } from './pbpTypes';
import { TacticalSliders, OffenseTactic } from '../../../../types';
import { OFFENSE_STRATEGY_CONFIG } from './strategyMap';

/**
 * Calculates how much time a possession takes based on:
 * - Pace slider
 * - Strategy (SevenSeconds vs Grind)
 * - Game situation (2-for-1, Clutch)
 */
export function calculatePossessionTime(
    state: GameState, 
    sliders: TacticalSliders,
    tactic: OffenseTactic = 'Balance'
): number {
    const { gameClock } = state;
    
    // Base time: 14 seconds average
    let timeTaken = Math.floor(Math.random() * 8) + 10;
    
    // 1. Slider Adjustment (1-10)
    // Higher pace = Less time taken.
    const paceMod = (sliders.pace - 5) * -0.8;
    timeTaken += paceMod;

    // 2. Tactic Adjustment
    const config = OFFENSE_STRATEGY_CONFIG[tactic];
    if (config) {
        // paceMod in config: +5 (Fast) to -5 (Slow)
        // Invert because higher config pace = lower time
        timeTaken -= (config.paceMod || 0); 
    }

    // 3. Situational Logic (2-for-1)
    // If quarter ending (between 28s and 40s), speed up to get 2 shots
    if (gameClock <= 45 && gameClock >= 30) {
        timeTaken = Math.min(timeTaken, 8); // Hurry up
    }

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
