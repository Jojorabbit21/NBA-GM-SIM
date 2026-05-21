
import { PlayerStats } from './player.ts';

export interface PlayerBoxScore {
    playerId: string;
    playerName: string;
    pts: number;
    reb: number;
    offReb: number;
    defReb: number;
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
    rimM: number;
    rimA: number;
    midM: number;
    midA: number;
    mp: number;
    g: number;
    gs: number;
    pf: number;
    techFouls: number;
    flagrantFouls: number;
    plusMinus: number;
    condition: number;
    isStopper?: boolean;
    isAceTarget?: boolean;
    matchupEffect?: number;
    fatigue?: number;
    zoneData?: any;
}

export interface PbpLog {
    quarter: number;
    timeRemaining: string;
    teamId: string;
    text: string;
    type: 'score' | 'miss' | 'turnover' | 'foul' | 'block' | 'freethrow' | 'info' | 'injury';
    points?: 1 | 2 | 3;
    homeScore?: number;
    awayScore?: number;
}

export interface QuarterScores {
    home: [number, number, number, number];
    away: [number, number, number, number];
}

export type RotationData = Record<string, { in: number, out: number }[]>;

export interface ShotEvent {
    id: string;
    quarter: number;
    gameClock: number;
    teamId: string;
    playerId: string;
    x: number;
    y: number;
    zone: string;
    isMake: boolean;
    playType?: string;
    assistPlayerId?: string;
    playerName?: string;
    assistPlayerName?: string;
    defenderName?: string;
    shotType?: string;
    points?: 0 | 2 | 3;
    isBlock?: boolean;
    subZone?: string;
}

export interface InjuryEvent {
    playerId: string;
    playerName: string;
    teamId: string;
    injuryType: string;
    durationDesc: string;
    quarter: number;
    timeRemaining: string;
}

export interface SimulationResult {
    homeScore: number;
    awayScore: number;
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
    homeTactics: any;
    awayTactics: any;
    rosterUpdates: Record<string, any>;
    pbpLogs: PbpLog[];
    rotationData: RotationData;
    pbpShotEvents?: ShotEvent[];
    injuries?: InjuryEvent[];
    suspensions?: {
        playerId: string; playerName: string; teamId: string;
        opponentPlayerId: string; opponentPlayerName: string; opponentTeamId: string;
        suspensionGames: number; opponentSuspensionGames: number;
        quarter: number; timeRemaining: string;
    }[];
}

export type PlayType =
    | 'Iso' | 'PnR_Handler' | 'PnR_Roll' | 'PnR_Pop' | 'PostUp'
    | 'CatchShoot' | 'Cut' | 'Handoff' | 'Transition' | 'Putback'
    | 'OffBallScreen' | 'DriveKick';
