
// ── 구단주 프로필 ──
export interface OwnerProfile {
    name: string;
    netWorth: number;              // 순자산 ($B)
    spendingWillingness: number;   // 1~10 — 택스 납부 의지
    winNowPriority: number;        // 1~10 — 단기 우승 vs 장기 육성
    marketingFocus: number;        // 1~10 — 수익 극대화 vs 팬 서비스
    patience: number;              // 1~10 — 리빌딩 인내심
}

// ── 마켓 & 경기장 데이터 ──
export interface MarketData {
    metroPopulation: number;       // 광역 인구 (만 명)
    marketTier: 1 | 2 | 3 | 4;    // 대/중대/중소/소
    arenaCapacity: number;         // 좌석 수
    arenaName: string;             // 경기장 이름
    baseTicketPrice: number;       // 기본 입장료 ($)
    localMediaDeal: number;        // 로컬 방송 계약 ($M/년)
    sponsorshipBase: number;       // 기본 스폰서 수익 ($M/년)
}

// ── 팀 재정 정적 데이터 (meta_teams용) ──
export interface TeamFinanceStaticData {
    ownerProfile: OwnerProfile;
    market: MarketData;
}

// ── 구단 재정 상태 (런타임) ──
export interface TeamFinance {
    revenue: {
        gate: number;              // 관중 입장료 수익 (경기별 누적, $M)
        broadcasting: number;      // 중앙 방송 분배금 (시즌 초 확정, $M)
        localMedia: number;        // 로컬 미디어 (시즌 초 확정, $M)
        sponsorship: number;       // 스폰서십 (시즌 초 확정, $M)
        merchandise: number;       // MD 수익 (경기별 누적, $M)
        other: number;             // 기타 수익 ($M)
    };
    expenses: {
        payroll: number;           // 선수 연봉 총액 ($M)
        luxuryTax: number;         // 예상 택스 ($M, 시즌 종료 시 확정)
        operations: number;        // 구장 운영비/스태프 등 고정비 ($M)
        coachSalary: number;       // 감독/코치 연봉 ($M)
        scouting: number;          // 스카우팅/선수 개발비 ($M)
        marketing: number;         // 마케팅/홍보비 ($M)
        administration: number;    // 일반 관리비 — 프런트오피스+원정경비+보험 ($M)
    };
    operatingIncome: number;       // 수익 - 지출 ($M)
    budget: number;                // 시즌 지출 가능 예산 ($M, 구단주 승인)
}

// ── 월별 관중 데이터 ──
export interface MonthlyAttendanceData {
    games: number;
    total: number;
}

// ── 저장용 팀 재정 상태 (saves 테이블) ──
export interface SavedTeamFinances {
    [teamId: string]: {
        revenue: TeamFinance['revenue'];
        expenses: TeamFinance['expenses'];
        budget: number;
        gamesPlayed: number;
        totalAttendance?: number;
        monthlyAttendance?: Record<string, MonthlyAttendanceData>;
    };
}
