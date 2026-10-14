
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

type PanelPos =
    | { kind: 'bottom'; top: number; left: number }
    | { kind: 'right'; bottom: number; left: number };

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
        return { kind: 'bottom', top: rect.bottom + 8, left: align === 'right' ? rect.right : rect.left };
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
                    className={`fixed ${width} bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-popover animate-in fade-in duration-100`}
                    style={
                        pos.kind === 'right'
                            ? { bottom: pos.bottom, left: pos.left }
                            : {
                                top: pos.top,
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
