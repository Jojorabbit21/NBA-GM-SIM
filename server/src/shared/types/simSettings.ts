
import type { LeagueContext } from '../engine/pbp/leagueNormalization.ts';

export interface SimSettings {
    homeAdvantage: number;

    injuriesEnabled: boolean;
    injuryFrequency: number;

    tradeMinValueRatio: number;
    cpuTradeBaseProbability: number;

    tcr: number;
    growthRate: number;
    declineRate: number;

    archetypesEnabled: boolean;

    // League-relative normalization
    normalizationStrength?: number;   // 0~1, UI slider override for k
    leagueContext?: LeagueContext;    // computed at sim start, injected here
}

export const DEFAULT_SIM_SETTINGS: SimSettings = {
    homeAdvantage: 0.02,
    injuriesEnabled: false,
    injuryFrequency: 1.0,
    tradeMinValueRatio: 0.95,
    cpuTradeBaseProbability: 0.15,
    tcr: 1.0,
    growthRate: 1.0,
    declineRate: 1.0,
    archetypesEnabled: false,
};

export type SettingType = 'number' | 'toggle';

export interface SimSettingMeta {
    key: keyof SimSettings;
    type: SettingType;
    label: string;
    description: string;
    category: string;
    min?: number;
    max?: number;
    step?: number;
}
