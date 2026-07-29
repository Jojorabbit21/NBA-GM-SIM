
import { TacticalSliders } from '../../../types';

export interface PlayTypeProfile {
    base: number;
    inside: number;
    pnr: number;
    bm: number;
}

/**
 * 10개 하프코트 플레이타입의 가중치 프로파일.
 * 3개 추상 슬라이더(insideOut, pnrFreq, ballMovement)로부터 각 플레이타입의
 * 상대적 빈도를 산출한다.
 *
 * weight(pt) = max(0.5, base + inside*insideFactor + pnr*pnrFactor + bm*bmFactor)
 *   insideFactor = (5 - insideOut) / 5
 *   pnrFactor    = (pnrFreq - 5) / 5
 *   bmFactor     = (ballMovement - 5) / 5
 *
 * [2026-07-29] base 전면 재조정 — 기존 값(특히 CatchShoot 3.5, PnR_Handler 3.0)이 문서/커밋
 * 어디에도 근거가 없는 채로 다른 플레이보다 2배 가까이 높게 잡혀 있어, 중립(모든 슬라이더 5)에서도
 * CatchShoot+PnR_Handler 둘이 전체 포제션의 32.5%를 가져가는 구조적 쏠림이 있었다(BIG LEAGUE TEST 7
 * 실측 — insideOut을 3까지 내려도 PnR_Handler가 여전히 1~2위라 로우포스트 빅맨이 포제션을 못
 * 가져가는 문제로 발견). 재조정 후 중립 상황은 PnR_Handler·Iso·PnR_Roll·PostUp 4개가 13.8%로 동률,
 * SEA 실제 설정(insideOut=3/pnrFreq=5/ballMovement=6)에서는 PostUp(19.2%)+PnR_Roll(17.5%)이
 * PnR_Handler(12.5%, 4위)를 확실히 앞서도록 검증(아티팩트 시뮬레이션).
 */
export const PLAY_TYPE_PROFILES: Record<string, PlayTypeProfile> = {
    'Iso':           { base: 1.5, inside:  0.0, pnr:  0.0, bm: -2.0 },
    'PostUp':        { base: 1.5, inside: +2.5, pnr:  0.0, bm: -1.0 },
    'PnR_Handler':   { base: 1.5, inside:  0.0, pnr: +3.0, bm:  0.0 },
    'PnR_Roll':      { base: 1.5, inside: +1.5, pnr: +2.0, bm:  0.0 },
    'PnR_Pop':       { base: 1.0, inside: -1.5, pnr: +2.0, bm:  0.0 },
    'CatchShoot':    { base: 1.0, inside: -2.0, pnr:  0.0, bm: +2.0 },
    'OffBallScreen': { base: 1.0, inside: -1.0, pnr:  0.0, bm: +1.5 },
    'DriveKick':     { base: 0.7, inside: -1.0, pnr:  0.0, bm: +2.0 },
    'Cut':           { base: 0.7, inside: +1.5, pnr:  0.0, bm: +1.5 },
    'Handoff':       { base: 0.5, inside:  0.0, pnr:  0.0, bm: +1.0 },
};

export function computePlayTypeWeights(sliders: TacticalSliders): Record<string, number> {
    const insideFactor = (5 - sliders.insideOut) / 5;
    const pnrFactor    = (sliders.pnrFreq - 5) / 5;
    const bmFactor     = (sliders.ballMovement - 5) / 5;

    const weights: Record<string, number> = {};
    for (const [pt, p] of Object.entries(PLAY_TYPE_PROFILES)) {
        weights[pt] = Math.max(0.5, p.base + p.inside * insideFactor + p.pnr * pnrFactor + p.bm * bmFactor);
    }
    weights['Transition'] = 0;  // pace 슬라이더로 별도 처리
    return weights;
}
