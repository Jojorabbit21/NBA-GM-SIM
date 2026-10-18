
import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';
import { Button } from '../common/Button';
import { SplitButton } from '../common/SplitButton';
import { AlertCircle, RotateCcw } from 'lucide-react';
import {
    ROTATION_ALLOCATION_OPTIONS, computeRotationMap, computeRotationValidation, getMinutesColor,
    type RotationAllocationMode,
} from '../../utils/rotationAllocation';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Stint {
    start: number; // 0-based minute index
    end: number;
    valid: boolean; // true = exactly 5 players on court
}

export interface DragState {
    playerId: string;
    startMin: number;
    currentMin: number;
    targetValue: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Merges consecutive active minutes into stint segments, split at validation boundaries.
 *  DepthRotationBoard.tsx도 동일한 스틴트 계산이 필요해 공용으로 export한다. */
export function computeStints(playerMap: boolean[], minuteCounts: number[]): Stint[] {
    const stints: Stint[] = [];
    let i = 0;
    while (i < 48) {
        if (!playerMap[i]) { i++; continue; }
        const start = i;
        const valid = minuteCounts[i] === 5;
        while (i < 48 && playerMap[i] && (minuteCounts[i] === 5) === valid) i++;
        stints.push({ start, end: i - 1, valid });
    }
    return stints;
}

// ── GanttBar (memoized inner component) ──────────────────────────────────────

export interface GanttBarProps {
    playerId: string;
    stints: Stint[];
    dragging: DragState | null;
    onMouseDown: (playerId: string, minute: number) => void;
    onMouseMove: (playerId: string, minute: number) => void;
    // Live mode
    currentMinute?: number;
    lockedBefore?: number;
    readOnly?: boolean;
    /** true면 12분(쿼터) 경계선도 다른 6분 보조선과 동일한 회색으로 그린다(인디고 강조 없음).
     *  DepthRotationBoard.tsx 전용 — 기본 false로 기존(RotationManager/싱글플레이어) 룩은 그대로. */
    flatGridLines?: boolean;
    /** true면 쿼터별 배경 음영(홀/짝 번갈아 slate-900↔950)을 없애고 4쿼터 전부 slate-800으로
     *  통일한다. DepthRotationBoard.tsx 전용 — 기본 false로 기존 룩은 그대로. */
    flatQuarterBg?: boolean;
    /** true면 활성 구간(stint) 블록의 모서리 둥글기(rounded)를 없앤다.
     *  DepthRotationBoard.tsx 전용 — 기본 false로 기존 룩은 그대로. */
    sharpStintCorners?: boolean;
}

export const GanttBar: React.FC<GanttBarProps> = React.memo(
    ({ playerId, stints, dragging, onMouseDown, onMouseMove, currentMinute, lockedBefore, readOnly, flatGridLines, flatQuarterBg, sharpStintCorners }) => {
        const barRef = useRef<HTMLDivElement>(null);

        const getMinute = useCallback((clientX: number): number => {
            const rect = barRef.current?.getBoundingClientRect();
            if (!rect || rect.width === 0) return 0;
            return Math.max(0, Math.min(47, Math.floor((clientX - rect.left) / rect.width * 48)));
        }, []);

        const isDraggingThis = dragging?.playerId === playerId;

        return (
            <div
                ref={barRef}
                className={`relative w-full h-full select-none ${readOnly ? 'cursor-default' : 'cursor-crosshair'}`}
                onMouseDown={(e) => {
                    if (readOnly) return;
                    e.preventDefault();
                    const minute = getMinute(e.clientX);
                    if (lockedBefore !== undefined && minute < lockedBefore) return;
                    onMouseDown(playerId, minute);
                }}
                onMouseMove={(e) => {
                    if (readOnly) return;
                    if (isDraggingThis) onMouseMove(playerId, getMinute(e.clientX));
                }}
            >
                {/* Background: alternating quarter shading.
                    flatQuarterBg(DepthRotationBoard 전용)일 땐 4쿼터 전부 slate-900/60 단색으로
                    통일한다 — 여백/마진 없음, 경계 없이 쭉 이어진 하나의 배경. */}
                {flatQuarterBg ? (
                    <div className="absolute inset-0 flex pointer-events-none">
                        {[0, 1, 2, 3].map(q => (
                            <div key={q} className="flex-1 h-full bg-slate-900/60" />
                        ))}
                    </div>
                ) : (
                    <div className="absolute inset-0 flex pointer-events-none">
                        {[0, 1, 2, 3].map(q => (
                            <div
                                key={q}
                                className={`flex-1 h-full ${q % 2 === 0 ? 'bg-slate-900/60' : 'bg-slate-950/60'}`}
                            />
                        ))}
                    </div>
                )}

                {/* Grid lines: minor every 6min, major at quarters.
                    flatGridLines(DepthRotationBoard 전용)일 땐 6분 단위 보조선/쿼터 경계선을 전부
                    안 그리고, 대신 맨 왼쪽(1쿼터 좌측)·맨 오른쪽(4쿼터 우측) 바깥쪽 경계에만
                    slate-800 구분선을 그린다. [2026-10-18] 쿼터 경계(12/24/36분)에도 같은 1px slate-800 세로선 추가. */}
                {flatGridLines ? (
                    <>
                        <div className="absolute top-0 bottom-0 left-0 w-px bg-slate-800 pointer-events-none" />
                        <div className="absolute top-0 bottom-0 right-0 w-px bg-slate-800 pointer-events-none" />
                        {[12, 24, 36].map(m => (
                            <div
                                key={m}
                                className="absolute top-0 bottom-0 w-px bg-slate-800 pointer-events-none"
                                style={{ left: `${m / 48 * 100}%` }}
                            />
                        ))}
                    </>
                ) : (
                    [6, 12, 18, 24, 30, 36, 42].map(m => (
                        <div
                            key={m}
                            className={`absolute top-0 bottom-0 pointer-events-none ${
                                m % 12 === 0 ? 'w-0.5 bg-indigo-500/35' : 'w-px bg-slate-700/50'
                            }`}
                            style={{ left: `${m / 48 * 100}%` }}
                        />
                    ))
                )}

                {/* Active stint blocks */}
                {stints.map((stint, idx) => (
                    <div
                        key={idx}
                        className={`absolute top-1.5 bottom-1.5 pointer-events-none ${sharpStintCorners ? '' : 'rounded'} ${
                            stint.valid
                                ? 'bg-emerald-500/40 border border-emerald-500/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                                : 'bg-red-500/30 border border-red-500/50'
                        }`}
                        style={{
                            left: `${stint.start / 48 * 100}%`,
                            width: `${(stint.end - stint.start + 1) / 48 * 100}%`,
                        }}
                    />
                ))}

                {/* Locked past-minutes overlay (live mode) */}
                {lockedBefore !== undefined && lockedBefore > 0 && (
                    <div
                        className="absolute inset-y-0 left-0 bg-slate-950/50 pointer-events-none z-[5]"
                        style={{ width: `${lockedBefore / 48 * 100}%` }}
                    />
                )}

                {/* Current minute indicator (live mode) */}
                {currentMinute !== undefined && currentMinute >= 0 && currentMinute < 48 && (
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10 pointer-events-none"
                        style={{ left: `${(currentMinute + 0.5) / 48 * 100}%` }}
                    />
                )}

                {/* Drag selection preview */}
                {isDraggingThis && dragging && (
                    <div
                        className="absolute top-0.5 bottom-0.5 bg-white/15 border border-white/25 rounded pointer-events-none"
                        style={{
                            left: `${Math.min(dragging.startMin, dragging.currentMin) / 48 * 100}%`,
                            width: `${(Math.abs(dragging.currentMin - dragging.startMin) + 1) / 48 * 100}%`,
                        }}
                    />
                )}
            </div>
        );
    },
    // Custom comparator: only re-render when stints change or this bar's drag state changes
    (prev, next) => {
        if (prev.stints !== next.stints) return false;
        if (prev.currentMinute !== next.currentMinute) return false;
        if (prev.lockedBefore !== next.lockedBefore) return false;
        if (prev.readOnly !== next.readOnly) return false;
        if (prev.flatGridLines !== next.flatGridLines) return false;
        if (prev.flatQuarterBg !== next.flatQuarterBg) return false;
        if (prev.sharpStintCorners !== next.sharpStintCorners) return false;

        const prevDrag = prev.dragging?.playerId === prev.playerId ? prev.dragging : null;
        const nextDrag = next.dragging?.playerId === next.playerId ? next.dragging : null;

        if (prevDrag === null && nextDrag === null) return true;
        if (prevDrag === null || nextDrag === null) return false;
        return prevDrag.startMin === nextDrag.startMin && prevDrag.currentMin === nextDrag.currentMin;
    }
);
GanttBar.displayName = 'GanttBar';

// ── Allocation modes — utils/rotationAllocation.ts(DepthRotationBoard와 공유) ──

// ── Main component ────────────────────────────────────────────────────────────

interface RotationGanttChartProps {
    team: Team;
    tactics: GameTactics;
    depthChart: DepthChart | null;
    healthySorted: Player[];
    onUpdateTactics: (t: GameTactics) => void;
    onViewPlayer: (p: Player) => void;
    coachName?: string;
    // Live mode
    liveMode?: boolean;
    currentMinute?: number;
    lockedBefore?: number;
    readOnly?: boolean;
}

const RotationGanttChartInner: React.FC<RotationGanttChartProps> = ({
    team, tactics, depthChart, healthySorted, onUpdateTactics, onViewPlayer, coachName,
    liveMode = false, currentMinute: liveCurrentMinute, lockedBefore, readOnly = false,
}) => {
    const [dragging, setDragging] = useState<DragState | null>(null);

    // Ref for stable callbacks (avoids recreating callbacks when tactics changes)
    const tacticsRef = useRef(tactics);
    tacticsRef.current = tactics;
    const onUpdateRef = useRef(onUpdateTactics);
    onUpdateRef.current = onUpdateTactics;

    // RAF handle for throttling drag mousemove updates to display refresh rate
    const rafRef = useRef<number | null>(null);

    // Ref for lockedBefore (used in mouseup handler)
    const lockedBeforeRef = useRef(lockedBefore);
    lockedBeforeRef.current = lockedBefore;

    // Cleanup RAF on unmount
    useEffect(() => {
        return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
    }, []);

    // Global mouseup — commit drag to rotationMap
    useEffect(() => {
        if (!dragging) return;
        const handleMouseUp = () => {
            const t = tacticsRef.current;
            let start = Math.min(dragging.startMin, dragging.currentMin);
            let end   = Math.max(dragging.startMin, dragging.currentMin);

            // In live mode, clamp to only affect future minutes
            const lb = lockedBeforeRef.current;
            if (lb !== undefined) {
                start = Math.max(start, lb);
                if (start > end) { setDragging(null); return; }
            }

            const cur   = t.rotationMap || {};
            const newMap = { ...cur };
            const arr = [...(cur[dragging.playerId] || Array(48).fill(false))];
            for (let i = start; i <= end; i++) arr[i] = dragging.targetValue;
            newMap[dragging.playerId] = arr;
            onUpdateRef.current({ ...t, rotationMap: newMap });
            setDragging(null);
        };
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, [dragging]);

    // Precomputed OVR map (avoids repeated calculatePlayerOvr calls in render)
    const ovrMap = useMemo(() => {
        const m = new Map<string, number>();
        team.roster.forEach(p => m.set(p.id, calculatePlayerOvr(p)));
        return m;
    }, [team.roster]);

    // Players grouped by depth chart position
    const groupedRotation = useMemo((): Record<string, Player[]> => {
        if (!depthChart) return { ALL: healthySorted };
        const groups: Record<string, Player[]> = { PG: [], SG: [], SF: [], PF: [], C: [], RES: [] };
        const usedIds = new Set<string>();
        const positions: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
        positions.forEach(pos => {
            depthChart[pos].forEach(id => {
                if (id) {
                    const p = team.roster.find(rp => rp.id === id);
                    if (p && p.health !== 'Injured') { groups[pos].push(p); usedIds.add(id); }
                }
            });
        });
        healthySorted.forEach(p => { if (!usedIds.has(p.id)) groups['RES'].push(p); });
        return groups;
    }, [depthChart, team.roster, healthySorted]);

    // Validation: per-minute court counts + warning buckets (utils/rotationAllocation.ts 공유)
    const validation = useMemo(() => {
        const v = computeRotationValidation(tactics.rotationMap, team.roster);
        return { ...v, under5Count: v.under5Minutes.length, over5Count: v.over5Minutes.length };
    }, [tactics.rotationMap, team.roster]);

    // Pre-computed stints per player (split at validation boundaries)
    const stintsMap = useMemo(() => {
        const result = new Map<string, Stint[]>();
        team.roster.forEach(p => {
            const m = (tactics.rotationMap || {})[p.id] || Array(48).fill(false);
            result.set(p.id, computeStints(m, validation.minuteCounts));
        });
        return result;
    }, [tactics.rotationMap, validation.minuteCounts, team.roster]);

    // Stable mouse handlers (use refs to access latest tactics)
    const handleBarMouseDown = useCallback((playerId: string, minute: number) => {
        if (readOnly) return;
        if (lockedBefore !== undefined && minute < lockedBefore) return;
        const currentMap = (tacticsRef.current.rotationMap || {})[playerId] || Array(48).fill(false);
        setDragging({ playerId, startMin: minute, currentMin: minute, targetValue: !currentMap[minute] });
    }, [readOnly, lockedBefore]);

    const handleBarMouseMove = useCallback((playerId: string, minute: number) => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            setDragging((prev: DragState | null) =>
                prev && prev.currentMin !== minute ? { ...prev, currentMin: minute } : prev
            );
        });
    }, []);

    // Allocation preset handler
    const handleAllocation = useCallback((mode: RotationAllocationMode) => {
        if (!depthChart) return;
        const t = tacticsRef.current;
        onUpdateRef.current({ ...t, rotationMap: computeRotationMap(depthChart, mode, team.roster) });
    }, [depthChart, team.roster]);

    const handleResetRotation = useCallback(() => {
        if (!window.confirm('로테이션 설정을 전부 초기화하시겠습니까?')) return;
        const t = tacticsRef.current;
        const newMap: Record<string, boolean[]> = {};
        team.roster.forEach(p => { newMap[p.id] = Array(48).fill(false); });
        onUpdateRef.current({ ...t, rotationMap: newMap });
    }, [team.roster]);

    const handleResetFutureRotation = useCallback(() => {
        const lb = lockedBeforeRef.current ?? 0;
        if (!window.confirm(`${lb}분 이후의 로테이션을 초기화하시겠습니까?`)) return;
        const t = tacticsRef.current;
        const cur = t.rotationMap || {};
        const newMap: Record<string, boolean[]> = {};
        team.roster.forEach(p => {
            const existing = cur[p.id] || Array(48).fill(false);
            const arr = [...existing];
            for (let i = lb; i < 48; i++) arr[i] = false;
            newMap[p.id] = arr;
        });
        onUpdateRef.current({ ...t, rotationMap: newMap });
    }, [team.roster]);

    const handleResetPlayer = useCallback((playerId: string) => {
        const t = tacticsRef.current;
        const currentMap = t.rotationMap || {};
        const existing = currentMap[playerId] || Array(48).fill(false);
        const lb = lockedBeforeRef.current;
        if (lb !== undefined) {
            // Live mode: only clear future minutes
            const arr = [...existing];
            for (let i = lb; i < 48; i++) arr[i] = false;
            const newMap = { ...currentMap, [playerId]: arr };
            onUpdateRef.current({ ...t, rotationMap: newMap });
        } else {
            const newMap = { ...currentMap, [playerId]: Array(48).fill(false) };
            onUpdateRef.current({ ...t, rotationMap: newMap });
        }
    }, []);

    const posKeys = depthChart ? ['PG', 'SG', 'SF', 'PF', 'C', 'RES'] : ['ALL'];
    const SH = 'bg-slate-950'; // sticky header bg
    const SK = 'bg-slate-900'; // sticky body bg
    const SB = 'border-r border-slate-800';

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* ── Toolbar ── */}
            <div className="px-6 py-3 bg-slate-800 border-t border-slate-600 border-b border-slate-600 flex items-center justify-between flex-shrink-0 gap-4">
                <span className="text-base font-black text-white">
                    {liveMode ? '라이브 로테이션' : '로테이션 차트'}
                </span>

                {!liveMode && (
                    <div className="flex gap-2">
                        <SplitButton
                            width="w-48"
                            onClick={() => handleAllocation('Overwork')}
                            items={ROTATION_ALLOCATION_OPTIONS.map(({ mode, label, sub }) => ({ id: mode, label, sub, onClick: () => handleAllocation(mode) }))}
                        >
                            {coachName ? `${coachName}에게 위임` : '코치에게 위임'}
                        </SplitButton>
                        <Button variant="secondary" onClick={handleResetRotation} icon={<RotateCcw size={14} />}>
                            초기화
                        </Button>
                    </div>
                )}

                {liveMode && !readOnly && (
                    <Button variant="secondary" onClick={handleResetFutureRotation} icon={<RotateCcw size={14} />}>
                        남은 분 초기화
                    </Button>
                )}
            </div>

            {/* Live mode status banner */}
            {liveMode && (
                <div className={`px-6 py-2 border-b flex-shrink-0 ${
                    readOnly
                        ? 'bg-slate-800/50 border-slate-600'
                        : 'bg-emerald-900/30 border-emerald-700/40'
                }`}>
                    <span className={`text-xs font-semibold ${readOnly ? 'text-slate-500' : 'text-emerald-400'}`}>
                        {readOnly
                            ? '경기 진행 중 — 쿼터 종료/하프타임/타임아웃 시 편집 가능'
                            : '편집 가능 — 미래 분만 수정 가능합니다'
                        }
                    </span>
                </div>
            )}

            {/* ── Gantt table ── */}
            <div className="flex-1 min-h-0 overflow-auto">
                <table className="border-separate border-spacing-0 w-full" style={{ minWidth: '960px' }}>
                    <thead className={`${SH} sticky top-0 z-50`}>
                        {/* Row 1: column headers + quarter labels */}
                        <tr className="text-sm font-bold text-slate-400">
                            <th rowSpan={2} className={`sticky left-0 z-50 ${SH} ${SB} border-b border-slate-800 w-[50px] min-w-[50px] text-center`}>포지션</th>
                            <th rowSpan={2} className={`sticky left-[50px] z-50 ${SH} ${SB} border-b border-slate-800 w-[160px] min-w-[160px] text-left px-3`}>선수</th>
                            <th rowSpan={2} className={`sticky left-[210px] z-50 ${SH} ${SB} border-b border-slate-800 w-[40px] min-w-[40px] text-center`}>OVR</th>
                            <th rowSpan={2} className={`sticky left-[250px] z-50 ${SH} ${SB} border-b border-slate-800 w-[55px] min-w-[55px] text-center`}>체력</th>
                            <th rowSpan={2} className={`sticky left-[305px] z-50 ${SH} ${SB} border-r-2 border-r-indigo-500/50 border-b border-slate-800 w-[40px] min-w-[40px] text-center`}>시간</th>
                            {/* Quarter label cell */}
                            <th className={`border-r border-slate-800 ${SH} border-b border-slate-800 p-0`}>
                                <div className="flex h-7 text-xs font-black">
                                    {['1쿼터', '2쿼터', '3쿼터', '4쿼터'].map((q, qi) => (
                                        <div
                                            key={q}
                                            className={`flex-1 flex items-center justify-center text-slate-400 ${qi < 3 ? 'border-r-2 border-indigo-500/40' : ''}`}
                                        >
                                            {q}
                                        </div>
                                    ))}
                                </div>
                            </th>
                        </tr>
                        {/* Row 2: minute markers */}
                        <tr>
                            <th className={`border-r border-slate-800 ${SH} border-b border-slate-800 p-0`}>
                                <div className="relative h-5">
                                    {Array.from({ length: 24 }, (_, i) => (i + 1) * 2).map(m => (
                                        <span
                                            key={m}
                                            className={`absolute bottom-0.5 text-xs select-none ${m === 48 ? 'right-0' : '-translate-x-1/2'} ${m % 12 === 0 ? 'text-slate-400 font-semibold' : 'text-slate-600'}`}
                                            style={m < 48 ? { left: `${m / 48 * 100}%` } : undefined}
                                        >
                                            {m}
                                        </span>
                                    ))}
                                </div>
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        {posKeys.map(pos => {
                            const players = groupedRotation[pos];
                            if (!players || players.length === 0) return null;
                            return players.map((p, index) => {
                                const playerMap = (tactics.rotationMap || {})[p.id] || Array(48).fill(false);
                                const totalMins = playerMap.filter(Boolean).length;
                                const cond  = Math.round(p.condition || 100);
                                const delta = p.conditionDelta;
                                const ovr   = ovrMap.get(p.id) ?? 0;
                                const stints = stintsMap.get(p.id) ?? [];

                                return (
                                    <tr key={p.id} className="hover:bg-white/[0.03] group h-9 border-b border-slate-800">
                                        {/* POS — merged cell for position group */}
                                        {index === 0 && (
                                            <td
                                                rowSpan={players.length}
                                                className={`sticky left-0 z-30 ${SK} text-center align-middle ${SB} border-b border-slate-800`}
                                            >
                                                <span className="text-[10px] font-bold text-slate-500">{pos}</span>
                                            </td>
                                        )}

                                        {/* PLAYER */}
                                        <td
                                            className={`sticky left-[50px] z-30 ${SK} px-3 cursor-pointer ${SB} border-b border-slate-800`}
                                            onClick={() => onViewPlayer(p)}
                                        >
                                            <span className={`text-xs font-semibold truncate block ${pos === 'RES' ? 'text-slate-500' : 'text-slate-200 group-hover:text-indigo-400'}`}>
                                                {p.name}
                                            </span>
                                        </td>

                                        {/* OVR */}
                                        <td className={`sticky left-[210px] z-30 ${SK} text-center ${SB} border-b border-slate-800`}>
                                            <div className="flex justify-center">
                                                <OvrBadge value={ovr} size="sm" className="!shadow-none" />
                                            </div>
                                        </td>

                                        {/* COND */}
                                        <td className={`sticky left-[250px] z-30 ${SK} text-center ${SB} border-b border-slate-800`}>
                                            <div className="flex items-center justify-center gap-1">
                                                <span className={`text-xs font-semibold ${cond < 70 ? 'text-red-500' : cond < 90 ? 'text-amber-500' : 'text-emerald-500'}`}>
                                                    {cond}
                                                </span>
                                                {/* {delta !== undefined && delta !== 0 && (
                                                    <span className={`text-[9px] font-bold ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {delta > 0 ? '+' : ''}{delta}
                                                    </span>
                                                )} */}
                                            </div>
                                        </td>

                                        {/* MIN */}
                                        <td className={`sticky left-[305px] z-30 ${SK} text-center align-middle ${SB} border-r-2 border-r-indigo-500/50 border-b border-slate-800`}>
                                            <div className="relative flex items-center justify-center h-full">
                                                <span className={`text-xs font-semibold ${getMinutesColor(totalMins)} group-hover:opacity-0 transition-opacity`}>{totalMins}</span>
                                                {totalMins > 0 && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleResetPlayer(p.id); }}
                                                        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="이 선수 로테이션 초기화"
                                                    >
                                                        <RotateCcw size={12} className="text-slate-400 hover:text-red-400 transition-colors" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>

                                        {/* GANTT BAR */}
                                        <td className="p-0 h-9 border-b border-slate-800">
                                            <GanttBar
                                                playerId={p.id}
                                                stints={stints}
                                                dragging={dragging}
                                                onMouseDown={handleBarMouseDown}
                                                onMouseMove={handleBarMouseMove}
                                                currentMinute={liveCurrentMinute}
                                                lockedBefore={lockedBefore}
                                                readOnly={readOnly}
                                            />
                                        </td>
                                    </tr>
                                );
                            });
                        })}
                    </tbody>
                </table>
            </div>

            {/* ── Validation banner ── */}
            {(validation.under5Count > 0 || validation.over5Count > 0 || validation.over42.length > 0) && (
                <div className="bg-red-500/10 border-t border-red-500/20 px-6 py-2 flex flex-wrap gap-4 items-center flex-shrink-0 animate-in slide-in-from-bottom-2">
                    <AlertCircle size={16} className="text-red-500" />
                    {validation.under5Count > 0 && (
                        <span className="text-[10px] font-bold text-red-400">5명 미만: {validation.under5Count}개 구간</span>
                    )}
                    {validation.over5Count > 0 && (
                        <span className="text-[10px] font-bold text-orange-400">5명 초과: {validation.over5Count}개 구간</span>
                    )}
                    {validation.over42.length > 0 && (
                        <span className="text-[10px] font-bold text-red-500">혹사 경고: {validation.over42.join(', ')}</span>
                    )}
                </div>
            )}
        </div>
    );
};

export const RotationGanttChart = React.memo(
    RotationGanttChartInner,
    (prev: RotationGanttChartProps, next: RotationGanttChartProps) =>
        prev.team === next.team &&
        prev.tactics.rotationMap === next.tactics.rotationMap &&
        prev.depthChart === next.depthChart &&
        prev.healthySorted === next.healthySorted &&
        prev.onUpdateTactics === next.onUpdateTactics &&
        prev.onViewPlayer === next.onViewPlayer &&
        prev.liveMode === next.liveMode &&
        prev.currentMinute === next.currentMinute &&
        prev.lockedBefore === next.lockedBefore &&
        prev.readOnly === next.readOnly
);
