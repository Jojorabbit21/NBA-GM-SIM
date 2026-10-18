
import { TacticalSliders } from '../../../../types';
import { computePlayTypeWeights } from '../../../../services/game/config/playTypeProfiles';

// 10개 하프코트 플레이타입 (차트/UI 표시용)
export const PLAY_TYPES = [
    { key: 'PnR_Handler',   label: '픽앤롤 (핸들러)', color: '#3b82f6' },
    { key: 'PnR_Roll',      label: '픽앤롤 (롤)',     color: '#60a5fa' },
    { key: 'PnR_Pop',       label: '픽앤롤 (팝)',     color: '#93c5fd' },
    { key: 'CatchShoot',    label: '캐치 앤 슛',      color: '#10b981' },
    { key: 'DriveKick',     label: '드라이브 킥',     color: '#34d399' },
    { key: 'Iso',           label: '아이솔레이션',    color: '#f97316' },
    { key: 'PostUp',        label: '포스트업',         color: '#ef4444' },
    { key: 'Cut',           label: '컷인',             color: '#d946ef' },
    { key: 'OffBallScreen', label: '오프볼 스크린',   color: '#a78bfa' },
    { key: 'Handoff',       label: '핸드오프',         color: '#fbbf24' },
];

// 플레이타입별 능력치 매핑 (차트 비교용)
export const PLAY_ATTR_MAP: Record<string, { attrs: string[]; weights: number[] }> = {
    PnR_Handler:   { attrs: ['handling', 'passIq', 'speed'], weights: [0.4, 0.35, 0.25] },
    PnR_Roll:      { attrs: ['ins', 'strength', 'vertical', 'hands'], weights: [0.3, 0.3, 0.2, 0.2] },
    PnR_Pop:       { attrs: ['out', 'shotIq', 'offConsist'], weights: [0.5, 0.3, 0.2] },
    CatchShoot:    { attrs: ['out', 'shotIq', 'offConsist'], weights: [0.5, 0.3, 0.2] },
    DriveKick:     { attrs: ['speed', 'handling', 'passIq'], weights: [0.35, 0.35, 0.3] },
    Iso:           { attrs: ['handling', 'midRange', 'speed', 'agility'], weights: [0.3, 0.25, 0.25, 0.2] },
    PostUp:        { attrs: ['ins', 'strength', 'hands', 'postPlay'], weights: [0.35, 0.3, 0.2, 0.15] },
    Cut:           { attrs: ['speed', 'agility', 'ins', 'vertical'], weights: [0.25, 0.25, 0.3, 0.2] },
    OffBallScreen: { attrs: ['out', 'offBallMovement', 'shotIq'], weights: [0.4, 0.35, 0.25] },
    Handoff:       { attrs: ['out', 'handling', 'shotIq'], weights: [0.4, 0.3, 0.3] },
};

// 슬라이더 → 플레이타입 분포 (%) 산출
export const getPlayTypeDistribution = (sliders: TacticalSliders): number[] => {
    const weights = computePlayTypeWeights(sliders);
    const ordered = PLAY_TYPES.map(pt => weights[pt.key] || 0);
    const total = ordered.reduce((s, v) => s + v, 0);
    return ordered.map(w => total > 0 ? (w / total) * 100 : 10);
};

// ── [2026-10-18] 속공 포함 11종 (멀티 전술 화면 "플레이타입 분석" + "PPP") ──────────────
// 엔진은 매 공격마다 먼저 속공 여부를 pace × 3% 확률로 정하고(possessionHandler.ts "Add Transition chance
// based on Pace"), 아니면 하프코트 10종을 가중치로 고른다. 화면에선 이 2단계 구조를 드러내지 않고 11종을
// 한 목록으로 보여준다. 수비 리바운드 직후 공격의 defReb 보너스는 그 공격 비율에 따라 달라 예상치에선 생략.
export const TRANSITION_PLAY_TYPE = { key: 'Transition', label: '속공', color: '#22d3ee' } as const;
export const PLAY_TYPES_WITH_TRANSITION = [TRANSITION_PLAY_TYPE, ...PLAY_TYPES];

/** 슬라이더 → 11종 예상 비중(%) — 속공 = pace × 3%, 나머지 10종 = 하프코트 비중 × (1 − 속공) */
export const getFullPlayTypeDistribution = (sliders: TacticalSliders): number[] => {
    const transition = Math.max(0, Math.min(1, sliders.pace * 0.03));
    const halfCourt = getPlayTypeDistribution(sliders);
    return [transition * 100, ...halfCourt.map(p => p * (1 - transition))];
};
