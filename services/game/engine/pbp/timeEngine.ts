
import { GameState } from './pbpTypes';
import { TacticalSliders, PlayType } from '../../../../types';
import { SIM_CONFIG } from '../../config/constants';

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
    // [2026-07-30] 21→19로 재조정 — pace=5(중립) 기준 실측 포제션 길이가 16.72초로 나왔는데,
    // 실제 NBA 평균(2880초/(99.3페이스×2)≈14.5초)보다 길어서 포제션 개수(FGA 등 전체 카운팅
    // 스탯) 부족의 핵심 원인으로 확인됨.
    // [2026-07-31] pace를 압축 없이 그대로 빼면(19-pace) pace=8~10 팀의 포제션이 9~11초까지
    // 떨어져 게임당 130점 이상 폭주하는 문제가 실측으로 확인됨(den pace8×por pace9 매치업 4연속
    // 144~187점) — SIM_CONFIG.POSSESSION_TIME.PACE_COMPRESSION(0.2)으로 pace 1~10의 영향력을
    // 완화. pace=5(중립)는 그대로 14초 유지, pace=1→14.8초, pace=10→13.0초로 스윙을 1.8초로 축소.
    const ptCfg = SIM_CONFIG.POSSESSION_TIME;
    const pace = sliders.pace;
    const compressedPace = ptCfg.PACE_NEUTRAL + (pace - ptCfg.PACE_NEUTRAL) * ptCfg.PACE_COMPRESSION;
    let timeTaken = ptCfg.BASE - compressedPace;

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
    // [2026-08-03] 상한을 23 고정값이 아니라 state.shotClock(오펜시브 리바운드 후 14로 리셋됨)과
    // 함께 고려 — 안 그러면 리바운드로 이어진 두 번째 시도가 실제 샷클락(14초) 규정을 무시하고
    // 최대 23초까지 배정돼, 인사이트 포제션 막대에서 "24초 넘는 포제션이 너무 많다"로 관측됨.
    const ceiling = Math.min(23, state.shotClock);
    if (timeTaken > ceiling) timeTaken = ceiling;

    // Random Variance (+/- 1.5s)
    timeTaken += (Math.random() * 3) - 1.5;

    // 5. Clutch Time Management (리드 팀 시간 끌기)
    // Q4 잔여 5분 이하, 10점차 이내에서 이기는 팀: 최소 18초 사용
    if (state.quarter >= 4 && gameClock <= 300) {
        const scoreDiff = state.home.score - state.away.score;
        const offIsHome = state.possession === 'home';
        const isLeading = (offIsHome && scoreDiff > 0) || (!offIsHome && scoreDiff < 0);
        const absDiff = Math.abs(scoreDiff);

        if (isLeading && absDiff <= 10) {
            timeTaken = Math.max(timeTaken, 18);
        }
    }

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
