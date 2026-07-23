/**
 * liveGameView.ts — game_pbp row를 "지금 몇 분 지났는지" 기준으로 잘라서 반환.
 *
 * views/multi/season/MultiGamePbpView.tsx의 클라이언트 필터링 로직(visibleEvents,
 * buildLiveBox 등)을 서버로 이식한 것. game_pbp 테이블 RLS는 game_start_time + 10분이
 * 지나야 직접 조회 가능하도록 잠겨 있으므로, 그 전(live 구간)의 조회는 반드시 이
 * 모듈을 거쳐 서버가 "지금까지 공개돼야 할 부분"만 잘라 내려줘야 한다 — 그래야
 * 최종 스코어가 방송(리플레이) 도중에 미리 새는 걸 물리적으로 막을 수 있다.
 */

export const TOTAL_GAME_SECONDS = 2880;       // 48분 경기
export const REPLAY_DURATION_MS = 10 * 60_000; // 10분 압축 중계

interface PbpLog {
    quarter: number;
    timeRemaining: string;
    teamId: string;
    text: string;
    type: string;
    points?: number;
    homeScore?: number;
    awayScore?: number;
    runTeamId?: string;
    runHomePts?: number;
    runAwayPts?: number;
    timeoutsLeft?: number;
    foulTeamId?: string;
}

interface ShotEvent {
    quarter: number;
    gameClock: number;
    [key: string]: unknown;
}

interface BoxTick {
    t: number;
    on: string[];
    mp: number;
    d: Record<string, Record<string, number>>;
    shot?: { p: string; m: boolean };
}

interface PlayerBoxScore {
    playerId: string;
    playerName: string;
    position?: string;
    [key: string]: unknown;
}

function parseTimeRemaining(t: string): number {
    const [m, s] = t.split(':').map(n => parseInt(n, 10) || 0);
    return m * 60 + s;
}

function pbpToGameSeconds(e: PbpLog): number {
    return (e.quarter - 1) * 720 + (720 - parseTimeRemaining(e.timeRemaining));
}

function shotToGameSeconds(e: ShotEvent): number {
    return (e.quarter - 1) * 720 + (720 - e.gameClock);
}

function withinElapsed(gameSeconds: number, elapsedMs: number): boolean {
    const replayMs = (gameSeconds / TOTAL_GAME_SECONDS) * REPLAY_DURATION_MS;
    return replayMs <= elapsedMs;
}

function identityOnly(box: PlayerBoxScore[]): PlayerBoxScore[] {
    return box.map(p => ({ playerId: p.playerId, playerName: p.playerName, position: p.position }));
}

export interface GamePbpSource {
    game_id:         string;
    home_team_id:    string;
    away_team_id:    string;
    home_score:      number;
    away_score:      number;
    game_start_time: string;
    events:          PbpLog[];
    shot_events:     ShotEvent[];
    home_box:        PlayerBoxScore[];
    away_box:        PlayerBoxScore[];
    box_timeline?:   BoxTick[];
}

export type LiveGameState = 'not_started' | 'live' | 'final';

export interface WindowedGameView {
    ok:              true;
    state:           LiveGameState;
    gameId:          string;
    homeTeamId:      string;
    awayTeamId:      string;
    gameStartTime:   string;
    events:          PbpLog[];
    shotEvents:      ShotEvent[];
    boxTimeline:     BoxTick[];
    homeBox:         PlayerBoxScore[];
    awayBox:         PlayerBoxScore[];
    homeScore?:      number; // final일 때만 포함 (스포일러 방지)
    awayScore?:      number;
}

export function computeGameState(gameStartTime: string, nowMs: number): { state: LiveGameState; elapsedMs: number } {
    const startMs   = new Date(gameStartTime).getTime();
    const elapsedMs = nowMs - startMs;
    if (elapsedMs < 0)                    return { state: 'not_started', elapsedMs };
    if (elapsedMs >= REPLAY_DURATION_MS)  return { state: 'final', elapsedMs };
    return { state: 'live', elapsedMs };
}

/** row 전체를 elapsed 기준으로 잘라 클라이언트에 안전하게 내려줄 형태로 변환. */
export function buildWindowedView(row: GamePbpSource, nowMs: number): WindowedGameView {
    const { state, elapsedMs } = computeGameState(row.game_start_time, nowMs);

    if (state === 'final') {
        return {
            ok: true, state,
            gameId: row.game_id, homeTeamId: row.home_team_id, awayTeamId: row.away_team_id,
            gameStartTime: row.game_start_time,
            events: row.events ?? [], shotEvents: row.shot_events ?? [],
            boxTimeline: row.box_timeline ?? [],
            homeBox: row.home_box ?? [], awayBox: row.away_box ?? [],
            homeScore: row.home_score, awayScore: row.away_score,
        };
    }

    if (state === 'not_started') {
        return {
            ok: true, state,
            gameId: row.game_id, homeTeamId: row.home_team_id, awayTeamId: row.away_team_id,
            gameStartTime: row.game_start_time,
            events: [], shotEvents: [], boxTimeline: [],
            homeBox: identityOnly(row.home_box ?? []), awayBox: identityOnly(row.away_box ?? []),
        };
    }

    // live: elapsedMs까지 공개된 부분만 자른다. 최종 스코어 컬럼은 절대 포함하지 않는다.
    const events      = (row.events ?? []).filter(e => withinElapsed(pbpToGameSeconds(e), elapsedMs));
    const shotEvents   = (row.shot_events ?? []).filter(e => withinElapsed(shotToGameSeconds(e), elapsedMs));
    const boxTimeline  = (row.box_timeline ?? []).filter(t => {
        const replayMs = (t.t / TOTAL_GAME_SECONDS) * REPLAY_DURATION_MS;
        return replayMs <= elapsedMs;
    });

    return {
        ok: true, state,
        gameId: row.game_id, homeTeamId: row.home_team_id, awayTeamId: row.away_team_id,
        gameStartTime: row.game_start_time,
        events, shotEvents, boxTimeline,
        homeBox: identityOnly(row.home_box ?? []), awayBox: identityOnly(row.away_box ?? []),
    };
}

/** 일정 리스트용 요약치 — events에서 마지막으로 공개된 누적 스코어 + 쿼터/게임클락만 뽑는다. */
export interface LiveGameSummary {
    gameId:    string;
    state:     LiveGameState;
    homeScore?: number;
    awayScore?: number;
    quarter?:   number;
    clock?:     string; // "MM:SS" 잔여 시간
}

export function buildLiveSummary(row: GamePbpSource, nowMs: number): LiveGameSummary {
    const { state, elapsedMs } = computeGameState(row.game_start_time, nowMs);

    if (state === 'final') {
        return { gameId: row.game_id, state, homeScore: row.home_score, awayScore: row.away_score };
    }
    if (state === 'not_started') {
        return { gameId: row.game_id, state };
    }

    const visible = (row.events ?? []).filter(e => withinElapsed(pbpToGameSeconds(e), elapsedMs));
    const last = [...visible].reverse().find(e => e.homeScore != null);
    if (!last) return { gameId: row.game_id, state, homeScore: 0, awayScore: 0, quarter: 1, clock: '12:00' };

    return {
        gameId:    row.game_id,
        state,
        homeScore: last.homeScore ?? 0,
        awayScore: last.awayScore ?? 0,
        quarter:   last.quarter,
        clock:     last.timeRemaining,
    };
}
