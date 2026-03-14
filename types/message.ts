
import { PlayerBoxScore } from './engine';

// SeasonAwardsContent는 utils/awardVoting.ts에서 직접 export됨
export type { SeasonAwardsContent } from '../utils/awardVoting';

export type MessageType = 'GAME_RECAP' | 'TRADE_ALERT' | 'TRADE_OFFER_RECEIVED' | 'TRADE_OFFER_RESPONSE' | 'INJURY_REPORT' | 'SUSPENSION' | 'LEAGUE_NEWS' | 'SEASON_REVIEW' | 'PLAYOFF_STAGE_REVIEW' | 'SEASON_AWARDS' | 'OWNER_LETTER' | 'HOF_QUALIFICATION' | 'FINALS_MVP' | 'REG_SEASON_CHAMPION' | 'PLAYOFF_CHAMPION' | 'SYSTEM' | 'SCOUT_REPORT';

export type MessageFilterCategory = 'GAME' | 'TRADE' | 'INJURY' | 'SCOUT' | 'LEAGUE' | 'SYSTEM';

export const MESSAGE_FILTER_CATEGORIES: MessageFilterCategory[] = ['GAME', 'TRADE', 'INJURY', 'SCOUT', 'LEAGUE', 'SYSTEM'];

export const MESSAGE_FILTER_MAP: Record<MessageFilterCategory, MessageType[]> = {
    GAME: ['GAME_RECAP', 'PLAYOFF_STAGE_REVIEW'],
    TRADE: ['TRADE_ALERT', 'TRADE_OFFER_RECEIVED', 'TRADE_OFFER_RESPONSE'],
    INJURY: ['INJURY_REPORT', 'SUSPENSION'],
    SCOUT: ['SCOUT_REPORT'],
    LEAGUE: ['LEAGUE_NEWS', 'SEASON_REVIEW', 'SEASON_AWARDS', 'OWNER_LETTER', 'HOF_QUALIFICATION', 'FINALS_MVP', 'REG_SEASON_CHAMPION', 'PLAYOFF_CHAMPION'],
    SYSTEM: ['SYSTEM'],
};

export const MESSAGE_FILTER_LABELS: Record<MessageFilterCategory, string> = {
    GAME: '경기',
    TRADE: '트레이드',
    INJURY: '부상',
    SCOUT: '스카우트',
    LEAGUE: '리그 소식',
    SYSTEM: '시스템',
};

export interface Message {
    id: string;
    user_id: string;
    team_id: string;
    date: string;
    type: MessageType;
    title: string;
    content: any;
    is_read: boolean;
    created_at: string;
}

/** Message metadata without the heavy content JSONB — used for list rendering */
export type MessageListItem = Omit<Message, 'content'>;

export interface GameRecapContent {
    gameId: string;
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number;
    awayScore: number;
    userBoxScore: PlayerBoxScore[];
    /** 플레이오프 경기인 경우에만 존재 */
    playoffInfo?: {
        conference: string;
        roundName: string;
        higherSeedId: string;
        lowerSeedId: string;
        higherSeedName: string;
        lowerSeedName: string;
        higherSeedWins: number;
        lowerSeedWins: number;
    };
}

export interface TradeAlertContent {
    summary: string;
    trades: {
        team1Id: string;
        team1Name: string;
        team2Id: string;
        team2Name: string;
        team1Acquired: { id: string; name: string; ovr: number }[];
        team2Acquired: { id: string; name: string; ovr: number }[];
    }[];
}

export interface InjuryReportContent {
    playerId: string;
    playerName: string;
    injuryType: string;
    severity: 'Minor' | 'Major' | 'Season-Ending';
    duration: string;
    /** 복귀 예정 날짜 (YYYY-MM-DD) */
    returnDate: string;
    /** true면 복귀 보고서 */
    isRecovery?: boolean;
    /** true면 훈련 중 부상 */
    isTrainingInjury?: boolean;
}

export interface SuspensionContent {
    playerId: string;
    playerName: string;
    teamId: string;
    opponentPlayerId: string;
    opponentPlayerName: string;
    opponentTeamId: string;
    opponentTeamName: string;
    suspensionGames: number;
    returnDate: string;
}

export interface LeagueNewsContent {
    /** 싸움/출장정지 리그 뉴스 (타팀 이벤트) */
    fighterPlayerId: string;
    fighterPlayerName: string;
    fighterTeamId: string;
    fighterTeamName: string;
    fighterSuspensionGames: number;
    opponentPlayerId: string;
    opponentPlayerName: string;
    opponentTeamId: string;
    opponentTeamName: string;
    opponentSuspensionGames: number;
}

export interface SeasonReviewContent {
    wins: number;
    losses: number;
    winPct: number;
    winPctStr: string;
    leagueRank: number;
    confRank: number;
    conference: string;
    isPlayoffBound: boolean;
    teamStats: Record<string, number>;
    leagueRanks: Record<string, { value: number; rank: number }>;
    mvp: { id: string; name: string; position: string; age: number; ppg: number; rpg: number; apg: number; ovr: number } | null;
    trades: { date: string; partnerId: string; partnerName: string; acquired: { id: string; name: string; ovr: number }[]; departed: { id: string; name: string; ovr: number }[] }[];
    ownerMood: { title: string; msg: string; color: string; borderColor: string; bg: string };
    ownerName: string;
    // Standings context: user team ± 2 teams
    standingsContext?: {
        teamId: string;
        teamName: string;
        rank: number;
        wins: number;
        losses: number;
        pct: string;
        gb: string;
        home: string;
        away: string;
        conf: string;
        ppg: string;
        oppg: string;
        diff: string;
        streak: string;
        l10: string;
        isUserTeam: boolean;
    }[];
    // All 30 teams stats (for 3-tab table)
    allTeamsStats?: {
        teamId: string;
        teamName: string;
        wins: number;
        losses: number;
        stats: Record<string, number>;
    }[];
    // Roster player traditional stats
    rosterStats?: {
        id: string;
        name: string;
        position: string;
        ovr: number;
        g: number;
        mpg: number;
        pts: number;
        oreb: number;
        dreb: number;
        reb: number;
        ast: number;
        stl: number;
        blk: number;
        tov: number;
        pf: number;
        fgm: number;
        fga: number;
        fgPct: number;
        p3m: number;
        p3a: number;
        p3Pct: number;
        ftm: number;
        fta: number;
        ftPct: number;
        pm: number;
    }[];
}

export interface OwnerLetterContent {
    ownerName: string;
    title: string;
    msg: string;
    mood: { color: string; borderColor: string; bg: string };
    confRank: number;
    wins: number;
    losses: number;
}

export interface SeriesPlayerStat {
    playerId: string;
    playerName: string;
    gp: number;
    mp: number;
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    tov: number;
    fgm: number;
    fga: number;
    p3m: number;
    p3a: number;
    ftm: number;
    fta: number;
    pf: number;
    plusMinus: number;
}

export interface PlayoffStageReviewContent {
    round: number;
    roundName: string;
    myTeamId: string;
    myTeamName: string;
    opponentId: string;
    opponentName: string;
    result: 'WON' | 'LOST';
    seriesScore: string;
    myWins: number;
    myLosses: number;
    games: { gameNum: number; isHome: boolean; myScore: number; oppScore: number; isWin: boolean; gameId?: string }[];
    isFinalStage: boolean;
    finalStatus?: { title: string; desc: string };
    ownerName: string;
    ownerMessage: string;
    seriesPlayerStats?: SeriesPlayerStat[];
}

export interface FinalsMvpContent {
    mvpPlayerId: string;
    mvpPlayerName: string;
    mvpTeamId: string;
    mvpTeamName: string;
    opponentTeamId: string;
    opponentTeamName: string;
    seriesScore: string;
    stats: SeriesPlayerStat;
    leaderboard: SeriesPlayerStat[];
}

export interface HofQualificationContent {
    result: 'WON' | 'LOST';
    round: number;
    teamId: string;
    teamName: string;
    totalScore: number;
    breakdown: {
        season_score: number;
        ptDiff_score: number;
        stat_score: number;
        playoff_score: number;
    };
    conference: string;
    wins: number;
    losses: number;
    pct: string;
    // All 30 teams stats
    allTeamsStats: {
        teamId: string;
        teamName: string;
        wins: number;
        losses: number;
        stats: Record<string, number>;
    }[];
    // Roster player traditional stats
    rosterStats: {
        id: string;
        name: string;
        position: string;
        ovr: number;
        g: number;
        mpg: number;
        pts: number;
        oreb: number;
        dreb: number;
        reb: number;
        ast: number;
        stl: number;
        blk: number;
        tov: number;
        pf: number;
        fgm: number;
        fga: number;
        fgPct: number;
        p3m: number;
        p3a: number;
        p3Pct: number;
        ftm: number;
        fta: number;
        ftPct: number;
        pm: number;
    }[];
}

export interface RegSeasonChampionContent {
    championTeamId: string;
    championTeamName: string;
    wins: number;
    losses: number;
    pct: string;
    conference: string;
    // All 30 teams stats (for team stat tables with league ranks)
    allTeamsStats: {
        teamId: string;
        teamName: string;
        wins: number;
        losses: number;
        stats: Record<string, number>;
    }[];
    // Champion roster player traditional stats
    rosterStats: {
        id: string;
        name: string;
        position: string;
        ovr: number;
        g: number;
        mpg: number;
        pts: number;
        oreb: number;
        dreb: number;
        reb: number;
        ast: number;
        stl: number;
        blk: number;
        tov: number;
        pf: number;
        fgm: number;
        fga: number;
        fgPct: number;
        p3m: number;
        p3a: number;
        p3Pct: number;
        ftm: number;
        fta: number;
        ftPct: number;
        pm: number;
    }[];
}

export interface ScoutReportPlayerEntry {
    playerId: string;
    playerName: string;
    position: string;
    age: number;
    ovr: number;
    changes: { attribute: string; attributeKr: string; totalDelta: number }[];
    netDelta: number;
}

export interface ScoutReportContent {
    monthLabel: string;
    periodStart: string;
    periodEnd: string;
    teamId: string;
    teamName: string;
    players: ScoutReportPlayerEntry[];
    hasAnyChanges: boolean;
}

/** CPU가 유저에게 트레이드 오퍼를 보낼 때 */
export interface TradeOfferReceivedContent {
    offerId: string;
    fromTeamId: string;
    fromTeamName: string;
    offeredSummary: string;     // "선수 A, B → 선수 C + 2027 1R 픽"
    analysis: string[];
}

/** CPU가 유저의 카운터/제안에 응답할 때 */
export interface TradeOfferResponseContent {
    offerId: string;
    fromTeamId: string;
    fromTeamName: string;
    accepted: boolean;
    reason?: string;
}

export interface PlayoffChampionContent {
    championTeamId: string;
    championTeamName: string;
    playoffWins: number;
    playoffLosses: number;
    conference: string;
    // All 30 teams playoff stats
    allTeamsStats: {
        teamId: string;
        teamName: string;
        wins: number;
        losses: number;
        stats: Record<string, number>;
    }[];
    // Champion roster playoff stats
    rosterStats: {
        id: string;
        name: string;
        position: string;
        ovr: number;
        g: number;
        mpg: number;
        pts: number;
        oreb: number;
        dreb: number;
        reb: number;
        ast: number;
        stl: number;
        blk: number;
        tov: number;
        pf: number;
        fgm: number;
        fga: number;
        fgPct: number;
        p3m: number;
        p3a: number;
        p3Pct: number;
        ftm: number;
        fta: number;
        ftPct: number;
        pm: number;
    }[];
}
