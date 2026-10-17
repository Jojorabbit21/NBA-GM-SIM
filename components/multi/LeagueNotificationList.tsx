// LeagueNotificationList.tsx — 채팅·알림 통합 위젯(LeagueChatDock)의 "알림" 탭 본문.
// [2026-10-17] 리그 안에서는 토스트 팝업 대신 이 목록이 알림을 보여준다(notificationStore.setToastsSuppressed).
// - 데이터: 전역 알림 저장소의 history(최근 50건, 새것 순). 리그 알림은 새로고침하면 사라진다 — 원본은 뉴스피드·트레이드 기록(DB).
//   에러 중 persistent인 것만 기존 localStorage 미러로 복원된다.
// - 안 읽음: 이 탭을 보는 동안 도착/기존 알림은 모두 읽음 처리(markAllRead). 단 "새 알림" 구분은 탭에 들어온 시점의 readUpTo 기준으로
//   고정해 보는 동안 유지한다(방금 읽은 항목이 곧바로 "이전"으로 내려가 버리지 않게).
// - 항목: 종류 아이콘(토스트와 같은 KIND_STYLE) · 제목 · 메시지 · 상대 시간 · "이동 →"(현재 경로와 다를 때만) · × 삭제

import React, { useEffect, useMemo, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { NotificationListState } from '../../hooks/useNotificationList';
import type { AppNotification } from '../../services/notifications/notificationStore';
import { KIND_STYLE } from '../common/NotificationCenter';
import { IconButton } from '../common/IconButton';
import { EmptyState } from '../common/EmptyState';

function formatRelative(createdAt: number, now: number): string {
    const sec = Math.max(0, Math.floor((now - createdAt) / 1000));
    if (sec < 60) return '방금 전';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}분 전`;
    const hour = Math.floor(min / 60);
    if (hour < 24) return `${hour}시간 전`;
    const day = Math.floor(hour / 24);
    if (day === 1) return '어제';
    if (day < 7) return `${day}일 전`;
    return new Date(createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

const Row: React.FC<{
    n: AppNotification;
    isNew: boolean;
    now: number;
    onRemove: () => void;
}> = ({ n, isNew, now, onRemove }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const style = KIND_STYLE[n.kind];
    const title = n.title ?? style.defaultTitle;
    const showLink = !!n.link && n.link.to !== location.pathname + location.search;

    return (
        <li
            role={n.kind === 'error' ? 'alert' : undefined}
            className={`flex items-start gap-2.5 py-3 pr-2 border-t border-slate-800 ${isNew ? 'pl-4 bg-slate-800/40' : 'pl-[34px]'}`}
        >
            {isNew && <span className="w-2 h-2 mt-[7px] rounded-full bg-indigo-500 shrink-0" aria-label="안 읽음" />}
            <span className="mt-[3px] shrink-0">{style.icon}</span>
            <div className="flex-1 min-w-0 flex flex-col gap-1">
                {title && <div className="text-[13px] font-bold text-slate-100 ko-normal">{title}</div>}
                <div className="text-[13px] leading-[19px] text-slate-300 ko-normal break-words whitespace-pre-line [overflow-wrap:anywhere]">{n.message}</div>
                <div className="flex items-center gap-2.5 text-xs text-slate-400">
                    <span>{formatRelative(n.createdAt, now)}</span>
                    {showLink && (
                        <button
                            type="button"
                            onClick={() => navigate(n.link!.to)}
                            className="font-bold text-indigo-300 hover:text-indigo-200 hover:underline"
                        >
                            {n.link!.label ?? '해당 화면으로 이동'} →
                        </button>
                    )}
                </div>
            </div>
            <IconButton label="알림 삭제" size="md" tone="subtle" onClick={onRemove}><X size={14} /></IconButton>
        </li>
    );
};

export const LeagueNotificationList: React.FC<{ list: NotificationListState }> = ({ list }) => {
    // 이 탭에 들어온 시점의 읽음 기준 — 보는 동안 고정
    const [anchor] = useState(list.readUpTo);
    const [now, setNow] = useState(() => Date.now());
    const { unread, markAllRead } = list;

    // 보는 동안(처음 + 새로 도착할 때마다) 읽음 처리
    useEffect(() => {
        if (unread > 0) markAllRead();
    }, [unread, markAllRead]);

    // 상대 시간 갱신
    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 30_000);
        return () => window.clearInterval(id);
    }, []);

    const { fresh, older } = useMemo(() => ({
        fresh: list.items.filter(n => n.createdAt > anchor),
        older: list.items.filter(n => n.createdAt <= anchor),
    }), [list.items, anchor]);

    if (list.items.length === 0) {
        return (
            <div className="flex-1 min-h-0 overflow-y-auto">
                <EmptyState padding="sm" icon={Bell} title="새 알림이 없어요" subtitle="지난 리그 소식은 뉴스피드에서 볼 수 있어요." />
            </div>
        );
    }

    return (
        <div className="flex-1 min-h-0 overflow-y-auto" aria-live="polite" aria-relevant="additions">
            {fresh.length > 0 && (
                <>
                    <div className="px-4 pt-2.5 pb-1.5 text-xs font-medium text-slate-400">새 알림 {fresh.length}</div>
                    <ul>{fresh.map(n => <Row key={n.id} n={n} isNew now={now} onRemove={() => list.remove(n.id)} />)}</ul>
                </>
            )}
            {older.length > 0 && (
                <>
                    <div className="px-4 pt-3.5 pb-1.5 text-xs font-medium text-slate-400">{fresh.length > 0 ? '이전 알림' : '알림'}</div>
                    <ul>{older.map(n => <Row key={n.id} n={n} isNew={false} now={now} onRemove={() => list.remove(n.id)} />)}</ul>
                </>
            )}
        </div>
    );
};
