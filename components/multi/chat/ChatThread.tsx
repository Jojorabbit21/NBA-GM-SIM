// ChatThread.tsx — 채팅 위젯의 메시지 목록 + 입력창(퍼블릭·DM 공용). 계획: docs/plan/league-chat-plan.md
//
// [2026-10-21] LeagueChatDock의 ChatBody/MessageRow를 옮겨 DM과 함께 쓰도록 일반화했다.
// - mode 'public': 다른 사람 말풍선에 로고·이름 머리줄 / 'dm': 1:1이라 머리줄 없음(상대는 대화창 헤더에 표시)
// - 다른 사람 말풍선 오른쪽에 "신고" 버튼(Button danger xs, 알약). 평소 숨김 — 행 hover·포커스 시, 터치는 말풍선 탭 시 보임.
//   신고된 메시지(reported)는 누가 신고했든 비활성. 신고 직후 말풍선 아래 InlineNotice success sm.
// - 한국어 IME 조합 중 Enter(nativeEvent.isComposing)는 전송하지 않는다.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageCircle, RotateCw, Send, Trash2 } from 'lucide-react';
import type { ChatConnection, ChatHistoryStatus, ChatOutboxItem } from '../../../hooks/useLeagueChat';
import { CHAT_MAX_BODY, limitDraftNewlines, sanitizeChatBody, type ChatMessage } from '../../../services/multi/chatService';
import { TeamLogo } from '../../common/TeamLogo';
import { IconButton } from '../../common/IconButton';
import { InlineNotice } from '../../common/InlineNotice';
import { EmptyState } from '../../common/EmptyState';
import { Skeleton } from '../../common/Skeleton';
import { Button } from '../../common/Button';

const GROUP_GAP_MS = 5 * 60 * 1000;   // 같은 사람의 메시지가 이 간격 안이면 한 묶음으로 보여준다
const NEAR_BOTTOM_PX = 80;

// ── 표시용 유틸 ───────────────────────────────────────────────────────────────

// Intl.DateTimeFormat 생성이 비싸서(toLocale*String은 호출마다 새로 만든다) 모듈 레벨에서 한 번만 만든다.
const TIME_FMT = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' });
const DATE_FMT = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' });

function formatTime(iso: string): string {
    return TIME_FMT.format(new Date(iso));
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
    return DATE_FMT.format(d);
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
export const ChatAvatar = React.memo<{ teamId: string | null; teamName: string | null; online: boolean; size?: 'sm' | 'md' }>(
    ({ teamId, teamName, online, size = 'md' }) => (
        <div
            title={online ? '접속 중' : undefined}
            className={`${size === 'md' ? 'w-8 h-8' : 'w-7 h-7'} shrink-0 rounded-full flex items-center justify-center ${online ? 'ring-2 ring-emerald-400' : ''}`}
        >
            {teamId
                ? <TeamLogo teamId={teamId} teamName={teamName ?? ''} size="custom" shadow={false} className={size === 'md' ? 'w-6 h-6' : 'w-5 h-5'} />
                : <div className={`${size === 'md' ? 'w-6 h-6' : 'w-5 h-5'} rounded-full bg-slate-800 border border-slate-700`} aria-hidden="true" />}
            {online && <span className="sr-only">접속 중</span>}
        </div>
    ),
);
ChatAvatar.displayName = 'ChatAvatar';

// memo: 입력창 타이핑(draft 변경)으로 부모가 다시 렌더돼도 행은 props가 같으면 건너뛴다. 콜백은 안정된 함수여야 한다.
const MessageRow = React.memo<{
    row: Extract<ListRow, { kind: 'msg' }>;
    online: boolean;
    showAuthors: boolean;
    revealed: boolean;
    notice: boolean;
    onRetry: (tempId: string) => void;
    onDiscard: (tempId: string) => void;
    onReveal: (id: number) => void;
    onReport?: (msg: ChatMessage, anchor: HTMLElement) => void;
}>(({ row, online, showAuthors, revealed, notice, onRetry, onDiscard, onReveal, onReport }) => {
    const { msg, mine, showHeader, showTime, outbox } = row;
    if (mine) {
        // outbox가 있으면 전송 중(실제 메시지와 똑같이 그림) 또는 실패(새로고침/삭제 아이콘 + 빨간 문구)
        const failed = outbox?.status === 'failed';
        return (
            <div className={`flex flex-col items-end gap-1 ${showHeader && showAuthors ? 'mt-2' : ''}`}>
                {showHeader && showAuthors && <span className="text-xs font-bold text-slate-100">나</span>}
                <div className="flex items-center gap-1">
                    {failed && (
                        <>
                            <IconButton label="다시 보내기" size="md" tone="subtle" onClick={() => outbox && onRetry(outbox.tempId)}><RotateCw size={16} /></IconButton>
                            <IconButton label="삭제" size="md" tone="subtle" onClick={() => outbox && onDiscard(outbox.tempId)}><Trash2 size={16} /></IconButton>
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
    const reported = !!msg.reported;
    return (
        <div className={`group flex items-start gap-2 ${showHeader && showAuthors ? 'mt-2' : ''}`}>
            {showAuthors && <div className="w-8 shrink-0">{showHeader && <ChatAvatar teamId={msg.team_id} teamName={msg.team_name} online={online} />}</div>}
            <div className="flex flex-col gap-1 min-w-0">
                {showAuthors && showHeader && (
                    <div className="flex items-baseline flex-wrap gap-x-1.5">
                        <span className="text-xs font-bold text-slate-100 ko-normal">{msg.author}</span>
                        {msg.team_name && <span className="text-xs text-slate-400 ko-normal">{msg.team_name}</span>}
                    </div>
                )}
                <div className="flex items-center gap-1">
                    {/* 터치 기기는 hover가 없어서 말풍선 탭으로 신고 버튼을 꺼낸다 */}
                    <div
                        onClick={() => onReveal(msg.id)}
                        className="max-w-[260px] w-fit bg-slate-700 text-white rounded-xl rounded-tl-sm px-3 py-2 text-sm leading-[21px] ko-normal whitespace-pre-wrap [overflow-wrap:anywhere]"
                    >
                        {msg.body}
                    </div>
                    {onReport && (
                        <Button
                            variant={reported ? 'secondary' : 'danger'}
                            size="xs"
                            shape="full"
                            disabled={reported}
                            title={reported ? '이미 신고된 메시지' : '메시지 신고'}
                            aria-label={reported ? '이미 신고된 메시지' : '메시지 신고'}
                            onClick={(e) => onReport(msg, e.currentTarget)}
                            // 신고됨(disabled)은 Button의 disabled:opacity-40이 숨김용 opacity-0을 덮으므로 visibility로 숨긴다.
                            // 활성 버튼은 Tab으로 닿아야 해서 opacity로 숨기고 focus-visible에 보인다.
                            className={reported
                                ? `shrink-0 ${revealed ? 'visible' : 'invisible'} group-hover:visible`
                                : `shrink-0 transition-opacity ${revealed ? 'opacity-100' : 'opacity-0'} group-hover:opacity-100 focus-visible:opacity-100`}
                        >
                            신고
                        </Button>
                    )}
                </div>
                {showTime && <span className="text-xs text-slate-400">{formatTime(msg.created_at)}</span>}
                {notice && <InlineNotice tone="success" size="sm" autoHideMs={3000}>신고가 접수됐어요.</InlineNotice>}
            </div>
        </div>
    );
});
MessageRow.displayName = 'MessageRow';

// ── 목록 + 입력창 ─────────────────────────────────────────────────────────────

export interface ChatThreadSource {
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
}

interface ChatThreadProps {
    thread: ChatThreadSource;
    mode: 'public' | 'dm';
    userId: string;
    draft: string;
    setDraft: (v: string) => void;
    connection: ChatConnection;
    onlineUserIds: ReadonlySet<string>;
    cooling: boolean;
    lockRemainingSec: number;
    /** "새 메시지 N개" 구분선 기준(null이면 없음) */
    unreadAnchorId: number | null;
    placeholder: string;
    emptyTitle: string;
    emptySubtitle: string;
    onReport: (msg: ChatMessage, anchor: HTMLElement) => void;
    /** 방금 신고가 접수된 메시지 id — 말풍선 아래 성공 안내 */
    noticeId: number | null;
}

export const ChatThread: React.FC<ChatThreadProps> = ({
    thread, mode, userId, draft, setDraft, connection, onlineUserIds, cooling, lockRemainingSec, unreadAnchorId,
    placeholder, emptyTitle, emptySubtitle, onReport, noticeId,
}) => {
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const stickRef = useRef(true);
    const lastSeenIdRef = useRef(0);
    const [newBelow, setNewBelow] = useState(false);
    const [revealedId, setRevealedId] = useState<number | null>(null);

    const rows = useMemo(() => buildRows(thread.messages, userId, unreadAnchorId, thread.outbox), [thread.messages, userId, unreadAnchorId, thread.outbox]);
    const onReveal = useCallback((id: number) => setRevealedId(cur => (cur === id ? null : id)), []);

    const scrollToBottom = useCallback(() => {
        const el = listRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
        stickRef.current = true;
        setNewBelow(false);
    }, []);

    // 열릴 때 맨 아래로 + 입력창 포커스(대화를 바꾸면 부모가 key로 다시 마운트한다)
    useEffect(() => { inputRef.current?.focus(); }, []);
    useLayoutEffect(() => { scrollToBottom(); }, [scrollToBottom, thread.historyStatus]);

    // 새 메시지: 바닥 근처면 따라가고, 위로 올려 둔 상태면 "새 메시지" 표시만
    useLayoutEffect(() => {
        const last = thread.messages[thread.messages.length - 1];
        const lastId = last?.id ?? 0;
        const hasNew = lastId > lastSeenIdRef.current;
        lastSeenIdRef.current = lastId;
        if (!hasNew && thread.outbox.length === 0) return;
        if (stickRef.current || last?.user_id === userId) scrollToBottom();
        else if (hasNew) setNewBelow(true);
    }, [thread.messages, thread.outbox.length, userId, scrollToBottom]);

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
        const added = await thread.loadOlder();
        if (added > 0 && el) requestAnimationFrame(() => { el.scrollTop += el.scrollHeight - prevHeight; });
    };

    const locked = lockRemainingSec > 0;
    const disconnected = connection === 'disconnected';
    const inputDisabled = locked || disconnected;
    const canSend = !inputDisabled && !cooling && sanitizeChatBody(draft).length > 0;

    const submit = () => {
        if (!canSend) return;
        if (thread.send(draft)) setDraft('');
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
        } else if (e.key === 'Enter' && e.shiftKey && draft.includes('\n')) {
            e.preventDefault();   // 줄바꿈은 최대 1번 — 이미 한 번 넣었으면 더 못 넣는다
        }
    };

    const isEmpty = thread.historyStatus === 'ready' && thread.messages.length === 0 && thread.outbox.length === 0;
    const showAuthors = mode === 'public';

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
                    {thread.historyStatus === 'loading' && (
                        <div className="flex flex-col gap-5" aria-label="불러오는 중">
                            {[0, 1, 2, 3].map(i => (
                                <div key={i} className={`flex gap-2 ${i === 2 ? 'justify-end' : ''}`}>
                                    {i !== 2 && showAuthors && <Skeleton className="w-7 h-7 rounded-full shrink-0" />}
                                    <div className="flex flex-col gap-1.5">
                                        {i !== 2 && showAuthors && <Skeleton className="h-3 w-20" />}
                                        <Skeleton className={`h-9 rounded-xl ${i === 2 ? 'w-44' : i === 1 ? 'w-40' : 'w-56'}`} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {thread.historyStatus === 'error' && (
                        <EmptyState
                            padding="sm"
                            title="메시지를 불러오지 못했어요"
                            action={<Button variant="secondary" size="sm" onClick={thread.reloadHistory}>다시 시도</Button>}
                        />
                    )}

                    {isEmpty && <EmptyState padding="sm" icon={MessageCircle} title={emptyTitle} subtitle={emptySubtitle} />}

                    {thread.historyStatus === 'ready' && thread.hasMore && (
                        <div className="flex justify-center">
                            <Button variant="link" size="sm" onClick={onLoadOlder} disabled={thread.loadingOlder}>
                                {thread.loadingOlder ? '불러오는 중…' : '이전 메시지 보기'}
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
                        const real = !row.outbox && row.msg.id > 0;
                        return (
                            <MessageRow
                                key={row.key}
                                row={row}
                                online={onlineUserIds.has(row.msg.user_id)}
                                showAuthors={showAuthors}
                                revealed={revealedId === row.msg.id}
                                notice={noticeId != null && noticeId === row.msg.id}
                                onRetry={thread.retry}
                                onDiscard={thread.discard}
                                onReveal={onReveal}
                                onReport={real ? onReport : undefined}
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
                        onChange={(e) => setDraft(limitDraftNewlines(e.target.value))}
                        onKeyDown={onKeyDown}
                        rows={1}
                        maxLength={CHAT_MAX_BODY}
                        disabled={inputDisabled}
                        placeholder={disconnected ? '연결되면 메시지를 보낼 수 있어요' : placeholder}
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
                    <InlineNotice tone="warning" size="sm">도배 방지를 위해 잠시 잠겼어요. {lockRemainingSec}초 뒤에 다시 보낼 수 있어요.</InlineNotice>
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
