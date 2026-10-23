
import { PlayerStats } from './player.ts';

export interface PlayerBoxScore {
    playerId: string;
    playerName: string;
    position?: string;
    /** 경기 기록 시점의 고정 OVR(서버가 박스스코어 저장 시 기록, 구버전 기록엔 없음) */
    ovr?: number;
    pts: number;
    reb: number;
    offReb: number;
    defReb: number;
    ast: number;
    stl: number;
    blk: number;
    tov: number;
    tovForced: number; // 상대 턴오버 유발 (스틸 + 차징 유도, NBA 관례상 스틸과 동일 취급)
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
    type: 'score' | 'miss' | 'turnover' | 'foul' | 'block' | 'freethrow' | 'info' | 'injury' | 'timeout';
    points?: 1 | 2 | 3;
    homeScore?: number;
    awayScore?: number;
    runTeamId?: string;
    runHomePts?: number;
    runAwayPts?: number;
    timeoutKind?: 'team' | 'mandatory'; // [2026-10-22] 일반/의무 타임아웃 구분(optional — 과거 로그 호환)
    timeoutsLeft?: number;
    foulTeamId?: string;
    isPossessionEnd?: boolean;
    possessionOutcome?: 'scoring' | 'nonScoring' | 'turnover';
    possessionTeamId?: string;
}

export interface QuarterScores {
    home: [number, number, number, number];
    away: [number, number, number, number];
}

export type RotationOutReason = 'normal' | 'foul_trouble' | 'shutdown' | 'injury' | 'foul_out' | 'garbage' | 'manual';
export type RotationData = Record<string, { in: number, out: number, outReason?: RotationOutReason }[]>;

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
    ftm?: number; fta?: number;
}

// 포세션 1회 종료 시점의 박스스코어 변화분 (멀티플레이어 중계 점진 공개용)
export interface BoxTick {
    t:  number;                    // 포세션 종료 시점 gameSec ((q-1)*720 + (720-clock))
    on: string[];                  // 이 포세션에 코트 위 있던 playerId 10명 (mp 누적 대상)
    off?: 'home' | 'away';         // 이 포세션의 공격팀 (On/Off·라인업 리포트에서 공격/수비 포제션 구분용). [2026-08-02] 이전 저장 데이터엔 없음 — 소급 적용 없음
    mp: number;                    // 이 포세션이 소비한 분 (timeTaken/60)
    d:  Record<string, BoxDelta>;  // playerId → 변화분 (변한 선수만)
    shot?: { p: string; m: boolean }; // 이 포세션 FG 시도 결과 (있었던 경우만): p=playerId, m=성공여부 — 핫/콜드 스트릭 재구성용
    c?: Record<string, number>;    // [2026-10-17] 체력(5 단위 양자화) — 첫 틱은 양 팀 전원, 이후엔 값이 바뀐 선수만. 라이브 중계 체력 배지 재구성용(이전 저장 데이터엔 없음)
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
    /** [2026-10-18] 팀별 플레이타입 실적 — 멀티 PPP 집계용(TeamPlayTypeStats) */
    playTypeStats?: TeamPlayTypeStats;
}

/** [2026-10-18] 플레이타입별 실적(팀 단위, 한 경기) — 플레이 1회 = 그 플레이타입으로 끝난 슛/턴오버/슈팅·보너스 자유투 1건.
 *  공격 리바운드 후 이어진 공격은 별도 플레이. 비보너스 파울·테크니컬·플래그런트·싸움은 집계 안 함(statsMappers.recordPlayTypeStat).
 *  pts = 그 플레이로 난 득점(앤드원·자유투 포함) → PPP = pts / poss. client(types/engine.ts) ↔ server(server/src/shared/types/engine.ts) 미러 */
export interface PlayTypeStatLine { poss: number; pts: number; fga: number; fgm: number; fta: number; tov: number; }
/** teamId → playType → 집계 */
export type TeamPlayTypeStats = Record<string, Record<string, PlayTypeStatLine>>;


export type PlayType =
    | 'Iso' | 'PnR_Handler' | 'PnR_Roll' | 'PnR_Pop' | 'PostUp'
    | 'CatchShoot' | 'Cut' | 'Handoff' | 'Transition' | 'Putback'
    | 'OffBallScreen' | 'DriveKick';
