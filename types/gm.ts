
export type GMPersonalityType =
    | 'balanced'       // 균형형
    | 'winNow'         // 우승지향
    | 'rebuilder'      // 리빌더
    | 'starHunter'     // 스타 사냥꾼
    | 'valueTrader'    // 가성비 추구
    | 'defenseFocused' // 수비 중시
    | 'youthMovement'; // 유스 무브먼트

export type TeamDirection =
    | 'winNow'    // 올인
    | 'buyer'     // 보강
    | 'standPat'  // 관망
    | 'seller'    // 매도
    | 'tanking';  // 탱킹 (리빌딩)

export interface GMSliders {
    aggressiveness: number;   // 1-10
    starWillingness: number;  // 1-10
    youthBias: number;        // 1-10
    riskTolerance: number;    // 1-10
    pickWillingness: number;  // 1-10
}

export interface GMProfile {
    teamId: string;
    name: string;
    personalityType: GMPersonalityType;
    sliders: GMSliders;
    direction: TeamDirection;
    directionSetDate?: string;
    // User GM only
    firstName?: string;
    lastName?: string;
    birthYear?: number;
    nationality?: string;
}

export type LeagueGMProfiles = Record<string, GMProfile>;

export const GM_PERSONALITY_TYPES: GMPersonalityType[] = [
    'balanced', 'winNow', 'rebuilder', 'starHunter',
    'valueTrader', 'defenseFocused', 'youthMovement',
];

export const GM_PERSONALITY_LABELS: Record<GMPersonalityType, string> = {
    balanced: '균형형',
    winNow: '우승지향',
    rebuilder: '리빌더',
    starHunter: '스타 사냥꾼',
    valueTrader: '가성비 추구',
    defenseFocused: '수비 중시',
    youthMovement: '유스 무브먼트',
};

export const DIRECTION_LABELS: Record<TeamDirection, string> = {
    winNow: '올인',
    buyer: '보강',
    standPat: '관망',
    seller: '매도',
    tanking: '리빌딩',
};

/** 성격별 슬라이더 프리셋 */
export const GM_SLIDER_PRESETS: Record<GMPersonalityType, GMSliders> = {
    balanced:       { aggressiveness: 5, starWillingness: 5, youthBias: 5, riskTolerance: 5, pickWillingness: 5 },
    winNow:         { aggressiveness: 8, starWillingness: 8, youthBias: 3, riskTolerance: 7, pickWillingness: 8 },
    rebuilder:      { aggressiveness: 6, starWillingness: 3, youthBias: 9, riskTolerance: 4, pickWillingness: 2 },
    starHunter:     { aggressiveness: 7, starWillingness: 10, youthBias: 4, riskTolerance: 6, pickWillingness: 7 },
    valueTrader:    { aggressiveness: 4, starWillingness: 4, youthBias: 6, riskTolerance: 3, pickWillingness: 4 },
    defenseFocused: { aggressiveness: 5, starWillingness: 5, youthBias: 5, riskTolerance: 5, pickWillingness: 5 },
    youthMovement:  { aggressiveness: 6, starWillingness: 3, youthBias: 10, riskTolerance: 5, pickWillingness: 3 },
};
