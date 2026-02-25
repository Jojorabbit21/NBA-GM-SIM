
import React, { useState, useRef, useEffect } from 'react';
import { Filter, Check } from 'lucide-react';

interface PositionFilterProps {
    selected: string[];
    onToggle: (pos: string) => void;
}

export const PositionFilter: React.FC<PositionFilterProps> = ({ selected, onToggle }) => {
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

    const positions = ['PG', 'SG', 'SF', 'PF', 'C'];

    return (
        <div className="relative" ref={wrapperRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`px-4 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all active:scale-95 flex items-center gap-2 ${selected.length > 0 ? 'bg-slate-800 text-indigo-400 border border-indigo-500/30' : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-transparent'}`}
            >
                <Filter size={14} />
                <span>{selected.length === 0 ? 'ALL' : selected.join(', ')}</span>
            </button>
            
            {isOpen && (
                <div className="absolute top-full left-0 mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 w-full min-w-[160px] z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="space-y-1">
                        {positions.map(pos => (
                            <button
                                key={pos}
                                onClick={() => onToggle(pos)}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all ${selected.includes(pos) ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                            >
                                <span>{pos}</span>
                                {selected.includes(pos) && <Check size={14} />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
