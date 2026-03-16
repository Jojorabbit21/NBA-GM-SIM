
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
const LIST_REVEAL_INTERVAL = 250;
const SLOT_PAUSE_BEFORE = 1000;
const SLOT_INITIAL_SPEED = 60;
const SLOT_STEP_COUNT = 22;
const SLOT_SPEED_INCREMENT = 18;
const SLOT_FINAL_PAUSE = 1000;

type Phase = 'waiting' | 'list' | 'slot' | 'done';

export const DraftLotteryView: React.FC<DraftLotteryViewProps> = ({
    myTeamId,
    savedOrder,
    lotteryMetadata,
    onComplete,
}) => {
    const [phase, setPhase] = useState<Phase>('waiting');
    const [revealedCount, setRevealedCount] = useState(0);
    // 슬롯머신: 현재 표시 중인 팀 ID (top-4 각 슬롯)
    const [slotDisplayIds, setSlotDisplayIds] = useState<(string | null)[]>([null, null, null, null]);
    // 슬롯머신: 현재 스핀 중인 top-4 인덱스 (0=4픽, 1=3픽, 2=2픽, 3=1픽)
    const [currentSlotIdx, setCurrentSlotIdx] = useState(-1);
    const [slotSpinning, setSlotSpinning] = useState(false);
    // top-4 중 reveal 완료된 개수
    const [top4RevealedCount, setTop4RevealedCount] = useState(0);

    const slotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isMountedRef = useRef(true);

    const totalTeams = savedOrder?.length || 0;

    // ── 메타데이터 맵 ──
    const lotteryTeamMap = useMemo(() => {
        if (!lotteryMetadata) return null;
        const map = new Map<string, { odds: number; preLotteryRank: number; wins: number; losses: number }>();
        for (const entry of lotteryMetadata.lotteryTeams) {
            map.set(entry.teamId, { odds: entry.odds, preLotteryRank: entry.preLotteryRank, wins: entry.wins, losses: entry.losses });
        }
        return map;
    }, [lotteryMetadata]);

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

    // ── 리스트 구간 (5~30픽) 역순 공개 순서 ──
    // savedOrder[4..29] → 29, 28, ..., 4 순으로 reveal
    const listRevealOrder = useMemo(() => {
        if (!savedOrder) return [];
        const indices: number[] = [];
        for (let i = savedOrder.length - 1; i >= 4; i--) {
            indices.push(i);
        }
        return indices;
    }, [savedOrder]);

    const listCount = listRevealOrder.length; // 26개

    // 현재까지 공개된 인덱스 Set (5~30픽)
    const revealedIndices = useMemo(() => {
        const set = new Set<number>();
        for (let i = 0; i < revealedCount; i++) {
            if (i < listRevealOrder.length) set.add(listRevealOrder[i]);
        }
        // top-4 공개분
        for (let i = 0; i < top4RevealedCount; i++) {
            set.add(3 - i); // 4픽(idx 3), 3픽(idx 2), 2픽(idx 1), 1픽(idx 0)
        }
        return set;
    }, [revealedCount, listRevealOrder, top4RevealedCount]);

    // ── Phase: list (30~5픽 빠른 공개) ──
    useEffect(() => {
        if (phase !== 'list' || !savedOrder) return;
        if (revealedCount >= listCount) {
            setPhase('slot');
            return;
        }
        const timer = setTimeout(() => {
            setRevealedCount(prev => prev + 1);
        }, LIST_REVEAL_INTERVAL);
        return () => clearTimeout(timer);
    }, [phase, savedOrder, revealedCount, listCount]);

    // ── Phase: slot (4~1픽 슬롯머신 공개) ──
    // 슬롯 애니메이션을 명령형 setTimeout 체인으로 처리하여 cleanup 버그 방지
    useEffect(() => {
        if (phase !== 'slot' || !savedOrder) return;
        if (top4RevealedCount >= 4) {
            setPhase('done');
            return;
        }
        if (slotSpinning) return;

        // 다음 슬롯 시작 (4픽 → 3픽 → 2픽 → 1픽)
        const slotIdx = top4RevealedCount; // 0=4픽, 1=3픽, 2=2픽, 3=1픽
        const pickIdx = 3 - slotIdx; // savedOrder 인덱스
        const actualTeamId = savedOrder[pickIdx];

        // 아직 공개 안 된 팀들 (현 시점 기준)
        const currentRevealed = new Set<number>();
        for (let i = 0; i < revealedCount && i < listRevealOrder.length; i++) {
            currentRevealed.add(listRevealOrder[i]);
        }
        for (let i = 0; i < top4RevealedCount; i++) {
            currentRevealed.add(3 - i);
        }
        const unrevealedTeams = savedOrder.filter((_, i) => !currentRevealed.has(i));

        setSlotSpinning(true);
        setCurrentSlotIdx(slotIdx);

        // 재귀 setTimeout 체인으로 점점 느려지는 애니메이션
        const runSpin = (step: number) => {
            if (!isMountedRef.current) return;

            if (step >= SLOT_STEP_COUNT) {
                // 최종 결과 표시
                setSlotDisplayIds(prev => {
                    const next = [...prev];
                    next[slotIdx] = actualTeamId;
                    return next;
                });
                // 잠시 후 확정
                slotTimerRef.current = setTimeout(() => {
                    if (!isMountedRef.current) return;
                    setTop4RevealedCount(prev => prev + 1);
                    setSlotSpinning(false);
                    setCurrentSlotIdx(-1);
                }, SLOT_FINAL_PAUSE);
                return;
            }

            // 랜덤 팀 표시
            const randomTeam = unrevealedTeams[Math.floor(Math.random() * unrevealedTeams.length)];
            setSlotDisplayIds(prev => {
                const next = [...prev];
                next[slotIdx] = randomTeam;
                return next;
            });

            const delay = SLOT_INITIAL_SPEED + step * SLOT_SPEED_INCREMENT;
            slotTimerRef.current = setTimeout(() => runSpin(step + 1), delay);
        };

        // 시작 전 대기
        slotTimerRef.current = setTimeout(() => {
            if (!isMountedRef.current) return;
            runSpin(0);
        }, SLOT_PAUSE_BEFORE);

        // cleanup 없음 — unmount 시 isMountedRef로 방어
    }, [phase, savedOrder, top4RevealedCount, slotSpinning]);

    // unmount cleanup
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (slotTimerRef.current) clearTimeout(slotTimerRef.current);
        };
    }, []);

    const handleStartLottery = useCallback(() => {
        setPhase('list');
    }, []);

    const handleComplete = useCallback(() => {
        if (savedOrder) onComplete(savedOrder);
    }, [savedOrder, onComplete]);

    const userPickNumber = savedOrder ? savedOrder.indexOf(myTeamId) + 1 : 0;

    // 현재 슬롯머신 대상 픽 번호
    const currentSlotPickNum = currentSlotIdx >= 0 ? 4 - currentSlotIdx : 0;

    if (!savedOrder) return null;

    // ── 레이아웃 분할 ──
    // top4: savedOrder[0..3] = 1~4픽
    // leftColumn: savedOrder[4..16] = 5~17픽 (13개)
    // rightColumn: savedOrder[17..29] = 18~30픽 (13개)
    const top4Teams = savedOrder.slice(0, 4);
    const leftColumn = savedOrder.slice(4, 17);
    const rightColumn = savedOrder.slice(17, 30);

    // ── 카드 렌더러 (5~30픽) ──
    const renderListCard = (teamId: string, idx: number) => {
        const pickNum = idx + 1;
        const isRevealed = revealedIndices.has(idx);
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
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-500 ${
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
                    className={`w-6 h-6 shrink-0 transition-all duration-300 ${isRevealed ? '' : 'opacity-0'}`}
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
                                LOTTERY
                            </span>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // ── Top-4 슬롯 카드 렌더러 ──
    const renderTop4Slot = (slotIdx: number) => {
        const pickIdx = 3 - slotIdx; // 0=4픽 → idx 3, 1=3픽 → idx 2, ...
        const pickNum = pickIdx + 1;
        const isRevealed = revealedIndices.has(pickIdx);
        const displayTeamId = slotDisplayIds[slotIdx];
        const actualTeamId = savedOrder[pickIdx];
        const isSpinning = currentSlotIdx === slotIdx && slotSpinning;
        const isMyTeam = actualTeamId === myTeamId;
        const teamInfo = isRevealed ? TEAM_DATA[actualTeamId] : (displayTeamId ? TEAM_DATA[displayTeamId] : null);
        const teamColor = isRevealed ? (TEAM_DATA[actualTeamId]?.colors.primary || '#6366f1') : 'transparent';
        const isTop4Winner = top4Set.has(actualTeamId);
        const lotteryEntry = lotteryTeamMap?.get(actualTeamId);
        const movement = movementMap?.get(actualTeamId);
        const moveDiff = movement?.diff ?? 0;

        // 아직 활성화 안 된 슬롯
        const isActive = phase === 'slot' || phase === 'done';
        const showPlaceholder = !isActive || (!isRevealed && !isSpinning);

        return (
            <div
                key={pickNum}
                className={`relative flex-1 rounded-2xl overflow-hidden transition-all duration-500 ${
                    isRevealed && isMyTeam ? 'ring-2 ring-indigo-500' : ''
                } ${isSpinning ? 'ring-2 ring-amber-400/60 animate-pulse' : ''} ${
                    isRevealed && isTop4Winner ? 'ring-1 ring-amber-400/60' : ''
                }`}
                style={{
                    backgroundColor: isRevealed ? teamColor : 'rgba(30,41,59,0.4)',
                    minHeight: 88,
                }}
            >
                {/* 픽 번호 뱃지 */}
                <div className={`absolute top-2 left-2 w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black ${
                    isRevealed ? 'bg-black/30 text-white' : 'bg-slate-800/60 text-slate-600'
                }`}>
                    {pickNum}
                </div>

                {showPlaceholder ? (
                    // 빈 슬롯
                    <div className="flex items-center justify-center h-full py-6">
                        <span className="text-slate-700 text-sm font-black">?</span>
                    </div>
                ) : isSpinning && displayTeamId ? (
                    // 스핀 중
                    <div className="flex flex-col items-center justify-center py-3 gap-1">
                        <TeamLogo teamId={displayTeamId} size="custom" className="w-10 h-10" />
                        <span className="text-xs font-bold text-white/80 truncate max-w-[140px] text-center">
                            {TEAM_DATA[displayTeamId] ? `${TEAM_DATA[displayTeamId].city} ${TEAM_DATA[displayTeamId].name}` : displayTeamId}
                        </span>
                    </div>
                ) : isRevealed ? (
                    // 확정
                    <div className="flex flex-col items-center justify-center py-3 gap-1">
                        <TeamLogo teamId={actualTeamId} size="custom" className="w-10 h-10" />
                        <span className="text-xs font-bold text-white truncate max-w-[140px] text-center">
                            {TEAM_DATA[actualTeamId] ? `${TEAM_DATA[actualTeamId].city} ${TEAM_DATA[actualTeamId].name}` : actualTeamId}
                        </span>
                        <div className="flex items-center gap-1">
                            {lotteryEntry && (
                                <span className="text-[10px] text-white/50">
                                    {lotteryEntry.wins}-{lotteryEntry.losses}
                                </span>
                            )}
                            {lotteryEntry && (
                                <span className="text-[10px] font-bold text-white/40">
                                    {(lotteryEntry.odds * 100).toFixed(1)}%
                                </span>
                            )}
                            {moveDiff !== 0 && (
                                <span className={`flex items-center gap-0.5 text-[10px] font-black ${
                                    moveDiff > 0 ? 'text-emerald-400' : 'text-red-400'
                                }`}>
                                    {moveDiff > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                    {Math.abs(moveDiff)}
                                </span>
                            )}
                        </div>
                        {isTop4Winner && movement?.jumped && (
                            <span className="text-[9px] font-black text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                                LOTTERY
                            </span>
                        )}
                    </div>
                ) : null}
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
            <div className="relative z-10 text-center mb-4">
                <h1 className="text-3xl font-black text-white uppercase tracking-wider mb-1">
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

            {/* Start Button */}
            {phase === 'waiting' && (
                <div className="relative z-10 mb-6">
                    <button
                        onClick={handleStartLottery}
                        className="group flex items-center gap-3 mx-auto px-10 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-lg uppercase tracking-wider transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/25"
                    >
                        추첨 시작
                        <ChevronRight size={22} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            )}

            {/* Content Area */}
            {phase !== 'waiting' && (
                <div className="relative z-10 w-full max-w-3xl px-4 flex flex-col gap-3">
                    {/* Top-4 슬롯 (수평 배치) */}
                    <div className="grid grid-cols-4 gap-2">
                        {[0, 1, 2, 3].map(slotIdx => renderTop4Slot(slotIdx))}
                    </div>

                    {/* 5~30픽 리스트 (2컬럼, 각 13개) */}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            {leftColumn.map((teamId, i) => renderListCard(teamId, i + 4))}
                        </div>
                        <div className="space-y-1">
                            {rightColumn.map((teamId, i) => renderListCard(teamId, i + 17))}
                        </div>
                    </div>
                </div>
            )}

            {/* Complete Button */}
            {phase === 'done' && (
                <div className="relative z-10 mt-4 text-center">
                    <button
                        onClick={handleComplete}
                        className="group flex items-center gap-3 mx-auto px-8 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-base uppercase tracking-wider transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/25"
                    >
                        확인
                        <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            )}
        </div>
    );
};
