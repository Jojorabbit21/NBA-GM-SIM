// NotificationCenter.tsx — 우측 하단 토스트 스택. 앱 전체에 하나만 마운트(index.tsx).
// [2026-10-02] docs/plan/toast-notification-center-plan.md 1단계. 상태는 services/notifications/
// notificationStore.ts가 갖고, 이 컴포넌트는 useSyncExternalStore로 구독해 그리기만 한다.
//   - 알림마다 × 닫기, 스택이 있을 때만 보이는 "전체 닫기"
//   - transient는 8초 후 자동 소멸, 호버 중엔 타이머 정지(남은 시간 보존 — ZenGM 동일)
//   - link가 있고 현재 경로와 다르면 "이동" 버튼(react-router navigate)
//   - z-index는 Modal(z-[500])보다 높게(z-[600]) — 모달 위에서도 보여야 함
//   - aria-live="polite": 낭독기에 새 알림을 알리되 폭주 시 끼어들지 않음
//   - 하단 고정 요소와 겹치지 않도록 bottomOffset(px) prop

import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Bell, CheckCircle2, Info, ShieldAlert, X } from 'lucide-react';
import {
    clearNotifications, getSnapshot, removeNotification, subscribe,
    TRANSIENT_TIMEOUT_MS, type AppNotification, type NotificationKind,
} from '../../services/notifications/notificationStore';

const KIND_STYLE: Record<NotificationKind, { box: string; icon: React.ReactNode; defaultTitle?: string }> = {
    error:   { box: 'bg-red-950/95 border-red-800/70 text-red-100',           icon: <ShieldAlert size={16} className="text-red-400 shrink-0" />,     defaultTitle: '오류' },
    warning: { box: 'bg-amber-950/95 border-amber-800/70 text-amber-100',     icon: <AlertTriangle size={16} className="text-amber-400 shrink-0" /> },
    success: { box: 'bg-emerald-950/95 border-emerald-800/70 text-emerald-100', icon: <CheckCircle2 size={16} className="text-emerald-400 shrink-0" /> },
    info:    { box: 'bg-slate-900/95 border-slate-700 text-slate-100',         icon: <Info size={16} className="text-sky-400 shrink-0" /> },
    league:  { box: 'bg-slate-900/95 border-indigo-700/60 text-slate-100',     icon: <Bell size={16} className="text-indigo-400 shrink-0" /> },
};

const Toast: React.FC<{ n: AppNotification; onRemove: () => void }> = ({ n, onRemove }) => {
    const ref = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const location = useLocation();
    const style = KIND_STYLE[n.kind];
    const title = n.title ?? style.defaultTitle;
    const currentPath = location.pathname + location.search;
    const showLink = !!n.link && n.link.to !== currentPath;

    // transient 자동 소멸 + 호버 일시정지(ZenGM Notification과 동일한 남은 시간 보존 방식)
    useEffect(() => {
        if (n.persistent) return;
        const el = ref.current;
        let timeoutId: number | undefined;
        let startedAt = 0;
        let remaining = TRANSIENT_TIMEOUT_MS;
        const start = () => { startedAt = Date.now(); timeoutId = window.setTimeout(onRemove, remaining); };
        const pause = () => { if (timeoutId != null) window.clearTimeout(timeoutId); remaining -= Date.now() - startedAt; };
        start();
        el?.addEventListener('mouseenter', pause);
        el?.addEventListener('mouseleave', start);
        return () => {
            if (timeoutId != null) window.clearTimeout(timeoutId);
            el?.removeEventListener('mouseenter', pause);
            el?.removeEventListener('mouseleave', start);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [n.id]);

    return (
        <div
            ref={ref}
            role={n.kind === 'error' ? 'alert' : 'status'}
            className={`toast-enter pointer-events-auto w-full rounded-xl border shadow-2xl backdrop-blur-sm px-4 py-3 flex items-start gap-3 ${style.box}`}
        >
            <div className="mt-0.5">{style.icon}</div>
            <div className="flex-1 min-w-0">
                {title && <div className="text-sm font-bold ko-normal leading-snug">{title}</div>}
                <div className="text-sm ko-normal leading-relaxed break-words whitespace-pre-line">{n.message}</div>
                {showLink && (
                    <button
                        onClick={() => { navigate(n.link!.to); onRemove(); }}
                        className="mt-2 text-xs font-bold text-indigo-300 hover:text-indigo-200 hover:underline"
                    >
                        {n.link!.label ?? '해당 화면으로 이동'} →
                    </button>
                )}
            </div>
            <button
                onClick={onRemove}
                title="알림 닫기"
                aria-label="알림 닫기"
                className="p-1 -mr-1 -mt-1 rounded-md text-current/60 hover:text-current hover:bg-white/10 transition-colors shrink-0"
            >
                <X size={14} />
            </button>
        </div>
    );
};

export const NotificationCenter: React.FC<{ bottomOffset?: number }> = ({ bottomOffset = 16 }) => {
    const { visible } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    return (
        <div
            aria-live="polite"
            aria-relevant="additions"
            className="fixed right-4 z-[600] w-[min(380px,calc(100vw-32px))] pointer-events-none flex flex-col items-end gap-2"
            style={{ bottom: bottomOffset }}
        >
            {visible.length > 0 && (
                <button
                    onClick={clearNotifications}
                    title="알림 전체 닫기"
                    aria-label="알림 전체 닫기"
                    className="pointer-events-auto flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/95 border border-slate-700 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-700 transition-colors shadow-lg"
                >
                    <X size={12} /> 전체 닫기 ({visible.length})
                </button>
            )}
            {visible.map(n => (
                <Toast key={n.id} n={n} onRemove={() => removeNotification(n.id)} />
            ))}
        </div>
    );
};
