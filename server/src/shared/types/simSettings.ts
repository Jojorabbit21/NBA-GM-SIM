
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

    // [2026-11-08] 시대별 플레이타입 기본 비율 — 세션(리그) 규칙, rooms.sim_settings에 저장. 미지정 = 엔진 폴백 '2020s'.
    // 값 표는 game/config/playTypeProfiles.ts (client 미러 types/simSettings.ts 참조)
    playTypeEra?: PlayTypeEra;

    // [2026-11-17] 방 단위 엔진 프로필 — 이 방의 경기를 어느 엔진으로 돌릴지(세션 설정 엔진 탭, 전역 어드민만 변경).
    // 미지정 = 'stable'(배포 엔진 보관본, server/src/engineSnapshots) → 기존 방은 값이 없어도 지금 엔진 그대로.
    // 'next' = 개발 중인 엔진(server/src/shared/engine). 서버가 경기 직전에 읽는다(server/src/engineProfile.ts).
    engineProfile?: EngineProfile;
}

/** 시대별 플레이타입 프리셋 키 — '1990s' = 클래식(1990년대 이전 포함). */
export type PlayTypeEra = '2020s' | '2010s' | '2000s' | '1990s';

/** 엔진 프로필 키 — 'stable' = 배포 엔진 보관본(기본), 'next' = 개발 중인 엔진(테스트 세션용). */
export type EngineProfile = 'stable' | 'next';
export const ENGINE_PROFILES: EngineProfile[] = ['stable', 'next'];
export const DEFAULT_ENGINE_PROFILE: EngineProfile = 'stable';
export const ENGINE_PROFILE_LABELS: Record<EngineProfile, string> = { stable: '기본', next: '테스트' };
/** sim_settings.engineProfile 해석 — 값이 없거나 모르는 값이면 기본(stable). */
export function resolveEngineProfile(v: unknown): EngineProfile {
    return v === 'next' ? 'next' : DEFAULT_ENGINE_PROFILE;
}
/** 테스트 세션 여부 — 엔진 프로필을 '테스트'(next)로 명시한 방. 포인트(BP)·도전 과제·통산 기록을 전부 남기지 않는다(사용자 결정 2026-11-17).
 *  해석값이 아니라 저장된 값을 본다 — 나중에 기본 프로필이 next 로 바뀌어도, 값을 명시하지 않은 일반 방은 테스트 세션이 아니다. */
export function isTestSession(simSettings: { engineProfile?: unknown } | null | undefined): boolean {
    return simSettings?.engineProfile === 'next';
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
