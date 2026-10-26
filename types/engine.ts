
import { PlayerStats } from './player';

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
    homeScore?: number;   // 이 이벤트 시점의 홈팀 누적 점수
    awayScore?: number;   // 이 이벤트 시점의 원정팀 누적 점수
    runTeamId?: string;   // 이 이벤트 시점에 런이 진행 중이면 런 팀 ID (멀티플레이어 리플레이용)
    runHomePts?: number;  // 현재 에포크 내 홈팀 누적 득점
    runAwayPts?: number;  // 현재 에포크 내 원정팀 누적 득점
    timeoutKind?: 'team' | 'mandatory'; // [2026-10-22] 일반/의무 타임아웃 구분(optional — 과거 로그 호환)
    timeoutsLeft?: number; // 타임아웃 로그(teamId=부른 팀)일 때: 그 팀의 잔여 타임아웃 수 (멀티플레이어 리플레이용)
    foulTeamId?: string;   // 이 로그가 팀파울(보너스 대상: 비슈팅/슈팅/플래그런트) 발생 시점이면 파울한 팀 ID.
                            // freethrow 타입(슈팅파울)은 teamId가 공격팀이라 별도 필드로 파울팀을 남긴다.
    // [2026-08-02] 포제션 단위 마커(인사이트 차트용) — 이 로그가 실제로 포제션이 끝나는 시점이면
    // true + 결과 분류. 오펜시브 리바운드/테크니컬·플래그런트 파울(공격권 유지)은 스탬프하지 않음.
    // 구버전 저장 데이터엔 없는 optional 필드 — 없으면 마커 UI에서 그냥 표시 안 함(소급 적용 없음).
    isPossessionEnd?: boolean;
    possessionOutcome?: 'scoring' | 'nonScoring' | 'turnover';
    possessionTeamId?: string; // 이 마커가 어느 팀의 포제션인지 (teamId와 다를 수 있음 — 예: 블록/수비파울
                                // 로그는 teamId가 수비팀이지만 포제션 자체는 공격팀 것)
}

/** [2026-10-26] Q1~Q4 + 연장(있으면 OT1, OT2 …) 순서 — 연장전 도입 전 저장값은 4칸(연장 득점은 Q4에 합산돼 있음). */
export interface QuarterScores {
    home: number[];
    away: number[];
}

// [2026-08-02] outReason: 이 스틴트가 왜 끝났는지(교체 사유) — 로테이션 차트 호버 툴팁용.
// undefined면 사유 없음(경기 종료 시점에 코트 위였던 마지막 스틴트 등)
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
    suspensions?: { playerId: string; playerName: string; teamId: string; opponentPlayerId: string; opponentPlayerName: string; opponentTeamId: string; suspensionGames: number; opponentSuspensionGames: number; quarter: number; timeRemaining: string }[];
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

export type PlayType = 'Iso' | 'PnR_Handler' | 'PnR_Roll' | 'PnR_Pop' | 'PostUp' | 'CatchShoot' | 'Cut' | 'Handoff' | 'Transition' | 'Putback' | 'OffBallScreen' | 'DriveKick';
