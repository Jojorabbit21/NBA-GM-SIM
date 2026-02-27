
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { BoardPick } from './DraftBoard';

interface PickHistoryProps {
    picks: BoardPick[];
    totalRounds: number;
    positionColors: Record<string, string>;
    userTeamId: string;
}

export const PickHistory: React.FC<PickHistoryProps> = ({ picks, totalRounds, positionColors, userTeamId }) => {
    const [roundFilter, setRoundFilter] = useState<number | null>(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const topRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        topRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [picks.length]);

    const filtered = useMemo(() => {
        const list = roundFilter !== null ? picks.filter(p => p.round === roundFilter) : picks;
        return [...list].reverse();
    }, [picks, roundFilter]);

    const filterLabel = roundFilter !== null ? `R${roundFilter}` : '전체';

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-3 h-10 border-b border-slate-800/50 shrink-0 flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">PICK HISTORY</span>
                {/* Round Filter Dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                        className="flex items-center gap-0.5 text-[10px] font-bold text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded-md px-1.5 py-0.5 transition-colors"
                    >
                        {filterLabel}
                        <ChevronDown size={10} />
                    </button>
                    {dropdownOpen && (
                        <div className="absolute right-0 top-full mt-0.5 bg-slate-900 border border-slate-800 rounded-md shadow-xl z-50 max-h-48 overflow-y-auto" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                            <button
                                onClick={() => { setRoundFilter(null); setDropdownOpen(false); }}
                                className={`block w-full text-left px-3 py-1 text-[10px] font-bold hover:bg-slate-800 transition-colors ${
                                    roundFilter === null ? 'text-indigo-400' : 'text-slate-400'
                                }`}
                            >
                                전체
                            </button>
                            {Array.from({ length: totalRounds }, (_, i) => (
                                <button
                                    key={i}
                                    onClick={() => { setRoundFilter(i + 1); setDropdownOpen(false); }}
                                    className={`block w-full text-left px-3 py-1 text-[10px] font-bold hover:bg-slate-800 transition-colors ${
                                        roundFilter === i + 1 ? 'text-indigo-400' : 'text-slate-400'
                                    }`}
                                >
                                    R{i + 1}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            {/* Scroll Area */}
            <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                <div ref={topRef} />
                {filtered.length === 0 && (
                    <div className="px-2 py-4 text-[10px] text-slate-600 italic text-center">아직 픽이 없습니다</div>
                )}
                {filtered.map((pick, idx) => {
                    const overallPick = roundFilter !== null
                        ? picks.filter(p => p.round === roundFilter).length - idx
                        : picks.length - idx;
                    const isLatest = idx === 0 && roundFilter === null;
                    const isUserPick = pick.teamId === userTeamId;
                    const posColor = positionColors[pick.position] || '#64748b';

                    return (
                        <div
                            key={`${pick.teamId}-${pick.round}`}
                            className={`px-2.5 py-2 border-b border-slate-700/50 flex items-center gap-0 transition-colors ${
                                isLatest ? 'bg-indigo-500/5' : isUserPick ? 'bg-amber-500/[0.04]' : ''
                            }`}
                        >
                            {/* Pick number */}
                            <span className="text-[11px] text-slate-500 font-bold font-mono w-8 shrink-0">
                                #{overallPick}
                            </span>
                            {/* Position */}
                            <span
                                className="text-[10px] font-bold w-8 shrink-0"
                                style={{ color: posColor }}
                            >
                                {pick.position}
                            </span>
                            {/* Team abbreviation */}
                            <span className="text-[10px] font-semibold text-slate-400 w-8 shrink-0 uppercase">
                                {pick.teamId.toUpperCase()}
                            </span>
                            {/* Player name */}
                            <span className={`text-[11px] font-semibold truncate flex-1 ${isUserPick ? 'text-white' : 'text-slate-200'}`}>
                                {pick.playerName}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
