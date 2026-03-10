
import { PlayerBoxScore } from './engine';

// SeasonAwardsContent는 utils/awardVoting.ts에서 직접 export됨
export type { SeasonAwardsContent } from '../utils/awardVoting';

export type MessageType = 'GAME_RECAP' | 'TRADE_ALERT' | 'INJURY_REPORT' | 'SEASON_REVIEW' | 'PLAYOFF_STAGE_REVIEW' | 'SEASON_AWARDS' | 'SYSTEM';

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
