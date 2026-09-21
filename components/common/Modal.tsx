
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    title?: React.ReactNode;
    footer?: React.ReactNode; // Added Footer Support
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
    headerColor?: string;
    className?: string;
    /** 모달 자체의 X 버튼(제목 있을 때 헤더 안 / 없을 때 우상단 absolute)을 감춤 —
     *  children 쪽에서 커스텀 위치의 닫기 버튼을 직접 그릴 때(onClose 호출) 사용. */
    hideCloseButton?: boolean;
    /** 배경 블러 여부. 기본값 true(기존 모든 모달과 동일) — 확인 팝업처럼 블러 없이 즉시
     *  아래 화면이 보여야 하는 경우에만 false로 끔. */
    blurBackdrop?: boolean;
    /** 패널 모서리 둥글기 클래스. 기본값은 기존 rounded-[2rem] 그대로 유지 — 작은 확인
     *  팝업처럼 더 각진 형태가 필요할 때만 덮어씀. */
    rounded?: string;
    /** 배경 어둡기 클래스(불투명도 포함). 기본값은 기존 bg-slate-950/80 그대로 유지 — 다른
     *  값이 필요한 팝업만 덮어씀. Tailwind가 리터럴 문자열을 정적 스캔하므로 완전한
     *  클래스명 문자열로 넘길 것(동적 조합 금지). */
    backdropClass?: string;
}

export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    children,
    title,
    footer,
    size = 'lg',
    headerColor,
    className = '',
    hideCloseButton = false,
    blurBackdrop = true,
    rounded = 'rounded-[2rem]',
    backdropClass = 'bg-slate-950/80',
}) => {
    const modalRef = useRef<HTMLDivElement>(null);

    // Prevent background scrolling
    useEffect(() => {
        if (isOpen) document.body.style.overflow = 'hidden';
        else document.body.style.overflow = 'unset';
        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen]);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (target.id === 'modal-backdrop') {
                onClose();
            }
        };

        if (isOpen) window.addEventListener('mousedown', handleClickOutside);
        return () => window.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const maxWidthClass = {
        sm: "max-w-md",
        md: "max-w-2xl",
        lg: "max-w-4xl",
        xl: "max-w-6xl",
        full: "max-w-[95vw] h-[90vh]"
    };

    return createPortal(
        <div
            id="modal-backdrop"
            className={`fixed inset-0 z-[500] flex items-center justify-center ${backdropClass} ${blurBackdrop ? 'backdrop-blur-md' : ''} p-4 animate-in fade-in duration-200`}
        >
            <div
                ref={modalRef}
                className={`bg-slate-900 border border-slate-700 ${rounded} w-full ${maxWidthClass[size]} max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden ${className}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Optional Header Accent */}
                {headerColor && (
                    <>
                        <div className="absolute top-0 left-0 right-0 h-1 z-20" style={{ backgroundColor: headerColor }}></div>
                        <div className="absolute top-0 right-0 w-64 h-64 blur-[80px] rounded-full opacity-10 pointer-events-none z-0" style={{ backgroundColor: headerColor }}></div>
                    </>
                )}

                {/* Header */}
                {(title) && (
                    <div className="px-8 py-6 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center relative z-10 shrink-0">
                        <div className="flex-1 text-xl font-bold text-white">{title}</div>
                        {!hideCloseButton && (
                            <button
                                onClick={onClose}
                                className="p-2 ml-4 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
                            >
                                <X size={24} />
                            </button>
                        )}
                    </div>
                )}

                {/* Close button if no header */}
                {!title && !hideCloseButton && (
                    <button
                        onClick={onClose}
                        className="absolute top-6 right-6 p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors z-50"
                    >
                        <X size={24} />
                    </button>
                )}

                {/* Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar relative z-10 p-0">
                    {children}
                </div>

                {/* Footer (Optional) */}
                {footer && (
                    <div className="px-8 py-5 border-t border-slate-800 bg-slate-900/90 relative z-10 shrink-0">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};
