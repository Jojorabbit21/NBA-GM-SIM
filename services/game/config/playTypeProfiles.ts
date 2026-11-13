
import type { TacticalSliders } from '../../../types';
import type { PlayTypeEra } from '../../../types/simSettings';

/** 슬라이더 1단계(5 기준 ±1)당 가중치 변화 계수 — 시대와 무관하게 공통. */
export interface PlayTypeSliderCoefs {
    inside: number;
    pnr: number;
    bm: number;
}

/**
 * 10개 하프코트 플레이타입의 가중치 프로파일.
 * 3개 추상 슬라이더(insideOut, pnrFreq, ballMovement)로부터 각 플레이타입의
 * 상대적 빈도를 산출한다.
 *
 * weight(pt) = max(min(0.5, base), base + inside*insideFactor + pnr*pnrFactor + bm*bmFactor)
 *   base         = PLAY_TYPE_ERA_BASES[세션 시대][pt]  (슬라이더 5일 때의 상대 비중)
 *   insideFactor = (5 - insideOut) / 5
 *   pnrFactor    = (pnrFreq - 5) / 5
 *   bmFactor     = (ballMovement - 5) / 5
 *
 * 속공은 pace 슬라이더로 플레이 선택 전에 따로 판정하므로(possessionHandler), 이 표는 하프코트
 * 플레이끼리의 상대 비율만 정한다 — base 합계의 절대값은 슬라이더 민감도에만 영향(시대 공통 10.8).
 *
 * 이력: [2026-07-29] base 전면 재조정(CatchShoot/PnR_Handler 근거 없는 고평가 제거) →
 * [2026-09-10] 빅맨 볼륨 쏠림 조사 후 재조정 → [2026-10-24] V3(Iso 1.1 / PostUp 1.8 / PnR_Handler 2.0 /
 * PnR_Roll 1.3 / PnR_Pop 0.8 / CatchShoot 1.0 / OffBallScreen 0.8 / DriveKick 0.8 / Cut 0.7 / Handoff 0.5)
 * → [2026-11-08] 시대별 프리셋으로 교체(아래).
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

/**
 * [2026-11-08] 시대별 중립(슬라이더 5) base — 세션 설정 `simSettings.playTypeEra`로 선택.
 * 보정 방식: 리그 전 팀 슬라이더 5(NBA Active 로스터)에서 엔진이 낸 하프코트 플레이 비율이
 * 목표 비율(Synergy 분류 — 킥아웃은 스팟업, CatchShoot+DriveKick = 스팟업, Roll+Pop = 롤맨)과
 * 같아지도록 곱셈 보정 후 합계 10.8로 정규화. CatchShoot:DriveKick, PnR_Roll:PnR_Pop은 V3 비율 고정.
 * 목표 비율:
 *   2020s — Synergy 2020-21~2025-26 평균 (실측)
 *   2010s — Synergy 2013-14~2019-20 평균 (실측, 2010-11~2012-13 자료 없음)
 *   2000s — 추정: 포스트업 ≈11.5%·아이솔 ≈10.5%·PnR 핸들러+롤 ≈17%(전체 플레이 대비, 2004-05 15.6% →
 *           2008-09 18.6% Synergy 공개 수치·Grantland 인용 기준), 나머지는 2010년대 추세 역산
 *   1990s — 추정(클래식): 플레이타입 기록 없음, 포스트업·아이솔↑ PnR·스팟업↓ 추세 연장
 * 상세 근거·하네스 결과: docs/history/dev-log.md 2026-11-08 항목.
 */
export const PLAY_TYPE_ERA_BASES: Record<PlayTypeEra, Record<string, number>> = {
    // [2026-11-13] 마무리 동작 기준 분류(빅맨 덤프오프 = 컷, 블리츠 롤 = 롤맨)로 재보정 — 2020s는 Synergy 2023-24~2025-26 하프코트 FGA 구성에 맞춤,
    //   다른 시대는 같은 분류 보정 배율(새 2020s ÷ 이전 2020s)을 곱해 합계 10.8로 정규화 (docs/plan/shooter-selection-plan.md 5-12·5-13).
    //   이전: 2020s 1.05/0.64/2.81/0.63/0.39/1.61/0.60/1.29/1.10/0.69 · 2010s 1.09/1.09/2.75/0.71/0.44/1.22/0.80/0.97/1.14/0.61 ·
    //   2000s 1.64/1.84/2.00/0.59/0.37/1.03/0.95/0.82/1.20/0.36 · 1990s 1.97/2.50/1.52/0.50/0.31/0.83/1.06/0.66/1.19/0.27 (Iso/PostUp/PnR_H/Roll/Pop/C&S/OffScreen/DK/Cut/Handoff)
    '2020s': { Iso: 1.093, PostUp: 0.611, PnR_Handler: 2.955, PnR_Roll: 0.524, PnR_Pop: 0.325, CatchShoot: 1.772, OffBallScreen: 0.579, DriveKick: 1.42, Cut: 0.811, Handoff: 0.71 },
    '2010s': { Iso: 1.148, PostUp: 1.053, PnR_Handler: 2.926, PnR_Roll: 0.597, PnR_Pop: 0.371, CatchShoot: 1.358, OffBallScreen: 0.781, DriveKick: 1.08, Cut: 0.85, Handoff: 0.635 },
    '2000s': { Iso: 1.744, PostUp: 1.794, PnR_Handler: 2.148, PnR_Roll: 0.501, PnR_Pop: 0.315, CatchShoot: 1.158, OffBallScreen: 0.936, DriveKick: 0.922, Cut: 0.904, Handoff: 0.378 },
    '1990s': { Iso: 2.104, PostUp: 2.448, PnR_Handler: 1.64, PnR_Roll: 0.427, PnR_Pop: 0.265, CatchShoot: 0.937, OffBallScreen: 1.049, DriveKick: 0.745, Cut: 0.9, Handoff: 0.285 },
};

export const PLAY_TYPE_ERAS: readonly PlayTypeEra[] = ['2020s', '2010s', '2000s', '1990s'];
/** 미지정(기존 세션·싱글) 폴백 — 싱글 시작 시즌 2025-26 기준. */
export const DEFAULT_PLAY_TYPE_ERA: PlayTypeEra = '2020s';

export const PLAY_TYPE_ERA_LABELS: Record<PlayTypeEra, string> = {
    '2020s': '2020년대',
    '2010s': '2010년대',
    '2000s': '2000년대',
    '1990s': '1990년대 (클래식)',
};

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
        // 하한 0.5 — 단, base가 0.5보다 낮은 시대(옛 시대 핸드오프 등)는 base 자체가 하한(슬라이더 5에서 끌어올리지 않음)
        weights[pt] = Math.max(Math.min(0.5, base), base + c.inside * insideFactor + c.pnr * pnrFactor + c.bm * bmFactor);
    }
    weights['Transition'] = 0;  // pace 슬라이더로 별도 처리
    return weights;
}
