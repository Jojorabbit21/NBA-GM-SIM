// useLeagueDm.ts — 리그 DM(다이렉트 메시지) 상태·구독·전송. 계획: docs/plan/league-chat-plan.md "DM 2차 확정안"
//
// LeagueChatDock에 한 번만 마운트한다(위젯이 닫혀 있어도 받은편지함을 구독해야 FAB 배지가 오른다).
// - 저장: league_chat_messages(recipient_id + conv_key). 전송은 send_chat_message RPC(p_recipient_id) 단일 경로.
// - 실시간: 내 받은편지함 비공개 채널 `league-dm:{room}:{me}` 하나 — 대화마다 채널을 만들지 않는다.
//   보낸 메시지는 RPC 반환값으로 내 화면에 반영한다(서버는 받는 사람에게만 브로드캐스트).
// - 목록: list_dm_conversations RPC(상대 이름·팀·마지막 id·안 읽은 수·삭제 기준). 모르는 대화의 메시지가 오면 목록을 다시 받는다.
// - 읽음: 대화를 보고 있는 동안 마지막 id를 mark_dm_read로 올린다(읽음 표시는 상대에게 보이지 않음 — 결정 1).
// - 삭제: clear_dm_conversation — 나에게서만. 이후 상대가 새 메시지를 보내면 목록에 다시 나타나고 그 뒤 메시지만 보인다.
// - 도배 방지: 전체 채팅과 같은 ChatSendGate를 받는다(서버 한도가 합산이므로).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import {
    CHAT_MAX_BODY, CHAT_PAGE_SIZE,
    ChatSendError, chatErrorMessage, clearDmConversation, dmConvKey, dmTopic, fetchDmClearedId, fetchDmMessages,
    listDmConversations, markDmRead, sanitizeChatBody, sendChatMessage,
    type ChatMessage, type DmConversation,
} from '../services/multi/chatService';
import { mergeMessages, type ChatConnection, type ChatHistoryStatus, type ChatOutboxItem } from './useLeagueChat';
import type { ChatSendGate } from './useChatSendGate';

export interface DmPeer {
    userId: string;
    name: string;
    teamId: string | null;
    teamAbbr: string | null;
    teamName: string | null;
}

export interface DmActive {
    convKey: string;
    peer: DmPeer;
}

export type DmListStatus = 'loading' | 'ready' | 'error';

export interface LeagueDmState {
    conversations: DmConversation[];
    listStatus: DmListStatus;
    reloadList: () => void;
    /** 안 읽은 DM 합계(보고 있는 대화 제외) */
    unread: number;
    active: DmActive | null;
    /** 상대를 골라 대화를 연다(목록에 없으면 새 대화) */
    openWith: (peer: DmPeer) => void;
    closeActive: () => void;
    messages: ChatMessage[];
    outbox: ChatOutboxItem[];
    historyStatus: ChatHistoryStatus;
    hasMore: boolean;
    loadingOlder: boolean;
    loadOlder: () => Promise<number>;
    reloadHistory: () => void;
    send: (raw: string) => boolean;
    retry: (tempId: string) => void;
    discard: (tempId: string) => void;
    /** 보고 있는 대화를 나에게서만 삭제. 실패하면 ChatSendError를 던진다 */
    clearActive: () => Promise<void>;
    markReported: (id: number) => void;
    connection: ChatConnection;
}

const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];

export const peerFromConversation = (c: DmConversation): DmPeer => ({
    userId: c.peer_id, name: c.peer_name, teamId: c.peer_team_id, teamAbbr: c.peer_team_abbr, teamName: c.peer_team_name,
});

export function useLeagueDm(
    roomId: string | null | undefined, userId: string | null | undefined, viewing: boolean, gate: ChatSendGate,
): LeagueDmState {
    const [conversations, setConversations] = useState<DmConversation[]>([]);
    const [listStatus, setListStatus] = useState<DmListStatus>('loading');
    const [listTick, setListTick] = useState(0);
    const [active, setActive] = useState<DmActive | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [outbox, setOutbox] = useState<ChatOutboxItem[]>([]);
    const [historyStatus, setHistoryStatus] = useState<ChatHistoryStatus>('loading');
    const [hasMore, setHasMore] = useState(false);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [historyTick, setHistoryTick] = useState(0);
    const [connection, setConnection] = useState<ChatConnection>('connecting');
    const [reconnectTick, setReconnectTick] = useState(0);

    const activeRef = useRef<DmActive | null>(null);
    activeRef.current = active;
    const viewingRef = useRef(viewing);
    viewingRef.current = viewing;
    const conversationsRef = useRef<DmConversation[]>([]);
    conversationsRef.current = conversations;
    const messagesRef = useRef<ChatMessage[]>([]);
    messagesRef.current = messages;
    /** 보고 있는 대화의 삭제 기준 — 이 id 이하는 조회하지 않는다 */
    const clearedRef = useRef(0);
    const markedRef = useRef<Map<string, number>>(new Map());
    const loadingOlderRef = useRef(false);
    const seqRef = useRef(0);
    const reconnectAttemptRef = useRef(0);

    const addMessages = useCallback((incoming: ChatMessage[]) => {
        setMessages(prev => mergeMessages(prev, incoming));
    }, []);

    // ── 룸이 바뀌면 전부 초기화 ───────────────────────────────────────────────────
    useEffect(() => {
        setConversations([]);
        setListStatus('loading');
        setActive(null);
        setMessages([]);
        setOutbox([]);
        markedRef.current = new Map();
    }, [roomId]);

    // ── 대화 목록 ────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!roomId || !userId) return;
        let cancelled = false;
        listDmConversations(roomId)
            .then(rows => {
                if (cancelled) return;
                setConversations(rows);
                setListStatus('ready');
            })
            .catch(() => { if (!cancelled) setListStatus(s => (s === 'ready' ? s : 'error')); });
        return () => { cancelled = true; };
    }, [roomId, userId, listTick]);

    const reloadList = useCallback(() => setListTick(t => t + 1), []);

    // ── 보고 있는 대화의 메시지(대화가 바뀔 때마다 처음부터) ─────────────────────────────
    const activeKey = active?.convKey ?? null;
    useEffect(() => {
        setMessages([]);
        setOutbox([]);
        setHasMore(false);
        if (!roomId || !activeKey) return;
        let cancelled = false;
        setHistoryStatus('loading');
        (async () => {
            const known = conversationsRef.current.find(c => c.conv_key === activeKey);
            // 목록에 없는 대화 = 처음이거나 내가 삭제한 대화 → 삭제 기준은 서버 상태에서 읽는다
            const cleared = known ? known.cleared_before_id : await fetchDmClearedId(roomId, activeKey);
            if (cancelled) return;
            clearedRef.current = cleared;
            const rows = await fetchDmMessages(roomId, activeKey, cleared);
            if (cancelled) return;
            addMessages(rows);
            setHasMore(rows.length >= CHAT_PAGE_SIZE);
            setHistoryStatus('ready');
        })().catch(() => { if (!cancelled) setHistoryStatus('error'); });
        return () => { cancelled = true; };
    }, [roomId, activeKey, historyTick, addMessages]);

    const reloadHistory = useCallback(() => setHistoryTick(t => t + 1), []);

    // ── 실시간: 내 받은편지함 ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!roomId || !userId) return;
        let cancelled = false;
        let firstSubscribe = true;
        let retryTimer: number | undefined;

        const channel = supabase.channel(dmTopic(roomId, userId), { config: { private: true } });
        channel
            .on('broadcast', { event: 'dm' }, ({ payload }) => {
                const m = payload as ChatMessage | null;
                if (!m || typeof m.id !== 'number' || typeof m.body !== 'string' || !m.conv_key) return;
                const key = m.conv_key;
                if (activeRef.current?.convKey === key) addMessages([m]);
                const seenHere = viewingRef.current && activeRef.current?.convKey === key;
                const known = conversationsRef.current.some(c => c.conv_key === key);
                if (!known) { setListTick(t => t + 1); return; }   // 새 상대 or 내가 삭제했던 대화 → 상대 정보 포함해 다시 받기
                setConversations(prev => {
                    const i = prev.findIndex(c => c.conv_key === key);
                    if (i < 0) return prev;
                    const c = prev[i];
                    const next = { ...c, last_id: Math.max(c.last_id, m.id), last_at: m.created_at, unread: seenHere ? 0 : c.unread + 1 };
                    return [next, ...prev.slice(0, i), ...prev.slice(i + 1)];
                });
            })
            .subscribe((status) => {
                if (cancelled) return;
                if (status === 'SUBSCRIBED') {
                    reconnectAttemptRef.current = 0;
                    setConnection('connected');
                    if (!firstSubscribe) {
                        // 끊긴 동안 놓친 메시지 보충
                        setListTick(t => t + 1);
                        const a = activeRef.current;
                        if (a) fetchDmMessages(roomId, a.convKey, clearedRef.current).then(rows => { if (!cancelled) addMessages(rows); }).catch(() => { /* 다음 수신 때 */ });
                    }
                    firstSubscribe = false;
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    setConnection('disconnected');
                    // 서버가 닫은 경우(토큰 만료 등)만 직접 재구독 — useLeagueChat과 같은 방식
                    if (status === 'CLOSED' && retryTimer === undefined) {
                        const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttemptRef.current++, RECONNECT_DELAYS_MS.length - 1)];
                        retryTimer = window.setTimeout(() => {
                            retryTimer = undefined;
                            void supabase.auth.getSession()
                                .then(() => supabase.realtime.setAuth())
                                .catch(() => { /* 다음 시도에서 재확인 */ })
                                .finally(() => { if (!cancelled) setReconnectTick(t => t + 1); });
                        }, delay);
                    }
                }
            });

        return () => {
            cancelled = true;
            if (retryTimer !== undefined) window.clearTimeout(retryTimer);
            supabase.removeChannel(channel);
        };
    }, [roomId, userId, addMessages, reconnectTick]);

    // ── 읽음: 보고 있는 대화의 마지막 id를 서버에 올리고 목록의 안 읽은 수를 0으로 ───────────────
    useEffect(() => {
        if (!viewing || !roomId || !activeKey) return;
        const conv = conversations.find(c => c.conv_key === activeKey);
        // 상대가 보낸 마지막 메시지까지만 올린다 — 내가 보낸 메시지로는 RPC를 부르지 않는다(안 읽은 수는 상대 메시지만 센다)
        let lastFromPeer = 0;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].user_id !== userId) { lastFromPeer = messages[i].id; break; }
        }
        const lastId = Math.max(lastFromPeer, conv && conv.unread > 0 ? conv.last_id : 0);
        if (lastId <= 0) return;
        if (conv && conv.unread > 0) {
            setConversations(prev => prev.map(c => (c.conv_key === activeKey ? { ...c, unread: 0 } : c)));
        }
        if ((markedRef.current.get(activeKey) ?? 0) >= lastId) return;
        markedRef.current.set(activeKey, lastId);
        markDmRead(roomId, activeKey, lastId).catch(() => { markedRef.current.delete(activeKey); });
    }, [viewing, roomId, userId, activeKey, messages, conversations]);

    const unread = useMemo(() => {
        let n = 0;
        for (const c of conversations) {
            if (viewing && c.conv_key === activeKey) continue;
            n += c.unread;
        }
        return n;
    }, [conversations, viewing, activeKey]);

    // ── 대화 열기/닫기 ────────────────────────────────────────────────────────────
    const openWith = useCallback((peer: DmPeer) => {
        if (!userId) return;
        const convKey = dmConvKey(userId, peer.userId);
        if (activeRef.current?.convKey === convKey) return;
        setActive({ convKey, peer });
    }, [userId]);

    const closeActive = useCallback(() => setActive(null), []);

    // ── 이전 페이지 ──────────────────────────────────────────────────────────────
    const loadOlder = useCallback(async (): Promise<number> => {
        const first = messagesRef.current[0];
        const a = activeRef.current;
        if (!roomId || !a || !first || loadingOlderRef.current) return 0;
        loadingOlderRef.current = true;
        setLoadingOlder(true);
        try {
            const rows = await fetchDmMessages(roomId, a.convKey, clearedRef.current, first.id);
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

    // ── 전송 ────────────────────────────────────────────────────────────────────
    const { admit, lockFor } = gate;

    const dispatch = useCallback(async (body: string, tempId: string, target: DmActive) => {
        if (!roomId) return;
        try {
            const row = await sendChatMessage(roomId, body, target.peer.userId);
            setOutbox(o => o.filter(x => x.tempId !== tempId));
            if (activeRef.current?.convKey === target.convKey) addMessages([row]);
            setConversations(prev => {
                const i = prev.findIndex(c => c.conv_key === target.convKey);
                if (i >= 0) {
                    const next = { ...prev[i], last_id: row.id, last_at: row.created_at };
                    return [next, ...prev.slice(0, i), ...prev.slice(i + 1)];
                }
                const fresh: DmConversation = {
                    conv_key: target.convKey, peer_id: target.peer.userId, peer_name: target.peer.name,
                    peer_team_id: target.peer.teamId, peer_team_abbr: target.peer.teamAbbr, peer_team_name: target.peer.teamName,
                    last_id: row.id, last_at: row.created_at, unread: 0, cleared_before_id: clearedRef.current,
                };
                return [fresh, ...prev];
            });
        } catch (e) {
            if (e instanceof ChatSendError && e.code === 'rate_limited') lockFor((e.waitSec ?? 5) * 1000);
            setOutbox(o => o.map(x => (x.tempId === tempId ? { ...x, status: 'failed', error: chatErrorMessage(e) } : x)));
        }
    }, [roomId, addMessages, lockFor]);

    const send = useCallback((raw: string): boolean => {
        const body = sanitizeChatBody(raw);
        const target = activeRef.current;
        if (!roomId || !target || !body || body.length > CHAT_MAX_BODY) return false;
        if (!admit()) return false;
        const tempId = `dm-tmp-${++seqRef.current}`;
        setOutbox(o => [...o, { tempId, body, status: 'sending', createdAt: Date.now() }]);
        void dispatch(body, tempId, target);
        return true;
    }, [roomId, admit, dispatch]);

    const outboxRef = useRef<ChatOutboxItem[]>([]);
    outboxRef.current = outbox;
    const retry = useCallback((tempId: string) => {
        const item = outboxRef.current.find(x => x.tempId === tempId);
        const target = activeRef.current;
        if (!item || item.status !== 'failed' || !target || !admit()) return;
        setOutbox(o => o.map(x => (x.tempId === tempId ? { ...x, status: 'sending', error: undefined } : x)));
        void dispatch(item.body, tempId, target);
    }, [admit, dispatch]);

    const discard = useCallback((tempId: string) => {
        setOutbox(o => o.filter(x => x.tempId !== tempId));
    }, []);

    // ── 삭제(나에게서만) ──────────────────────────────────────────────────────────
    const clearActive = useCallback(async () => {
        const a = activeRef.current;
        if (!roomId || !a) return;
        await clearDmConversation(roomId, a.convKey);
        setConversations(prev => prev.filter(c => c.conv_key !== a.convKey));
        markedRef.current.delete(a.convKey);
        setActive(cur => (cur?.convKey === a.convKey ? null : cur));
    }, [roomId]);

    const markReported = useCallback((id: number) => {
        setMessages(prev => prev.map(m => (m.id === id && !m.reported ? { ...m, reported: true } : m)));
    }, []);

    return {
        conversations, listStatus, reloadList, unread,
        active, openWith, closeActive,
        messages, outbox, historyStatus, hasMore, loadingOlder, loadOlder, reloadHistory,
        send, retry, discard, clearActive, markReported, connection,
    };
}
