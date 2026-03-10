
import { PlayerBoxScore } from './engine';

// SeasonAwardsContent는 utils/awardVoting.ts에서 직접 export됨
export type { SeasonAwardsContent } from '../utils/awardVoting';

export type MessageType = 'GAME_RECAP' | 'TRADE_ALERT' | 'INJURY_REPORT' | 'SEASON_REVIEW' | 'PLAYOFF_STAGE_REVIEW' | 'SEASON_AWARDS' | 'OWNER_LETTER' | 'SYSTEM';

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

export interface GameRecapContent {
    gameId: string;
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number;
    awayScore: number;
    userBoxScore: PlayerBoxScore[];
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
    severity: 'Minor' | 'Major';
    duration: string;
    returnDate: string;
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

export interface PlayoffStageReviewContent {
    round: number;
    roundName: string;
    opponentId: string;
    opponentName: string;
    result: 'WON' | 'LOST';
    seriesScore: string;
    myWins: number;
    myLosses: number;
    games: { gameNum: number; isHome: boolean; myScore: number; oppScore: number; isWin: boolean }[];
    isFinalStage: boolean;
    finalStatus?: { title: string; desc: string };
    ownerName: string;
    ownerMessage: string;
}
