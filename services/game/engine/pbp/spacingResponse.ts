import type { LivePlayer, TeamState } from './pbpTypes';
import type { TacticalSliders } from '../../../../types';
import type { PlayTypeEra } from '../../../../types/simSettings';
import { SIM_CONFIG } from '../../config/constants';
import { resolvePlayTypeEra } from '../../config/playTypeProfiles';

/**
 * [2026-11-11] 스페이싱 반응 (SPACING_RESPONSE) — server 미러: server/src/shared/engine/pbp/spacingResponse.ts
 *
 * 수비가 공격 라인업의 외곽 위협(스페이싱)에 반응한다. 포세션마다 슛하는 선수를 뺀 오프볼 4명의
 * 외곽 위협 평균(스페이싱 지수 S)을 재고, 그 시대의 보통 라인업(REF_BY_ERA)과 비교한 편차 dev로
 *   ① 헬프 시도 확률 × (1 + HELP_MULT·dev)        — 비슈터를 두고 더 자주 돕는다
 *   ② 림 프로텍터 개입 확률 + PROTECTOR_SHIFT·dev  — 빅맨이 비슈터 마크맨을 버리고 페인트에 머문다
 *   ③ 림·페인트 성공률 − SAG·dev                   — 수비가 한 발씩 안쪽에 서는 기하학(세깅), 킥아웃 슛 제외
 * 를 조정한다. dev > 0 = 보통보다 좁음(수비가 과감), dev < 0 = 보통보다 넓음(수비가 조심).
 *
 * 적용 범위: 맨투맨 하프코트만. 지역방어는 자기 내곽 억제·3점 오픈 대가가 있어 이중 부과를 피하고,
 * 속공은 수비가 서 있지 않다. 3점 슛에는 아무것도 걸지 않는다(실제도 3점은 비중과 성공률이 무관).
 * 공격의 플레이·존 선택과 선수 성향은 바꾸지 않는다 — 수비가 응답할 뿐이다.
 *
 * 위협 = 능력 × 의지: 능력 = clamp((threeVal − 50)/35, 0, 1), 의지 = 현재 공격 슬라이더에서 오픈 시
 * 3점을 택할 확률(playTypes.selectZone과 같은 산식: 성향 × 슬라이더 배율, 3점 성향 < 0.15는 ×0.2).
 *
 * 근거·측정(하네스, NBA Active 4시즌): 같은 로스터 교차 실험의 인사이드 극단 우위 +1.49/100 → −0.04,
 * 리그 득점·3PA·TS·3점 효율·스타 득점비 불변, helpDef 10 순이득 불변(+0.63 → +0.71 ±0.2),
 * 레전드 리그는 시대 기준으로 중립. 상세 docs/plan/spacing-help-plan.md, dev-log 2026-11-11.
 */
export const SPACING_RESPONSE = {
    ENABLED: true,                 // false면 dev = 0 → 현행과 동일
    THREE_CAP_MIN: 50,             // threeVal 50 이하 = 외곽 위협 0
    THREE_CAP_MAX: 85,             // 85 이상 = 1
    /** 시대별 보통 라인업의 스페이싱 지수 — 2020s(NBA Active 중립 0.366·유저 전술 0.363)·1990s(PBL 0.257·Test 0.263) 측정, 2010s·2000s는 보간 추정 */
    REF_BY_ERA: { '2020s': 0.365, '2010s': 0.33, '2000s': 0.29, '1990s': 0.26 } as Record<PlayTypeEra, number>,
    DEV_CAP: 1.0,                  // (ref − S)/ref 클램프
    HELP_MULT: 1.0,                // 헬프 빈도 반응 기울기
    HELP_MULT_MIN: 0.5,
    HELP_MULT_MAX: 2.0,
    HELP_ATTEMPT_CAP: 0.95,
    PROTECTOR_SHIFT: 0.25,         // 프로텍터 체류 기울기
    SAG: 0.04,                     // 세깅 기울기 (H2 — H3는 0.08)
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
