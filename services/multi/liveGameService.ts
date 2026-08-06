
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
}

async function authHeader(accessToken?: string): Promise<Record<string, string>> {
    const token = accessToken ?? (await supabase.auth.getSession()).data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
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
        if (!res.ok) return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
        return data as WindowedGameView;
    } catch (e: any) {
        return { ok: false, error: e?.message ?? '조회 실패' };
    }
};

/** 방 전체의 "지금 진행 중"인 경기 요약 — 일정 리스트 라이브 스코어 표시용. */
export const fetchLiveGamesSummary = async (
    roomId: string,
    accessToken?: string,
): Promise<LiveGameSummary[]> => {
    try {
        const headers = await authHeader(accessToken);
        const res = await fetch(`${FLY_SERVER}/live-games?roomId=${roomId}`, { headers });
        if (!res.ok) return [];
        const data = await res.json().catch(() => ({}));
        return (data?.games as LiveGameSummary[]) ?? [];
    } catch {
        return [];
    }
};
