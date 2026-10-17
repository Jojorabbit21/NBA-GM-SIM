// useLeagueChat.ts — 리그 세션 채팅의 상태·구독·전송 로직. 계획: docs/plan/league-chat-plan.md
//
// LeagueLayout에 **한 번만** 마운트한다(LeagueChatDock 안에서). 위젯이 닫혀 있어도 같은 채널을 계속 구독해야
// FAB의 안 읽은 수 배지가 올라가고, 리그 화면을 이동해도 구독·입력 상태가 유지된다.
//
// - 저장: league_chat_messages(RPC send_chat_message 단일 경로). 입장 시 최근 50건 조회, 위로 스크롤하면 이전 페이지.
// - 실시간: 비공개 Broadcast 채널 `league-chat:{room_id}` (서버 RPC의 realtime.send가 내보냄). postgres_changes 아님.
//   같은 채널의 Presence로 접속 인원을 센다(key = user_id).
// - 재연결(SUBSCRIBED 재수신) 시 최근 페이지를 다시 받아 끊긴 동안 놓친 메시지를 채운다.
// - 도배 방지(값은 chatService 상수): 전송 후 0.5초 쿨다운 / 3초 안에 5건이면 5초 잠금 / 서버가 rate_limited를
//   돌려주면 남은 초만큼 같은 잠금. 잠금은 메모리에만(새로고침하면 풀림 — 서버 한도가 최후 방어선).
// - 마지막으로 읽은 id는 룸별 localStorage(편의 기능 — 실패해도 안 읽음 0으로 정상 동작).
// - [2026-10-17] 위젯이 채팅·알림 탭으로 통합되면서 열림/탭 상태는 LeagueChatDock이 갖는다. 이 훅은 "채팅 탭을 보고 있는지"
//   (viewing)만 받아 읽음 처리·"새 메시지 N개" 구분선 기준(unreadAnchorId)에 쓴다 — 위젯이 열려 있어도 알림 탭이면 채팅은 안 읽음.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import {
    CHAT_COOLDOWN_MS, CHAT_FLOOD_LOCK_MS, CHAT_MAX_BODY, CHAT_PAGE_SIZE,
    ChatSendError, chatErrorMessage, chatTopic, fetchChatMessages, sendChatMessage, shouldFloodLock,
    type ChatMessage,
} from '../services/multi/chatService';

export interface ChatOutboxItem {
    tempId: string;
    body: string;
    status: 'sending' | 'failed';
    error?: string;
    /** 보낸 순간의 클라이언트 시각(ms) — 전송 중 말풍선의 시간 표시용 */
    createdAt: number;
}

export type ChatConnection = 'connecting' | 'connected' | 'disconnected';
export type ChatHistoryStatus = 'loading' | 'ready' | 'error';

export interface LeagueChatState {
    messages: ChatMessage[];
    outbox: ChatOutboxItem[];
    historyStatus: ChatHistoryStatus;
    hasMore: boolean;
    loadingOlder: boolean;
    connection: ChatConnection;
    onlineCount: number;
    /** 지금 채널에 접속 중인 사용자 id(Presence key) — 메시지 아바타의 접속 표시용 */
    onlineUserIds: ReadonlySet<string>;
    unread: number;
    /** 채팅 탭을 보기 시작한 시점의 마지막 읽은 id — "새 메시지 N개" 구분선 위치(안 보면 null) */
    unreadAnchorId: number | null;
    /** 이전 메시지 페이지를 앞에 붙이고, 붙인 개수를 돌려준다 */
    loadOlder: () => Promise<number>;
    reloadHistory: () => void;
    /** 전송 요청. 쿨다운·잠금·빈 문자열이면 false(아무 일도 안 함) */
    send: (raw: string) => boolean;
    retry: (tempId: string) => void;
    discard: (tempId: string) => void;
    /** 전송 버튼 잠깐 비활성(0.5초 쿨다운) */
    cooling: boolean;
    /** 도배 잠금 남은 초(0이면 잠금 아님) */
    lockRemainingSec: number;
}

const readKey = (roomId: string) => `nba-gm-sim-chat-read:${roomId}`;

function readStorage(key: string): string | null {
    try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key: string, value: string): void {
    try { window.localStorage.setItem(key, value); } catch { /* 사생활 모드 등 — 무시 */ }
}

/** id 기준 중복 제거 + 오름차순 정렬 */
function mergeMessages(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
    if (incoming.length === 0) return prev;
    const byId = new Map<number, ChatMessage>();
    for (const m of prev) byId.set(m.id, m);
    for (const m of incoming) byId.set(m.id, m);
    return Array.from(byId.values()).sort((a, b) => a.id - b.id);
}

export function useLeagueChat(roomId: string | null | undefined, userId: string | null | undefined, viewing: boolean): LeagueChatState {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [outbox, setOutbox] = useState<ChatOutboxItem[]>([]);
    const [historyStatus, setHistoryStatus] = useState<ChatHistoryStatus>('loading');
    const [hasMore, setHasMore] = useState(false);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [connection, setConnection] = useState<ChatConnection>('connecting');
    const [onlineCount, setOnlineCount] = useState(0);
    const [onlineUserIds, setOnlineUserIds] = useState<ReadonlySet<string>>(() => new Set());
    const [lastReadId, setLastReadId] = useState(0);
    const [unreadAnchorId, setUnreadAnchorId] = useState<number | null>(null);
    const [cooling, setCooling] = useState(false);
    const [lockUntil, setLockUntil] = useState(0);
    const [now, setNow] = useState(() => Date.now());
    const [historyTick, setHistoryTick] = useState(0);

    const messagesRef = useRef<ChatMessage[]>([]);
    messagesRef.current = messages;
    const lastReadRef = useRef(0);
    const readInitializedRef = useRef(false);
    const sentAtRef = useRef<number[]>([]);
    const cooldownUntilRef = useRef(0);
    const lockUntilRef = useRef(0);
    const seqRef = useRef(0);
    const loadingOlderRef = useRef(false);

    const addMessages = useCallback((incoming: ChatMessage[]) => {
        setMessages(prev => mergeMessages(prev, incoming));
    }, []);

    const persistLastRead = useCallback((id: number) => {
        if (!roomId || id <= lastReadRef.current) return;
        lastReadRef.current = id;
        setLastReadId(id);
        writeStorage(readKey(roomId), String(id));
    }, [roomId]);

    // ── 룸이 바뀌면 전부 초기화하고 저장된 열림/읽음 상태를 복원 ────────────────────
    useEffect(() => {
        setMessages([]);
        setOutbox([]);
        setHistoryStatus('loading');
        setHasMore(false);
        setOnlineCount(0);
        setOnlineUserIds(new Set());
        setConnection('connecting');
        setLockUntil(0);
        lockUntilRef.current = 0;
        cooldownUntilRef.current = 0;
        sentAtRef.current = [];
        readInitializedRef.current = false;
        lastReadRef.current = 0;
        setLastReadId(0);
        if (!roomId) { setUnreadAnchorId(null); return; }
        const storedRead = Number(readStorage(readKey(roomId)));
        if (Number.isFinite(storedRead) && storedRead > 0) {
            lastReadRef.current = storedRead;
            setLastReadId(storedRead);
            readInitializedRef.current = true;
        }
    }, [roomId]);

    // 채팅 탭을 보기 시작하는 순간의 읽은 위치를 구분선 기준으로 고정(보는 동안 읽음 처리가 올라가도 구분선은 그대로).
    // 선언 순서 주의: 위 룸 초기화 효과가 먼저 돌아 lastReadRef가 복원된 뒤에 읽고, 아래 읽음 효과보다 먼저 돈다.
    useEffect(() => {
        setUnreadAnchorId(viewing ? lastReadRef.current : null);
    }, [viewing, roomId]);

    // ── 입장 시 최근 페이지 조회 ──────────────────────────────────────────────────
    useEffect(() => {
        if (!roomId) return;
        let cancelled = false;
        setHistoryStatus('loading');
        fetchChatMessages(roomId)
            .then(rows => {
                if (cancelled) return;
                addMessages(rows);
                setHasMore(rows.length >= CHAT_PAGE_SIZE);
                setHistoryStatus('ready');
                // 처음 입장한 리그: 기존 대화를 "안 읽음"으로 치지 않도록 지금 마지막 id를 읽음 기준으로 삼는다
                if (!readInitializedRef.current) {
                    readInitializedRef.current = true;
                    const baseline = rows.length > 0 ? rows[rows.length - 1].id : 0;
                    persistLastRead(baseline);
                    setUnreadAnchorId(a => (a === null ? null : baseline));   // 처음 입장: 기존 대화를 구분선 아래 "새 메시지"로 세지 않음
                }
            })
            .catch(() => { if (!cancelled) setHistoryStatus('error'); });
        return () => { cancelled = true; };
    }, [roomId, historyTick, addMessages, persistLastRead]);

    // ── 실시간 구독(Broadcast + Presence) ─────────────────────────────────────────
    useEffect(() => {
        if (!roomId || !userId) return;
        let cancelled = false;
        let firstSubscribe = true;

        const channel = supabase.channel(chatTopic(roomId), {
            config: { private: true, presence: { key: userId } },
        });

        channel
            .on('broadcast', { event: 'message' }, ({ payload }) => {
                const m = payload as ChatMessage | null;
                if (m && typeof m.id === 'number' && typeof m.body === 'string') {
                    addMessages([m]);
                    // 내 메시지의 broadcast가 RPC 응답보다 먼저 도착하면 임시(전송 중) 말풍선과 실제 메시지가 잠깐 겹쳐 보인다 —
                    // 같은 내용의 가장 오래된 전송 중 항목을 바로 걷어 교체를 즉시 끝낸다(응답이 오면 어차피 걷는 항목이라 중복 제거는 무해).
                    if (m.user_id === userId) {
                        setOutbox(o => {
                            const i = o.findIndex(x => x.status === 'sending' && x.body === m.body);
                            return i < 0 ? o : [...o.slice(0, i), ...o.slice(i + 1)];
                        });
                    }
                }
            })
            .on('presence', { event: 'sync' }, () => {
                const keys = Object.keys(channel.presenceState());
                setOnlineCount(keys.length);
                setOnlineUserIds(new Set(keys));
            })
            .subscribe((status) => {
                if (cancelled) return;
                if (status === 'SUBSCRIBED') {
                    setConnection('connected');
                    void channel.track({ user_id: userId, at: new Date().toISOString() });
                    if (!firstSubscribe) {
                        // 끊긴 동안 놓친 메시지 보충(최초 구독은 입장 조회가 담당)
                        fetchChatMessages(roomId).then(rows => { if (!cancelled) addMessages(rows); }).catch(() => { /* 다음 수신 때 보충 */ });
                    }
                    firstSubscribe = false;
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    setConnection('disconnected');
                }
            });

        return () => {
            cancelled = true;
            supabase.removeChannel(channel);
        };
    }, [roomId, userId, addMessages]);

    // ── 읽음 ─────────────────────────────────────────────────────────────────────
    // 채팅 탭을 보는 동안 도착한 메시지는 바로 읽음 처리
    useEffect(() => {
        if (!viewing || messages.length === 0) return;
        persistLastRead(messages[messages.length - 1].id);
    }, [viewing, messages, persistLastRead]);

    const unread = useMemo(() => {
        if (viewing) return 0;
        let n = 0;
        for (const m of messages) if (m.id > lastReadId && m.user_id !== userId) n++;
        return n;
    }, [viewing, messages, lastReadId, userId]);

    // ── 이전 페이지 ──────────────────────────────────────────────────────────────
    const loadOlder = useCallback(async (): Promise<number> => {
        const first = messagesRef.current[0];
        if (!roomId || !first || loadingOlderRef.current) return 0;
        loadingOlderRef.current = true;
        setLoadingOlder(true);
        try {
            const rows = await fetchChatMessages(roomId, first.id);
            addMessages(rows);
            setHasMore(rows.length >= CHAT_PAGE_SIZE);
            return rows.length;
        } catch {
            return 0;
        } finally {
            loadingOlderRef.current = false;
            setLoadingOlder(false);
        }
    }, [roomId, addMessages]);

    const reloadHistory = useCallback(() => setHistoryTick(t => t + 1), []);

    // ── 전송 ────────────────────────────────────────────────────────────────────
    const lockFor = useCallback((ms: number) => {
        const until = Date.now() + ms;
        if (until <= lockUntilRef.current) return;
        lockUntilRef.current = until;
        setLockUntil(until);
        setNow(Date.now());
    }, []);

    // 잠금 중에만 0.25초 간격으로 남은 초를 갱신
    useEffect(() => {
        if (lockUntil <= Date.now()) return;
        const id = window.setInterval(() => {
            const t = Date.now();
            setNow(t);
            if (t >= lockUntil) window.clearInterval(id);
        }, 250);
        return () => window.clearInterval(id);
    }, [lockUntil]);

    const dispatch = useCallback(async (body: string, tempId: string) => {
        if (!roomId) return;
        try {
            const row = await sendChatMessage(roomId, body);
            setOutbox(o => o.filter(x => x.tempId !== tempId));
            addMessages([row]);   // 곧 도착할 broadcast와는 id로 중복 제거
        } catch (e) {
            if (e instanceof ChatSendError && e.code === 'rate_limited') lockFor((e.waitSec ?? 5) * 1000);
            setOutbox(o => o.map(x => x.tempId === tempId ? { ...x, status: 'failed', error: chatErrorMessage(e) } : x));
        }
    }, [roomId, addMessages, lockFor]);

    /** 쿨다운·잠금·도배 판정을 통과하면 전송 시각을 기록한다. 통과 못 하면 false. */
    const admit = useCallback((): boolean => {
        const t = Date.now();
        if (t < lockUntilRef.current || t < cooldownUntilRef.current) return false;
        const next = [...sentAtRef.current.filter(s => t - s < 60_000), t];
        sentAtRef.current = next;
        cooldownUntilRef.current = t + CHAT_COOLDOWN_MS;
        setCooling(true);
        window.setTimeout(() => setCooling(false), CHAT_COOLDOWN_MS);
        if (shouldFloodLock(next, t)) {
            lockFor(CHAT_FLOOD_LOCK_MS);
            sentAtRef.current = [];
        }
        return true;
    }, [lockFor]);

    const send = useCallback((raw: string): boolean => {
        const body = raw.trim();
        if (!roomId || !body || body.length > CHAT_MAX_BODY) return false;
        if (!admit()) return false;
        const tempId = `tmp-${++seqRef.current}`;
        setOutbox(o => [...o, { tempId, body, status: 'sending', createdAt: Date.now() }]);
        void dispatch(body, tempId);
        return true;
    }, [roomId, admit, dispatch]);

    const retry = useCallback((tempId: string) => {
        const item = outbox.find(x => x.tempId === tempId);
        if (!item || item.status !== 'failed' || !admit()) return;
        setOutbox(o => o.map(x => x.tempId === tempId ? { ...x, status: 'sending', error: undefined } : x));
        void dispatch(item.body, tempId);
    }, [outbox, admit, dispatch]);

    const discard = useCallback((tempId: string) => {
        setOutbox(o => o.filter(x => x.tempId !== tempId));
    }, []);

    const lockRemainingSec = lockUntil > now ? Math.ceil((lockUntil - now) / 1000) : 0;

    return {
        messages, outbox, historyStatus, hasMore, loadingOlder, connection, onlineCount, onlineUserIds,
        unread, unreadAnchorId, loadOlder, reloadHistory,
        send, retry, discard, cooling, lockRemainingSec,
    };
}
