
export type AppView = 'Auth' | 'TeamSelect' | 'Onboarding' | 'Dashboard' | 'Roster' | 'Schedule' | 'Standings' | 'Leaderboard' | 'Transactions' | 'Playoffs' | 'Help' | 'OvrCalculator' | 'Inbox' | 'GameSim' | 'LiveGame' | 'GameResult' | 'DraftBoard' | 'DraftRoom' | 'DraftHistory' | 'DraftLottery' | 'ModeSelect' | 'DraftPoolSelect' | 'PlayerDetail' | 'CoachDetail' | 'GMDetail' | 'HallOfFame' | 'FrontOffice';

export type RosterMode = 'default' | 'custom';
export type DraftPoolType = 'current' | 'alltime';

/** 오프시즌 진행 단계 (null = 인시즌) */
export type OffseasonPhase =
    | null              // 인시즌 (정규시즌 + 포스트시즌)
    | 'POST_FINALS'     // 파이널 종료 → 로터리 대기
    | 'POST_LOTTERY'    // 로터리 완료 → 드래프트 대기
    | 'POST_DRAFT'      // 드래프트 완료 → FA 대기
    | 'FA_OPEN'         // FA 시장 개방
    | 'PRE_SEASON';     // 트레이닝 캠프 이후 → 개막 대기
