
// 헤드 코치 전술 성향 (1~10 양극 스케일) — 자동전술 생성에만 영향
export interface HeadCoachPreferences {
    // 공격 철학
    offenseIdentity: number;  // 1=히어로볼 ... 10=시스템농구
    tempo: number;            // 1=하프코트 그라인드 ... 10=런앤건
    scoringFocus: number;     // 1=페인트존 ... 10=3점라인
    pnrEmphasis: number;      // 1=ISO/포스트업 ... 10=PnR헤비

    // 수비 철학
    defenseStyle: number;     // 1=보수적 대인 ... 10=공격적 프레셔
    helpScheme: number;       // 1=1:1 고수 ... 10=적극 로테이션
    zonePreference: number;   // 1=대인 전용 ... 10=존 위주
}

// 공통 코치 능력치 (헤드코치·오펜스·디펜스·디벨롭먼트 동일 — 오프시즌 훈련 효율에만 영향)
export interface CoachAbilities {
    // 훈련 효율 직접 기여
    teaching: number;           // 0~10: 지도력 — 담당 훈련 카테고리 효율의 핵심 가중치
    schemeDepth: number;        // 0~10: 전술 깊이 — 공격/수비/전술 훈련의 깊이 (IQ 계열 성장)
    communication: number;      // 0~10: 소통력 — 훈련 피드백 전달력
    playerEval: number;         // 0~10: 선수 평가 — potential 소프트캡 완화

    // 팀 전체 보정 (globalMult — HC 주력)
    motivation: number;         // 0~10: 동기부여 — 팀 전체 훈련 참여도
    playerRelation: number;     // 0~10: 선수 관계 — 훈련 흡수율
    adaptability: number;       // 0~10: 적응력 — 다양한 아키타입 선수 균등 훈련

    // 젊은 선수 특화 (Dev 주력)
    developmentVision: number;  // 0~10: 성장 비전 — age≤25 훈련 효율 추가 배율
    experienceTransfer: number; // 0~10: 경험 전수 — age≤22 훈련 효율 추가 배율

    // 전술 훈련 효율 (HC + Dev 주력)
    mentalCoaching: number;     // 0~10: 멘탈 코칭 — offTactics/defTactics 훈련 효율
}

// 트레이닝 코치 전용 능력치 (신체/의료 전문)
export interface TrainingCoachAbilities {
    athleticTraining: number;  // 0~10: 신체 훈련 — 폭발력 훈련 효율 주력
    recovery: number;          // 0~10: 회복 관리 — 훈련 후 부상 위험 감소
    conditioning: number;      // 0~10: 컨디셔닝 — 근력·지구력 훈련 효율 주력
}

export interface HeadCoach {
    id: string;
    name: string;
    preferences: HeadCoachPreferences;
    abilities: CoachAbilities;
    contractYears: number;
    contractSalary: number;
    contractYearsRemaining: number;
}

export interface OffenseCoordinator {
    id: string;
    name: string;
    abilities: CoachAbilities;
    contractYears: number;
    contractSalary: number;
    contractYearsRemaining: number;
}

export interface DefenseCoordinator {
    id: string;
    name: string;
    abilities: CoachAbilities;
    contractYears: number;
    contractSalary: number;
    contractYearsRemaining: number;
}

export interface DevelopmentCoach {
    id: string;
    name: string;
    abilities: CoachAbilities;
    contractYears: number;
    contractSalary: number;
    contractYearsRemaining: number;
}

export interface TrainingCoach {
    id: string;
    name: string;
    abilities: TrainingCoachAbilities;
    contractYears: number;
    contractSalary: number;
    contractYearsRemaining: number;
}

// 팀 코칭 스태프 전체 (모든 슬롯 optional — 빈 슬롯은 훈련 효율 50% 기본값)
export interface CoachingStaff {
    headCoach:            HeadCoach | null;
    offenseCoordinator:   OffenseCoordinator | null;
    defenseCoordinator:   DefenseCoordinator | null;
    developmentCoach:     DevelopmentCoach | null;
    trainingCoach:        TrainingCoach | null;
}

// 코치 FA 풀 (saves에 저장)
export interface CoachFAPool {
    headCoaches:         HeadCoach[];
    offenseCoordinators: OffenseCoordinator[];
    defenseCoordinators: DefenseCoordinator[];
    developmentCoaches:  DevelopmentCoach[];
    trainingCoaches:     TrainingCoach[];
}

export type StaffRole =
    | 'headCoach'
    | 'offenseCoordinator'
    | 'defenseCoordinator'
    | 'developmentCoach'
    | 'trainingCoach';

// 30팀 코칭 데이터 (saves 테이블 저장용)
export type LeagueCoachingData = Record<string, CoachingStaff>; // teamId → CoachingStaff
