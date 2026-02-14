
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { PbpLog, Team } from '../../../types';
import { TEAM_DATA } from '../../../data/teamData';
import { ArrowRight, UserPlus, UserMinus, Clock } from 'lucide-react';

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
        
        return logs.map(log => {
            // [FIX] Rely on explicit 'points' field from engine, do not guess from text.
            // This ensures And-1s and multi-FT makes are counted correctly.
            const points = log.points || 0;
            
            if (points > 0) {
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

    // Helper to format log text
    const renderLogContent = (text: string, homeTeam: Team, awayTeam: Team) => {
        // [New] Structured Substitution Parsing
        if (text.startsWith('교체:')) {
            // Expected format: "교체: IN [Name, Name] OUT [Name, Name]"
            const inMatch = text.match(/IN \[(.*?)\]/);
            const outMatch = text.match(/OUT \[(.*?)\]/);
            
            if (inMatch && outMatch) {
                const inPlayers = inMatch[1].split(',').map(s => s.trim());
                const outPlayers = outMatch[1].split(',').map(s => s.trim());
                
                return (
                    <div className="flex flex-col gap-1 text-xs">
                        <div className="flex items-center gap-2 text-emerald-400">
                            <UserPlus size={14} />
                            <span>IN:</span>
                            <div className="flex flex-wrap gap-2">
                                {inPlayers.map((p, i) => <span key={i} className="font-bold">{p}</span>)}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-red-400">
                            <UserMinus size={14} />
                            <span>OUT:</span>
                            <div className="flex flex-wrap gap-2">
                                {outPlayers.map((p, i) => <span key={i} className="font-bold opacity-80">{p}</span>)}
                            </div>
                        </div>
                    </div>
                );
            }
        }

        // Standard formatting for other logs
        let cleanText = text.replace(/^\[\d+-\d+\]\s*/, '');
        cleanText = cleanText.replace(/^[-\.]+\s*(.*?)\s*[-\.]+$/, '$1');
        cleanText = cleanText.replace(/\s*\(\d+\s*:\s*\d+\)$/, '');

        // Collect all player names for highlighting
        const playerNames = new Set<string>();
        [...homeTeam.roster, ...awayTeam.roster].forEach(p => playerNames.add(p.name));

        const matchedNames = Array.from(playerNames)
            .filter(name => cleanText.includes(name))
            .sort((a, b) => b.length - a.length);

        if (matchedNames.length > 0) {
            const regex = new RegExp(`(${matchedNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
            const split = cleanText.split(regex);
            
            return (
                <span>
                    {split.map((part, i) => 
                        playerNames.has(part) ? <span key={i} className="text-white font-bold">{part}</span> : part
                    )}
                </span>
            );
        }

        return cleanText;
    };

    if (!logs || logs.length === 0) return (
        <div className="w-full h-64 flex items-center justify-center text-slate-500 font-bold bg-slate-900/50 rounded-xl border border-slate-800">
            기록된 로그가 없습니다.
        </div>
    );

    return (
        <div className="h-[600px] w-full flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Quarter Filter Tabs */}
            <div className="flex items-center gap-2 mb-4 px-4 md:px-0">
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
                className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900 border border-slate-800 p-0 font-mono text-xs md:text-sm shadow-inner rounded-none md:rounded-xl"
            >
                <div className="divide-y divide-slate-800/50">
                    {displayLogs.map((log, idx) => {
                        const isHome = log.teamId === homeTeam.id;
                        const isScore = log.type === 'score';
                        const isImportant = log.type === 'info';
                        const isFT = log.type === 'freethrow';
                        const isFoul = log.type === 'foul';
                        const isTurnover = log.type === 'turnover';
                        
                        // Check for Game Flow Events
                        const isFlowEvent = log.text.includes('경기 시작') || log.text.includes('종료') || log.text.includes('하프 타임');

                        if (isFlowEvent) {
                             return (
                                <div key={idx} className="flex items-center justify-center py-3 bg-slate-800/40 border-y border-slate-800">
                                    <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs uppercase tracking-widest">
                                        <Clock size={14} />
                                        <span>{log.text}</span>
                                    </div>
                                </div>
                             );
                        }
                        
                        // Text Color
                        let textColor = 'text-slate-400';
                        if (isImportant) textColor = 'text-slate-300';
                        else if (isScore) textColor = 'text-slate-200'; 
                        else if (isFT) textColor = 'text-cyan-400';
                        else if (isFoul) textColor = 'text-orange-400';
                        else if (isTurnover) textColor = 'text-red-400';

                        // Background
                        let bgClass = 'hover:bg-white/5 transition-colors';
                        if (isImportant) bgClass = 'bg-slate-800/30 border-y border-slate-800/50';
                        
                        const timeDisplay = (log.timeRemaining || '-');

                        return (
                            <div key={idx} className={`flex items-center py-2.5 px-4 gap-4 ${bgClass}`}>
                                {/* 1. Quarter */}
                                <div className="flex-shrink-0 w-6 text-slate-600 font-bold text-[10px] text-center">
                                    {log.quarter}Q
                                </div>

                                {/* 2. Time */}
                                <div className="flex-shrink-0 w-12 text-slate-500 font-bold text-xs text-center">
                                    {timeDisplay}
                                </div>

                                {/* 3. Away Logo */}
                                <div className="flex-shrink-0 w-8 flex justify-center">
                                    <img src={awayTeam.logo} className={`w-5 h-5 object-contain ${!isHome ? 'opacity-100' : 'opacity-40 grayscale'}`} alt="" />
                                </div>

                                {/* 4. Score (Text Only) */}
                                <div className="flex-shrink-0 w-16 text-center">
                                    <div className="font-black text-slate-500 text-xs tracking-tight">
                                        <span className={!isHome && (isScore || isFT) ? 'text-white' : ''}>{log.awayScore}</span>
                                        <span className="mx-1 text-slate-700">:</span>
                                        <span className={isHome && (isScore || isFT) ? 'text-white' : ''}>{log.homeScore}</span>
                                    </div>
                                </div>

                                {/* 5. Home Logo */}
                                <div className="flex-shrink-0 w-8 flex justify-center">
                                    <img src={homeTeam.logo} className={`w-5 h-5 object-contain ${isHome ? 'opacity-100' : 'opacity-40 grayscale'}`} alt="" />
                                </div>

                                {/* 6. Message */}
                                <div className={`flex-1 break-words leading-relaxed pl-2 ${textColor}`}>
                                    {renderLogContent(log.text, homeTeam, awayTeam)}
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
