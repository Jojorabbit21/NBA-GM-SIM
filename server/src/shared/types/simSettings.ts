
import type { LeagueContext } from '../engine/pbp/leagueNormalization.ts';

export interface SimSettings {
    homeAdvantage: number;

    injuriesEnabled: boolean;
    injuryFrequency: number;
    majorInjuryFrequency: number;

    suspensionsEnabled: boolean;
    suspensionFrequency: number;

    tradeMinValueRatio: number;
    cpuTradeBaseProbability: number;

    tcr: number;
    growthRate: number;
    declineRate: number;

    garbageTimeEnabled: boolean;

    archetypesEnabled: boolean;

    // League-relative normalization
    normalizationStrength?: number;   // 0~1, UI slider override for k
    leagueContext?: LeagueContext;    // computed at sim start, injected here

    // Fatigue recovery / back-to-back (multiplayer only — docs/plan/multiplayer-fatigue.md).
    // Defaults live in MULTI_FATIGUE_DEFAULTS, NOT DEFAULT_SIM_SETTINGS (single merges that and must keep B2B ×1.5).
    fatigueOvernightKeep?: number;   // deficit fraction kept at midnight after a game day (0.3~0.7)
    fatigueRestDayKeep?: number;     // deficit fraction kept at midnight of a rest day (0.1~0.5)
    fatigueB2BMultiplier?: number;   // B2B drain multiplier (1.0~1.5, engine fallback 1.5)
    fatigueDrainMultiplier?: number; // [2026-10-26] in-game drain multiplier applied to all drain (0.5~1.5, default 1.0, engine fallback 1.0)

    // Server batch sim only: allow AI auto-timeouts for both home/away (unset=false; single/live keep skipping the user team)
    autoTimeoutAllTeams?: boolean;

    // [2026-10-26] 연장전 — 4쿼터 동점이면 5분 연장(최대 2회, 그래도 동점이면 결승 공격). 미지정 = false = 기존
    // 버저비터 방식. 멀티는 leagues.overtime_enabled를 simRunner/postAllStarGame이 주입 — 칼럼 기본값은 P3(경기별
    // 공개 시각) 완료와 함께 2026-10-26 true로 변경(새 리그부터, 이전 리그는 false 유지). 싱글은 미지정(off) — P4 표시 작업 후 검토.
    // docs/plan/overtime-system.md
    overtimeEnabled?: boolean;
}

// ── Multiplayer fatigue defaults/ranges (mirror of types/simSettings.ts) ──
export const MULTI_FATIGUE_DEFAULTS = {
    fatigueOvernightKeep: 0.5,
    fatigueRestDayKeep: 0.25,
    fatigueB2BMultiplier: 1.3,
    fatigueDrainMultiplier: 1.0,
} as const;

export const MULTI_FATIGUE_RANGES = {
    fatigueOvernightKeep: { min: 0.3, max: 0.7, step: 0.05 },
    fatigueRestDayKeep:   { min: 0.1, max: 0.5, step: 0.05 },
    fatigueB2BMultiplier: { min: 1.0, max: 1.5, step: 0.05 },
    fatigueDrainMultiplier: { min: 0.5, max: 1.5, step: 0.05 },
} as const;

export type MultiFatigueSettings = { -readonly [K in keyof typeof MULTI_FATIGUE_DEFAULTS]: number };

/** Resolve multiplayer fatigue settings from room sim_settings — missing/out-of-range → default/clamped. */
export function resolveMultiFatigueSettings(s: Partial<SimSettings> | null | undefined): MultiFatigueSettings {
    const pick = (key: keyof typeof MULTI_FATIGUE_DEFAULTS): number => {
        const v = s?.[key];
        const { min, max } = MULTI_FATIGUE_RANGES[key];
        return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : MULTI_FATIGUE_DEFAULTS[key];
    };
    return {
        fatigueOvernightKeep: pick('fatigueOvernightKeep'),
        fatigueRestDayKeep: pick('fatigueRestDayKeep'),
        fatigueB2BMultiplier: pick('fatigueB2BMultiplier'),
        fatigueDrainMultiplier: pick('fatigueDrainMultiplier'),
    };
}

export const DEFAULT_SIM_SETTINGS: SimSettings = {
    homeAdvantage: 0.005,   // [2026-10-27] 0.02 → 0.005 (사용자 결정, client 미러 참조)
    injuriesEnabled: false,
    injuryFrequency: 1.0,
    majorInjuryFrequency: 1.0,
    suspensionsEnabled: true,
    suspensionFrequency: 1.0,
    tradeMinValueRatio: 0.95,
    cpuTradeBaseProbability: 0.15,
    tcr: 1.0,
    growthRate: 1.0,
    declineRate: 1.0,
    garbageTimeEnabled: true,
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
