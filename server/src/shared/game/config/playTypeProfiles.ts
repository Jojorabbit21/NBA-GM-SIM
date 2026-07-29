
import { TacticalSliders } from '../../types.ts';

export interface PlayTypeProfile {
    base: number;
    inside: number;
    pnr: number;
    bm: number;
}

/**
 * 10개 하프코트 플레이타입의 가중치 프로파일.
 * [2026-07-29] base 전면 재조정(client 미러 상세 참조) — CatchShoot/PnR_Handler가 근거 없이
 * 다른 플레이보다 2배 가까이 높아 중립 설정에서도 32.5%를 독식하던 문제 수정.
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
    weights['Transition'] = 0;
    return weights;
}
