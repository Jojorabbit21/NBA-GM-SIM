
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
// [2026-09-10] 빅맨 볼륨 쏠림 조사 후속 조치 — base 재조정(사용자 확정 값). PnR_Roll/PnR_Pop은
// 포지션 게이트(C/PF만, 그 외 0%)라 빅맨 전용 확정 플레이, PostUp도 포지션 가중치상 C/PF가
// 80%를 차지해 사실상 빅맨 우세 플레이 — 이 셋(PostUp/PnR_Roll/PnR_Pop) base를 낮추고,
// 가드 주도형(Iso/PnR_Handler/DriveKick) + 논게이트 퍼리미터(CatchShoot)를 올렸다.
// 총합 10.9→10.7(무관 — 상대 비중만 선택에 영향).
export const PLAY_TYPE_PROFILES: Record<string, PlayTypeProfile> = {
    'Iso':           { base: 1.5, inside:  0.0, pnr:  0.0, bm: -2.0 },
    'PostUp':        { base: 1.2, inside: +2.5, pnr:  0.0, bm: -1.0 },
    'PnR_Handler':   { base: 2.0, inside:  0.0, pnr: +3.0, bm:  0.0 },
    'PnR_Roll':      { base: 1.1, inside: +1.5, pnr: +2.0, bm:  0.0 },
    'PnR_Pop':       { base: 0.8, inside: -1.5, pnr: +2.0, bm:  0.0 },
    'CatchShoot':    { base: 1.2, inside: -2.0, pnr:  0.0, bm: +2.0 },
    'OffBallScreen': { base: 0.9, inside: -1.0, pnr:  0.0, bm: +1.5 },
    'DriveKick':     { base: 0.8, inside: -1.0, pnr:  0.0, bm: +2.0 },
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
