// LeagueChatDock.tsx — 리그 채팅·알림 통합 FAB + 위젯. 계획: docs/plan/league-chat-plan.md ("UI 결정")
//
// LeagueLayout에 **한 번만** 마운트한다. 위젯이 닫혀 있어도 useLeagueChat이 채널을 계속 구독하므로
// FAB 배지가 올라가고, 리그 화면을 이동해도 열림 상태·탭·입력 중이던 초안이 유지된다(draft는 이 컴포넌트 상태).
// - FAB(48px 원형, 주황 그라디언트 — Button의 cta와 같은 색): 닫힘 = 말풍선 아이콘 + 안 읽은 수 배지(채팅 안 읽음 + 알림 안 읽음 합계 하나), 열림 = 같은 자리에서 X 닫기 버튼으로 변환
// - 위젯(380×560): 상단 탭 [채팅 | 알림]. 채팅 탭 = 메시지 목록 + 입력창, 알림 탭 = 알림 목록(LeagueNotificationList)
// - [2026-10-17] 토스트 팝업은 이 위젯으로 통합됐다 — 마운트되는 동안 notificationStore.setToastsSuppressed(true)로 팝업을 끄고
//   알림은 알림 탭 목록 + 배지로만 알린다(리그 밖에서는 기존 토스트). 참가자 목록·입력 중 표시·DM은 1차 범위 밖
// - z-widget(300): 헤더 위, 모달(500) 아래
// - 비모달 위젯이라 role="dialog"가 아니다. Esc로 닫고 포커스를 FAB으로 돌려준다.
// - 한국어 IME 조합 중 Enter(nativeEvent.isComposing)는 전송하지 않는다.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageCircle, RotateCw, Send, Trash2, X } from 'lucide-react';
import { useLeagueChat, type ChatOutboxItem } from '../../hooks/useLeagueChat';
import { useNotificationList } from '../../hooks/useNotificationList';
import { setToastsSuppressed } from '../../services/notifications/notificationStore';
import { LeagueNotificationList } from './LeagueNotificationList';
import { CHAT_MAX_BODY, type ChatMessage } from '../../services/multi/chatService';
import { TeamLogo } from '../common/TeamLogo';
import { CountBadge } from '../common/CountBadge';
import { IconButton } from '../common/IconButton';
import { InlineNotice } from '../common/InlineNotice';
import { EmptyState } from '../common/EmptyState';
import { Skeleton } from '../common/Skeleton';
import { Button } from '../common/Button';

const WIDGET_ID = 'league-chat-widget';
const GROUP_GAP_MS = 5 * 60 * 1000;   // 같은 사람의 메시지가 이 간격 안이면 한 묶음으로 보여준다
const NEAR_BOTTOM_PX = 80;

// ── 표시용 유틸 ───────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
}

function dayKey(iso: string): string {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    if (dayKey(iso) === dayKey(today.toISOString())) return '오늘';
    if (dayKey(iso) === dayKey(yesterday.toISOString())) return '어제';
    return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

type ListRow =
    | { kind: 'day'; key: string; label: string }
    | { kind: 'unread'; key: string; count: number }
    | { kind: 'msg'; key: string; msg: ChatMessage; mine: boolean; showHeader: boolean; showTime: boolean; outbox?: ChatOutboxItem };

function buildRows(messages: ChatMessage[], userId: string, anchorId: number | null, outbox: ChatOutboxItem[]): ListRow[] {
    const rows: ListRow[] = [];
    let prev: ChatMessage | null = null;
    let prevWasDivider = true;
    let unreadShown = false;
    const unreadCount = anchorId == null ? 0 : messages.filter(m => m.id > anchorId && m.user_id !== userId).length;

    // 전송 중/실패 메시지도 실제 메시지와 같은 규칙(묶음 머리줄·시간)으로 그린다 — 서버 응답으로 실제 메시지로 바뀔 때
    // "나" 머리줄·시간 줄이 뒤늦게 생기면서 높이가 튀는 것을 막는다(임시 메시지의 시각은 보낸 순간의 클라이언트 시계).
    const items: Array<{ m: ChatMessage; ob?: ChatOutboxItem }> = [
        ...messages.map(m => ({ m })),
        ...outbox.map(ob => ({
            m: { id: -1, room_id: '', user_id: userId, team_id: null, team_abbr: null, team_name: null, author: '나', body: ob.body, created_at: new Date(ob.createdAt).toISOString() } as ChatMessage,
            ob,
        })),
    ];

    for (const { m, ob } of items) {
        if (!prev || dayKey(prev.created_at) !== dayKey(m.created_at)) {
            rows.push({ kind: 'day', key: `day-${ob ? ob.tempId : m.id}`, label: dayLabel(m.created_at) });
            prevWasDivider = true;
        }
        if (!ob && !unreadShown && anchorId != null && m.id > anchorId && m.user_id !== userId && unreadCount > 0) {
            rows.push({ kind: 'unread', key: `unread-${m.id}`, count: unreadCount });
            unreadShown = true;
            prevWasDivider = true;
        }
        const showHeader = prevWasDivider
            || !prev
            || prev.user_id !== m.user_id
            || new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > GROUP_GAP_MS;
        rows.push({ kind: 'msg', key: ob ? `o-${ob.tempId}` : `m-${m.id}`, msg: m, mine: m.user_id === userId, showHeader, showTime: true, outbox: ob });
        prev = m;
        prevWasDivider = false;
    }

    // 시간은 버블 아래에 표시한다. 같은 사람이 같은 시각(표시 단위 = 분)에 연달아 보낸 메시지는 맨 아래(최신) 것에만 보여준다.
    // 다음 행이 날짜/새 메시지 구분선이거나 다른 사람·다른 시각의 메시지면 이 메시지가 그 묶음의 마지막이다.
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.kind !== 'msg') continue;
        const next = rows[i + 1];
        row.showTime = !(next && next.kind === 'msg'
            && next.msg.user_id === row.msg.user_id
            && formatTime(next.msg.created_at) === formatTime(row.msg.created_at));
    }
    return rows;
}

// ── 하위 표시 컴포넌트 ─────────────────────────────────────────────────────────

// 채팅에 접속 중인 사람은 로고 둘레가 초록색으로 빛난다(색만으로 전달하지 않도록 title + 스크린리더 문구도 함께)
const Avatar: React.FC<{ msg: ChatMessage; online: boolean }> = ({ msg, online }) => (
    <div
        title={online ? '접속 중' : undefined}
        className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${online ? 'ring-2 ring-emerald-400' : ''}`}
    >
        {msg.team_id
            ? <TeamLogo teamId={msg.team_id} teamName={msg.team_name ?? ''} size="custom" shadow={false} className="w-6 h-6" />
            : <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700" aria-hidden="true" />}
        {online && <span className="sr-only">접속 중</span>}
    </div>
);

const MessageRow: React.FC<{
    row: Extract<ListRow, { kind: 'msg' }>;
    online: boolean;
    onRetry: () => void;
    onDiscard: () => void;
}> = ({ row, online, onRetry, onDiscard }) => {
    const { msg, mine, showHeader, showTime, outbox } = row;
    if (mine) {
        // outbox가 있으면 전송 중(실제 메시지와 똑같이 그림) 또는 실패(새로고침/삭제 아이콘 + 빨간 문구)
        const failed = outbox?.status === 'failed';
        return (
            <div className={`flex flex-col items-end gap-1 ${showHeader ? 'mt-2' : ''}`}>
                {showHeader && <span className="text-xs font-bold text-slate-100">나</span>}
                <div className="flex items-center gap-1">
                    {failed && (
                        <>
                            <IconButton label="다시 보내기" size="md" tone="subtle" onClick={onRetry}><RotateCw size={16} /></IconButton>
                            <IconButton label="삭제" size="md" tone="subtle" onClick={onDiscard}><Trash2 size={16} /></IconButton>
                        </>
                    )}
                    <div className={`${failed ? 'max-w-[220px]' : 'max-w-[260px]'} text-white rounded-xl rounded-tr-sm px-3 py-2 text-sm leading-[21px] ko-normal whitespace-pre-wrap [overflow-wrap:anywhere] ${failed ? 'bg-orange-600/35 border border-red-400' : 'bg-orange-600'}`}>
                        {msg.body}
                    </div>
                </div>
                {failed
                    ? <InlineNotice tone="danger" size="sm">{outbox?.error ?? '전송하지 못했어요'}</InlineNotice>
                    : showTime && <span className="text-xs text-slate-400">{formatTime(msg.created_at)}</span>}
            </div>
        );
    }
    return (
        <div className={`flex items-start gap-2 ${showHeader ? 'mt-2' : ''}`}>
            <div className="w-8 shrink-0">{showHeader && <Avatar msg={msg} online={online} />}</div>
            <div className="flex flex-col gap-1 min-w-0">
                {showHeader && (
                    <div className="flex items-baseline flex-wrap gap-x-1.5">
                        <span className="text-xs font-bold text-slate-100 ko-normal">{msg.author}</span>
                        {msg.team_name && <span className="text-xs text-slate-400 ko-normal">{msg.team_name}</span>}
                    </div>
                )}
                <div className="max-w-[260px] w-fit bg-slate-700 text-white rounded-xl rounded-tl-sm px-3 py-2 text-sm leading-[21px] ko-normal whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {msg.body}
                </div>
                {showTime && <span className="text-xs text-slate-400">{formatTime(msg.created_at)}</span>}
            </div>
        </div>
    );
};

// ── 채팅 탭 본문 ───────────────────────────────────────────────────────────────

interface ChatBodyProps {
    chat: ReturnType<typeof useLeagueChat>;
    userId: string;
    draft: string;
    setDraft: (v: string) => void;
}

const ChatBody: React.FC<ChatBodyProps> = ({ chat, userId, draft, setDraft }) => {
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const stickRef = useRef(true);
    const lastSeenIdRef = useRef(0);
    const [newBelow, setNewBelow] = useState(false);

    const rows = useMemo(() => buildRows(chat.messages, userId, chat.unreadAnchorId, chat.outbox), [chat.messages, userId, chat.unreadAnchorId, chat.outbox]);

    const scrollToBottom = useCallback(() => {
        const el = listRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
        stickRef.current = true;
        setNewBelow(false);
    }, []);

    // 열릴 때 맨 아래로 + 입력창 포커스
    useEffect(() => { inputRef.current?.focus(); }, []);
    useLayoutEffect(() => { scrollToBottom(); }, [scrollToBottom, chat.historyStatus]);

    // 새 메시지: 바닥 근처면 따라가고, 위로 올려 둔 상태면 "새 메시지" 표시만
    useLayoutEffect(() => {
        const last = chat.messages[chat.messages.length - 1];
        const lastId = last?.id ?? 0;
        const hasNew = lastId > lastSeenIdRef.current;
        lastSeenIdRef.current = lastId;
        if (!hasNew && chat.outbox.length === 0) return;
        if (stickRef.current || last?.user_id === userId) scrollToBottom();
        else if (hasNew) setNewBelow(true);
    }, [chat.messages, chat.outbox.length, userId, scrollToBottom]);

    // 입력창 높이 자동(최대 4줄)
    useLayoutEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
    }, [draft]);

    const onScroll = () => {
        const el = listRef.current;
        if (!el) return;
        const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
        stickRef.current = near;
        if (near) setNewBelow(false);
    };

    const onLoadOlder = async () => {
        const el = listRef.current;
        const prevHeight = el?.scrollHeight ?? 0;
        const added = await chat.loadOlder();
        if (added > 0 && el) requestAnimationFrame(() => { el.scrollTop += el.scrollHeight - prevHeight; });
    };

    const locked = chat.lockRemainingSec > 0;
    const disconnected = chat.connection === 'disconnected';
    const inputDisabled = locked || disconnected;
    const canSend = !inputDisabled && !chat.cooling && draft.trim().length > 0;

    const submit = () => {
        if (!canSend) return;
        if (chat.send(draft)) setDraft('');
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
        }
    };

    const isEmpty = chat.historyStatus === 'ready' && chat.messages.length === 0 && chat.outbox.length === 0;

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* 연결 끊김 배너 */}
            {disconnected && (
                <div role="status" className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-xs font-medium text-amber-400 shrink-0">
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                    연결이 끊겼어요. 다시 연결하는 중…
                </div>
            )}

            {/* 메시지 목록 */}
            <div className="relative flex-1 min-h-0">
                <div
                    ref={listRef}
                    onScroll={onScroll}
                    aria-live="polite"
                    aria-relevant="additions"
                    className={`h-full overflow-y-auto px-4 py-4 flex flex-col gap-2 ${disconnected ? 'opacity-60' : ''}`}
                >
                    {chat.historyStatus === 'loading' && (
                        <div className="flex flex-col gap-5" aria-label="불러오는 중">
                            {[0, 1, 2, 3].map(i => (
                                <div key={i} className={`flex gap-2 ${i === 2 ? 'justify-end' : ''}`}>
                                    {i !== 2 && <Skeleton className="w-7 h-7 rounded-full shrink-0" />}
                                    <div className="flex flex-col gap-1.5">
                                        {i !== 2 && <Skeleton className="h-3 w-20" />}
                                        <Skeleton className={`h-9 rounded-xl ${i === 2 ? 'w-44' : i === 1 ? 'w-40' : 'w-56'}`} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {chat.historyStatus === 'error' && (
                        <EmptyState
                            padding="sm"
                            title="메시지를 불러오지 못했어요"
                            action={<Button variant="secondary" size="sm" onClick={chat.reloadHistory}>다시 시도</Button>}
                        />
                    )}

                    {isEmpty && (
                        <EmptyState padding="sm" icon={MessageCircle} title="아직 메시지가 없어요" subtitle="첫 인사를 남겨보세요. 참가자 모두가 볼 수 있어요." />
                    )}

                    {chat.historyStatus === 'ready' && chat.hasMore && (
                        <div className="flex justify-center">
                            <Button variant="link" size="sm" onClick={onLoadOlder} disabled={chat.loadingOlder}>
                                {chat.loadingOlder ? '불러오는 중…' : '이전 메시지 보기'}
                            </Button>
                        </div>
                    )}

                    {rows.map(row => {
                        if (row.kind === 'day') {
                            return (
                                <div key={row.key} className="self-center text-xs text-slate-400 px-3 py-0.5 rounded-full bg-slate-950/40">{row.label}</div>
                            );
                        }
                        if (row.kind === 'unread') {
                            return (
                                <div key={row.key} className="flex items-center gap-3 my-2">
                                    <div className="flex-1 h-px bg-indigo-600" />
                                    <div className="text-xs font-medium text-indigo-300 px-2.5 py-0.5 rounded-full bg-indigo-500/10">새 메시지 {row.count}개</div>
                                    <div className="flex-1 h-px bg-indigo-600" />
                                </div>
                            );
                        }
                        return (
                            <MessageRow
                                key={row.key}
                                row={row}
                                online={chat.onlineUserIds.has(row.msg.user_id)}
                                onRetry={() => row.outbox && chat.retry(row.outbox.tempId)}
                                onDiscard={() => row.outbox && chat.discard(row.outbox.tempId)}
                            />
                        );
                    })}

                </div>

                {newBelow && (
                    <button
                        type="button"
                        onClick={scrollToBottom}
                        className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 h-7 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg"
                    >
                        새 메시지 ↓
                    </button>
                )}
            </div>

            {/* 입력창 */}
            <div className="border-t border-slate-800 p-3 flex flex-col gap-1.5 shrink-0">
                <div className="flex items-end gap-2">
                    <textarea
                        ref={inputRef}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={onKeyDown}
                        rows={1}
                        maxLength={CHAT_MAX_BODY}
                        disabled={inputDisabled}
                        placeholder={disconnected ? '연결되면 메시지를 보낼 수 있어요' : '메시지를 입력하세요'}
                        aria-label={locked ? '메시지 입력 (잠금 중)' : '메시지 입력'}
                        className="flex-1 min-w-0 resize-none rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm leading-[21px] text-slate-100 placeholder:text-slate-500 ko-normal focus:outline-none focus:border-indigo-400 disabled:bg-slate-950/20 disabled:text-slate-400 disabled:border-slate-800"
                    />
                    <button
                        type="button"
                        onClick={submit}
                        disabled={!canSend}
                        aria-label="메시지 보내기"
                        className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:bg-slate-800 disabled:hover:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed"
                    >
                        <Send size={16} />
                    </button>
                </div>
                {locked && (
                    <InlineNotice tone="warning" size="sm">도배 방지를 위해 잠시 잠겼어요. {chat.lockRemainingSec}초 뒤에 다시 보낼 수 있어요.</InlineNotice>
                )}
                {!locked && draft.length >= 400 && (
                    <div className={`text-right text-xs font-medium ${draft.length >= 480 ? 'text-amber-400' : 'text-slate-400'}`}>
                        {draft.length} / {CHAT_MAX_BODY}{draft.length >= 480 ? ` · ${CHAT_MAX_BODY - draft.length}자 남음` : ''}
                    </div>
                )}
            </div>
        </div>
    );
};

// ── 위젯 껍데기(탭 + 본문) ──────────────────────────────────────────────────────

export type DockTab = 'chat' | 'notifications';

const CountPill: React.FC<{ count: number }> = ({ count }) => (
    <CountBadge count={count} size="md" />
);

interface DockWidgetProps {
    chat: ReturnType<typeof useLeagueChat>;
    notif: ReturnType<typeof useNotificationList>;
    userId: string;
    tab: DockTab;
    setTab: (t: DockTab) => void;
    draft: string;
    setDraft: (v: string) => void;
    onClose: () => void;
}

const DockWidget: React.FC<DockWidgetProps> = ({ chat, notif, userId, tab, setTab, draft, setDraft, onClose }) => {
    const tabBtn = (id: DockTab, label: string, badge: number) => {
        const active = tab === id;
        return (
            <button
                type="button"
                role="tab"
                id={`${WIDGET_ID}-tab-${id}`}
                aria-selected={active}
                aria-controls={`${WIDGET_ID}-panel`}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 h-11 px-3 border-b-2 text-sm transition-colors ${active ? 'border-indigo-500 text-slate-100 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200 font-medium'}`}
            >
                {label}
                {!active && <CountPill count={badge} />}
            </button>
        );
    };

    return (
        <section
            id={WIDGET_ID}
            aria-label="채팅과 알림"
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
            className="pointer-events-auto flex flex-col w-[380px] max-w-[calc(100vw-32px)] h-[min(560px,calc(100dvh-112px))] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
        >
            {/* 탭 + 우측 보조 정보 */}
            <div className="flex items-center justify-between gap-2 pl-2 pr-3 border-b border-slate-800 shrink-0">
                <div role="tablist" aria-label="채팅과 알림" className="flex gap-0.5">
                    {tabBtn('chat', '채팅', chat.unread)}
                    {tabBtn('notifications', '알림', notif.unread)}
                </div>
                {tab === 'chat' && chat.connection === 'connected' && chat.onlineCount > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
                        {chat.onlineCount}명 접속 중
                    </div>
                )}
                {tab === 'notifications' && notif.items.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={notif.clear}>전체 삭제</Button>
                )}
            </div>

            <div id={`${WIDGET_ID}-panel`} role="tabpanel" aria-labelledby={`${WIDGET_ID}-tab-${tab}`} className="flex flex-col flex-1 min-h-0">
                {tab === 'chat'
                    ? <ChatBody chat={chat} userId={userId} draft={draft} setDraft={setDraft} />
                    : <LeagueNotificationList list={notif} />}
            </div>
        </section>
    );
};

// ── FAB + 위젯 ────────────────────────────────────────────────────────────────

interface DockProps {
    roomId: string;
    userId: string;
}

const openKey = (roomId: string) => `nba-gm-sim-chat-open:${roomId}`;
const TAB_KEY = 'nba-gm-sim-dock-tab';

function readOpen(roomId: string): boolean {
    try { return window.localStorage.getItem(openKey(roomId)) === '1'; } catch { return false; }
}
function readTab(): DockTab {
    try { return window.localStorage.getItem(TAB_KEY) === 'notifications' ? 'notifications' : 'chat'; } catch { return 'chat'; }
}
function writeStorage(key: string, value: string): void {
    try { window.localStorage.setItem(key, value); } catch { /* 사생활 모드 등 — 무시 */ }
}

export const LeagueChatDock: React.FC<DockProps> = ({ roomId, userId }) => {
    const [open, setOpenState] = useState(() => readOpen(roomId));
    const [tab, setTabState] = useState<DockTab>(readTab);
    const [draft, setDraft] = useState('');
    const fabRef = useRef<HTMLButtonElement>(null);

    // 채팅은 "열려 있고 채팅 탭일 때"만 읽는 중 — 알림 탭을 보는 동안 도착한 메시지는 안 읽음으로 남는다
    const chat = useLeagueChat(roomId, userId, open && tab === 'chat');
    const notif = useNotificationList();

    // 위젯이 떠 있는 동안 토스트 팝업을 끈다(알림은 알림 탭이 보여줌)
    useEffect(() => {
        setToastsSuppressed(true);
        return () => setToastsSuppressed(false);
    }, []);

    // 룸이 바뀌면 열림 상태를 복원하고 초안을 비운다
    useEffect(() => {
        setOpenState(readOpen(roomId));
        setDraft('');
    }, [roomId]);

    const setTab = useCallback((t: DockTab) => {
        setTabState(t);
        writeStorage(TAB_KEY, t);
    }, []);

    const setOpen = useCallback((next: boolean) => {
        setOpenState(next);
        writeStorage(openKey(roomId), next ? '1' : '0');
    }, [roomId]);

    const toggle = () => {
        if (!open) {
            // 안 읽은 게 알림뿐이면 알림 탭으로 연다
            if (chat.unread === 0 && notif.unread > 0) setTab('notifications');
            setOpen(true);
        } else {
            setOpen(false);
        }
    };

    const close = useCallback(() => {
        setOpen(false);
        fabRef.current?.focus();
    }, [setOpen]);

    const totalUnread = chat.unread + notif.unread;
    const fabLabel = open
        ? '채팅과 알림 닫기'
        : totalUnread > 0 ? `채팅과 알림 열기, 안 읽은 항목 ${totalUnread}개` : '채팅과 알림 열기';

    return (
        <div className="fixed bottom-6 right-6 z-widget flex flex-col items-end gap-3 pointer-events-none">
            {open && <DockWidget chat={chat} notif={notif} userId={userId} tab={tab} setTab={setTab} draft={draft} setDraft={setDraft} onClose={close} />}
            <div className="relative pointer-events-auto">
                <button
                    ref={fabRef}
                    type="button"
                    onClick={toggle}
                    aria-label={fabLabel}
                    aria-expanded={open}
                    aria-controls={WIDGET_ID}
                    className="w-12 h-12 rounded-full bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white shadow-elevation-md flex items-center justify-center transition-colors"
                >
                    {open ? <X size={20} strokeWidth={2} /> : <MessageCircle size={20} strokeWidth={1.8} />}
                </button>
                {!open && <CountBadge count={totalUnread} size="lg" className="absolute -top-1.5 -right-1.5 ring-2 ring-slate-950 pointer-events-none" />}
            </div>
        </div>
    );
};
