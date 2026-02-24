
import React, { useRef, useEffect } from 'react';
import { TeamLogo } from '../common/TeamLogo';
import { BoardPick } from './DraftBoard';

interface PickHistoryProps {
    picks: BoardPick[];
}

export const PickHistory: React.FC<PickHistoryProps> = ({ picks }) => {
    const topRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        topRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [picks.length]);

    const reversed = [...picks].reverse();

    return (
        <div className="flex flex-col h-full bg-slate-950">
            {/* Header */}
            <div className="px-2 py-1.5 border-b border-slate-800 shrink-0">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">PICK HISTORY</span>
            </div>
            {/* Scroll Area */}
            <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                <div ref={topRef} />
                {reversed.length === 0 && (
                    <div className="px-2 py-4 text-[10px] text-slate-600 italic text-center">아직 픽이 없습니다</div>
                )}
                {reversed.map((pick, idx) => {
                    const overallPick = picks.length - idx;
                    const isLatest = idx === 0;
                    return (
                        <div
                            key={`${pick.teamId}-${pick.round}`}
                            className={`px-2 py-1 border-b border-slate-800/30 flex items-center gap-2 ${
                                isLatest ? 'bg-indigo-500/5' : ''
                            }`}
                        >
                            <span className="text-[9px] text-slate-600 font-mono w-6 shrink-0 text-right">#{overallPick}</span>
                            <TeamLogo teamId={pick.teamId} size="xs" className="w-3.5 h-3.5 shrink-0" />
                            <span className="text-xs font-bold text-slate-200 truncate flex-1">{pick.playerName}</span>
                            <span className="text-[10px] font-bold text-indigo-400">{pick.ovr}</span>
                            <span className="text-[9px] text-slate-500">{pick.position}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
