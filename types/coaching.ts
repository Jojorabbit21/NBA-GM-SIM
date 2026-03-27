
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

/**
 * 모든 코치 공통 능력치 (슬롯 무관 — 13개 필드).
 * HC/OC/DC/Dev/Trainer 구분 없이 동일한 능력치 집합을 보유.
 * 트레이너 슬롯에 배치된 코치는 athleticTraining/recovery/conditioning 값이 높은 경향.
 */
export interface CoachAbilities {
    // 코칭 능력치 (10개)
    teaching: number;           // 지도력 — 훈련 효율 핵심
    schemeDepth: number;        // 전술 깊이 — IQ 계열 성장
    communication: number;      // 소통력 — 피드백 전달력
    playerEval: number;         // 선수 평가 — potential 소프트캡 완화
    motivation: number;         // 동기부여 — 팀 전체 훈련 참여도
    playerRelation: number;     // 선수 관계 — 훈련 흡수율
    adaptability: number;       // 적응력 — 다양한 아키타입 균등 훈련
    developmentVision: number;  // 성장 비전 — age≤25 효율 추가 배율
    experienceTransfer: number; // 경험 전수 — age≤22 효율 추가 배율
    mentalCoaching: number;     // 멘탈 코칭 — offTactics/defTactics 훈련 효율

    // 메디컬/신체 훈련 능력치 (3개)
    athleticTraining: number;   // 신체 훈련 — 폭발력 훈련 효율
    recovery: number;           // 회복 관리 — 부상 위험 감소
    conditioning: number;       // 컨디셔닝 — 근력·지구력 훈련 효율
}

/** 슬롯 무관 단일 코치 타입. 어떤 슬롯에 배치할지는 GM이 결정. */
export interface Coach {
    id: string;
    name: string;
    abilities: CoachAbilities;
    preferences?: HeadCoachPreferences; // HC 슬롯 배치 시에만 의미 있음
    contractYears: number;
    contractSalary: number;
    contractYearsRemaining: number;
}

// 슬롯별 타입 — 모두 Coach와 동일 (하위 호환용 별칭)
export type HeadCoach          = Coach;
export type OffenseCoordinator = Coach;
export type DefenseCoordinator = Coach;
export type DevelopmentCoach   = Coach;
export type TrainingCoach      = Coach;

// 팀 코칭 스태프 전체 (모든 슬롯 optional — 빈 슬롯은 훈련 효율 50% 기본값)
export interface CoachingStaff {
    headCoach?:            Coach | null;
    offenseCoordinator?:   Coach | null;
    defenseCoordinator?:   Coach | null;
    developmentCoach?:     Coach | null;
    trainingCoach?:        Coach | null;
}

/** FA 코치 풀 — role=null(미배치) 코치 전체. 슬롯 구분 없이 단일 배열. */
export interface CoachFAPool {
    coaches: Coach[];
}

export type StaffRole =
    | 'headCoach'
    | 'offenseCoordinator'
    | 'defenseCoordinator'
    | 'developmentCoach'
    | 'trainingCoach';

// 30팀 코칭 데이터 (saves 테이블 저장용)
export type LeagueCoachingData = Record<string, CoachingStaff>; // teamId → CoachingStaff
