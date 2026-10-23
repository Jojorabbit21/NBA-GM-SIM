
import { useState, useEffect, useCallback, useRef } from 'react';
import { mapDraftError } from '../utils/draftErrors';
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

    /** 어드민 전용: pause/resume/reset-timer/skip-turn/autocomplete/rollback/toggle-autopick */
    sendAdmin:        (action: string, params?: { targetPickIndex?: number; targetUserId?: string; enabled?: boolean }) => void;

    /** 본인 팀 오토픽 모드 on/off (어드민 권한 불필요) */
    toggleAutoPick:   (enabled: boolean) => void;

    /** [2026-10-23] 본인 드래프트 큐 로컬 편집본(playerId[], 희망 순서). 지명된 선수도 그대로 남는다(화면에서 걸러 표시). */
    myQueue:          string[];
    /** 로컬 편집만 — 서버엔 안 보낸다(저장 버튼 방식) */
    setQueue:         (playerIds: string[]) => void;
    /** 로컬 큐를 서버(draft_queues)에 저장 — 오토픽은 저장본만 본다. 에코/실패/5초 타임아웃으로 resolve */
    saveQueue:        () => Promise<{ error: string | null }>;
    /** 로컬 편집본 ≠ 서버 저장본 */
    queueDirty:       boolean;
    queueSaving:      boolean;

    /** [2026-10-13] WS 연결 상태 — reconnecting이면 화면이 지명 버튼·오토픽 토글을 막고 인라인으로 알린다 */
    connectionState:  'connecting' | 'connected' | 'reconnecting';
    /** 연속 재연결 시도 횟수(연결 성공 시 0) */
    reconnectAttempt: number;
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
 *   ← queue (auth 직후 1회, 본인 큐만) / → { type:'setQueue', playerIds } ← queue (에코, 같은 유저 소켓 전부) | { type:'error', code:'queue_save_failed' }
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
    // [2026-07-29] 서버-클라이언트 clock skew 보정값(ms, 양수 = 서버 시계가 빠름).
    // cursor.serverNow 수신 시마다 갱신 — Fly.io 서버와 클라이언트 로컬 시계가 몇 초 어긋나 있으면
    // 카운트다운이 그만큼 부풀어 보이는 문제(AI 픽처럼 짧은 타이머에서 특히 두드러짐)를 방지한다.
    const clockSkewRef = useRef(0);
    function updateClockSkew(cursor: any) {
        if (cursor?.serverNow) {
            clockSkewRef.current = new Date(cursor.serverNow).getTime() - Date.now();
        }
    }

    // WS + 재연결 상태
    const wsRef        = useRef<WebSocket | null>(null);
    const backoffRef   = useRef(1000);
    const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const destroyedRef = useRef(false);   // unmount 후 재연결 방지
    // [2026-10-13] 연결 상태 노출 + 좀비 소켓 감시(docs/plan/ui-inline-notice.md 4-4)
    const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
    const [reconnectAttempt, setReconnectAttempt] = useState(0);
    const missedPongRef = useRef(0);      // 마지막 pong 이후 보낸 ping 수 — 2개 이상 쌓이면(60초 무응답) 소켓을 강제로 닫아 재연결

    // submitPick Promise 콜백 (ack/error 수신 시 resolve)
    const pendingPickRef = useRef<{
        resolve: (v: { error: string | null }) => void;
        timer:   ReturnType<typeof setTimeout>;
    } | null>(null);

    // [2026-10-23] 드래프트 큐 — 로컬 편집본(myQueue) + 서버 저장본(savedQueue), 저장 버튼으로만 전송(사용자 결정:
    // 자동 저장·디바운스 폐기). dirty = 둘이 다름. 서버 queue 메시지(auth 직후·에코·다른 탭 저장)는 항상 savedQueue 를
    // 갱신하고, 로컬에 미저장 편집이 없을 때만 myQueue 도 따라간다(미저장 편집을 옛 값으로 덮지 않기 위해).
    const [myQueue,    setMyQueue]    = useState<string[]>([]);
    const [savedQueue, setSavedQueue] = useState<string[]>([]);
    const queueLocalRef = useRef<string[]>([]);
    const queueSavedRef = useRef<string[]>([]);
    const [queueSaving, setQueueSaving] = useState(false);
    // saveQueue Promise 콜백 (queue 에코 / queue_save_failed 수신 시 resolve)
    const pendingQueueRef = useRef<{
        resolve: (v: { error: string | null }) => void;
        timer:   ReturnType<typeof setTimeout>;
    } | null>(null);
    const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

    // ── WS 연결 / 재연결 ──────────────────────────────────────────────────────
    const connect = useCallback(() => {
        if (!roomId || !token || destroyedRef.current) return;

        const ws = new WebSocket(WS_BASE);
        wsRef.current = ws;

        ws.onopen = () => {
            backoffRef.current = 1000; // 재연결 성공 → backoff 리셋
            missedPongRef.current = 0;
            setConnectionState('connected');
            setReconnectAttempt(0);
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
                    updateClockSkew(cursor);
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
                    updateClockSkew(cursor);
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
                    updateClockSkew(msg.cursor);
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

                // ── 에러 (submitPick / admin / 큐 저장 실패) ───────────────
                case 'error': {
                    // [2026-10-23] 큐 저장 실패는 큐 Promise 로만 보낸다 — 픽 제출 Promise 를 잘못 깨우지 않도록 분리
                    if (msg.code === 'queue_save_failed') {
                        setQueueSaving(false);
                        if (pendingQueueRef.current) {
                            clearTimeout(pendingQueueRef.current.timer);
                            pendingQueueRef.current.resolve({ error: '큐를 저장하지 못했습니다. 다시 시도하세요.' });
                            pendingQueueRef.current = null;
                        }
                        break;
                    }
                    setIsSubmitting(false);
                    if (pendingPickRef.current) {
                        clearTimeout(pendingPickRef.current.timer);
                        const code = msg.code ?? 'internal';
                        pendingPickRef.current.resolve({ error: mapDraftError(code) });
                        pendingPickRef.current = null;
                    }
                    break;
                }

                // ── [2026-10-23] 본인 큐 (auth 직후 1회 + 저장 에코 + 다른 탭 저장) ──
                case 'queue': {
                    const ids = Array.isArray(msg.playerIds) ? msg.playerIds.map(String) : [];
                    const wasDirty = !sameIds(queueLocalRef.current, queueSavedRef.current);
                    queueSavedRef.current = ids;
                    setSavedQueue(ids);
                    if (pendingQueueRef.current) {
                        // 내가 보낸 저장의 에코 — 저장 중 추가 편집이 없었으면 로컬도 서버값으로 정리(정규화 결과 반영)
                        clearTimeout(pendingQueueRef.current.timer);
                        pendingQueueRef.current.resolve({ error: null });
                        pendingQueueRef.current = null;
                        setQueueSaving(false);
                        if (sameIds(queueLocalRef.current, ids) || !wasDirty) { queueLocalRef.current = ids; setMyQueue(ids); }
                    } else if (!wasDirty) {
                        // auth 초기값·다른 탭 저장 — 미저장 편집이 없을 때만 로컬 동기화
                        queueLocalRef.current = ids;
                        setMyQueue(ids);
                    }
                    break;
                }

                case 'pong':
                    missedPongRef.current = 0; // heartbeat 응답 — 좀비 카운터 리셋
                    break;

                default:
                    break;
            }
        };

        ws.onclose = () => {
            if (destroyedRef.current) return;
            setConnectionState('reconnecting');
            setReconnectAttempt(n => n + 1);
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
        // 방이 바뀌면 큐도 초기화 — 새 방의 큐는 auth 직후 서버가 보내준다
        setMyQueue([]);
        setSavedQueue([]);
        queueLocalRef.current = [];
        queueSavedRef.current = [];
        setQueueSaving(false);
        if (pendingQueueRef.current) { clearTimeout(pendingQueueRef.current.timer); pendingQueueRef.current = null; }

        connect();

        // 30초 heartbeat + 좀비 감시: pong 없이 ping이 2번 쌓이면(≈60초) 소켓을 닫아 onclose의 재연결 루프에 태운다.
        // 네트워크가 반쯤 죽은 상태(소켓은 OPEN, 서버 미응답)에서 submitPick이 5초 타임아웃으로만 실패하던 사각지대.
        const pingTimer = setInterval(() => {
            const ws = wsRef.current;
            if (ws?.readyState !== WebSocket.OPEN) return;
            if (missedPongRef.current >= 2) {
                console.warn('[useLeagueDraft] pong 2회 미수신 — 소켓 강제 종료 후 재연결');
                missedPongRef.current = 0;
                ws.close();
                return;
            }
            missedPongRef.current += 1;
            ws.send(JSON.stringify({ type: 'ping' }));
        }, 30_000);

        // 탭 복귀/네트워크 복귀 시 백오프를 기다리지 않고 즉시 재연결(연결 중이거나 이미 연결돼 있으면 무시)
        const wake = () => {
            if (destroyedRef.current) return;
            const st = wsRef.current?.readyState;
            if (st === WebSocket.OPEN || st === WebSocket.CONNECTING) return;
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
            backoffRef.current = 1000;
            connect();
        };
        const onVisible = () => { if (document.visibilityState === 'visible') wake(); };
        window.addEventListener('online', wake);
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            destroyedRef.current = true;
            clearInterval(pingTimer);
            if (pendingQueueRef.current) { clearTimeout(pendingQueueRef.current.timer); pendingQueueRef.current = null; }
            window.removeEventListener('online', wake);
            document.removeEventListener('visibilitychange', onVisible);
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
            // clockSkewRef로 서버-클라이언트 시계 오차를 보정한 "서버 기준 현재 시각"을 사용
            const correctedNow = Date.now() + clockSkewRef.current;
            const elapsed    = (correctedNow - new Date(draftState.currentPickStartedAt).getTime()) / 1000;
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
        if (!roomId || !token) return { error: mapDraftError('not authenticated') };
        if (!isMyTurn)         return { error: mapDraftError('not your turn') };
        if (wsRef.current?.readyState !== WebSocket.OPEN) return { error: mapDraftError('connection lost') };

        setIsSubmitting(true);

        return new Promise<{ error: string | null }>((resolve) => {
            // 5초 타임아웃
            const timer = setTimeout(() => {
                pendingPickRef.current = null;
                setIsSubmitting(false);
                resolve({ error: mapDraftError('timeout') });
            }, 5_000);

            pendingPickRef.current = { resolve, timer };
            wsRef.current!.send(JSON.stringify({ type: 'submitPick', playerId }));
        });
    }, [roomId, token, isMyTurn]);

    // ── sendAdmin ─────────────────────────────────────────────────────────────
    const sendAdmin = useCallback((action: string, params?: { targetPickIndex?: number; targetUserId?: string; enabled?: boolean }) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify({ type: 'admin', action, params }));
    }, []);

    // ── toggleAutoPick (본인 팀) ──────────────────────────────────────────────
    const toggleAutoPick = useCallback((enabled: boolean) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify({ type: 'toggleAutoPick', enabled }));
    }, []);

    // ── [2026-10-23] 큐 편집(로컬만) / 저장(서버 전송) ─────────────────────────
    const setQueue = useCallback((playerIds: string[]) => {
        const ids = playerIds.map(String);
        queueLocalRef.current = ids;
        setMyQueue(ids);
    }, []);

    // submitPick 과 같은 패턴: 전송 후 queue 에코(성공) / queue_save_failed(실패) / 5초 타임아웃으로 resolve
    const saveQueue = useCallback(async (): Promise<{ error: string | null }> => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return { error: '연결이 끊겨 저장할 수 없습니다. 다시 연결 중…' };
        if (pendingQueueRef.current) return { error: null };   // 이미 저장 중 — 중복 전송 안 함
        setQueueSaving(true);
        return new Promise<{ error: string | null }>((resolve) => {
            const timer = setTimeout(() => {
                pendingQueueRef.current = null;
                setQueueSaving(false);
                resolve({ error: '서버 응답이 없어 저장을 확인하지 못했습니다. 다시 시도하세요.' });
            }, 5_000);
            pendingQueueRef.current = { resolve, timer };
            wsRef.current!.send(JSON.stringify({ type: 'setQueue', playerIds: queueLocalRef.current }));
        });
    }, []);

    const queueDirty = !sameIds(myQueue, savedQueue);

    // 미저장 편집이 있으면 탭 닫기/새로고침 때 브라우저 확인창 — 저장 버튼 방식의 유일한 소실 경로 방지
    useEffect(() => {
        if (!queueDirty) return;
        const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [queueDirty]);

    return {
        draftState, poolPlayers, isLoading,
        isMyTurn, currentPickEntry, timeRemaining, myTeamId, myPicks,
        submitPick, isSubmitting,
        sendAdmin, toggleAutoPick,
        myQueue, setQueue, saveQueue, queueDirty, queueSaving,
        connectionState, reconnectAttempt,
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
        autoPickAfterMisses:  config.autoPickAfterMisses ?? 1,
        status:               cursor.status               ?? 'active',
        currentPickIndex:     cursor.currentPickIndex     ?? 0,
        currentPickStartedAt: cursor.currentPickStartedAt ?? '',
        pausedAt:             cursor.pausedAt,
        autoPickUserIds:      cursor.autoPickUserIds      ?? [],
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
        autoPickUserIds:      cursor.autoPickUserIds      ?? [],
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
