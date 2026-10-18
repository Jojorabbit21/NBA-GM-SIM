
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
// useEffect: click outside handler / useLayoutEffect: position calc before paint
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

interface DropdownItem {
    id: string;
    label: React.ReactNode;
    onClick: () => void;
    active?: boolean;
    /** 이 항목 위에 구분선을 그린다(그룹 경계). [2026-10-13] 사이드바 프로필 메뉴 이관 시 추가. */
    dividerBefore?: boolean;
}

interface DropdownProps {
    trigger: React.ReactNode;
    items?: DropdownItem[];
    children?: React.ReactNode; // For custom content instead of items
    align?: 'left' | 'right';
    /** 패널이 열리는 방향. 기본 'bottom'(트리거 아래). 'right'는 트리거 오른쪽에 붙어 위로 자라는
     *  형태 — 화면 왼쪽 하단의 40px 사이드바 프로필 버튼처럼 아래 공간이 없는 트리거용. [2026-10-13] */
    side?: 'bottom' | 'right';
    className?: string;
    width?: string;
    // Controlled props
    isOpen?: boolean;
    onOpenChange?: (isOpen: boolean) => void;
}

// 'bottom' 패널은 처음엔 트리거 아래(top)로 그리고, 실제 높이를 잰 뒤(fitted) 화면 아래가 모자라면 위로 뒤집거나(bottom)
// 남은 공간만큼 maxHeight로 줄인다. [2026-10-18] 뎁스차트 마지막 줄 선수 드롭다운이 화면 아래로 잘려 선택 불가였던 문제.
type PanelPos =
    | { kind: 'bottom'; top?: number; bottom?: number; left: number; maxHeight?: number; fitted: boolean }
    | { kind: 'right'; bottom: number; left: number };

const PANEL_GAP = 8;        // 트리거와 패널 사이
const VIEWPORT_MARGIN = 8;  // 패널과 화면 끝 사이 최소 여백
const MIN_PANEL_HEIGHT = 120; // 공간이 극단적으로 좁아도 이 높이는 확보(스크롤)

/** 패널 높이 h와 트리거 위치로 열 방향·최대 높이를 정한다(순수 함수 — 테스트용으로 export). */
export function fitDropdownPanel(h: number, triggerTop: number, triggerBottom: number, viewportH: number):
    { placement: 'below' | 'above'; maxHeight?: number } {
    const spaceBelow = viewportH - triggerBottom - PANEL_GAP - VIEWPORT_MARGIN;
    const spaceAbove = triggerTop - PANEL_GAP - VIEWPORT_MARGIN;
    if (h <= spaceBelow) return { placement: 'below' };
    if (h <= spaceAbove) return { placement: 'above' };
    return spaceAbove > spaceBelow
        ? { placement: 'above', maxHeight: Math.max(spaceAbove, MIN_PANEL_HEIGHT) }
        : { placement: 'below', maxHeight: Math.max(spaceBelow, MIN_PANEL_HEIGHT) };
}

export const Dropdown: React.FC<DropdownProps> = ({
    trigger,
    items,
    children,
    align = 'right',
    side = 'bottom',
    className = '',
    width = 'w-64',
    isOpen: controlledIsOpen,
    onOpenChange
}) => {
    const [internalIsOpen, setInternalIsOpen] = useState(false);
    const triggerRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<PanelPos | null>(null);

    const isExpanded = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

    const calcPos = useCallback((): PanelPos | null => {
        if (!triggerRef.current) return null;
        const rect = triggerRef.current.getBoundingClientRect();
        if (side === 'right') {
            return { kind: 'right', bottom: window.innerHeight - rect.bottom + 8, left: rect.right + 8 };
        }
        return { kind: 'bottom', top: rect.bottom + PANEL_GAP, left: align === 'right' ? rect.right : rect.left, fitted: false };
    }, [align, side]);

    const toggle = () => {
        const newState = !isExpanded;
        // Pre-calculate position before opening → batched with state update → no (0,0) flash
        if (newState) setPos(calcPos());
        if (onOpenChange) onOpenChange(newState);
        else setInternalIsOpen(newState);
    };

    const close = useCallback(() => {
        if (onOpenChange) onOpenChange(false);
        else setInternalIsOpen(false);
    }, [onOpenChange]);

    // Fallback: recalculate if opened externally (not via toggle)
    useLayoutEffect(() => {
        if (isExpanded && !pos) setPos(calcPos());
    }, [isExpanded, pos, calcPos]);

    // 화면 안에 맞추기 — 패널이 그려진 직후(페인트 전) 실제 높이를 재서 1회 보정한다. 아래에 들어가면 그대로,
    // 아래가 모자라고 위에 들어가면 위로 뒤집고, 양쪽 다 모자라면 더 넓은 쪽에 열고 maxHeight + 패널 스크롤.
    useLayoutEffect(() => {
        if (!isExpanded || !pos || pos.kind !== 'bottom' || pos.fitted) return;
        const panel = panelRef.current;
        const trig = triggerRef.current;
        if (!panel || !trig) return;
        const rect = trig.getBoundingClientRect();
        const fit = fitDropdownPanel(panel.offsetHeight, rect.top, rect.bottom, window.innerHeight);
        setPos(fit.placement === 'below'
            ? { kind: 'bottom', left: pos.left, fitted: true, top: rect.bottom + PANEL_GAP, maxHeight: fit.maxHeight }
            : { kind: 'bottom', left: pos.left, fitted: true, bottom: window.innerHeight - rect.top + PANEL_GAP, maxHeight: fit.maxHeight });
    }, [isExpanded, pos]);

    // Click outside to close
    useEffect(() => {
        if (!isExpanded) return;
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                triggerRef.current && !triggerRef.current.contains(target) &&
                panelRef.current && !panelRef.current.contains(target)
            ) {
                close();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isExpanded, close]);

    return (
        <div className={`relative ${className}`} ref={triggerRef}>
            <div onClick={toggle} className="cursor-pointer">
                {trigger}
            </div>

            {isExpanded && pos && createPortal(
                <div
                    ref={panelRef}
                    className={`fixed ${width} bg-slate-900 border border-slate-800 rounded-xl shadow-2xl ${pos.kind === 'bottom' && pos.maxHeight !== undefined ? 'overflow-y-auto custom-scrollbar' : 'overflow-hidden'} z-popover animate-in fade-in duration-100`}
                    style={
                        pos.kind === 'right'
                            ? { bottom: pos.bottom, left: pos.left }
                            : {
                                ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom }),
                                ...(pos.maxHeight !== undefined ? { maxHeight: pos.maxHeight } : {}),
                                ...(align === 'right' ? { right: window.innerWidth - pos.left } : { left: pos.left }),
                            }
                    }
                >
                    {items ? (
                        <div className="p-1 max-h-80 overflow-y-auto custom-scrollbar">
                            {items.map((item) => (
                                <React.Fragment key={item.id}>
                                    {item.dividerBefore && <div className="my-1 border-t border-slate-800" />}
                                    <button
                                        onClick={() => {
                                            item.onClick();
                                            close();
                                        }}
                                        className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-between group ${
                                            item.active
                                                ? 'bg-indigo-600/10 text-indigo-400'
                                                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                        }`}
                                    >
                                        {item.label}
                                    </button>
                                </React.Fragment>
                            ))}
                        </div>
                    ) : (
                        children
                    )}
                </div>,
                document.body
            )}
        </div>
    );
};

// Pre-styled trigger button for common use cases
export const DropdownButton: React.FC<{ 
    label: React.ReactNode; 
    icon?: React.ReactNode; 
    isOpen?: boolean; // Just for visual arrow rotation if needed manually
    className?: string;
    onClick?: () => void; // Optional direct click handler if not using Dropdown wrapper
}> = ({ label, icon, isOpen, className = '', onClick }) => (
    <div 
        onClick={onClick}
        className={`flex items-center justify-between gap-3 bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-lg px-4 py-2 transition-all shadow-lg group ${className}`}
    >
        <div className="flex items-center gap-3 min-w-0">
            {icon && <span className="flex-shrink-0">{icon}</span>}
            <span className="font-bold text-white text-xs lg:text-sm truncate">{label}</span>
        </div>
        <ChevronDown size={16} className={`text-slate-500 transition-transform group-hover:text-white flex-shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`} />
    </div>
);
