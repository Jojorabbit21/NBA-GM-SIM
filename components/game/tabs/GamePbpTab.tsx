
import React, { useRef, useEffect } from 'react';
import { List, Clock } from 'lucide-react';
import { PbpLog } from '../../../types';

interface GamePbpTabProps {
    logs?: PbpLog[];
    homeTeamId: string;
    awayTeamId: string;
}

export const GamePbpTab: React.FC<GamePbpTabProps> = ({ logs, homeTeamId, awayTeamId }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]); // Scroll when logs change or on mount

    if (!logs || logs.length === 0) return (
        <div className="w-full h-64 flex items-center justify-center text-slate-500 font-bold bg-slate-900/50 rounded-xl border border-slate-800">
            기록된 로그가 없습니다.
        </div>
    );

    return (
        <div className="h-[600px] w-full flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center gap-3 mb-4 px-1">
                <List className="text-indigo-400" size={20} />
                <h3 className="text-lg font-black uppercase text-slate-200 tracking-widest ko-tight">Play-by-Play Log</h3>
            </div>
            <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900 border border-slate-800 rounded-2xl p-4 font-mono text-xs md:text-sm space-y-1.5 shadow-inner"
            >
                {logs.map((log, idx) => {
                    const isHome = log.teamId === homeTeamId;
                    const isScore = log.type === 'score';
                    const isImportant = log.type === 'info';
                    const isFT = log.type === 'freethrow';
                    const isFoul = log.type === 'foul';
                    const isTurnover = log.type === 'turnover';
                    
                    let textColor = 'text-slate-400';
                    let bgClass = '';
                    
                    if (isImportant) {
                        textColor = 'text-yellow-400 font-bold';
                        bgClass = 'bg-yellow-900/10 border-y border-yellow-500/10 py-2 my-2 justify-center';
                    }
                    else if (isScore) textColor = isHome ? 'text-indigo-300 font-bold' : 'text-emerald-300 font-bold';
                    else if (isFT) textColor = 'text-cyan-400';
                    else if (isFoul) textColor = 'text-orange-400';
                    else if (isTurnover) textColor = 'text-red-400';

                    return (
                        <div key={idx} className={`flex gap-4 ${bgClass}`}>
                            {!isImportant && (
                                <div className="flex-shrink-0 w-16 text-slate-600 flex items-center gap-1 select-none">
                                    <Clock size={10} />
                                    <span>{log.quarter}Q {log.timeRemaining}</span>
                                </div>
                            )}
                            <div className={`flex-1 break-words ${textColor}`}>
                                {log.text}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
