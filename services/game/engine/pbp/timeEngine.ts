
import { GameState, PossessionResult } from './pbpTypes';
import { TacticalSliders, OffenseTactic, PlayType } from '../../../../types';
import { OFFENSE_STRATEGY_CONFIG } from './strategyMap';

/**
 * Calculates how much time a possession takes based on:
 * - Base Time (Tactic Defined)
 * - Pace Slider (User Defined)
 * - Game Situation (2-for-1, Transition, Putback)
 */
export function calculatePossessionTime(
    state: GameState, 
    sliders: TacticalSliders,
    tactic: OffenseTactic = 'Balance',
    playType?: PlayType
): number {
    const { gameClock } = state;
    
    // [Update] Instant Action for Putbacks (Second Chance)
    // No set up required, immediate shot or pass
    if (playType === 'Putback') {
        // Randomly 2 to 4 seconds
        let putbackTime = 2 + Math.floor(Math.random() * 3);
        if (putbackTime > gameClock) putbackTime = gameClock;
        return putbackTime;
    }

    // 1. Get Base Time from Tactic
    const config = OFFENSE_STRATEGY_CONFIG[tactic];
    let timeTaken = config ? config.baseTime : 15.5; // Default to Balance if undefined

    // 2. Slider Adjustment (Revised Formula)
    // Range: 1 (Slow) to 10 (Fast)
    // Formula: (5 - Slider) * 0.4
    // Slider 10 => -2.0s
    // Slider 1  => +1.6s
    const paceMod = (5 - sliders.pace) * 0.4;
    timeTaken += paceMod;

    // 3. Situational Logic (2-for-1)
    // If quarter ending (between 30s and 45s), speed up significantly
    if (gameClock <= 45 && gameClock >= 30) {
        timeTaken = Math.min(timeTaken, 6); 
    }

    // 4. Hard Floor (Minimum Time Limit)
    // Transition plays can be fast, but set plays have a physical floor (inbound + crossing halfcourt + set up)
    if (playType !== 'Transition') {
        if (timeTaken < 7) timeTaken = 7;
    } else {
        // Transition is naturally faster
        timeTaken = Math.max(4, timeTaken - 4);
    }

    // Upper Clamp (Shot Clock Violation prevention logic handled elsewhere, but cap for sim realism)
    if (timeTaken > 24) timeTaken = 24; 

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
