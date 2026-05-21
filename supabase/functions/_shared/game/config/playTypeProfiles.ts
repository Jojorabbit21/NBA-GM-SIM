
import { TacticalSliders } from '../../types.ts';

export interface PlayTypeProfile {
    base: number;
    hero: number;
    inside: number;
    pnr: number;
}

/**
 * 10개 하프코트 플레이타입의 가중치 프로파일.
 */
export const PLAY_TYPE_PROFILES: Record<string, PlayTypeProfile> = {
    'Iso':           { base: 2.0, hero: +3.0, inside:  0.0, pnr:  0.0 },
    'PostUp':        { base: 1.5, hero: +1.5, inside: +2.5, pnr:  0.0 },
    'PnR_Handler':   { base: 3.0, hero: +1.0, inside:  0.0, pnr: +3.0 },
    'PnR_Roll':      { base: 1.5, hero:  0.0, inside: +1.5, pnr: +2.0 },
    'PnR_Pop':       { base: 1.0, hero:  0.0, inside: -1.5, pnr: +2.0 },
    'CatchShoot':    { base: 3.5, hero: -2.5, inside: -2.0, pnr:  0.0 },
    'OffBallScreen': { base: 1.5, hero: -1.5, inside: -1.0, pnr:  0.0 },
    'DriveKick':     { base: 2.5, hero: -1.5, inside: -1.0, pnr:  0.0 },
    'Cut':           { base: 2.0, hero: -0.5, inside: +1.5, pnr:  0.0 },
    'Handoff':       { base: 1.5, hero: -1.0, inside:  0.0, pnr:  0.0 },
};

export function computePlayTypeWeights(sliders: TacticalSliders): Record<string, number> {
    const heroFactor   = (5 - sliders.playStyle) / 5;
    const insideFactor = (5 - sliders.insideOut) / 5;
    const pnrFactor    = (sliders.pnrFreq - 5) / 5;

    const weights: Record<string, number> = {};
    for (const [pt, p] of Object.entries(PLAY_TYPE_PROFILES)) {
        weights[pt] = Math.max(0.5, p.base + p.hero * heroFactor + p.inside * insideFactor + p.pnr * pnrFactor);
    }
    weights['Transition'] = 0;
    return weights;
}
