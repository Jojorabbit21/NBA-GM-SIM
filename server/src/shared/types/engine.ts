
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
    runTeamId?: string;
    runHomePts?: number;
    runAwayPts?: number;
    timeoutsLeft?: number;
    foulTeamId?: string;
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

// 한 포세션에서 변한 카운팅 스탯만 (생략된 필드 = 0)
export interface BoxDelta {
    pts?: number; reb?: number; offReb?: number; ast?: number; stl?: number;
    blk?: number; tov?: number; pf?: number;
    fgm?: number; fga?: number; p3m?: number; p3a?: number;
}

// 포세션 1회 종료 시점의 박스스코어 변화분 (멀티플레이어 중계 점진 공개용)
export interface BoxTick {
    t:  number;                    // 포세션 종료 시점 gameSec ((q-1)*720 + (720-clock))
    on: string[];                  // 이 포세션에 코트 위 있던 playerId 10명 (mp 누적 대상)
    mp: number;                    // 이 포세션이 소비한 분 (timeTaken/60)
    d:  Record<string, BoxDelta>;  // playerId → 변화분 (변한 선수만)
    shot?: { p: string; m: boolean }; // 이 포세션 FG 시도 결과 (있었던 경우만): p=playerId, m=성공여부 — 핫/콜드 스트릭 재구성용
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
    boxTimeline?: BoxTick[];
}

export type PlayType =
    | 'Iso' | 'PnR_Handler' | 'PnR_Roll' | 'PnR_Pop' | 'PostUp'
    | 'CatchShoot' | 'Cut' | 'Handoff' | 'Transition' | 'Putback'
    | 'OffBallScreen' | 'DriveKick';
