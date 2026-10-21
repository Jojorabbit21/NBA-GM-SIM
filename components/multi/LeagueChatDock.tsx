// LeagueChatDock.tsx — 리그 채팅·알림 통합 FAB + 위젯. 계획: docs/plan/league-chat-plan.md ("UI 결정", "DM 2차 확정안")
//
// LeagueLayout에 **한 번만** 마운트한다. 위젯이 닫혀 있어도 useLeagueChat(퍼블릭)·useLeagueDm(내 받은편지함)이 채널을 계속
// 구독하므로 FAB 배지가 올라가고, 리그 화면을 이동해도 열림 상태·탭·대화·입력 중이던 초안이 유지된다(초안은 대화별로 이 컴포넌트 상태).
// - FAB(48px 원형, 주황 그라디언트): 닫힘 = 말풍선 아이콘 + 안 읽은 수 배지(퍼블릭 + DM + 알림 합계 하나), 열림 = 같은 자리에서 X 닫기 버튼
// - 위젯 [2026-10-21 DM] 600×560, 탭 [채팅 | 알림]. 채팅 탭 = 좌측 220px 채팅 목록(# 퍼블릭 + 다이렉트 메시지, ChatSidebar) 상시 표시
//   + 우측 대화 영역(퍼블릭 대화 / DM 대화 / 새 대화 상대 고르기). 화면 폭이 좁으면(640px 미만) 목록 → 대화 한 화면씩.
// - 신고: 말풍선 "신고" → 대화 영역을 어둡게 덮고(블러 금지 — 2026-09-30 실측 렉) 사유 팝오버(ReportPopover)
// - DM 대화 삭제: 헤더 "대화 삭제" → 헤더가 확인 단계로 바뀜(트레이드 수락/거절 확인 단계와 같은 방식, 모달 아님). 나에게서만 삭제
// - [2026-10-17] 토스트 팝업은 이 위젯으로 통합 — 마운트 중 notificationStore.setToastsSuppressed(true), 알림은 알림 탭 + 배지로만
// - [2026-10-19] 업데이트 알림 통합: 위젯이 닫혀 있으면 FAB 위 UpdateToastCard, 열려 있으면 탭 아래 UpdateBanner(updateNoticeStore)
// - z-widget(300): 헤더 위, 모달(500) 아래. 비모달 위젯이라 role="dialog"가 아니다. Esc로 닫고 포커스를 FAB으로 돌려준다.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, MessageCircle, X } from 'lucide-react';
import { useLeagueChat } from '../../hooks/useLeagueChat';
import { useLeagueDm, peerFromConversation, type DmPeer } from '../../hooks/useLeagueDm';
import { useChatSendGate } from '../../hooks/useChatSendGate';
import { useNotificationList } from '../../hooks/useNotificationList';
import { setToastsSuppressed } from '../../services/notifications/notificationStore';
import { setUpdateDockMounted, useUpdateNotice } from '../../services/notifications/updateNoticeStore';
import { UpdateBanner, UpdateToastCard } from '../UpdateToast';
import { LeagueNotificationList } from './LeagueNotificationList';
import { ChatSendError, type ChatMessage, type DmConversation } from '../../services/multi/chatService';
import { CountBadge } from '../common/CountBadge';
import { IconButton } from '../common/IconButton';
import { InlineNotice } from '../common/InlineNotice';
import { Button } from '../common/Button';
import { ChatThread, ChatAvatar } from './chat/ChatThread';
import { ChatSidebar } from './chat/ChatSidebar';
import { DmNewConversation } from './chat/DmNewConversation';
import { ReportPopover, type ReportAnchor } from './chat/ReportPopover';

const WIDGET_ID = 'league-chat-widget';
const NARROW_QUERY = '(max-width: 639px)';
const NOTICE_MS = 3000;

export type DockTab = 'chat' | 'notifications';
type ChatView = 'public' | 'dm' | 'new';

function useIsNarrow(): boolean {
    const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches;
    const [narrow, setNarrow] = useState(get);
    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const mq = window.matchMedia(NARROW_QUERY);
        const on = () => setNarrow(mq.matches);
        on();
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    }, []);
    return narrow;
}

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

interface ReportTarget {
    messageId: number;
    source: 'public' | 'dm';
    anchor: ReportAnchor;
}

export const LeagueChatDock: React.FC<DockProps> = ({ roomId, userId }) => {
    const [open, setOpenState] = useState(() => readOpen(roomId));
    const [tab, setTabState] = useState<DockTab>(readTab);
    const [view, setView] = useState<ChatView>('public');
    /** 좁은 화면에서 대화 영역을 보고 있는지(false면 목록) */
    const [paneOpen, setPaneOpen] = useState(false);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [report, setReport] = useState<ReportTarget | null>(null);
    const [noticeId, setNoticeId] = useState<number | null>(null);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const fabRef = useRef<HTMLButtonElement>(null);
    const paneRef = useRef<HTMLDivElement>(null);
    const reportButtonRef = useRef<HTMLElement | null>(null);
    const narrow = useIsNarrow();

    const showingPane = !narrow || paneOpen;
    const chatTabVisible = open && tab === 'chat';
    const gate = useChatSendGate(roomId);
    // 퍼블릭은 "열려 있고 채팅 탭에서 퍼블릭 대화를 보고 있을 때"만 읽는 중 — 그 밖에 도착한 메시지는 안 읽음으로 남는다
    const chat = useLeagueChat(roomId, userId, chatTabVisible && showingPane && view === 'public', gate);
    const dm = useLeagueDm(roomId, userId, chatTabVisible && showingPane && view === 'dm', gate);
    const notif = useNotificationList();

    // 위젯이 떠 있는 동안 토스트 팝업을 끈다(알림은 알림 탭이 보여줌)
    useEffect(() => {
        setToastsSuppressed(true);
        return () => setToastsSuppressed(false);
    }, []);

    // 업데이트 알림은 단독 토스트 대신 이 위젯이 보여준다(App의 UpdateToast는 dockMounted면 숨는다)
    const update = useUpdateNotice();
    useEffect(() => {
        setUpdateDockMounted(true);
        return () => setUpdateDockMounted(false);
    }, []);

    // 룸이 바뀌면 열림 상태를 복원하고 초안·선택을 비운다
    useEffect(() => {
        setOpenState(readOpen(roomId));
        setDrafts({});
        setView('public');
        setPaneOpen(false);
    }, [roomId]);

    // 보고 있던 DM이 사라지면(삭제 등) 퍼블릭으로
    useEffect(() => {
        if (view === 'dm' && !dm.active) setView('public');
    }, [view, dm.active]);

    // 대화를 바꾸면 신고 팝오버·삭제 확인을 닫는다
    const channelKey = view === 'dm' ? (dm.active?.convKey ?? 'dm') : view;
    useEffect(() => {
        setReport(null);
        setConfirmingDelete(false);
        setDeleteError(null);
    }, [channelKey, tab, open]);

    // 신고 성공 안내는 3초 뒤 정리
    useEffect(() => {
        if (noticeId == null) return;
        const t = window.setTimeout(() => setNoticeId(null), NOTICE_MS);
        return () => window.clearTimeout(t);
    }, [noticeId]);

    const setTab = useCallback((t: DockTab) => {
        setTabState(t);
        writeStorage(TAB_KEY, t);
    }, []);

    const setOpen = useCallback((next: boolean) => {
        setOpenState(next);
        writeStorage(openKey(roomId), next ? '1' : '0');
    }, [roomId]);

    const chatUnread = chat.unread + dm.unread;

    const toggle = () => {
        if (!open) {
            // 안 읽은 게 알림뿐이면 알림 탭으로 연다
            if (chatUnread === 0 && notif.unread > 0) setTab('notifications');
            setOpen(true);
        } else {
            setOpen(false);
        }
    };

    const close = useCallback(() => {
        setOpen(false);
        fabRef.current?.focus();
    }, [setOpen]);

    // ── 대화 선택 ────────────────────────────────────────────────────────────────
    const selectPublic = useCallback(() => { setView('public'); setPaneOpen(true); }, []);
    const selectConversation = useCallback((c: DmConversation) => {
        dm.openWith(peerFromConversation(c));
        setView('dm');
        setPaneOpen(true);
    }, [dm.openWith]);   // eslint-disable-line react-hooks/exhaustive-deps
    const startNew = useCallback(() => { setView('new'); setPaneOpen(true); }, []);
    const pickPeer = useCallback((peer: DmPeer) => {
        dm.openWith(peer);
        setView('dm');
    }, [dm.openWith]);   // eslint-disable-line react-hooks/exhaustive-deps
    const backToList = useCallback(() => setPaneOpen(false), []);

    const activeId = view === 'public' ? 'public' : view === 'new' ? 'new' : (dm.active?.convKey ?? null);
    const excludeUserIds = useMemo(() => new Set(dm.conversations.map(c => c.peer_id)), [dm.conversations]);

    // ── 초안(대화별) ─────────────────────────────────────────────────────────────
    const draftKey = view === 'public' ? 'public' : (dm.active?.convKey ?? '');
    const draft = drafts[draftKey] ?? '';
    const setDraft = useCallback((v: string) => {
        setDrafts(d => ({ ...d, [draftKey]: v }));
    }, [draftKey]);

    // ── 신고 ────────────────────────────────────────────────────────────────────
    const openReport = useCallback((source: 'public' | 'dm') => (msg: ChatMessage, el: HTMLElement) => {
        const pane = paneRef.current;
        if (!pane || msg.reported) return;
        const pr = pane.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        reportButtonRef.current = el;
        setReport({ messageId: msg.id, source, anchor: { top: r.top - pr.top, bottom: r.bottom - pr.top, left: r.left - pr.left, right: r.right - pr.left } });
    }, []);
    const onReportPublic = useMemo(() => openReport('public'), [openReport]);
    const onReportDm = useMemo(() => openReport('dm'), [openReport]);

    const closeReport = useCallback(() => {
        setReport(null);
        const el = reportButtonRef.current;
        reportButtonRef.current = null;
        if (el && el.isConnected && !(el as HTMLButtonElement).disabled) el.focus();
    }, []);
    const markReported = useCallback((id: number) => {
        chat.markReported(id);
        dm.markReported(id);
    }, [chat.markReported, dm.markReported]);   // eslint-disable-line react-hooks/exhaustive-deps
    const onReported = useCallback((id: number) => {
        markReported(id);
        setNoticeId(id);
        setReport(null);
        reportButtonRef.current = null;
    }, [markReported]);
    const onAlreadyReported = useCallback((id: number) => {
        markReported(id);
        setReport(null);
        reportButtonRef.current = null;
    }, [markReported]);

    // ── DM 대화 삭제 ─────────────────────────────────────────────────────────────
    const confirmDelete = async () => {
        if (deleteBusy) return;
        setDeleteBusy(true);
        setDeleteError(null);
        try {
            await dm.clearActive();
            setConfirmingDelete(false);
            setView('public');
        } catch (e) {
            setDeleteError(e instanceof ChatSendError && e.code === 'invalid_conversation' ? '대화를 찾을 수 없어요.' : '삭제하지 못했어요. 잠시 후 다시 시도해 주세요.');
        } finally {
            setDeleteBusy(false);
        }
    };

    const totalUnread = chatUnread + notif.unread;
    const fabLabel = open
        ? '채팅과 알림 닫기'
        : totalUnread > 0 ? `채팅과 알림 열기, 안 읽은 항목 ${totalUnread}개` : '채팅과 알림 열기';

    // ── 위젯 본문 ────────────────────────────────────────────────────────────────
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
                {!active && <CountBadge count={badge} size="md" />}
            </button>
        );
    };

    const backButton = narrow && (
        <IconButton label="채팅 목록으로" size="lg" tone="ghost" onClick={backToList}><ChevronLeft size={18} /></IconButton>
    );

    const renderPane = () => {
        if (view === 'new') {
            return (
                <DmNewConversation
                    roomId={roomId}
                    excludeUserIds={excludeUserIds}
                    onlineUserIds={chat.onlineUserIds}
                    onPick={pickPeer}
                    onClose={() => { setView('public'); if (narrow) setPaneOpen(false); }}
                />
            );
        }
        if (view === 'dm' && dm.active) {
            const peer = dm.active.peer;
            const peerOnline = chat.onlineUserIds.has(peer.userId);
            return (
                <>
                    {confirmingDelete ? (
                        <div role="group" aria-label="대화 삭제 확인" className="flex flex-col gap-1.5 min-h-[52px] pl-4 pr-2.5 py-2 border-b border-slate-800 bg-red-500/5 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                    <span className="text-sm font-bold text-white">이 대화를 삭제할까요?</span>
                                    <span className="text-xs font-medium text-slate-400 ko-normal">내 목록과 내 화면에서만 사라져요.</span>
                                </div>
                                <div className="flex gap-1.5 shrink-0">
                                    <Button variant="danger" size="sm" onClick={confirmDelete} isLoading={deleteBusy}>삭제</Button>
                                    <Button variant="secondary" size="sm" onClick={() => { setConfirmingDelete(false); setDeleteError(null); }} disabled={deleteBusy}>돌아가기</Button>
                                </div>
                            </div>
                            {deleteError && <InlineNotice tone="danger" size="sm">{deleteError}</InlineNotice>}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2.5 h-[52px] pl-4 pr-2.5 border-b border-slate-800 shrink-0">
                            {backButton && <div className="-ml-2">{backButton}</div>}
                            <ChatAvatar teamId={peer.teamId} teamName={peer.teamName} online={peerOnline} size="sm" />
                            <div className="flex-1 min-w-0 flex flex-col">
                                <span className="text-sm font-bold text-white truncate ko-normal leading-[18px]">{peer.name}</span>
                                <span className="text-xs font-medium text-slate-400 truncate ko-normal leading-4">
                                    {[peer.teamName, peerOnline ? '접속 중' : null].filter(Boolean).join(' · ')}
                                </span>
                            </div>
                            <Button variant="dangerSoft" size="sm" onClick={() => setConfirmingDelete(true)}>대화 삭제</Button>
                        </div>
                    )}
                    <ChatThread
                        key={dm.active.convKey}
                        thread={dm}
                        mode="dm"
                        userId={userId}
                        draft={draft}
                        setDraft={setDraft}
                        connection={dm.connection}
                        onlineUserIds={chat.onlineUserIds}
                        cooling={gate.cooling}
                        lockRemainingSec={gate.lockRemainingSec}
                        unreadAnchorId={null}
                        placeholder={`${peer.name}님에게 메시지 보내기`}
                        emptyTitle="아직 주고받은 메시지가 없어요"
                        emptySubtitle="첫 메시지를 보내 보세요. 상대가 접속해 있지 않아도 메시지는 남아 있어요."
                        onReport={onReportDm}
                        noticeId={noticeId}
                    />
                </>
            );
        }
        return (
            <>
                <div className="flex items-center justify-between gap-2 h-[52px] pl-4 pr-4 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-1 min-w-0">
                        {backButton && <div className="-ml-2">{backButton}</div>}
                        <span className="flex items-baseline gap-1.5 text-sm font-bold text-white">
                            <span aria-hidden="true" className="text-base font-medium text-slate-500">#</span>퍼블릭
                        </span>
                    </div>
                    {chat.connection === 'connected' && chat.onlineCount > 0 && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
                            {chat.onlineCount}명 접속 중
                        </div>
                    )}
                </div>
                <ChatThread
                    key="public"
                    thread={chat}
                    mode="public"
                    userId={userId}
                    draft={draft}
                    setDraft={setDraft}
                    connection={chat.connection}
                    onlineUserIds={chat.onlineUserIds}
                    cooling={gate.cooling}
                    lockRemainingSec={gate.lockRemainingSec}
                    unreadAnchorId={chat.unreadAnchorId}
                    placeholder="메시지를 입력하세요"
                    emptyTitle="아직 메시지가 없어요"
                    emptySubtitle="첫 인사를 남겨보세요. 참가자 모두가 볼 수 있어요."
                    onReport={onReportPublic}
                    noticeId={noticeId}
                />
            </>
        );
    };

    const paneEl = paneRef.current;

    return (
        <div className="fixed bottom-6 right-6 z-widget flex flex-col items-end gap-3 pointer-events-none">
            {open && (
                <section
                    id={WIDGET_ID}
                    aria-label="채팅과 알림"
                    onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
                    className="pointer-events-auto flex flex-col w-[600px] max-w-[calc(100vw-32px)] h-[min(560px,calc(100dvh-112px))] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
                >
                    {/* 탭 + 우측 보조 동작 */}
                    <div className="flex items-center justify-between gap-2 pl-2 pr-3 border-b border-slate-800 shrink-0">
                        <div role="tablist" aria-label="채팅과 알림" className="flex gap-0.5">
                            {tabBtn('chat', '채팅', chatUnread)}
                            {tabBtn('notifications', '알림', notif.unread)}
                        </div>
                        {tab === 'notifications' && notif.items.length > 0 && (
                            <Button variant="ghost" size="sm" onClick={notif.clear}>전체 삭제</Button>
                        )}
                    </div>

                    {update.available && <UpdateBanner />}

                    <div id={`${WIDGET_ID}-panel`} role="tabpanel" aria-labelledby={`${WIDGET_ID}-tab-${tab}`} className="flex flex-col flex-1 min-h-0">
                        {tab === 'chat' ? (
                            <div className="flex flex-1 min-h-0">
                                {(!narrow || !paneOpen) && (
                                    <ChatSidebar
                                        activeId={narrow ? null : activeId}
                                        publicUnread={chat.unread}
                                        conversations={dm.conversations}
                                        onlineUserIds={chat.onlineUserIds}
                                        onSelectPublic={selectPublic}
                                        onSelectConversation={selectConversation}
                                        onNew={startNew}
                                        fullWidth={narrow}
                                    />
                                )}
                                {showingPane && (
                                    <div ref={paneRef} className="relative flex-1 min-w-0 flex flex-col">
                                        {renderPane()}
                                        {report && (
                                            <>
                                                {/* 어둡게만(블러 금지). 클릭하면 팝오버 닫기 */}
                                                <div aria-hidden="true" onClick={closeReport} className="absolute inset-0 z-10 bg-slate-950/60" />
                                                <ReportPopover
                                                    key={report.messageId}
                                                    messageId={report.messageId}
                                                    anchor={report.anchor}
                                                    paneWidth={paneEl?.clientWidth ?? 380}
                                                    paneHeight={paneEl?.clientHeight ?? 500}
                                                    onClose={closeReport}
                                                    onReported={onReported}
                                                    onAlreadyReported={onAlreadyReported}
                                                />
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <LeagueNotificationList list={notif} />
                        )}
                    </div>
                </section>
            )}
            {!open && update.available && !update.toastDismissed && <UpdateToastCard withTail />}
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
