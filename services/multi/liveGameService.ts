
import { supabase } from '../supabaseClient';
import type { PbpLog, PlayerBoxScore, BoxTick, ShotEvent } from '../../types/engine';

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
    events:        PbpLog[];
    shotEvents:    ShotEvent[];
    boxTimeline:   BoxTick[];
    homeBox:       PlayerBoxScore[];
    awayBox:       PlayerBoxScore[];
    homeScore?:    number;
    awayScore?:    number;
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
): Promise<WindowedGameView | { ok: false; error: string }> => {
    try {
        const headers = await authHeader(accessToken);
        const res = await fetch(`${FLY_SERVER}/live-game?roomId=${roomId}&gameId=${gameId}`, { headers });
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
