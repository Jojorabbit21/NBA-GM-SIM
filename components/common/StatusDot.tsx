import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { InlineNoticeTone } from './InlineNotice';

interface StatusDotProps {
    tone: InlineNoticeTone;
    /** 툴팁 본문이자 aria-label(필수) — 점 하나로는 아무것도 전달되지 않으므로 */
    label: string;
    /** 한 변 px: sm 16 / md 20 */
    size?: 'sm' | 'md';
    className?: string;
}

const ICON = { danger: AlertCircle, warning: AlertTriangle, info: Info, success: CheckCircle2 } as const;
const TONE: Record<InlineNoticeTone, string> = {
    danger:  'text-red-400 bg-red-500/15',
    warning: 'text-amber-400 bg-amber-500/15',
    info:    'text-indigo-300 bg-indigo-500/15',
    success: 'text-emerald-400 bg-emerald-500/15',
};
const PX = { sm: 16, md: 20 } as const;
const TOOLTIP_GAP = 8;

/**
 * 원형 아이콘 + 호버/포커스 툴팁 — 2026-10-13 신설. InlineNotice의 변형이 아니라 용도가 다른 소형 컴포넌트:
 * 표 행·목록 항목처럼 조밀한 곳에서 "항목별 상태"를 표시할 때만 쓴다. 버튼 액션 실패의 1차 표시로는
 * 쓰지 않는다(실패 사실이 20px 점에 묻히고, 이유를 보려면 호버가 필요하며, 터치에선 호버가 없음).
 * 툴팁은 InjuryStatusBadge와 같은 방식(document.body 포탈 + fixed + z-tooltip)이라 sticky 셀·
 * 스크롤 컨테이너에 가려지지 않는다. 터치/키보드용으로 클릭 토글·포커스·Escape도 지원.
 */
export const StatusDot: React.FC<StatusDotProps> = ({ tone, label, size = 'md', className = '' }) => {
    const Icon = ICON[tone];
    const px = PX[size];
    const anchorRef = useRef<HTMLSpanElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const pinnedRef = useRef(false); // 클릭으로 연 경우 mouseleave에 닫지 않음

    const open = () => {
        if (!anchorRef.current) return;
        const r = anchorRef.current.getBoundingClientRect();
        setPos({ top: r.top - TOOLTIP_GAP, left: r.left + r.width / 2 });
    };
    const close = () => { pinnedRef.current = false; setPos(null); };

    useEffect(() => {
        if (!pos) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
        const onDown = (e: MouseEvent) => { if (!anchorRef.current?.contains(e.target as Node)) close(); };
        window.addEventListener('keydown', onKey);
        window.addEventListener('mousedown', onDown);
        return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
    }, [pos]);

    return (
        <span
            ref={anchorRef}
            role="img"
            aria-label={label}
            tabIndex={0}
            className={`inline-flex items-center justify-center rounded-full shrink-0 cursor-default outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${TONE[tone]} ${className}`}
            style={{ width: px, height: px }}
            onMouseEnter={open}
            onMouseLeave={() => { if (!pinnedRef.current) setPos(null); }}
            onFocus={open}
            onBlur={close}
            onClick={e => { e.stopPropagation(); if (pos && pinnedRef.current) close(); else { pinnedRef.current = true; open(); } }}
        >
            <Icon size={Math.round(px * 0.7)} strokeWidth={2} />
            {pos && createPortal(
                <span
                    role="tooltip"
                    className="fixed -translate-x-1/2 -translate-y-full z-tooltip w-max max-w-[260px] bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs font-medium leading-4 text-slate-200 break-keep shadow-xl pointer-events-none"
                    style={{ top: pos.top, left: pos.left }}
                >
                    {label}
                </span>,
                document.body,
            )}
        </span>
    );
};
