
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface DropdownItem {
    id: string;
    label: React.ReactNode;
    onClick: () => void;
    active?: boolean;
}

interface DropdownProps {
    trigger: React.ReactNode;
    items?: DropdownItem[];
    children?: React.ReactNode; // For custom content instead of items
    align?: 'left' | 'right';
    className?: string;
    width?: string;
    // Controlled props
    isOpen?: boolean;
    onOpenChange?: (isOpen: boolean) => void;
}

export const Dropdown: React.FC<DropdownProps> = ({ 
    trigger, 
    items, 
    children, 
    align = 'right', 
    className = '',
    width = 'w-64',
    isOpen: controlledIsOpen,
    onOpenChange
}) => {
    const [internalIsOpen, setInternalIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const isExpanded = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

    const toggle = () => {
        const newState = !isExpanded;
        if (onOpenChange) onOpenChange(newState);
        else setInternalIsOpen(newState);
    };

    const close = () => {
        if (onOpenChange) onOpenChange(false);
        else setInternalIsOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                close();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [wrapperRef]); // Dependencies adjusted

    return (
        <div className={`relative ${className}`} ref={wrapperRef}>
            <div onClick={toggle} className="cursor-pointer">
                {trigger}
            </div>

            {isExpanded && (
                <div 
                    className={`absolute top-full mt-2 ${align === 'right' ? 'right-0' : 'left-0'} ${width} bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-[200] animate-in fade-in zoom-in-95 duration-150`}
                >
                    {items ? (
                        <div className="p-1 max-h-80 overflow-y-auto custom-scrollbar">
                            {items.map((item) => (
                                <button
                                    key={item.id}
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
                            ))}
                        </div>
                    ) : (
                        children
                    )}
                </div>
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
        className={`flex items-center justify-between gap-3 bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-xl px-4 py-3 transition-all shadow-lg group ${className}`}
    >
        <div className="flex items-center gap-3 min-w-0">
            {icon && <span className="flex-shrink-0">{icon}</span>}
            <span className="font-bold text-white text-xs lg:text-sm truncate">{label}</span>
        </div>
        <ChevronDown size={16} className={`text-slate-500 transition-transform group-hover:text-white flex-shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`} />
    </div>
);
