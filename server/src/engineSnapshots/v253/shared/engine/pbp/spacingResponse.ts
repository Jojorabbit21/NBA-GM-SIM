import type { LivePlayer, TeamState } from './pbpTypes.ts';
import type { TacticalSliders } from '../../types.ts';
import type { PlayTypeEra } from '../../types/simSettings.ts';
import { SIM_CONFIG } from '../../game/config/constants.ts';
import { resolvePlayTypeEra } from '../../game/config/playTypeProfiles.ts';

/**
 * [2026-11-11] 스페이싱 반응 (SPACING_RESPONSE) — client 미러 services/game/engine/pbp/spacingResponse.ts (상세 주석은 그쪽).
 * 오프볼 4명의 외곽 위협 평균(스페이싱 지수 S)을 시대 기준(REF_BY_ERA)과 비교한 편차 dev로
 * ① 헬프 시도 확률 × (1 + HELP_MULT·dev) ② 림 프로텍터 개입 + PROTECTOR_SHIFT·dev ③ 림·페인트 성공률 − SAG·dev(킥아웃 제외).
 * 맨투맨 하프코트만, 3점에는 미적용. 상세 docs/plan/spacing-help-plan.md.
 */
export const SPACING_RESPONSE = {
    ENABLED: true,                 // false면 dev = 0 → 현행과 동일
    THREE_CAP_MIN: 50,
    THREE_CAP_MAX: 85,
    REF_BY_ERA: { '2020s': 0.365, '2010s': 0.33, '2000s': 0.29, '1990s': 0.26 } as Record<PlayTypeEra, number>,
    DEV_CAP: 1.0,
    HELP_MULT: 1.0,
    HELP_MULT_MIN: 0.5,
    HELP_MULT_MAX: 2.0,
    HELP_ATTEMPT_CAP: 0.95,
    PROTECTOR_SHIFT: 0.25,
    SAG: 0.04,
    SAG_CAP: 0.05,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 스페이싱 지수 S: 액터를 뺀 오프볼 선수들의 (3점 능력 계수 × 오픈 시 3점 선택 확률) 평균, 0~1 */
export function computeSpacingIndex(offTeam: TeamState, actor: LivePlayer, sliders: TacticalSliders): number {
    const cfg = SPACING_RESPONSE;
    const zs = SIM_CONFIG.ZONE_SELECTION;
    const sens = zs.SLIDER_SENSITIVITY;
    let sum = 0, n = 0;
    for (const p of offTeam.onCourt) {
        if (p.playerId === actor.playerId) continue;
        const pref3raw = p.zonePref.three;
        const pref3 = pref3raw < zs.THREE_PREF_THRESHOLD ? pref3raw * 0.2 : pref3raw;   // selectZone 소량 선호 규칙
        const s3 = pref3 * (1 + (sliders.shot_3pt - 5) / 5 * sens);
        const sMid = p.zonePref.mid * (1 + (sliders.shot_mid - 5) / 5 * sens);
        const sIn = (p.zonePref.itp + p.zonePref.ra) * (1 + (sliders.shot_rim - 5) / 5 * sens);
        const tot = s3 + sMid + sIn;
        const p3 = tot > 0 ? s3 / tot : 0;
        const cap3 = clamp((p.attr.threeVal - cfg.THREE_CAP_MIN) / (cfg.THREE_CAP_MAX - cfg.THREE_CAP_MIN), 0, 1);
        sum += cap3 * p3; n++;
    }
    return n > 0 ? sum / n : 0;
}

/** 스페이싱 편차 dev = clamp((ref − S)/ref, ±DEV_CAP). applies = 맨투맨 하프코트 포세션. 꺼져 있거나 적용 대상이 아니면 0 */
export function computeSpacingDev(spacingIndex: number, era: PlayTypeEra | undefined | null, applies: boolean): number {
    const cfg = SPACING_RESPONSE;
    if (!cfg.ENABLED || !applies) return 0;
    const ref = cfg.REF_BY_ERA[resolvePlayTypeEra(era)];
    return clamp((ref - spacingIndex) / ref, -cfg.DEV_CAP, cfg.DEV_CAP);
}

/** ① 헬프 빈도 반응 — 헬프 시도 확률에 곱하는 배율 */
export function spacingHelpMult(spacingDev: number): number {
    const cfg = SPACING_RESPONSE;
    return clamp(1 + cfg.HELP_MULT * spacingDev, cfg.HELP_MULT_MIN, cfg.HELP_MULT_MAX);
}

/** ③ 세깅 — 림·페인트 슛의 성공률 이동(bonusHitRate 가산분). 킥아웃 슛(수비가 흩어진 뒤)은 제외 */
export function spacingSag(spacingDev: number, preferredZone: string, isKickout: boolean): number {
    const cfg = SPACING_RESPONSE;
    if (isKickout || (preferredZone !== 'Rim' && preferredZone !== 'Paint')) return 0;
    return -clamp(cfg.SAG * spacingDev, -cfg.SAG_CAP, cfg.SAG_CAP);
}
