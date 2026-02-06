
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { PbpLog, Team } from '../../../types';

interface GamePbpTabProps {
    logs?: PbpLog[];
    homeTeam: Team;
    awayTeam: Team;
}

interface ProcessedLog extends PbpLog {
    homeScore: number;
    awayScore: number;
}

export const GamePbpTab: React.FC<GamePbpTabProps> = ({ logs, homeTeam, awayTeam }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [selectedQuarter, setSelectedQuarter] = useState<number>(0); // 0 = All

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, selectedQuarter]);

    // 1. Calculate Running Score for ALL logs chronologically
    const processedLogs = useMemo(() => {
        if (!logs) return [];
        let hScore = 0;
        let aScore = 0;
        
        // Ensure logs are sorted by time? Assuming API returns chronological or we sort them?
        // Usually logs come in order. If reversed, we'd need to reverse first.
        // Assuming `logs` array is in order of occurrence (Q1 start -> Q4 end).
        
        return logs.map(log => {
            if (log.type === 'score' || log.type === 'freethrow') {
                let points = 2;
                if (log.text.includes('3점')) points = 3;
                else if (log.type === 'freethrow') {
                    if (log.text.includes('앤드원')) points = 1;
                    else points = 1;
                }
                
                if (log.teamId === homeTeam.id) hScore += points;
                else aScore += points;
            }
            
            return {
                ...log,
                homeScore: hScore,
                awayScore: aScore
            } as ProcessedLog;
        });
    }, [logs, homeTeam.id]);

    // 2. Filter by Quarter
    const displayLogs = useMemo(() => {
        if (selectedQuarter === 0) return processedLogs;
        return processedLogs.filter(l => l.quarter === selectedQuarter);
    }, [processedLogs, selectedQuarter]);

    if (!logs || logs.length === 0) return (
        <div className="w-full h-64 flex items-center justify-center text-slate-500 font-bold bg-slate-900/50 rounded-xl border border-slate-800">
            기록된 로그가 없습니다.
        </div>
    );

    return (
        <div className="h-[600px] w-full flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Quarter Filter Tabs */}
            <div className="flex items-center gap-2 mb-4 px-1">
                {[0, 1, 2, 3, 4].map(q => (
                    <button
                        key={q}
                        onClick={() => setSelectedQuarter(q)}
                        className={`
                            px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all
                            ${selectedQuarter === q 
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' 
                                : 'bg-slate-900 text-slate-500 hover:bg-slate-800 hover:text-slate-300 border border-slate-800'}
                        `}
                    >
                        {q === 0 ? '전체' : `${q}쿼터`}
                    </button>
                ))}
            </div>

            <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900 border border-slate-800 rounded-2xl p-0 font-mono text-xs md:text-sm shadow-inner"
            >
                <div className="divide-y divide-slate-800/50">
                    {displayLogs.map((log, idx) => {
                        const isHome = log.teamId === homeTeam.id;
                        const isScore = log.type === 'score';
                        const isImportant = log.type === 'info';
                        const isFT = log.type === 'freethrow';
                        const isFoul = log.type === 'foul';
                        const isTurnover = log.type === 'turnover';
                        
                        // Text Color
                        let textColor = 'text-slate-400';
                        if (isImportant) textColor = 'text-yellow-400 font-bold';
                        else if (isScore) textColor = 'text-white font-bold'; // Unified color for scores
                        else if (isFT) textColor = 'text-cyan-400';
                        else if (isFoul) textColor = 'text-orange-400';
                        else if (isTurnover) textColor = 'text-red-400';

                        // Background
                        let bgClass = 'hover:bg-white/5 transition-colors';
                        if (isImportant) bgClass = 'bg-yellow-900/10 border-y border-yellow-500/10';
                        
                        return (
                            <div key={idx} className={`flex items-center py-2.5 px-4 gap-4 ${bgClass}`}>
                                {/* 1. Time (Horizontal) */}
                                <div className="flex-shrink-0 w-16 text-slate-500 font-bold text-xs text-center">
                                    {isImportant ? (
                                        <span>INFO</span>
                                    ) : (
                                        <span>{log.quarter}Q {log.timeRemaining}</span>
                                    )}
                                </div>

                                {/* 2. Score Board (Away Logo | Score - Score | Home Logo) */}
                                <div className="flex-shrink-0 w-32 flex items-center justify-center gap-2 bg-slate-950/50 rounded-lg py-1 px-2 border border-slate-800/50">
                                    <img src={awayTeam.logo} className="w-5 h-5 object-contain opacity-80" alt="" />
                                    <div className="font-black text-slate-300 text-xs tracking-tight">
                                        <span className={!isHome && (isScore || isFT) ? 'text-white' : ''}>{log.awayScore}</span>
                                        <span className="mx-1 text-slate-600">-</span>
                                        <span className={isHome && (isScore || isFT) ? 'text-white' : ''}>{log.homeScore}</span>
                                    </div>
                                    <img src={homeTeam.logo} className="w-5 h-5 object-contain opacity-80" alt="" />
                                </div>

                                {/* 3. Message */}
                                <div className={`flex-1 break-words leading-relaxed ${textColor}`}>
                                    {log.text}
                                </div>
                            </div>
                        );
                    })}
                </div>
                
                {displayLogs.length === 0 && (
                    <div className="py-20 text-center text-slate-600">
                        해당 쿼터의 기록이 없습니다.
                    </div>
                )}
            </div>
        </div>
    );
};
