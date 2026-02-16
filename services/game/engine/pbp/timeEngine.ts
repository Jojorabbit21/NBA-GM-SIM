
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
    // [Normalization] Increased base times slightly to reduce total possessions (Prevent 140+ pts)
    // Was 15.5, now dynamic but centered around 14-16s effectively
    let timeTaken = config ? config.baseTime : 16.0; 

    // 2. Slider Adjustment (Compressed Impact)
    // Old: (5 - Slider) * 0.4 -> Range +/- 2.0s
    // New: (5 - Slider) * 0.6 -> Range +/- 3.0s (But base times are higher)
    // However, we apply a dampener to ensure we don't go too low.
    const paceMod = (5 - sliders.pace) * 0.6;
    timeTaken += paceMod;

    // 3. Situational Logic (2-for-1)
    if (gameClock <= 45 && gameClock >= 30) {
        timeTaken = Math.min(timeTaken, 6); 
    }

    // 4. Hard Floors & Ceilings (Normalization Logic)
    // Prevent unrealistic rapid-fire or shot-clock stalling
    if (playType !== 'Transition') {
        // [Normalization] Raised floor from 7s to 10s for set plays.
        // Even fast teams need time to cross half court and pass once.
        if (timeTaken < 10) timeTaken = 10;
    } else {
        // Transition is naturally faster, but rarely instant
        timeTaken = Math.max(6, timeTaken - 4);
    }

    // Upper Clamp (Prevent exceeding 24s violation logic handled elsewhere)
    if (timeTaken > 23) timeTaken = 23; 

    // Random Variance (Natural feeling)
    // +/- 1.5 seconds
    timeTaken += (Math.random() * 3) - 1.5;

    // Final Safety Checks
    if (timeTaken < 4) timeTaken = 4; // Absolute physical minimum
    if (timeTaken > gameClock) {
        timeTaken = gameClock; 
    }
    
    return Math.round(timeTaken);
}

export function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}
