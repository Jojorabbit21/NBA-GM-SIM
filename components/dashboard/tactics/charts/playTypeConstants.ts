
import { TacticalSliders } from '../../../../types';

// Shared play type definitions used by PlayTypePPP, KeyPlayerFit, ShotDistribution, etc.

export const PLAY_TYPES = [
    { key: 'pnr', sliderKey: 'play_pnr' as const, label: '픽앤롤', baseEff: 0.95, color: '#3b82f6' },
    { key: 'iso', sliderKey: 'play_iso' as const, label: '아이솔레이션', baseEff: 0.88, color: '#f97316' },
    { key: 'post', sliderKey: 'play_post' as const, label: '포스트업', baseEff: 0.90, color: '#ef4444' },
    { key: 'cns', sliderKey: 'play_cns' as const, label: '캐치 앤 슛', baseEff: 0.98, color: '#10b981' },
    { key: 'drive', sliderKey: 'play_drive' as const, label: '컷인 & 돌파', baseEff: 1.05, color: '#d946ef' },
];

export const PLAY_ATTR_MAP: Record<string, { attrs: string[]; weights: number[] }> = {
    pnr: { attrs: ['handling', 'passIq', 'ins', 'speed'], weights: [0.3, 0.25, 0.25, 0.2] },
    iso: { attrs: ['handling', 'midRange', 'speed', 'agility'], weights: [0.3, 0.25, 0.25, 0.2] },
    post: { attrs: ['ins', 'strength', 'hands', 'postPlay'], weights: [0.35, 0.3, 0.2, 0.15] },
    cns: { attrs: ['out', 'shotIq', 'offConsist'], weights: [0.5, 0.3, 0.2] },
    drive: { attrs: ['speed', 'agility', 'ins', 'vertical'], weights: [0.25, 0.25, 0.3, 0.2] },
};

// Helper: Get play type distribution % from sliders
export const getPlayTypeDistribution = (sliders: TacticalSliders): number[] => {
    const rawWeights = PLAY_TYPES.map(pt => sliders[pt.sliderKey] || 5);
    const totalWeight = rawWeights.reduce((s, v) => s + v, 0);
    return rawWeights.map(w => (w / totalWeight) * 100);
};
