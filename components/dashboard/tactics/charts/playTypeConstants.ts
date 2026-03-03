
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
