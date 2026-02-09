
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
}

export const Dropdown: React.FC<DropdownProps> = ({ 
    trigger, 
    items, 
    children, 
    align = 'right', 
    className = '',
    width = 'w-64'
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className={`relative ${className}`} ref={wrapperRef}>
            <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
                {trigger}
            </div>

            {isOpen && (
                <div 
                    className={`absolute top-full mt-2 ${align === 'right' ? 'right-0' : 'left-0'} ${width} bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150`}
                >
                    {items ? (
                        <div className="p-1 max-h-80 overflow-y-auto custom-scrollbar">
                            {items.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => {
                                        item.onClick();
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-between group ${
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
    isOpen?: boolean;
    className?: string;
}> = ({ label, icon, isOpen, className = '' }) => (
    <div className={`flex items-center justify-between gap-3 bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-2xl px-5 py-3 transition-all shadow-sm group ${className}`}>
        <div className="flex items-center gap-3 min-w-0">
            {icon && <span className="flex-shrink-0">{icon}</span>}
            <span className="font-bold text-white text-sm truncate">{label}</span>
        </div>
        <ChevronDown size={16} className={`text-slate-500 transition-transform group-hover:text-white ${isOpen ? 'rotate-180' : ''}`} />
    </div>
);
