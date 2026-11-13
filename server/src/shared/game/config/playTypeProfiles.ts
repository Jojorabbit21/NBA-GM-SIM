
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
    // [2026-11-13] 마무리 동작 기준 분류(빅맨 덤프오프 = 컷, 블리츠 롤 = 롤맨)로 재보정 — 2020s는 Synergy 2023-24~2025-26 하프코트 FGA 구성에 맞춤,
    //   다른 시대는 같은 분류 보정 배율(새 2020s ÷ 이전 2020s)을 곱해 합계 10.8로 정규화 (docs/plan/shooter-selection-plan.md 5-12·5-13).
    //   이전: 2020s 1.05/0.64/2.81/0.63/0.39/1.61/0.60/1.29/1.10/0.69 · 2010s 1.09/1.09/2.75/0.71/0.44/1.22/0.80/0.97/1.14/0.61 ·
    //   2000s 1.64/1.84/2.00/0.59/0.37/1.03/0.95/0.82/1.20/0.36 · 1990s 1.97/2.50/1.52/0.50/0.31/0.83/1.06/0.66/1.19/0.27 (Iso/PostUp/PnR_H/Roll/Pop/C&S/OffScreen/DK/Cut/Handoff)
    '2020s': { Iso: 1.093, PostUp: 0.611, PnR_Handler: 2.955, PnR_Roll: 0.524, PnR_Pop: 0.325, CatchShoot: 1.772, OffBallScreen: 0.579, DriveKick: 1.42, Cut: 0.811, Handoff: 0.71 },
    '2010s': { Iso: 1.148, PostUp: 1.053, PnR_Handler: 2.926, PnR_Roll: 0.597, PnR_Pop: 0.371, CatchShoot: 1.358, OffBallScreen: 0.781, DriveKick: 1.08, Cut: 0.85, Handoff: 0.635 },
    // [2026-11-13] 2000s·1990s 포스트업 완화 — 레전드 리그에서 1990s가 포스트업 22.7%로 센터 득점을 키우고 가드 볼륨을 깎던 문제
    //   (실제 NBA 1990년대 센터 득점 지수는 오히려 2020년대보다 낮음). 포스트업 기본 비중 2000s 16.6→11.5%·1990s 22.7→13.6%,
    //   줄인 몫은 아이솔 65%·오프스크린 35% (시대 정체성 유지 — 비례·아이솔+PnR 배분과 포지션 득점 차이 없음, 하네스 측정).
    //   2000s·1990s 값은 역사 재현이 아니라 레전드 리그 밸런스 값. 이전: 2000s Iso 1.744/PostUp 1.794/OffBallScreen 0.936 ·
    //   1990s Iso 2.104/PostUp 2.448/OffBallScreen 1.049 (나머지 불변)
    '2000s': { Iso: 2.1028, PostUp: 1.242, PnR_Handler: 2.148, PnR_Roll: 0.501, PnR_Pop: 0.315, CatchShoot: 1.158, OffBallScreen: 1.1292, DriveKick: 0.922, Cut: 0.904, Handoff: 0.378 },
    '1990s': { Iso: 2.7405, PostUp: 1.4688, PnR_Handler: 1.64, PnR_Roll: 0.427, PnR_Pop: 0.265, CatchShoot: 0.937, OffBallScreen: 1.3917, DriveKick: 0.745, Cut: 0.9, Handoff: 0.285 },
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
