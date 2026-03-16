
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { TEAM_DATA } from '../data/teamData';
import { TeamLogo } from '../components/common/TeamLogo';
import { ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import { LotteryResult } from '../services/draft/lotteryEngine';

interface DraftLotteryViewProps {
    myTeamId: string;
    savedOrder: string[] | null;
    lotteryMetadata?: LotteryResult | null;
    onComplete: (order: string[]) => void;
}

// ── 타이밍 상수 ──

const LIST_REVEAL_INTERVAL = 300;   // 30~5픽: 빠른 리스트 공개 (ms)
const SLOT_SPIN_DURATION = 2000;    // 4~1픽: 슬롯머신 스핀 시간 (ms)
const SLOT_PAUSE_BEFORE = 800;      // 슬롯 시작 전 대기 (ms)

type Phase = 'waiting' | 'list' | 'slot' | 'done';

export const DraftLotteryView: React.FC<DraftLotteryViewProps> = ({
    myTeamId,
    savedOrder,
    lotteryMetadata,
    onComplete,
}) => {
    const [phase, setPhase] = useState<Phase>('waiting');
    const [revealedCount, setRevealedCount] = useState(0);
    // 슬롯머신: 현재 스핀 중인 픽 인덱스 (0-based in savedOrder)
    const [slotSpinning, setSlotSpinning] = useState(false);
    const [slotDisplayId, setSlotDisplayId] = useState<string | null>(null);
    const lastRevealedRef = useRef<HTMLDivElement>(null);
    const slotIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const totalTeams = savedOrder?.length || 0;

    // 로터리 메타데이터 맵
    const lotteryTeamMap = useMemo(() => {
        if (!lotteryMetadata) return null;
        const map = new Map<string, { odds: number; preLotteryRank: number; wins: number; losses: number }>();
        for (const entry of lotteryMetadata.lotteryTeams) {
            map.set(entry.teamId, { odds: entry.odds, preLotteryRank: entry.preLotteryRank, wins: entry.wins, losses: entry.losses });
        }
        return map;
    }, [lotteryMetadata]);

    // 순위 변동 맵
    const movementMap = useMemo(() => {
        if (!lotteryMetadata) return null;
        const map = new Map<string, { diff: number; jumped: boolean }>();
        for (const mv of lotteryMetadata.pickMovements) {
            map.set(mv.teamId, { diff: mv.preLotteryPosition - mv.finalPosition, jumped: mv.jumped });
        }
        return map;
    }, [lotteryMetadata]);

    const top4Set = useMemo(() => {
        if (!lotteryMetadata) return new Set<string>();
        return new Set(lotteryMetadata.top4Drawn);
    }, [lotteryMetadata]);

    // 역순 reveal: 30위→1위 순서로 공개
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

    // 리스트 구간: 30~5픽 = 총 26개 (revealOrder의 0~25)
    const listCount = totalTeams - 4; // 26개 (30위→5위)

    // ── Phase: list (30~5픽 빠른 공개) ──
    useEffect(() => {
        if (phase !== 'list' || !savedOrder) return;
        if (revealedCount >= listCount) {
            // 리스트 구간 완료 → 슬롯 구간으로 전환
            setPhase('slot');
            return;
        }

        const timer = setTimeout(() => {
            setRevealedCount(prev => prev + 1);
        }, LIST_REVEAL_INTERVAL);

        return () => clearTimeout(timer);
    }, [phase, savedOrder, revealedCount, listCount]);

    // ── Phase: slot (4~1픽 슬롯머신 공개) ──
    useEffect(() => {
        if (phase !== 'slot' || !savedOrder) return;
        if (revealedCount >= totalTeams) {
            setPhase('done');
            return;
        }
        if (slotSpinning) return; // 이미 스핀 중

        // 다음 슬롯 시작
        const currentRevealIdx = revealOrder[revealedCount]; // savedOrder에서의 인덱스
        const actualTeamId = savedOrder[currentRevealIdx];
        const pickNum = currentRevealIdx + 1;

        // 스핀 시작 전 대기
        const pauseTimer = setTimeout(() => {
            setSlotSpinning(true);

            // 로터리 팀 ID 목록에서 랜덤 셔플 (아직 공개 안 된 팀들)
            const unrevealedTeams = savedOrder.filter((_, i) => !revealedIndices.has(i));

            // 빠르게 팀 ID 순환 표시
            let spinCount = 0;
            const spinInterval = setInterval(() => {
                spinCount++;
                const randomTeam = unrevealedTeams[Math.floor(Math.random() * unrevealedTeams.length)];
                setSlotDisplayId(randomTeam);

                // 점점 느려지는 효과: 스핀 횟수에 따라 인터벌 변경
                if (spinCount > 15) {
                    clearInterval(spinInterval);
                    slotIntervalRef.current = null;

                    // 최종 결과 표시
                    setSlotDisplayId(actualTeamId);
                    setTimeout(() => {
                        setRevealedCount(prev => prev + 1);
                        setSlotSpinning(false);
                        setSlotDisplayId(null);
                    }, 600);
                }
            }, 80 + spinCount * 8);

            slotIntervalRef.current = spinInterval;
        }, SLOT_PAUSE_BEFORE);

        return () => {
            clearTimeout(pauseTimer);
            if (slotIntervalRef.current) {
                clearInterval(slotIntervalRef.current);
                slotIntervalRef.current = null;
            }
        };
    }, [phase, savedOrder, revealedCount, totalTeams, slotSpinning, revealOrder, revealedIndices]);

    // Auto-scroll
    useEffect(() => {
        if (lastRevealedRef.current) {
            lastRevealedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [revealedCount]);

    // cleanup
    useEffect(() => {
        return () => {
            if (slotIntervalRef.current) {
                clearInterval(slotIntervalRef.current);
            }
        };
    }, []);

    const handleStartLottery = useCallback(() => {
        setPhase('list');
    }, []);

    const handleComplete = useCallback(() => {
        if (savedOrder) onComplete(savedOrder);
    }, [savedOrder, onComplete]);

    const userPickNumber = savedOrder ? savedOrder.indexOf(myTeamId) + 1 : 0;
    const justRevealedIdx = revealedCount > 0 ? revealOrder[revealedCount - 1] : -1;

    // 현재 슬롯머신 대상 픽 번호
    const currentSlotPickNum = phase === 'slot' && revealedCount < totalTeams
        ? revealOrder[revealedCount] + 1
        : 0;

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
                <span className={`text-xs font-black shrink-0 w-5 text-center ${
                    isRevealed ? 'text-white' : 'text-slate-700'
                }`}>
                    {pickNum}
                </span>

                <TeamLogo
                    teamId={teamId}
                    size="custom"
                    className={`w-7 h-7 shrink-0 transition-all duration-300 ${isRevealed ? '' : 'opacity-0'}`}
                />

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

                {isRevealed && lotteryMetadata && (
                    <div className="flex items-center gap-1.5 shrink-0">
                        {lotteryEntry && isLotteryPick && (
                            <span className="text-[10px] font-bold text-white/40">
                                {(lotteryEntry.odds * 100).toFixed(1)}%
                            </span>
                        )}

                        {moveDiff !== 0 && isLotteryPick && (
                            <span className={`flex items-center gap-0.5 text-[10px] font-black ${
                                moveDiff > 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}>
                                {moveDiff > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                {Math.abs(moveDiff)}
                            </span>
                        )}

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
            {/* Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl" />
            </div>

            {/* Title */}
            <div className="relative z-10 text-center mb-6">
                <h1 className="text-3xl font-black text-white uppercase tracking-wider mb-2">
                    드래프트 로터리
                </h1>
                {phase === 'waiting' && (
                    <p className="text-slate-500 text-sm font-bold ko-tight">
                        추첨을 시작하여 드래프트 순서를 확인하세요
                    </p>
                )}
                {phase === 'list' && (
                    <p className="text-slate-500 text-sm font-bold ko-tight">
                        드래프트 순서 공개 중...
                    </p>
                )}
                {phase === 'slot' && currentSlotPickNum > 0 && (
                    <p className="text-amber-400 text-sm font-black ko-tight animate-pulse">
                        {currentSlotPickNum}픽 추첨 중...
                    </p>
                )}
                {phase === 'done' && userPickNumber > 0 && (
                    <p className="text-indigo-400 text-sm font-bold ko-tight">
                        내 팀 드래프트 순위: {userPickNumber}픽
                    </p>
                )}
            </div>

            {/* Start Button (waiting phase) */}
            {phase === 'waiting' && (
                <div className="relative z-10 mb-8 animate-in fade-in duration-500">
                    <button
                        onClick={handleStartLottery}
                        className="group flex items-center gap-3 mx-auto px-10 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-lg uppercase tracking-wider transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/25"
                    >
                        추첨 시작
                        <ChevronRight size={22} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            )}

            {/* Slot Machine Display (top-4) */}
            {phase === 'slot' && slotSpinning && slotDisplayId && (
                <div className="relative z-10 mb-6 animate-in fade-in duration-200">
                    <div className="bg-slate-900 border-2 border-amber-400/50 rounded-2xl px-8 py-5 flex items-center gap-4 shadow-lg shadow-amber-400/10">
                        <span className="text-2xl font-black text-amber-400">{currentSlotPickNum}픽</span>
                        <div className="w-px h-8 bg-slate-700" />
                        <TeamLogo teamId={slotDisplayId} size="custom" className="w-10 h-10" />
                        <span className="text-lg font-black text-white">
                            {TEAM_DATA[slotDisplayId] ? `${TEAM_DATA[slotDisplayId].city} ${TEAM_DATA[slotDisplayId].name}` : slotDisplayId}
                        </span>
                    </div>
                </div>
            )}

            {/* 2-Column Grid */}
            {phase !== 'waiting' && (
                <div className="relative z-10 w-full max-w-2xl px-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            {leftColumn.map((teamId, i) => renderCard(teamId, i))}
                        </div>
                        <div className="space-y-1.5">
                            {rightColumn.map((teamId, i) => renderCard(teamId, i + 15))}
                        </div>
                    </div>
                </div>
            )}

            {/* Complete Button */}
            {phase === 'done' && (
                <div className="relative z-10 mt-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <button
                        onClick={handleComplete}
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
