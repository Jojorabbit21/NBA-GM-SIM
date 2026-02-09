
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
}

export const Modal: React.FC<ModalProps> = ({ 
    isOpen, 
    onClose, 
    children, 
    title, 
    footer,
    size = 'lg', 
    headerColor,
    className = ''
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
            className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
        >
            <div 
                ref={modalRef}
                className={`bg-slate-900 border border-slate-700 rounded-[2rem] w-full ${maxWidthClass[size]} max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden ${className}`}
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
                        <button 
                            onClick={onClose} 
                            className="p-2 ml-4 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
                        >
                            <X size={24} />
                        </button>
                    </div>
                )}
                
                {/* Close button if no header */}
                {!title && (
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
