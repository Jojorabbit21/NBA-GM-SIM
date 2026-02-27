
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { TEAM_DATA } from '../data/teamData';
import { TeamLogo } from '../components/common/TeamLogo';
import { ChevronRight } from 'lucide-react';

interface DraftLotteryViewProps {
    myTeamId: string;
    savedOrder: string[] | null;
    onComplete: (order: string[]) => void;
}

const REVEAL_INTERVAL = 400; // ms between each reveal

export const DraftLotteryView: React.FC<DraftLotteryViewProps> = ({
    myTeamId,
    savedOrder,
    onComplete,
}) => {
    const [revealedCount, setRevealedCount] = useState(0);
    const [isAllRevealed, setIsAllRevealed] = useState(false);
    const lastRevealedRef = useRef<HTMLDivElement>(null);

    const totalTeams = savedOrder?.length || 0;

    // 역순 reveal: 30위→1위 순서로 공개할 인덱스 배열
    const revealOrder = useMemo(() => {
        if (!savedOrder) return [];
        return Array.from({ length: savedOrder.length }, (_, i) => savedOrder.length - 1 - i);
    }, [savedOrder]);

    // 현재까지 공개된 인덱스 Set
    const revealedIndices = useMemo(() => {
        const set = new Set<number>();
        for (let i = 0; i < revealedCount; i++) {
            set.add(revealOrder[i]);
        }
        return set;
    }, [revealedCount, revealOrder]);

    // Sequential reveal animation (30위→1위)
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
    const justRevealedIdx = revealedCount > 0 ? revealOrder[revealedCount - 1] : -1;

    if (!savedOrder) return null;

    // 2컬럼 분할: 좌측 1~15, 우측 16~30
    const leftColumn = savedOrder.slice(0, 15);
    const rightColumn = savedOrder.slice(15);

    const renderCard = (teamId: string, idx: number) => {
        const pickNum = idx + 1;
        const isRevealed = revealedIndices.has(idx);
        const isJustRevealed = idx === justRevealedIdx;
        const isMyTeam = teamId === myTeamId;
        const teamInfo = TEAM_DATA[teamId];
        const teamColor = teamInfo?.colors.primary || '#6366f1';

        return (
            <div
                key={teamId}
                ref={isJustRevealed ? lastRevealedRef : undefined}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-500 ${
                    isRevealed && isMyTeam ? 'ring-2 ring-indigo-500' : ''
                }`}
                style={{
                    backgroundColor: isRevealed ? teamColor : 'rgba(30,41,59,0.3)',
                    opacity: isRevealed ? 1 : 0.12,
                    transform: isRevealed ? 'scale(1)' : 'scale(0.95)',
                    transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
            >
                {/* Pick Number */}
                <span className={`text-xs font-black oswald shrink-0 w-5 text-center ${
                    isRevealed ? 'text-white' : 'text-slate-700'
                }`}>
                    {pickNum}
                </span>

                {/* Team Logo */}
                <TeamLogo
                    teamId={teamId}
                    size="custom"
                    className={`w-7 h-7 shrink-0 transition-all duration-300 ${isRevealed ? '' : 'opacity-0'}`}
                />

                {/* Team Name */}
                <div className="flex-1 min-w-0">
                    {isRevealed ? (
                        <span className="text-xs font-bold text-white truncate block">
                            {teamInfo ? `${teamInfo.city} ${teamInfo.name}` : teamId.toUpperCase()}
                        </span>
                    ) : (
                        <div className="h-3 w-20 bg-slate-800/40 rounded" />
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col items-center justify-center">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl" />
            </div>

            {/* Title */}
            <div className="relative z-10 text-center mb-6">
                <h1 className="text-3xl font-black text-white uppercase oswald tracking-wider mb-2">
                    드래프트 로터리
                </h1>
                <p className="text-slate-500 text-sm font-bold ko-tight">
                    {!isAllRevealed ? '드래프트 순서가 공개됩니다' : '로터리가 완료되었습니다'}
                </p>
            </div>

            {/* 2-Column Grid */}
            <div className="relative z-10 w-full max-w-2xl px-4">
                <div className="grid grid-cols-2 gap-3">
                    {/* Left Column: 1~15 */}
                    <div className="space-y-1.5">
                        {leftColumn.map((teamId, i) => renderCard(teamId, i))}
                    </div>
                    {/* Right Column: 16~30 */}
                    <div className="space-y-1.5">
                        {rightColumn.map((teamId, i) => renderCard(teamId, i + 15))}
                    </div>
                </div>
            </div>

            {/* Summary + Start Button */}
            {isAllRevealed && (
                <div className="relative z-10 mt-6 text-center space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
