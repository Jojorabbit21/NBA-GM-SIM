
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TEAM_DATA } from '../data/teamData';
import { TeamLogo } from '../components/common/TeamLogo';
import { Dices, ChevronRight } from 'lucide-react';

interface DraftLotteryViewProps {
    myTeamId: string;
    savedOrder: string[] | null;
    onComplete: (order: string[]) => void;
}

const REVEAL_INTERVAL = 500; // ms between each reveal

export const DraftLotteryView: React.FC<DraftLotteryViewProps> = ({
    myTeamId,
    savedOrder,
    onComplete,
}) => {
    const [revealedCount, setRevealedCount] = useState(0);
    const [isAllRevealed, setIsAllRevealed] = useState(false);
    const lastRevealedRef = useRef<HTMLDivElement>(null);

    // Sequential reveal animation (savedOrder는 마운트 전에 DB 저장 완료 보장)
    useEffect(() => {
        if (!savedOrder) return;
        if (revealedCount >= savedOrder.length) return;

        const delay = revealedCount === 0 ? 800 : REVEAL_INTERVAL;
        const timer = setTimeout(() => {
            setRevealedCount(prev => prev + 1);
        }, delay);

        return () => clearTimeout(timer);
    }, [savedOrder, revealedCount]);

    // Auto-scroll to last revealed item
    useEffect(() => {
        if (lastRevealedRef.current) {
            lastRevealedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [revealedCount]);

    // Check completion
    useEffect(() => {
        if (savedOrder && revealedCount >= savedOrder.length && !isAllRevealed) {
            setIsAllRevealed(true);
        }
    }, [savedOrder, revealedCount, isAllRevealed]);

    const handleStart = useCallback(() => {
        if (savedOrder) onComplete(savedOrder);
    }, [savedOrder, onComplete]);

    const userPickNumber = savedOrder ? savedOrder.indexOf(myTeamId) + 1 : 0;

    if (!savedOrder) return null;

    return (
        <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col items-center justify-center">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl" />
            </div>

            {/* Title */}
            <div className="relative z-10 text-center mb-8">
                <div className="flex items-center justify-center gap-3 mb-3">
                    <Dices size={28} className="text-indigo-400" />
                    <h1 className="text-3xl font-black text-white uppercase oswald tracking-wider">
                        드래프트 추첨
                    </h1>
                    <Dices size={28} className="text-indigo-400" />
                </div>
                <p className="text-slate-500 text-sm font-bold ko-tight">
                    {!isAllRevealed ? '드래프트 순서가 공개됩니다' : '추첨이 완료되었습니다'}
                </p>
            </div>

            {/* Lottery List */}
            <div className="relative z-10 w-full max-w-md max-h-[60vh] overflow-y-auto custom-scrollbar px-4">
                <div className="space-y-2">
                    {savedOrder.map((teamId, idx) => {
                        const pickNum = idx + 1;
                        const isRevealed = idx < revealedCount;
                        const isJustRevealed = idx === revealedCount - 1;
                        const isMyTeam = teamId === myTeamId;
                        const teamInfo = TEAM_DATA[teamId];
                        const teamColor = teamInfo?.colors.primary || '#6366f1';

                        return (
                            <div
                                key={teamId}
                                ref={isJustRevealed ? lastRevealedRef : undefined}
                                className={`flex items-center gap-4 px-5 py-3.5 rounded-2xl transition-all duration-500 ${
                                    isRevealed
                                        ? isMyTeam
                                            ? 'bg-indigo-500/15 ring-2 ring-indigo-500/50'
                                            : 'bg-slate-900/80'
                                        : 'bg-slate-900/30'
                                }`}
                                style={{
                                    opacity: isRevealed ? 1 : 0.15,
                                    transform: isRevealed ? 'translateX(0)' : 'translateX(20px)',
                                    transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                                }}
                            >
                                {/* Pick Number */}
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-black text-sm oswald ${
                                    isRevealed
                                        ? isMyTeam ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'
                                        : 'bg-slate-800/50 text-slate-700'
                                }`}>
                                    {pickNum}
                                </div>

                                {/* Team Logo */}
                                <TeamLogo
                                    teamId={teamId}
                                    size="sm"
                                    className={`transition-all duration-300 ${isRevealed ? '' : 'opacity-0'}`}
                                />

                                {/* Team Name */}
                                <div className="flex-1 min-w-0">
                                    {isRevealed ? (
                                        <div className="flex items-center gap-2">
                                            <span className={`text-sm font-bold uppercase tracking-wide ${
                                                isMyTeam ? 'text-indigo-300' : 'text-slate-200'
                                            }`}>
                                                {teamInfo ? `${teamInfo.city} ${teamInfo.name}` : teamId.toUpperCase()}
                                            </span>
                                            {isMyTeam && (
                                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 uppercase">
                                                    My Team
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="h-4 w-32 bg-slate-800/50 rounded-lg" />
                                    )}
                                </div>

                                {/* Team color bar */}
                                <div
                                    className={`w-1 h-8 rounded-full transition-all duration-300 ${isRevealed ? '' : 'opacity-0'}`}
                                    style={{ backgroundColor: isRevealed ? teamColor : 'transparent' }}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Summary + Start Button */}
            {isAllRevealed && (
                <div className="relative z-10 mt-8 text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <p className="text-slate-400 text-sm font-bold ko-tight">
                        당신의 팀은 <span className="text-indigo-400 font-black">{userPickNumber}번째</span>로 선수를 지명합니다
                    </p>
                    <button
                        onClick={handleStart}
                        className="group flex items-center gap-3 mx-auto px-8 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-base uppercase tracking-wider transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/25"
                    >
                        드래프트 시작
                        <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            )}
        </div>
    );
};
