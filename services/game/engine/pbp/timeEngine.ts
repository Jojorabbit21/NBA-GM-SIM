
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
    
    // [Balance Fix] Increased Base time: 12 ~ 22 seconds (Avg ~17s)
    // Real NBA Avg is ~14-15s, but simulation overhead usually requires slight padding
    // to prevent 150+ point games constantly.
    let timeTaken = Math.floor(Math.random() * 10) + 12;
    
    // 1. Slider Adjustment (1-10)
    // Higher pace = Less time taken.
    // Range: (1-5) -> +Adds time, (6-10) -> -Removes time
    // Max Impact: Pace 10 => (5 * -0.8) = -4s. Pace 1 => (-4 * -0.8) = +3.2s
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
    // If quarter ending (between 30s and 45s), speed up to get 2 shots
    if (gameClock <= 45 && gameClock >= 30) {
        timeTaken = Math.min(timeTaken, 6); // Hurry up significantly
    }

    // Hard clamps
    if (timeTaken < 4) timeTaken = 4; // Unlikely to be faster than 4s (Inbound + Dribble)
    if (timeTaken > 23) timeTaken = 23; // Shot clock is 24

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
