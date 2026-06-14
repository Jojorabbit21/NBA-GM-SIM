
import { PlayerStats } from './player';

export interface PlayerBoxScore {
    playerId: string;
    playerName: string;
    position?: string;
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
    contestedAttempted: number;
    contestedMade: number;
    defRimAttempted: number;
    defRimMade: number;
    defMidAttempted: number;
    defMidMade: number;
    defThreeAttempted: number;
    defThreeMade: number;
    defRAAttempted: number;
    defRAMade: number;
    defITPAttempted: number;
    defITPMade: number;
    defMIDAttempted: number;
    defMIDMade: number;
    defCNRAttempted: number;
    defCNRMade: number;
    defWINGAttempted: number;
    defWINGMade: number;
    defATBAttempted: number;
    defATBMade: number;
    condition: number;
    isStopper?: boolean;
    isAceTarget?: boolean;
    matchupEffect?: number;
    fatigue?: number;
    recentShots?: boolean[];
    zoneData?: any;
}

export interface PbpLog {
    quarter: number;
    timeRemaining: string;
    teamId: string;
    text: string;
    type: 'score' | 'miss' | 'turnover' | 'foul' | 'block' | 'freethrow' | 'info' | 'injury';
    points?: 1 | 2 | 3;
    homeScore?: number;   // 이 이벤트 시점의 홈팀 누적 점수
    awayScore?: number;   // 이 이벤트 시점의 원정팀 누적 점수
}

export interface QuarterScores {
    home: [number, number, number, number]; // Q1, Q2, Q3, Q4
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
    // Tooltip data
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
    suspensions?: { playerId: string; playerName: string; teamId: string; opponentPlayerId: string; opponentPlayerName: string; opponentTeamId: string; suspensionGames: number; opponentSuspensionGames: number; quarter: number; timeRemaining: string }[];
    boxTimeline?: BoxTick[];
}

export type PlayType = 'Iso' | 'PnR_Handler' | 'PnR_Roll' | 'PnR_Pop' | 'PostUp' | 'CatchShoot' | 'Cut' | 'Handoff' | 'Transition' | 'Putback' | 'OffBallScreen' | 'DriveKick';
