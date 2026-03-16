
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { TEAM_DATA } from '../data/teamData';
import { TeamLogo } from '../components/common/TeamLogo';
import { ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { LotteryResult } from '../services/draft/lotteryEngine';

interface DraftLotteryViewProps {
    myTeamId: string;
    savedOrder: string[] | null;
    lotteryMetadata?: LotteryResult | null;
    onComplete: (order: string[]) => void;
}

const REVEAL_INTERVAL = 400; // ms between each reveal

export const DraftLotteryView: React.FC<DraftLotteryViewProps> = ({
    myTeamId,
    savedOrder,
    lotteryMetadata,
    onComplete,
}) => {
    const [revealedCount, setRevealedCount] = useState(0);
    const [isAllRevealed, setIsAllRevealed] = useState(false);
    const lastRevealedRef = useRef<HTMLDivElement>(null);

    const totalTeams = savedOrder?.length || 0;

    // 로터리 메타데이터 맵 (teamId → entry)
    const lotteryTeamMap = useMemo(() => {
        if (!lotteryMetadata) return null;
        const map = new Map<string, { odds: number; preLotteryRank: number; wins: number; losses: number }>();
        for (const entry of lotteryMetadata.lotteryTeams) {
            map.set(entry.teamId, { odds: entry.odds, preLotteryRank: entry.preLotteryRank, wins: entry.wins, losses: entry.losses });
        }
        return map;
    }, [lotteryMetadata]);

    // 순위 변동 맵 (teamId → movement)
    const movementMap = useMemo(() => {
        if (!lotteryMetadata) return null;
        const map = new Map<string, { diff: number; jumped: boolean }>();
        for (const mv of lotteryMetadata.pickMovements) {
            map.set(mv.teamId, {
                diff: mv.preLotteryPosition - mv.finalPosition,
                jumped: mv.jumped,
            });
        }
        return map;
    }, [lotteryMetadata]);

    // top4 추첨 당첨 팀 Set
    const top4Set = useMemo(() => {
        if (!lotteryMetadata) return new Set<string>();
        return new Set(lotteryMetadata.top4Drawn);
    }, [lotteryMetadata]);

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
        const isLotteryPick = pickNum <= 14;
        const isTop4Winner = top4Set.has(teamId);

        // 로터리 메타데이터
        const lotteryEntry = lotteryTeamMap?.get(teamId);
        const movement = movementMap?.get(teamId);
        const moveDiff = movement?.diff ?? 0;

        return (
            <div
                key={teamId}
                ref={isJustRevealed ? lastRevealedRef : undefined}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-500 ${
                    isRevealed && isMyTeam ? 'ring-2 ring-indigo-500' : ''
                } ${isRevealed && isTop4Winner && isLotteryPick ? 'ring-1 ring-amber-400/60' : ''}`}
                style={{
                    backgroundColor: isRevealed ? teamColor : 'rgba(30,41,59,0.3)',
                    opacity: isRevealed ? 1 : 0.12,
                    transform: isRevealed ? 'scale(1)' : 'scale(0.95)',
                    transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
            >
                {/* Pick Number */}
                <span className={`text-xs font-black shrink-0 w-5 text-center ${
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

                {/* Team Name + Record */}
                <div className="flex-1 min-w-0">
                    {isRevealed ? (
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white truncate">
                                {teamInfo ? `${teamInfo.city} ${teamInfo.name}` : teamId.toUpperCase()}
                            </span>
                            {lotteryEntry && isLotteryPick && (
                                <span className="text-[10px] text-white/50 shrink-0">
                                    {lotteryEntry.wins}-{lotteryEntry.losses}
                                </span>
                            )}
                        </div>
                    ) : (
                        <div className="h-3 w-20 bg-slate-800/40 rounded" />
                    )}
                </div>

                {/* Lottery Info (확률 + 순위 변동) */}
                {isRevealed && lotteryMetadata && (
                    <div className="flex items-center gap-1.5 shrink-0">
                        {/* 확률 (로터리 팀만) */}
                        {lotteryEntry && isLotteryPick && (
                            <span className="text-[10px] font-bold text-white/40">
                                {(lotteryEntry.odds * 100).toFixed(1)}%
                            </span>
                        )}

                        {/* 순위 변동 */}
                        {moveDiff !== 0 && isLotteryPick && (
                            <span className={`flex items-center gap-0.5 text-[10px] font-black ${
                                moveDiff > 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}>
                                {moveDiff > 0 ? (
                                    <TrendingUp size={10} />
                                ) : (
                                    <TrendingDown size={10} />
                                )}
                                {Math.abs(moveDiff)}
                            </span>
                        )}

                        {/* LOTTERY WINNER 뱃지 */}
                        {isTop4Winner && isLotteryPick && movement?.jumped && (
                            <span className="text-[9px] font-black text-amber-400 bg-amber-400/10 px-1 py-0.5 rounded">
                                WINNER
                            </span>
                        )}
                    </div>
                )}
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
                <h1 className="text-3xl font-black text-white uppercase tracking-wider mb-2">
                    드래프트 로터리 결과
                </h1>
                {!isAllRevealed && (
                    <p className="text-slate-500 text-sm font-bold ko-tight">
                        드래프트 순서가 공개됩니다
                    </p>
                )}
                {isAllRevealed && userPickNumber > 0 && (
                    <p className="text-indigo-400 text-sm font-bold ko-tight">
                        내 팀 드래프트 순위: {userPickNumber}픽
                    </p>
                )}
            </div>

            {/* 2-Column Grid */}
            <div className="relative z-10 w-full max-w-2xl px-4">
                <div className="grid grid-cols-2 gap-3">
                    {/* Left Column: 1~15 (로터리 + 1) */}
                    <div className="space-y-1.5">
                        {leftColumn.map((teamId, i) => renderCard(teamId, i))}
                    </div>
                    {/* Right Column: 16~30 (플레이오프 팀) */}
                    <div className="space-y-1.5">
                        {/* 구분선 */}
                        {lotteryMetadata && (
                            <div className="flex items-center gap-2 px-2 py-1">
                                <div className="flex-1 h-px bg-slate-700/50" />
                                <span className="text-[10px] font-bold text-slate-600 uppercase">Playoff Teams</span>
                                <div className="flex-1 h-px bg-slate-700/50" />
                            </div>
                        )}
                        {rightColumn.map((teamId, i) => renderCard(teamId, i + 15))}
                    </div>
                </div>
            </div>

            {/* Start Button */}
            {isAllRevealed && (
                <div className="relative z-10 mt-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <button
                        onClick={handleStart}
                        className="group flex items-center gap-3 mx-auto px-8 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-base uppercase tracking-wider transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/25"
                    >
                        확인
                        <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            )}
        </div>
    );
};
