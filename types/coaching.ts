
// 헤드 코치 전술 성향 (1~10 양극 스케일)
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

export interface HeadCoach {
    id: string;
    name: string;
    preferences: HeadCoachPreferences;
    contractYears: number;
    contractSalary: number;        // 연봉 (달러)
    contractYearsRemaining: number;
}

// 전체 코칭 스태프 (현재는 헤드 코치만)
export interface CoachingStaff {
    headCoach: HeadCoach | null;
}

// 30팀 코칭 데이터 (saves 테이블 저장용)
export type LeagueCoachingData = Record<string, CoachingStaff>; // teamId → CoachingStaff
