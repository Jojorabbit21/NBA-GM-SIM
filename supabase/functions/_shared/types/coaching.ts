
// 헤드 코치 전술 성향 (1~10 양극 스케일) — 자동전술 생성에만 영향
export interface HeadCoachPreferences {
    offenseIdentity: number;
    tempo: number;
    scoringFocus: number;
    pnrEmphasis: number;

    defenseStyle: number;
    helpScheme: number;
    zonePreference: number;
}

export interface CoachAbilities {
    teaching: number;
    schemeDepth: number;
    communication: number;
    playerEval: number;
    motivation: number;
    playerRelation: number;
    adaptability: number;
    developmentVision: number;
    experienceTransfer: number;
    mentalCoaching: number;

    athleticTraining: number;
    recovery: number;
    conditioning: number;
}

export interface Coach {
    id: string;
    name: string;
    age: number;
    abilities: CoachAbilities;
    preferences: HeadCoachPreferences;
    contractYears: number;
    contractSalary: number;
    contractYearsRemaining: number;
}

export type HeadCoach          = Coach;
export type OffenseCoordinator = Coach;
export type DefenseCoordinator = Coach;
export type DevelopmentCoach   = Coach;
export type TrainingCoach      = Coach;

export interface CoachingStaff {
    headCoach?:            Coach | null;
    offenseCoordinator?:   Coach | null;
    defenseCoordinator?:   Coach | null;
    developmentCoach?:     Coach | null;
    trainingCoach?:        Coach | null;
}

export interface CoachFAPool {
    coaches: Coach[];
}

export type StaffRole =
    | 'headCoach'
    | 'offenseCoordinator'
    | 'defenseCoordinator'
    | 'developmentCoach'
    | 'trainingCoach';

export type LeagueCoachingData = Record<string, CoachingStaff>;
