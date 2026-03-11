
export interface SimSettings {
    // 게임 환경
    homeAdvantage: number;       // 0.00~0.05, 기본 0.02

    // 부상
    injuriesEnabled: boolean;    // 기본 false
    injuryFrequency: number;     // 0.0~3.0, 기본 1.0

    // 트레이드
    tradeMinValueRatio: number;      // 0.70~1.20, 기본 0.95
    cpuTradeBaseProbability: number;  // 0.0~0.5, 기본 0.15
    cpuTradeMaxPerDay: number;       // 0~10, 기본 3

    // 선수 성장
    tcr: number;                 // 0.0~2.0, 기본 1.0

    // 엔진 피처
    archetypesEnabled: boolean;  // 기본 false
}

export const DEFAULT_SIM_SETTINGS: SimSettings = {
    homeAdvantage: 0.02,
    injuriesEnabled: false,
    injuryFrequency: 1.0,
    tradeMinValueRatio: 0.95,
    cpuTradeBaseProbability: 0.15,
    cpuTradeMaxPerDay: 3,
    tcr: 1.0,
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
    {
        key: 'cpuTradeMaxPerDay',
        type: 'number',
        label: '일일 최대 CPU 트레이드',
        description: '하루에 발생할 수 있는 최대 CPU 트레이드 수',
        category: '트레이드',
        min: 0, max: 10, step: 1,
    },
    // 선수 성장
    {
        key: 'tcr',
        type: 'number',
        label: '성장/노화 속도 (TCR)',
        description: '선수 성장 및 노화 속도 배율 (1.0 = 기본)',
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
