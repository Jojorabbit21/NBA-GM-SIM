
import { GameState } from './pbpTypes';
import { TacticalSliders, PlayType } from '../../../../types';

/**
 * Calculates how much time a possession takes based on:
 * - Pace Slider (1-10)
 * - Play Type Context (Transition is fast, PostUp is slow)
 * - Game Situation (2-for-1)
 */
export function calculatePossessionTime(
    state: GameState, 
    sliders: TacticalSliders,
    playType?: PlayType
): number {
    const { gameClock } = state;
    
    // [Update] Instant Action for Putbacks (Second Chance)
    if (playType === 'Putback') {
        let putbackTime = 2 + Math.floor(Math.random() * 3);
        if (putbackTime > gameClock) putbackTime = gameClock;
        return putbackTime;
    }

    // 1. Base Time based on Pace Slider (1~10)
    // Pace 1 (Slow) -> 20s base
    // Pace 5 (Avg)  -> 16s base
    // Pace 10 (Fast)-> 11s base
    const pace = sliders.pace;
    let timeTaken = 21 - pace; 

    // 2. Play Type Modifiers
    if (playType === 'Transition') {
        timeTaken -= 5; // Fast break
    } else if (playType === 'PostUp' || playType === 'Iso') {
        timeTaken += 2; // Development time
    } else if (playType === 'CatchShoot' || playType === 'Cut') {
        timeTaken -= 1; // Quick action
    }

    // 3. Situational Logic (2-for-1)
    if (gameClock <= 45 && gameClock >= 30) {
        timeTaken = Math.min(timeTaken, 6); 
    }

    // 4. Floors & Ceilings
    // Absolute floor depends on context
    const floor = playType === 'Transition' ? 4 : 8;
    
    if (timeTaken < floor) timeTaken = floor;
    if (timeTaken > 23) timeTaken = 23; 

    // Random Variance (+/- 1.5s)
    timeTaken += (Math.random() * 3) - 1.5;

    // Final Safety Checks
    if (timeTaken < 3) timeTaken = 3;
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
