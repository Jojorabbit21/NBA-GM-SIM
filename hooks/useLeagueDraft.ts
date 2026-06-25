
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { MultiDraftState, DraftPickEntry, DraftPoolPlayer } from '../types/multiDraft';

// ── 서버 주소 ─────────────────────────────────────────────────────────────────
// VITE_DRAFT_WS_URL 환경변수로 재정의 가능 (개발: ws://localhost:3001/ws)
const WS_BASE = (import.meta as any).env?.VITE_DRAFT_WS_URL ?? 'wss://basketballgm-app-server.fly.dev/ws';

export interface UseLeagueDraftReturn {
    draftState:       MultiDraftState | null;
    poolPlayers:      DraftPoolPlayer[];
    isLoading:        boolean;

    // 파생 값
    isMyTurn:         boolean;
    currentPickEntry: { userId: string; teamId: string } | null;
    timeRemaining:    number;   // 초
    myTeamId:         string | null;
    myPicks:          string[]; // playerId[]

    submitPick:       (playerId: string) => Promise<{ error: string | null }>;
    isSubmitting:     boolean;

    /** 어드민 전용: pause/resume/reset-timer/skip-turn/autocomplete/rollback */
    sendAdmin:        (action: string, params?: { targetPickIndex?: number }) => void;
}

/**
 * 멀티 드래프트 상태 훅 (WebSocket 버전).
 *
 * Realtime 구독 제거 → Fly.io Bun WS 서버 연결.
 *
 * 프로토콜:
 *   open  → { type:'auth', roomId, token }
 *   ← snapshot (1회, 풀 포함)
 *   ← pick (delta: cursor + 새 픽 1개)
 *   ← cursor (pause/resume/reset-timer)
 *   → { type:'submitPick', playerId }   ← { type:'ack' } | { type:'error', code }
 *   → { type:'admin', action, params }
 *   → { type:'ping' }   ← { type:'pong' }  (30s heartbeat)
 */
export function useLeagueDraft(
    roomId:  string | null,
    session: Session | null
): UseLeagueDraftReturn {
    const userId = session?.user?.id ?? null;
    const token  = session?.access_token ?? null;

    const [draftState,   setDraftState]   = useState<MultiDraftState | null>(null);
    const [poolPlayers,  setPoolPlayers]  = useState<DraftPoolPlayer[]>([]);
    const [isLoading,    setIsLoading]    = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 타이머 (표시 전용)
    const [timeRemaining, setTimeRemaining] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // WS + 재연결 상태
    const wsRef        = useRef<WebSocket | null>(null);
    const backoffRef   = useRef(1000);
    const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const destroyedRef = useRef(false);   // unmount 후 재연결 방지

    // submitPick Promise 콜백 (ack/error 수신 시 resolve)
    const pendingPickRef = useRef<{
        resolve: (v: { error: string | null }) => void;
        timer:   ReturnType<typeof setTimeout>;
    } | null>(null);

    // ── WS 연결 / 재연결 ──────────────────────────────────────────────────────
    const connect = useCallback(() => {
        if (!roomId || !token || destroyedRef.current) return;

        const ws = new WebSocket(WS_BASE);
        wsRef.current = ws;

        ws.onopen = () => {
            backoffRef.current = 1000; // 재연결 성공 → backoff 리셋
            ws.send(JSON.stringify({ type: 'auth', roomId, token }));
        };

        ws.onmessage = (ev) => {
            let msg: any;
            try { msg = JSON.parse(ev.data as string); } catch { return; }

            switch (msg.type) {
                // ── 초기 스냅샷 (풀 포함, 1회) ────────────────────────────
                case 'snapshot': {
                    const { config, cursor, picks, pool } = msg as {
                        config: any; cursor: any;
                        picks:  any[]; pool: DraftPoolPlayer[];
                    };
                    const pickEntries = buildPickEntries(picks);
                    setDraftState(assembleState(config, cursor, pickEntries));
                    setPoolPlayers(pool);
                    setIsLoading(false);
                    break;
                }

                // ── 픽 델타 (~200B) ────────────────────────────────────────
                case 'pick': {
                    const { pick: newPick, cursor } = msg as {
                        pick: DraftPickEntry; cursor: any;
                    };
                    setDraftState(prev => {
                        if (!prev) return prev;
                        if (prev.picks.some(p => p.pickIndex === newPick.pickIndex)) {
                            // cursor만 갱신 (낙관적 업데이트와 WS delta 중복)
                            return applycursor(prev, cursor);
                        }
                        return {
                            ...applyPick(prev, newPick),
                            ...cursorFields(cursor),
                        };
                    });
                    break;
                }

                // ── cursor만 변경 (pause/resume/reset-timer) ──────────────
                case 'cursor': {
                    setDraftState(prev => prev ? applycursor(prev, msg.cursor) : prev);
                    break;
                }

                // ── submitPick ack ─────────────────────────────────────────
                case 'ack': {
                    setIsSubmitting(false);
                    if (pendingPickRef.current) {
                        clearTimeout(pendingPickRef.current.timer);
                        pendingPickRef.current.resolve({ error: null });
                        pendingPickRef.current = null;
                    }
                    break;
                }

                // ── 에러 (submitPick 또는 admin 실패) ─────────────────────
                case 'error': {
                    setIsSubmitting(false);
                    if (pendingPickRef.current) {
                        clearTimeout(pendingPickRef.current.timer);
                        const code = msg.code ?? 'internal';
                        pendingPickRef.current.resolve({ error: code });
                        pendingPickRef.current = null;
                    }
                    break;
                }

                case 'pong':
                    break; // heartbeat — 무시

                default:
                    break;
            }
        };

        ws.onclose = () => {
            if (destroyedRef.current) return;
            // 지수 백오프 재연결 (1s → 2s → 4s → max 10s)
            const delay = Math.min(backoffRef.current, 10_000);
            backoffRef.current = Math.min(backoffRef.current * 2, 10_000);
            reconnectRef.current = setTimeout(connect, delay);
            console.log(`[useLeagueDraft] WS closed, reconnect in ${delay}ms`);
        };

        ws.onerror = (e) => {
            console.warn('[useLeagueDraft] WS error', e);
        };
    }, [roomId, token]);

    // roomId / token이 바뀌면 재연결
    useEffect(() => {
        destroyedRef.current = false;
        setIsLoading(true);
        setDraftState(null);
        setPoolPlayers([]);

        connect();

        // 30초 heartbeat
        const pingTimer = setInterval(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30_000);

        return () => {
            destroyedRef.current = true;
            clearInterval(pingTimer);
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
            wsRef.current?.close();
        };
    }, [connect]);

    // ── 타이머 (표시 전용) ────────────────────────────────────────────────────
    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);

        if (!draftState || draftState.status === 'pending' || draftState.status === 'completed') {
            setTimeRemaining(0);
            return;
        }
        if (draftState.status === 'paused') return;

        const update = () => {
            const elapsed    = (Date.now() - new Date(draftState.currentPickStartedAt).getTime()) / 1000;
            const remaining  = Math.max(0, Math.round(draftState.pickDurationSec - elapsed));
            setTimeRemaining(remaining);
        };
        update();
        timerRef.current = setInterval(update, 500);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [draftState?.currentPickIndex, draftState?.currentPickStartedAt, draftState?.status]);

    // ── 파생 값 ───────────────────────────────────────────────────────────────
    const currentPickEntry = draftState?.pickOrder[draftState.currentPickIndex] ?? null;
    const isMyTurn         = !!(currentPickEntry && currentPickEntry.userId === userId && draftState?.status === 'active');
    const myTeamId         = draftState?.pickOrder.find(e => e.userId === userId)?.teamId ?? null;
    const myPicks          = (draftState?.picks ?? [])
        .filter(p => p.userId === userId)
        .map(p => p.playerId);

    // ── submitPick ────────────────────────────────────────────────────────────
    const submitPick = useCallback(async (playerId: string): Promise<{ error: string | null }> => {
        if (!roomId || !token) return { error: 'not authenticated' };
        if (!isMyTurn)         return { error: 'not your turn' };
        if (wsRef.current?.readyState !== WebSocket.OPEN) return { error: 'connection lost' };

        setIsSubmitting(true);

        return new Promise<{ error: string | null }>((resolve) => {
            // 5초 타임아웃
            const timer = setTimeout(() => {
                pendingPickRef.current = null;
                setIsSubmitting(false);
                resolve({ error: 'timeout' });
            }, 5_000);

            pendingPickRef.current = { resolve, timer };
            wsRef.current!.send(JSON.stringify({ type: 'submitPick', playerId }));
        });
    }, [roomId, token, isMyTurn]);

    // ── sendAdmin ─────────────────────────────────────────────────────────────
    const sendAdmin = useCallback((action: string, params?: { targetPickIndex?: number }) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify({ type: 'admin', action, params }));
    }, []);

    return {
        draftState, poolPlayers, isLoading,
        isMyTurn, currentPickEntry, timeRemaining, myTeamId, myPicks,
        submitPick, isSubmitting,
        sendAdmin,
    };
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function rowToPickEntry(row: any): DraftPickEntry {
    return {
        pickIndex:  row.pickIndex  ?? row.pick_index  ?? 0,
        round:      row.round      ?? 0,
        slot:       row.slot       ?? 0,
        userId:     row.userId     ?? row.user_id     ?? '',
        teamId:     row.teamId     ?? row.team_id     ?? '',
        playerId:   row.playerId   ?? row.player_id   ?? '',
        playerName: row.playerName ?? row.player_name ?? '',
        position:   row.position   ?? '',
        ovr:        row.ovr        ?? 0,
        pickedAt:   row.pickedAt   ?? row.picked_at   ?? '',
    };
}

function buildPickEntries(rows: any[]): DraftPickEntry[] {
    return rows.map(rowToPickEntry);
}

function assembleState(config: any, cursor: any, picks: DraftPickEntry[]): MultiDraftState {
    return {
        format:               config.format          ?? 'snake',
        totalRounds:          config.totalRounds      ?? 10,
        pickDurationSec:      config.pickDurationSec  ?? 30,
        teamCount:            config.teamCount        ?? 0,
        poolIds:              config.poolIds          ?? [],
        pickOrder:            config.pickOrder        ?? [],
        status:               cursor.status               ?? 'active',
        currentPickIndex:     cursor.currentPickIndex     ?? 0,
        currentPickStartedAt: cursor.currentPickStartedAt ?? '',
        pausedAt:             cursor.pausedAt,
        picks,
        draftedIds: picks.map(p => p.playerId),
    };
}

function cursorFields(cursor: any) {
    return {
        status:               cursor.status               ?? 'active',
        currentPickIndex:     cursor.currentPickIndex     ?? 0,
        currentPickStartedAt: cursor.currentPickStartedAt ?? '',
        pausedAt:             cursor.pausedAt,
    };
}

function applyPick(prev: MultiDraftState, pick: DraftPickEntry): MultiDraftState {
    return {
        ...prev,
        picks:      [...prev.picks, pick],
        draftedIds: [...prev.draftedIds, pick.playerId],
    };
}

function applycursor(prev: MultiDraftState, cursor: any): MultiDraftState {
    return { ...prev, ...cursorFields(cursor) };
}
