
import type { LeagueContext } from '../services/game/engine/pbp/leagueNormalization';

export interface SimSettings {
    // 게임 환경
    homeAdvantage: number;       // 0.00~0.05, 기본 0.02

    // 부상
    injuriesEnabled: boolean;    // 기본 false
    injuryFrequency: number;     // 0.0~3.0, 기본 1.0
    majorInjuryFrequency: number; // 0.0~3.0, 기본 1.0 — 부상 중 Major/Season-Ending 비중 배율

    // 출장정지 (싸움)
    suspensionsEnabled: boolean;  // 기본 true (기존 동작 유지 — 항상 켜져 있던 기능)
    suspensionFrequency: number;  // 0.0~3.0, 기본 1.0

    // 트레이드
    tradeMinValueRatio: number;      // 0.70~1.20, 기본 0.95
    cpuTradeBaseProbability: number;  // 0.0~0.5, 기본 0.15

    // 선수 성장/노화
    tcr: number;                 // 레거시 (하위호환) — 사용하지 않음
    growthRate: number;          // 0.0~2.0, 기본 1.0 — 성장 속도 배율
    declineRate: number;         // 0.0~2.0, 기본 1.0 — 노화 속도 배율

    // 가비지타임
    garbageTimeEnabled: boolean; // 기본 true (기존 동작 유지)

    // 엔진 피처
    archetypesEnabled: boolean;  // 기본 false

    // League-relative normalization
    normalizationStrength?: number;   // 0~1, UI slider override for k
    // 세션 설정 화면(리그 상대 정규화 강도 0~5 슬라이더)이 저장하는 실제 필드 —
    // normalizationStrength와 별개로, resolveNormalizationContext()(leagueNormalization.ts)가
    // 읽는 { enabled, k } 오버라이드. enabled=false면 정규화 자체를 끔.
    normalization?: { enabled?: boolean; k?: number; muRef?: number };
    leagueContext?: LeagueContext;    // computed at sim start, injected here

    // 체력 회복/백투백 (멀티플레이어 전용 — docs/plan/multiplayer-fatigue.md)
    // 싱글은 이 키를 쓰지 않는다. 기본값은 DEFAULT_SIM_SETTINGS가 아니라 MULTI_FATIGUE_DEFAULTS에 있다
    // (DEFAULT_SIM_SETTINGS는 싱글도 병합해 쓰므로 여기 넣으면 싱글 백투백 배율이 바뀜).
    fatigueOvernightKeep?: number;   // 경기를 뛴 날 자정에 남는 체력 부족분 비율 (0.3~0.7)
    fatigueRestDayKeep?: number;     // 경기 없는 날 자정에 남는 체력 부족분 비율 (0.1~0.5)
    fatigueB2BMultiplier?: number;   // 백투백 경기 체력 소모 배율 (1.0~1.5, 엔진 폴백 1.5 = 싱글 값)

    // 서버 배치 시뮬 전용: 홈/원정 모두 AI 자동 타임아웃 허용 (미지정=false, 싱글/라이브는 유저 팀 스킵 유지)
    autoTimeoutAllTeams?: boolean;

    // [2026-10-26] 연장전 — 4쿼터 동점이면 5분 연장(최대 2회, 그래도 동점이면 결승 공격). 미지정 = false = 기존
    // 버저비터 방식. 멀티는 leagues.overtime_enabled를 simRunner/postAllStarGame이 주입 — 칼럼 기본값은 P3(경기별
    // 공개 시각) 완료와 함께 2026-10-26 true로 변경(새 리그부터, 이전 리그는 false 유지). 싱글은 미지정(off) — P4 표시 작업 후 검토.
    // docs/plan/overtime-system.md
    overtimeEnabled?: boolean;
}

// ── 멀티플레이어 체력 설정 기본값/범위 (server/src/shared/types/simSettings.ts 미러) ──
// 근거: 정규시즌 1,230경기 시뮬(docs/plan/multiplayer-fatigue.md 3-8).
export const MULTI_FATIGUE_DEFAULTS = {
    fatigueOvernightKeep: 0.5,
    fatigueRestDayKeep: 0.25,
    fatigueB2BMultiplier: 1.3,
} as const;

export const MULTI_FATIGUE_RANGES = {
    fatigueOvernightKeep: { min: 0.3, max: 0.7, step: 0.05 },
    fatigueRestDayKeep:   { min: 0.1, max: 0.5, step: 0.05 },
    fatigueB2BMultiplier: { min: 1.0, max: 1.5, step: 0.05 },
} as const;

export type MultiFatigueSettings = { -readonly [K in keyof typeof MULTI_FATIGUE_DEFAULTS]: number };

/** 멀티 리그 sim_settings에서 체력 설정을 해석 — 키가 없거나 범위 밖이면 기본값/경계값. */
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
    };
}

export const DEFAULT_SIM_SETTINGS: SimSettings = {
    homeAdvantage: 0.02,
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
    normalizationStrength: 0.7,
};

// ── UI 렌더링용 메타데이터 ──

export type SettingType = 'number' | 'toggle';

export interface SimSettingMeta {
    key: keyof SimSettings;
    type: SettingType;
    label: string;
    description: string;
    category: string;
    // number 타입 전용
    min?: number;
    max?: number;
    step?: number;
}

// ── 리그 상대 정규화 강도(0~5) — { enabled, k } 매핑 ──
// 0은 정규화 자체를 끄고(resolveNormalizationContext가 leagueContext를 undefined로
// 만들어 shift 계산을 건너뜀), 1~5는 k(0~1) 압축 강도. 기본값(레벨3=0.7)은
// SIM_CONFIG.NORMALIZATION.DEFAULT_K와 동일. 멀티플레이어 리그 생성 모달과
// 세션 설정 화면 양쪽에서 공유한다.
export const NORMALIZATION_LEVELS: { enabled: boolean; k: number; label: string }[] = [
    { enabled: false, k: 0,    label: '끔' },       // 0
    { enabled: true,  k: 0.3,  label: '약하게' },    // 1
    { enabled: true,  k: 0.5,  label: '약간 약하게' }, // 2
    { enabled: true,  k: 0.7,  label: '기본' },      // 3
    { enabled: true,  k: 0.85, label: '강하게' },    // 4
    { enabled: true,  k: 1.0,  label: '최대' },      // 5
];

export const DEFAULT_NORMALIZATION_LEVEL = 3;

export const SIM_SETTINGS_META: SimSettingMeta[] = [
    // 게임 환경
    {
        key: 'homeAdvantage',
        type: 'number',
        label: '홈코트 어드밴티지',
        description: '홈팀에 부여되는 FG% 보너스',
        category: '게임 환경',
        min: 0, max: 0.05, step: 0.005,
    },
    // 부상
    {
        key: 'injuriesEnabled',
        type: 'toggle',
        label: '부상 시스템',
        description: '경기 중 부상 발생 활성화',
        category: '부상',
    },
    {
        key: 'injuryFrequency',
        type: 'number',
        label: '부상 빈도 배율',
        description: '부상 발생 빈도 조절 (1.0 = 기본)',
        category: '부상',
        min: 0, max: 2.0, step: 0.1,
    },
    {
        key: 'majorInjuryFrequency',
        type: 'number',
        label: '중대 부상 비율',
        description: '부상 중 Major/Season-Ending 비중 배율 (1.0 = 기본, 0 = 전부 경미한 부상)',
        category: '부상',
        min: 0, max: 2.0, step: 0.1,
    },
    // 출장정지 (싸움)
    {
        key: 'suspensionsEnabled',
        type: 'toggle',
        label: '출장정지 시스템',
        description: '경기 중 다혈질 선수의 싸움/출장정지 이벤트 활성화',
        category: '출장정지',
    },
    {
        key: 'suspensionFrequency',
        type: 'number',
        label: '출장정지 빈도 배율',
        description: '싸움/출장정지 발생 빈도 조절 (1.0 = 기본)',
        category: '출장정지',
        min: 0, max: 3.0, step: 0.1,
    },
    // 트레이드
    {
        key: 'tradeMinValueRatio',
        type: 'number',
        label: '트레이드 수락 기준',
        description: '상대 팀의 최소 가치 비율 (낮을수록 트레이드 쉬움)',
        category: '트레이드',
        min: 0.70, max: 1.20, step: 0.05,
    },
    {
        key: 'cpuTradeBaseProbability',
        type: 'number',
        label: 'CPU 트레이드 확률',
        description: 'CPU 팀 간 일일 트레이드 발생 기본 확률',
        category: '트레이드',
        min: 0, max: 0.5, step: 0.05,
    },
    // 선수 성장/노화
    {
        key: 'growthRate',
        type: 'number',
        label: '성장 속도',
        description: '선수 능력치 성장 속도 배율 (1.0 = 기본)',
        category: '선수 성장',
        min: 0, max: 2.0, step: 0.1,
    },
    {
        key: 'declineRate',
        type: 'number',
        label: '노화 속도',
        description: '선수 능력치 노화/퇴화 속도 배율 (1.0 = 기본)',
        category: '선수 성장',
        min: 0, max: 2.0, step: 0.1,
    },
    // 가비지타임
    {
        key: 'garbageTimeEnabled',
        type: 'toggle',
        label: '가비지타임 자동 벤치',
        description: 'Q4 대량 점수차 시 주전 자동 벤치 및 후보 투입 활성화',
        category: '가비지타임',
    },
    // 엔진 피처
    {
        key: 'archetypesEnabled',
        type: 'toggle',
        label: '아키타입 시스템',
        description: '12종 선수 아키타입 활성화 (실험적)',
        category: '엔진 피처',
    },
    {
        key: 'normalizationStrength',
        type: 'number',
        label: '리그 평준화 강도',
        description: '리그 평균 대비 능력치 압축 강도 (0=끔, 1=완전 평준화)',
        category: '엔진 피처',
        min: 0, max: 1, step: 0.05,
    },
];
