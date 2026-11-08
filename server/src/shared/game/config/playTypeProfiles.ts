
import type { TacticalSliders } from '../../types.ts';
import type { PlayTypeEra } from '../../types/simSettings.ts';

/** 슬라이더 1단계(5 기준 ±1)당 가중치 변화 계수 — 시대와 무관하게 공통. */
export interface PlayTypeSliderCoefs {
    inside: number;
    pnr: number;
    bm: number;
}

/**
 * 10개 하프코트 플레이타입의 가중치 프로파일 (client 미러 services/game/config/playTypeProfiles.ts — 상세 주석은 그쪽).
 * weight(pt) = max(min(0.5, base), base + inside*insideFactor + pnr*pnrFactor + bm*bmFactor)
 * [2026-11-08] base를 시대별 프리셋(PLAY_TYPE_ERA_BASES)으로 교체 — 이전 V3: Iso 1.1 / PostUp 1.8 / PnR_Handler 2.0 /
 * PnR_Roll 1.3 / PnR_Pop 0.8 / CatchShoot 1.0 / OffBallScreen 0.8 / DriveKick 0.8 / Cut 0.7 / Handoff 0.5, 하한 max(0.5, …).
 */
export const PLAY_TYPE_SLIDER_COEFS: Record<string, PlayTypeSliderCoefs> = {
    'Iso':           { inside:  0.0, pnr:  0.0, bm: -2.0 },
    'PostUp':        { inside: +2.5, pnr:  0.0, bm: -1.0 },
    'PnR_Handler':   { inside:  0.0, pnr: +3.0, bm:  0.0 },
    'PnR_Roll':      { inside: +1.5, pnr: +2.0, bm:  0.0 },
    'PnR_Pop':       { inside: -1.5, pnr: +2.0, bm:  0.0 },
    'CatchShoot':    { inside: -2.0, pnr:  0.0, bm: +2.0 },
    'OffBallScreen': { inside: -1.0, pnr:  0.0, bm: +1.5 },
    'DriveKick':     { inside: -1.0, pnr:  0.0, bm: +2.0 },
    'Cut':           { inside: +1.5, pnr:  0.0, bm: +1.5 },
    'Handoff':       { inside:  0.0, pnr:  0.0, bm: +1.0 },
};

/** [2026-11-08] 시대별 중립(슬라이더 5) base — 보정 방식·목표 비율 근거는 client 미러 주석 참조. */
export const PLAY_TYPE_ERA_BASES: Record<PlayTypeEra, Record<string, number>> = {
    '2020s': { Iso: 1.05, PostUp: 0.64, PnR_Handler: 2.81, PnR_Roll: 0.63, PnR_Pop: 0.39, CatchShoot: 1.61, OffBallScreen: 0.60, DriveKick: 1.29, Cut: 1.10, Handoff: 0.69 },
    '2010s': { Iso: 1.09, PostUp: 1.09, PnR_Handler: 2.75, PnR_Roll: 0.71, PnR_Pop: 0.44, CatchShoot: 1.22, OffBallScreen: 0.80, DriveKick: 0.97, Cut: 1.14, Handoff: 0.61 },
    '2000s': { Iso: 1.64, PostUp: 1.84, PnR_Handler: 2.00, PnR_Roll: 0.59, PnR_Pop: 0.37, CatchShoot: 1.03, OffBallScreen: 0.95, DriveKick: 0.82, Cut: 1.20, Handoff: 0.36 },
    '1990s': { Iso: 1.97, PostUp: 2.50, PnR_Handler: 1.52, PnR_Roll: 0.50, PnR_Pop: 0.31, CatchShoot: 0.83, OffBallScreen: 1.06, DriveKick: 0.66, Cut: 1.19, Handoff: 0.27 },
};

export const PLAY_TYPE_ERAS: readonly PlayTypeEra[] = ['2020s', '2010s', '2000s', '1990s'];
/** 미지정(기존 세션·싱글) 폴백. */
export const DEFAULT_PLAY_TYPE_ERA: PlayTypeEra = '2020s';

/** sim_settings(JSONB)에서 읽은 값 검증 — 모르는 값·미지정은 기본 시대. */
export function resolvePlayTypeEra(era: unknown): PlayTypeEra {
    return typeof era === 'string' && era in PLAY_TYPE_ERA_BASES ? era as PlayTypeEra : DEFAULT_PLAY_TYPE_ERA;
}

export function computePlayTypeWeights(sliders: TacticalSliders, era?: PlayTypeEra | null): Record<string, number> {
    const insideFactor = (5 - sliders.insideOut) / 5;
    const pnrFactor    = (sliders.pnrFreq - 5) / 5;
    const bmFactor     = (sliders.ballMovement - 5) / 5;
    const bases = PLAY_TYPE_ERA_BASES[resolvePlayTypeEra(era)];

    const weights: Record<string, number> = {};
    for (const [pt, c] of Object.entries(PLAY_TYPE_SLIDER_COEFS)) {
        const base = bases[pt];
        // 하한 0.5 — 단, base가 0.5보다 낮은 시대는 base 자체가 하한
        weights[pt] = Math.max(Math.min(0.5, base), base + c.inside * insideFactor + c.pnr * pnrFactor + c.bm * bmFactor);
    }
    weights['Transition'] = 0;
    return weights;
}
