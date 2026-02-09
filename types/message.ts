
import { PlayerBoxScore } from './engine';

export type MessageType = 'GAME_RECAP' | 'TRADE_ALERT' | 'INJURY_REPORT' | 'SYSTEM';

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
