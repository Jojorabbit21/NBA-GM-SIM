
import { GameState } from './pbpTypes.ts';
import { TacticalSliders, PlayType } from '../../types.ts';
import { SIM_CONFIG } from '../../game/config/constants.ts';

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

    // [2026-07-30] 21→19로 재조정 (client 미러 참고) — 포제션 길이 캘리브레이션 수정
    // [2026-07-31] pace 압축 도입 (client 미러 참고) — 고페이스 팀 득점 폭주 방지
    const ptCfg = SIM_CONFIG.POSSESSION_TIME;
    const pace = sliders.pace;
    const compressedPace = ptCfg.PACE_NEUTRAL + (pace - ptCfg.PACE_NEUTRAL) * ptCfg.PACE_COMPRESSION;
    let timeTaken = ptCfg.BASE - compressedPace;

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
    // [2026-08-03] 상한을 23 고정값이 아니라 state.shotClock(오펜시브 리바운드 후 14로 리셋됨)과
    // 함께 고려 (client 미러 참고) — 리바운드로 이어진 시도가 실제 샷클락 규정을 무시하고
    // 최대 23초까지 배정되던 버그 수정.
    const ceiling = Math.min(23, state.shotClock);
    if (timeTaken > ceiling) timeTaken = ceiling;

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
