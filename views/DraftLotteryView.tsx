
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { TEAM_DATA } from '../data/teamData';
import { TeamLogo } from '../components/common/TeamLogo';
import { ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import { LotteryResult } from '../services/draft/lotteryEngine';
import type { ResolvedDraftOrder } from '../types/draftAssets';

interface DraftLotteryViewProps {
    myTeamId: string;
    savedOrder: string[] | null;
    lotteryMetadata?: LotteryResult | null;
    resolvedDraftOrder?: ResolvedDraftOrder | null;
    seasonShort?: string;
    onComplete: (order: string[]) => void;
}

// ── 타이밍 상수 ──
const LIST_REVEAL_INTERVAL = 250;
const SLOT_PAUSE_BEFORE = 1000;
const SLOT_FINAL_PAUSE = 1200;

// ── 릴 상수 ──
const REEL_ITEM_HEIGHT = 96;       // 릴 아이템 1개 높이 (px)
const REEL_LENGTH = 30;            // 릴에 포함될 팀 수 (마지막이 정답)
const SPIN_DURATION = 3500;        // CSS transition 시간 (ms)
const SPIN_EASING = 'cubic-bezier(0.15, 0.6, 0.25, 1)'; // 빠른 시작 → 자연스러운 감속

type Phase = 'waiting' | 'list' | 'slot' | 'done';
type SlotPhase = 'idle' | 'ready' | 'spinning' | 'revealed';

export const DraftLotteryView: React.FC<DraftLotteryViewProps> = ({
    myTeamId,
    savedOrder,
    lotteryMetadata,
    resolvedDraftOrder,
    seasonShort = '2025-26',
    onComplete,
}) => {
    const [phase, setPhase] = useState<Phase>('waiting');
    const [revealedCount, setRevealedCount] = useState(0);
    const [bgLoaded, setBgLoaded] = useState(false);

    // 슬롯 릴 데이터
    const [slotReels, setSlotReels] = useState<string[][]>([[], [], [], []]);
    const [slotPhases, setSlotPhases] = useState<SlotPhase[]>(['idle', 'idle', 'idle', 'idle']);
    // top-4 중 reveal 완료된 개수
    const [top4RevealedCount, setTop4RevealedCount] = useState(0);
    const [activeSlotIdx, setActiveSlotIdx] = useState(-1);

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
    const listRevealOrder = useMemo(() => {
        if (!savedOrder) return [];
        const indices: number[] = [];
        for (let i = savedOrder.length - 1; i >= 4; i--) {
            indices.push(i);
        }
        return indices;
    }, [savedOrder]);

    const listCount = listRevealOrder.length;

    // 현재까지 공개된 인덱스 Set
    const revealedIndices = useMemo(() => {
        const set = new Set<number>();
        for (let i = 0; i < revealedCount; i++) {
            if (i < listRevealOrder.length) set.add(listRevealOrder[i]);
        }
        for (let i = 0; i < top4RevealedCount; i++) {
            set.add(3 - i);
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

    // ── Phase: slot (4~1픽 릴 슬롯머신) ──
    useEffect(() => {
        if (phase !== 'slot' || !savedOrder) return;
        if (top4RevealedCount >= 4) {
            setPhase('done');
            return;
        }
        // 이미 스핀 중이면 무시
        if (slotPhases[top4RevealedCount] !== 'idle') return;

        const slotIdx = top4RevealedCount; // 0=4픽, 1=3픽, 2=2픽, 3=1픽
        const pickIdx = 3 - slotIdx;
        const actualTeamId = savedOrder[pickIdx];

        // ── 1픽: 남은 팀이 하나뿐이므로 릴 없이 강조 reveal ──
        if (slotIdx === 3) {
            setActiveSlotIdx(slotIdx);
            setSlotPhases(prev => {
                const next = [...prev];
                next[slotIdx] = 'ready';
                return next;
            });

            slotTimerRef.current = setTimeout(() => {
                if (!isMountedRef.current) return;
                setSlotPhases(prev => {
                    const next = [...prev];
                    next[slotIdx] = 'revealed';
                    return next;
                });

                slotTimerRef.current = setTimeout(() => {
                    if (!isMountedRef.current) return;
                    setTop4RevealedCount(prev => prev + 1);
                    setActiveSlotIdx(-1);
                }, SLOT_FINAL_PAUSE + 500);
            }, SLOT_PAUSE_BEFORE + 500);
            return;
        }

        // ── 4~2픽: 릴 슬롯머신 ──

        // 미공개 팀 목록 계산
        const currentRevealed = new Set<number>();
        for (let i = 0; i < revealedCount && i < listRevealOrder.length; i++) {
            currentRevealed.add(listRevealOrder[i]);
        }
        for (let i = 0; i < top4RevealedCount; i++) {
            currentRevealed.add(3 - i);
        }
        const unrevealedTeams = savedOrder.filter((_, i) => !currentRevealed.has(i));

        // 릴 생성: 랜덤 팀 (REEL_LENGTH - 1)개 + 정답 1개
        const reel: string[] = [];
        for (let i = 0; i < REEL_LENGTH - 1; i++) {
            reel.push(unrevealedTeams[Math.floor(Math.random() * unrevealedTeams.length)]);
        }
        reel.push(actualTeamId);

        // 릴 데이터 세팅
        setSlotReels(prev => {
            const next = [...prev];
            next[slotIdx] = reel;
            return next;
        });
        setSlotPhases(prev => {
            const next = [...prev];
            next[slotIdx] = 'ready';
            return next;
        });
        setActiveSlotIdx(slotIdx);

        // ready → spinning (1프레임 후, CSS transition 발동을 위해)
        slotTimerRef.current = setTimeout(() => {
            if (!isMountedRef.current) return;
            setSlotPhases(prev => {
                const next = [...prev];
                next[slotIdx] = 'spinning';
                return next;
            });

            // spinning 완료 → revealed
            slotTimerRef.current = setTimeout(() => {
                if (!isMountedRef.current) return;
                setSlotPhases(prev => {
                    const next = [...prev];
                    next[slotIdx] = 'revealed';
                    return next;
                });

                // 잠시 후 다음 슬롯
                slotTimerRef.current = setTimeout(() => {
                    if (!isMountedRef.current) return;
                    setTop4RevealedCount(prev => prev + 1);
                    setActiveSlotIdx(-1);
                }, SLOT_FINAL_PAUSE);
            }, SPIN_DURATION + 100);
        }, SLOT_PAUSE_BEFORE);

    }, [phase, savedOrder, top4RevealedCount, slotPhases]);

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
    const currentSlotPickNum = activeSlotIdx >= 0 ? 4 - activeSlotIdx : 0;

    if (!savedOrder) return null;

    // ── 레이아웃 분할 ──
    const leftColumn = savedOrder.slice(4, 17);   // 5~17픽 (13개)
    const rightColumn = savedOrder.slice(17, 30);  // 18~30픽 (13개)

    // ── 5~30픽 카드 렌더러 ──
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

        // resolvedDraftOrder에서 해당 픽의 소유권/노트 가져오기
        const resolvedPick = resolvedDraftOrder?.picks.find(p => p.pickNumber === pickNum);
        const hasOwnershipChange = resolvedPick && resolvedPick.currentTeamId !== resolvedPick.originalTeamId;
        const ownerTeamInfo = hasOwnershipChange ? TEAM_DATA[resolvedPick!.currentTeamId] : null;

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
                        <div>
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
                            {hasOwnershipChange && (
                                <div className="flex items-center gap-1 mt-0.5">
                                    <span className="text-[9px] text-amber-300 font-bold">
                                        → {ownerTeamInfo ? ownerTeamInfo.name : resolvedPick!.currentTeamId.toUpperCase()}
                                    </span>
                                    {resolvedPick?.note && (
                                        <span className="text-[9px] text-white/40">{resolvedPick.note}</span>
                                    )}
                                </div>
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
                    </div>
                )}
            </div>
        );
    };

    // ── 릴 아이템 렌더러 ──
    const renderReelItem = (teamId: string, i: number) => {
        const teamInfo = TEAM_DATA[teamId];
        return (
            <div
                key={i}
                className="flex flex-col items-center justify-center gap-1 shrink-0"
                style={{ height: REEL_ITEM_HEIGHT }}
            >
                <TeamLogo teamId={teamId} size="custom" className="w-14 h-14" />
                <span className="text-[11px] font-bold text-white/80 truncate max-w-[130px] text-center leading-tight">
                    {teamInfo ? `${teamInfo.city} ${teamInfo.name}` : teamId}
                </span>
            </div>
        );
    };

    // ── Top-4 슬롯 렌더러 ──
    const renderTop4Slot = (slotIdx: number) => {
        const pickIdx = 3 - slotIdx;
        const pickNum = pickIdx + 1;
        const isRevealed = revealedIndices.has(pickIdx);
        const actualTeamId = savedOrder[pickIdx];
        const isMyTeam = actualTeamId === myTeamId;
        const teamColor = TEAM_DATA[actualTeamId]?.colors.primary || '#6366f1';
        const isTop4Winner = top4Set.has(actualTeamId);
        const lotteryEntry = lotteryTeamMap?.get(actualTeamId);
        const movement = movementMap?.get(actualTeamId);
        const moveDiff = movement?.diff ?? 0;

        const sp = slotPhases[slotIdx];
        const reel = slotReels[slotIdx];
        const isSpinning = sp === 'ready' || sp === 'spinning';
        const showReel = isSpinning && reel.length > 0;
        const showResult = sp === 'revealed' || isRevealed;
        const isFirstPick = pickNum === 1;
        // 1픽 ready 단계: 금색 배경 → revealed 단계: 팀 색상으로 트랜지션
        const isFirstPickReady = isFirstPick && sp === 'ready';
        const isFirstPickRevealed = isFirstPick && showResult;

        // 릴 translateY 계산
        const reelOffset = sp === 'spinning'
            ? -(reel.length - 1) * REEL_ITEM_HEIGHT
            : 0;

        // 1픽 배경색 결정: ready → 금색, revealed → 팀색상
        const slotBgColor = isFirstPickReady
            ? '#d4a017'
            : showResult ? teamColor : 'rgba(30,41,59,0.4)';

        // 보더/글로우 inline style 계산 (Tailwind ring 충돌 방지)
        const borderStyle: React.CSSProperties = (() => {
            if (showResult && isMyTeam) {
                return { outline: '2px solid #6366f1', outlineOffset: '-1px' };
            }
            if (isFirstPickReady || isFirstPickRevealed) {
                return {
                    outline: '2px solid #f59e0b',
                    outlineOffset: '-1px',
                    boxShadow: isFirstPickReady
                        ? '0 0 40px rgba(245,158,11,0.7), 0 0 80px rgba(245,158,11,0.4)'
                        : '0 0 30px rgba(245,158,11,0.6), 0 0 60px rgba(245,158,11,0.35)',
                };
            }
            if (isSpinning && !isFirstPick) {
                return { outline: '2px solid rgba(251,191,36,0.6)', outlineOffset: '-1px' };
            }
            if (showResult && isTop4Winner) {
                return {
                    outline: '2px solid rgba(251,191,36,0.6)',
                    outlineOffset: '-1px',
                    boxShadow: '0 0 20px rgba(251,191,36,0.3)',
                };
            }
            return {};
        })();

        return (
            <div
                key={pickNum}
                className="relative rounded-2xl overflow-hidden transition-all duration-700"
                style={{
                    backgroundColor: slotBgColor,
                    height: REEL_ITEM_HEIGHT + 40,
                    transition: `background-color 0.8s ease, box-shadow 0.8s ease`,
                    ...borderStyle,
                }}
            >
                {/* 픽 번호 뱃지 */}
                <div className={`absolute top-2 left-2 z-20 w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black transition-all duration-500 ${
                    showResult ? 'bg-black/30 text-white' : isFirstPickReady ? 'bg-black/20 text-white' : 'bg-slate-800/60 text-slate-600'
                }`}>
                    {pickNum}
                </div>

                {/* 릴 윈도우 */}
                <div
                    className="absolute inset-0 overflow-hidden"
                    style={{ top: 16, bottom: 16 }}
                >
                    {showReel && !isFirstPick ? (
                        /* 릴 스트립 — CSS transition으로 스크롤 */
                        <div
                            style={{
                                transform: `translateY(${reelOffset}px)`,
                                transition: sp === 'spinning'
                                    ? `transform ${SPIN_DURATION}ms ${SPIN_EASING}`
                                    : 'none',
                            }}
                        >
                            {reel.map((teamId, i) => renderReelItem(teamId, i))}
                        </div>
                    ) : showResult ? (
                        /* 확정 결과 */
                        <div className={`flex flex-col items-center justify-center h-full gap-1 ${
                            isFirstPick ? 'animate-in zoom-in-50 duration-700' : ''
                        }`}>
                            <TeamLogo teamId={actualTeamId} size="custom" className={isFirstPick ? 'w-16 h-16' : 'w-14 h-14'} />
                            <span className={`font-bold text-white truncate max-w-[130px] text-center leading-tight ${
                                isFirstPick ? 'text-xs' : 'text-[11px]'
                            }`}>
                                {TEAM_DATA[actualTeamId] ? `${TEAM_DATA[actualTeamId].city} ${TEAM_DATA[actualTeamId].name}` : actualTeamId}
                            </span>
                            <div className="flex items-center gap-1 flex-wrap justify-center">
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
                        </div>
                    ) : isFirstPickReady ? (
                        /* 1픽 대기 중 — 금색 배경이 가득 차도록 빈 상태 유지 */
                        <div className="flex items-center justify-center h-full" />
                    ) : (
                        /* 빈 슬롯 */
                        <div className="flex items-center justify-center h-full">
                            <span className="text-slate-700 text-xl font-black">?</span>
                        </div>
                    )}
                </div>

                {/* 릴 상하 그라데이션 마스크 (스핀 중만) */}
                {showReel && (
                    <>
                        <div className="absolute top-0 left-0 right-0 h-6 z-10 pointer-events-none"
                            style={{ background: 'linear-gradient(to bottom, rgba(15,23,42,0.9), transparent)' }} />
                        <div className="absolute bottom-0 left-0 right-0 h-6 z-10 pointer-events-none"
                            style={{ background: 'linear-gradient(to top, rgba(15,23,42,0.9), transparent)' }} />
                    </>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col items-center justify-center">
            {/* Background Image */}
            <div className="absolute inset-0 pointer-events-none">
                <img
                    src="/images/lottery2.png"
                    alt=""
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${bgLoaded ? 'opacity-100' : 'opacity-0'}`}
                    onLoad={() => setBgLoaded(true)}
                />
                <div className="absolute inset-0 bg-slate-950/85" />
            </div>

            {/* Title */}
            <div className="relative z-10 text-center mb-4">
                <h1 className="text-3xl font-black text-white uppercase tracking-wider mb-1">
                    {seasonShort} 드래프트 로터리 추첨
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
                        {[3, 2, 1, 0].map(slotIdx => renderTop4Slot(slotIdx))}
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
