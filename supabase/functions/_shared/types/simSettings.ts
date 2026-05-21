
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
