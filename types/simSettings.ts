
export interface SimSettings {
    // 게임 환경
    homeAdvantage: number;       // 0.00~0.05, 기본 0.02

    // 부상
    injuriesEnabled: boolean;    // 기본 false
    injuryFrequency: number;     // 0.0~3.0, 기본 1.0

    // 트레이드
    tradeMinValueRatio: number;      // 0.70~1.20, 기본 0.95
    cpuTradeBaseProbability: number;  // 0.0~0.5, 기본 0.15

    // 선수 성장/노화
    tcr: number;                 // 레거시 (하위호환) — 사용하지 않음
    growthRate: number;          // 0.0~2.0, 기본 1.0 — 성장 속도 배율
    declineRate: number;         // 0.0~2.0, 기본 1.0 — 노화 속도 배율

    // 엔진 피처
    archetypesEnabled: boolean;  // 기본 false
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
    // 엔진 피처
    {
        key: 'archetypesEnabled',
        type: 'toggle',
        label: '아키타입 시스템',
        description: '12종 선수 아키타입 활성화 (실험적)',
        category: '엔진 피처',
    },
];
