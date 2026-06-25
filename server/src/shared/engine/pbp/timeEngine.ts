
import { GameState } from './pbpTypes.ts';
import { TacticalSliders, PlayType } from '../../types.ts';

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

    // Instant Action for Putbacks (Second Chance)
    if (playType === 'Putback') {
        let putbackTime = 2 + Math.floor(Math.random() * 3);
        if (putbackTime > gameClock) putbackTime = gameClock;
        return putbackTime;
    }

    const pace = sliders.pace;
    let timeTaken = 21 - pace;

    if (playType === 'Transition') {
        timeTaken -= 5;
    } else if (playType === 'PostUp' || playType === 'Iso') {
        timeTaken += 2;
    } else if (playType === 'CatchShoot' || playType === 'Cut') {
        timeTaken -= 1;
    }

    if (gameClock <= 45 && gameClock >= 30) {
        timeTaken = Math.min(timeTaken, 6);
    }

    const floor = playType === 'Transition' ? 4 : 8;

    if (timeTaken < floor) timeTaken = floor;
    if (timeTaken > 23) timeTaken = 23;

    timeTaken += (Math.random() * 3) - 1.5;

    if (state.quarter >= 4 && gameClock <= 300) {
        const scoreDiff = state.home.score - state.away.score;
        const offIsHome = state.possession === 'home';
        const isLeading = (offIsHome && scoreDiff > 0) || (!offIsHome && scoreDiff < 0);
        const absDiff = Math.abs(scoreDiff);

        if (isLeading && absDiff <= 10) {
            timeTaken = Math.max(timeTaken, 18);
        }
    }

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
