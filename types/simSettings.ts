
import type { LeagueContext } from '../services/game/engine/pbp/leagueNormalization';

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

    // 가비지타임
    garbageTimeEnabled: boolean; // 기본 true (기존 동작 유지)

    // 엔진 피처
    archetypesEnabled: boolean;  // 기본 false

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
