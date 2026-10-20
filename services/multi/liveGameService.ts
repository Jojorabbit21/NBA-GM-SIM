
import { supabase } from '../supabaseClient';
import type { PbpLog, PlayerBoxScore, BoxTick, ShotEvent, RotationData } from '../../types/engine';

const FLY_SERVER = (import.meta as any).env?.VITE_DRAFT_WS_URL
    ? (import.meta as any).env.VITE_DRAFT_WS_URL.replace(/^ws/, 'http').replace(/\/ws$/, '')
    : 'https://basketballgm-app-server.fly.dev';

export type LiveGameState = 'not_started' | 'live' | 'final';

export interface WindowedGameView {
    ok:            true;
    state:         LiveGameState;
    gameId:        string;
    homeTeamId:    string;
    awayTeamId:    string;
    gameStartTime: string;
    events:        PbpLog[];   // since를 보냈다면 그 이후 새로 공개된 것만
    shotEvents:    ShotEvent[];
    boxTimeline:   BoxTick[];
    eventCount:    number;     // 누적 총 개수 — 다음 호출의 since로 그대로 전달
    shotCount:     number;
    boxCount:      number;
    homeBox:       PlayerBoxScore[];
    awayBox:       PlayerBoxScore[];
    homeScore?:    number;
    awayScore?:    number;
    rotationData?: RotationData; // final일 때만 포함
}

/** live 폴링 시 이미 받은 만큼(count)을 서버에 알려 그 이후 새로 공개된 구간만 받기 위한 커서. */
export interface LiveGameSinceCursor {
    events?: number;
    shots?:  number;
    box?:    number;
}

export interface LiveGameSummary {
    gameId:     string;
    state:      LiveGameState;
    homeScore?: number;
    awayScore?: number;
    quarter?:   number;
    clock?:     string;
    quarterScores?: { home: number[]; away: number[] };
}

async function authHeader(accessToken?: string): Promise<Record<string, string>> {
    const token = accessToken ?? (await supabase.auth.getSession()).data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Fly 서버가 401을 반환하면(로컬엔 토큰이 있지만 서버 세션이 이미 죽은 경우 — 다른
 * 기기/탭에서 재로그인해 단일세션 정책으로 무효화된 케이스 등) 5초 폴링이 영원히
 * 401만 반복하게 된다. 실제 세션 생사를 서버에 직접 확인해 죽어있으면 로그아웃 후
 * 로그인 화면으로 돌려보내 사용자가 다시 로그인하도록 유도한다.
 */
let sessionDeathHandled = false;
async function handlePossibleDeadSession(status: number) {
    if (status !== 401 || sessionDeathHandled) return;
    try {
        const { error } = await supabase.auth.getUser();
        if (!error) return; // 세션 살아있음 — 일시적 네트워크 문제였을 뿐
        sessionDeathHandled = true;
        await supabase.auth.signOut().catch(() => {});
        window.location.href = '/auth';
    } catch { /* 판정 실패 시 다음 폴링에서 재시도 */ }
}

/** 경기 상세 — live 구간이면 서버가 elapsed까지만 잘라서 반환 (스포일러 방지). */
export const fetchLiveGameView = async (
    roomId: string,
    gameId: string,
    accessToken?: string,
    since?: LiveGameSinceCursor,
): Promise<WindowedGameView | { ok: false; error: string }> => {
    try {
        const headers = await authHeader(accessToken);
        const params = new URLSearchParams({ roomId, gameId });
        if (since?.events != null) params.set('sinceEvents', String(since.events));
        if (since?.shots  != null) params.set('sinceShots',  String(since.shots));
        if (since?.box    != null) params.set('sinceBox',    String(since.box));
        const res = await fetch(`${FLY_SERVER}/live-game?${params.toString()}`, { headers });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            handlePossibleDeadSession(res.status);
            return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
        }
        return data as WindowedGameView;
    } catch (e: any) {
        return { ok: false, error: e?.message ?? '조회 실패' };
    }
};

// [2026-10-20] 라이브 요약 폴링 보호. 한 탭에서 GameDateStrip·MultiScheduleView가 각자 5초마다 같은 요청을 보내고,
// 서버가 느리면 응답 전에 다음 요청이 쌓여(setInterval은 이전 요청 완료를 기다리지 않음) DB 지연을 증폭했다.
//  - 같은 방의 요청은 하나로 합친다(진행 중이거나 3초 이내면 그 결과 재사용).
//  - 백그라운드 탭에서는 요청하지 않는다(마지막 값 유지).
//  - 실패하면 5→10→20→30초로 물러서고, 그동안엔 마지막 성공 값을 최대 30초 보여준다(전엔 바로 빈 배열 → 라이브 스코어가 깜빡임).
//  - 요청은 10초에서 끊는다(서버가 연결을 끊기 전에 클라이언트가 먼저 정리).
const LIVE_SUMMARY_MIN_GAP_MS = 3000;
const LIVE_SUMMARY_TIMEOUT_MS = 10_000;
const LIVE_SUMMARY_BACKOFF_MS = [5000, 10_000, 20_000, 30_000];
const LIVE_SUMMARY_STALE_MS = 30_000;

interface LiveSummaryState {
    inflight: Promise<LiveGameSummary[]> | null;
    last: LiveGameSummary[];
    lastOkAt: number;
    lastAttemptAt: number;
    failures: number;
    blockedUntil: number;
}
const liveSummaryState = new Map<string, LiveSummaryState>();

/** 방 전체의 "지금 진행 중"인 경기 요약 — 일정 리스트 라이브 스코어 표시용. */
export const fetchLiveGamesSummary = async (
    roomId: string,
    accessToken?: string,
): Promise<LiveGameSummary[]> => {
    let st = liveSummaryState.get(roomId);
    if (!st) {
        st = { inflight: null, last: [], lastOkAt: 0, lastAttemptAt: 0, failures: 0, blockedUntil: 0 };
        liveSummaryState.set(roomId, st);
    }
    const state = st;
    const now = Date.now();
    const staleSafe = () => (now - state.lastOkAt <= LIVE_SUMMARY_STALE_MS ? state.last : []);

    if (state.inflight) return state.inflight;
    if (typeof document !== 'undefined' && document.hidden) return staleSafe();
    if (now < state.blockedUntil) return staleSafe();
    if (now - state.lastAttemptAt < LIVE_SUMMARY_MIN_GAP_MS) return staleSafe();

    state.lastAttemptAt = now;
    state.inflight = (async () => {
        try {
            const headers = await authHeader(accessToken);
            const res = await fetch(`${FLY_SERVER}/live-games?roomId=${roomId}`, {
                headers,
                signal: AbortSignal.timeout(LIVE_SUMMARY_TIMEOUT_MS),
            });
            if (!res.ok) {
                handlePossibleDeadSession(res.status);
                throw new Error(`HTTP ${res.status}`);
            }
            const data = await res.json().catch(() => ({}));
            state.last = (data?.games as LiveGameSummary[]) ?? [];
            state.lastOkAt = Date.now();
            state.failures = 0;
            state.blockedUntil = 0;
            return state.last;
        } catch {
            state.failures += 1;
            state.blockedUntil = Date.now() + LIVE_SUMMARY_BACKOFF_MS[Math.min(state.failures - 1, LIVE_SUMMARY_BACKOFF_MS.length - 1)];
            return Date.now() - state.lastOkAt <= LIVE_SUMMARY_STALE_MS ? state.last : [];
        } finally {
            state.inflight = null;
        }
    })();
    return state.inflight;
};
