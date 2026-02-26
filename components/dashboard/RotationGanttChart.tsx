
import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';
import { AlertCircle, RotateCcw, ChevronDown } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Stint {
    start: number; // 0-based minute index
    end: number;
    valid: boolean; // true = exactly 5 players on court
}

interface DragState {
    playerId: string;
    startMin: number;
    currentMin: number;
    targetValue: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Merges consecutive active minutes into stint segments, split at validation boundaries */
function computeStints(playerMap: boolean[], minuteCounts: number[]): Stint[] {
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

interface GanttBarProps {
    playerId: string;
    stints: Stint[];
    dragging: DragState | null;
    onMouseDown: (playerId: string, minute: number) => void;
    onMouseMove: (playerId: string, minute: number) => void;
}

const GanttBar: React.FC<GanttBarProps> = React.memo(
    ({ playerId, stints, dragging, onMouseDown, onMouseMove }) => {
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
                className="relative w-full h-full cursor-crosshair select-none"
                onMouseDown={(e) => {
                    e.preventDefault();
                    onMouseDown(playerId, getMinute(e.clientX));
                }}
                onMouseMove={(e) => {
                    if (isDraggingThis) onMouseMove(playerId, getMinute(e.clientX));
                }}
            >
                {/* Background: alternating quarter shading */}
                <div className="absolute inset-0 flex pointer-events-none">
                    {[0, 1, 2, 3].map(q => (
                        <div
                            key={q}
                            className={`flex-1 h-full ${q % 2 === 0 ? 'bg-slate-900/60' : 'bg-slate-950/60'}`}
                        />
                    ))}
                </div>

                {/* Grid lines: minor every 6min, major at quarters */}
                {[6, 12, 18, 24, 30, 36, 42].map(m => (
                    <div
                        key={m}
                        className={`absolute top-0 bottom-0 pointer-events-none ${
                            m % 12 === 0
                                ? 'w-0.5 bg-indigo-500/35'
                                : 'w-px bg-slate-700/50'
                        }`}
                        style={{ left: `${m / 48 * 100}%` }}
                    />
                ))}

                {/* Active stint blocks */}
                {stints.map((stint, idx) => (
                    <div
                        key={idx}
                        className={`absolute top-1.5 bottom-1.5 rounded pointer-events-none ${
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
        if (prev.stints !== next.stints) return false; // stints changed → re-render

        const prevDrag = prev.dragging?.playerId === prev.playerId ? prev.dragging : null;
        const nextDrag = next.dragging?.playerId === next.playerId ? next.dragging : null;

        if (prevDrag === null && nextDrag === null) return true; // neither dragging → skip
        if (prevDrag === null || nextDrag === null) return false; // drag started/ended → re-render
        // Both dragging: re-render only if position changed
        return prevDrag.startMin === nextDrag.startMin && prevDrag.currentMin === nextDrag.currentMin;
    }
);
GanttBar.displayName = 'GanttBar';

// ── Allocation modes (same patterns as RotationMatrix) ───────────────────────
type AllocationMode = 'Overwork' | 'Balanced' | 'Socialist';

const ALLOCATION_OPTIONS: { mode: AllocationMode; label: string; sub: string }[] = [
    { mode: 'Overwork',   label: '주전 혹사 (기본)', sub: '주전 36분 / 벤치 12분' },
    { mode: 'Balanced',   label: '균형 분배',        sub: '주전 26분 / 벤치 18분 / 써드 4분' },
    { mode: 'Socialist',  label: '공산 농구',        sub: '주전 20분 / 벤치 16분 / 써드 12분' },
];

// ── Main component ────────────────────────────────────────────────────────────

interface RotationGanttChartProps {
    team: Team;
    tactics: GameTactics;
    depthChart: DepthChart | null;
    healthySorted: Player[];
    onUpdateTactics: (t: GameTactics) => void;
    onViewPlayer: (p: Player) => void;
}

const RotationGanttChartInner: React.FC<RotationGanttChartProps> = ({
    team, tactics, depthChart, healthySorted, onUpdateTactics, onViewPlayer,
}) => {
    const [dragging, setDragging] = useState<DragState | null>(null);
    const [isAiDropdownOpen, setIsAiDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Ref for stable callbacks (avoids recreating callbacks when tactics changes)
    const tacticsRef = useRef(tactics);
    tacticsRef.current = tactics;
    const onUpdateRef = useRef(onUpdateTactics);
    onUpdateRef.current = onUpdateTactics;

    // RAF handle for throttling drag mousemove updates to display refresh rate
    const rafRef = useRef<number | null>(null);

    // Cleanup RAF on unmount
    useEffect(() => {
        return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
    }, []);

    // Close dropdown on outside click
    useEffect(() => {
        const handle = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
                setIsAiDropdownOpen(false);
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, []);

    // Global mouseup — commit drag to rotationMap
    useEffect(() => {
        if (!dragging) return;
        const handleMouseUp = () => {
            const t = tacticsRef.current;
            const start = Math.min(dragging.startMin, dragging.currentMin);
            const end   = Math.max(dragging.startMin, dragging.currentMin);
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

    // Validation: per-minute court counts + warning buckets
    const validation = useMemo(() => {
        const minuteCounts = Array<number>(48).fill(0);
        const over42: string[] = [];
        const mapData = tactics.rotationMap || {};
        Object.entries(mapData).forEach(([pid, map]) => {
            if (map.filter(Boolean).length > 42)
                over42.push(team.roster.find(p => p.id === pid)?.name || pid);
            map.forEach((active, i) => { if (active) minuteCounts[i]++; });
        });
        return {
            minuteCounts,
            over42,
            under5Count: minuteCounts.filter(c => c < 5).length,
            over5Count:  minuteCounts.filter(c => c > 5).length,
        };
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
        const currentMap = (tacticsRef.current.rotationMap || {})[playerId] || Array(48).fill(false);
        setDragging({ playerId, startMin: minute, currentMin: minute, targetValue: !currentMap[minute] });
    }, []);

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
    const handleAllocation = useCallback((mode: AllocationMode) => {
        if (!depthChart) return;
        const t = tacticsRef.current;
        const newMap: Record<string, boolean[]> = {};
        team.roster.forEach(p => { newMap[p.id] = Array(48).fill(false); });
        const fill = (id: string, s: number, e: number) => {
            if (!newMap[id]) newMap[id] = Array(48).fill(false);
            for (let i = s - 1; i < e; i++) newMap[id][i] = true;
        };
        const positions: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
        positions.forEach(pos => {
            const [sid, bid, tid] = depthChart[pos];
            if (mode === 'Overwork') {
                if (sid) { fill(sid,1,12); fill(sid,19,24); fill(sid,25,36); fill(sid,43,48); }
                if (bid) { fill(bid,13,18); fill(bid,37,42); }
                else if (sid) { fill(sid,13,18); fill(sid,37,42); }
            } else if (mode === 'Balanced') {
                if (sid) { fill(sid,1,8); fill(sid,21,24); fill(sid,25,32); fill(sid,43,48); }
                if (bid) { fill(bid,9,12); fill(bid,17,20); fill(bid,33,36); fill(bid,37,42); }
                if (tid) { fill(tid,13,16); } else if (sid) { fill(sid,13,16); }
                if (sid && !bid) { fill(sid,9,12); fill(sid,17,20); fill(sid,33,36); fill(sid,37,42); }
            } else {
                if (sid) { fill(sid,1,6); fill(sid,21,24); fill(sid,25,30); fill(sid,45,48); }
                if (bid) { fill(bid,7,10); fill(bid,13,16); fill(bid,31,34); fill(bid,37,40); }
                if (tid) { fill(tid,11,12); fill(tid,17,20); fill(tid,35,36); fill(tid,41,44); }
                else {
                    if (sid) { fill(sid,17,20); fill(sid,41,44); }
                    if (bid) { fill(bid,11,12); fill(bid,35,36); }
                    else if (sid) { fill(sid,11,12); fill(sid,35,36); }
                }
                if (sid && !bid) { fill(sid,7,10); fill(sid,13,16); fill(sid,31,34); fill(sid,37,40); }
            }
        });
        onUpdateRef.current({ ...t, rotationMap: newMap });
        setIsAiDropdownOpen(false);
    }, [depthChart, team.roster]);

    const handleResetRotation = useCallback(() => {
        if (!window.confirm('로테이션 설정을 전부 초기화하시겠습니까?')) return;
        const t = tacticsRef.current;
        const newMap: Record<string, boolean[]> = {};
        team.roster.forEach(p => { newMap[p.id] = Array(48).fill(false); });
        onUpdateRef.current({ ...t, rotationMap: newMap });
    }, [team.roster]);

    const getMinColor = (mins: number) => {
        if (mins === 0) return 'text-slate-600';
        if (mins > 42) return 'text-red-500';
        if (mins > 34) return 'text-amber-500';
        if (mins > 20) return 'text-indigo-400';
        return 'text-emerald-400';
    };

    const posKeys = depthChart ? ['PG', 'SG', 'SF', 'PF', 'C', 'RES'] : ['ALL'];
    const SH = 'bg-slate-950'; // sticky header bg
    const SK = 'bg-slate-900'; // sticky body bg
    const SB = 'border-r border-slate-800';

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* ── Toolbar ── */}
            <div className="px-6 py-3 bg-slate-800 border-t border-slate-700 border-b border-slate-700 flex items-center justify-between flex-shrink-0 gap-4">
                <span className="text-base font-black text-white uppercase tracking-widest oswald">로테이션 차트</span>

                <div className="flex gap-2">
                    <div className="relative flex shadow-md" ref={dropdownRef}>
                        <button
                            onClick={() => handleAllocation('Overwork')}
                            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-l-lg transition-all text-xs font-bold uppercase tracking-wider active:scale-95 border-r border-indigo-700/50"
                        >
                            코치에게 위임
                        </button>
                        <button
                            onClick={() => setIsAiDropdownOpen(v => !v)}
                            className={`px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-r-lg transition-all ${isAiDropdownOpen ? 'bg-indigo-700' : ''}`}
                        >
                            <ChevronDown size={14} className={`transition-transform duration-200 ${isAiDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isAiDropdownOpen && (
                            <div className="absolute top-full right-0 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                <div className="p-1">
                                    {ALLOCATION_OPTIONS.map(({ mode, label, sub }) => (
                                        <button
                                            key={mode}
                                            onClick={() => handleAllocation(mode)}
                                            className="w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-all flex flex-col gap-0.5"
                                        >
                                            <span>{label}</span>
                                            <span className="text-[9px] text-slate-500 font-normal">{sub}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={handleResetRotation}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg transition-all text-xs font-bold uppercase tracking-wider shadow-sm active:scale-95"
                    >
                        <RotateCcw size={14} />
                        <span>초기화</span>
                    </button>
                </div>
            </div>

            {/* ── Gantt table ── */}
            <div className="flex-1 min-h-0 overflow-auto">
                <table className="border-collapse w-full" style={{ minWidth: '960px' }}>
                    <thead className={`${SH} sticky top-0 z-50`}>
                        {/* Row 1: column headers + quarter labels */}
                        <tr className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">
                            <th rowSpan={2} className={`sticky left-0 z-50 ${SH} ${SB} border-b border-slate-800 w-[50px] min-w-[50px] text-center`}>POS</th>
                            <th rowSpan={2} className={`sticky left-[50px] z-50 ${SH} ${SB} border-b border-slate-800 w-[160px] min-w-[160px] text-left px-3`}>PLAYER</th>
                            <th rowSpan={2} className={`sticky left-[210px] z-50 ${SH} ${SB} border-b border-slate-800 w-[40px] min-w-[40px] text-center`}>OVR</th>
                            <th rowSpan={2} className={`sticky left-[250px] z-50 ${SH} ${SB} border-b border-slate-800 w-[55px] min-w-[55px] text-center`}>COND</th>
                            <th rowSpan={2} className={`sticky left-[305px] z-50 ${SH} border-b border-slate-800 w-[40px] min-w-[40px] text-center shadow-[4px_0_12px_rgba(0,0,0,0.5)]`}>MIN</th>
                            {/* Quarter label cell */}
                            <th className={`${SH} border-b border-slate-800/50 p-0`}>
                                <div className="flex h-7 text-[10px] font-black">
                                    {['Q1', 'Q2', 'Q3', 'Q4'].map((q, qi) => (
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
                            <th className={`${SH} border-b border-slate-800 p-0`}>
                                <div className="relative h-5 overflow-hidden">
                                    {[6, 12, 18, 24, 30, 36, 42, 48].map(m => (
                                        <span
                                            key={m}
                                            className="absolute bottom-0.5 text-[8px] font-mono text-slate-600 -translate-x-1/2 select-none"
                                            style={{ left: `${m / 48 * 100}%` }}
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
                                    <tr key={p.id} className="hover:bg-white/[0.03] group h-9 border-b border-slate-800/50">
                                        {/* POS — merged cell for position group */}
                                        {index === 0 && (
                                            <td
                                                rowSpan={players.length}
                                                className={`sticky left-0 z-30 ${SK} text-center align-middle ${SB} border-b border-slate-800`}
                                            >
                                                <span className="text-[10px] font-bold tracking-widest text-slate-500">{pos}</span>
                                            </td>
                                        )}

                                        {/* PLAYER */}
                                        <td
                                            className={`sticky left-[50px] z-30 ${SK} px-3 cursor-pointer ${SB} border-b border-slate-800/50`}
                                            onClick={() => onViewPlayer(p)}
                                        >
                                            <span className={`text-xs font-semibold truncate block ${pos === 'RES' ? 'text-slate-500' : 'text-slate-200 group-hover:text-indigo-400'}`}>
                                                {p.name}
                                            </span>
                                        </td>

                                        {/* OVR */}
                                        <td className={`sticky left-[210px] z-30 ${SK} text-center ${SB} border-b border-slate-800/50`}>
                                            <div className="flex justify-center">
                                                <OvrBadge value={ovr} size="sm" className="!w-6 !h-6 !text-xs !shadow-none" />
                                            </div>
                                        </td>

                                        {/* COND */}
                                        <td className={`sticky left-[250px] z-30 ${SK} text-center ${SB} border-b border-slate-800/50`}>
                                            <div className="flex items-center justify-center gap-1">
                                                <span className={`text-xs font-mono font-semibold ${cond < 70 ? 'text-red-500' : cond < 90 ? 'text-amber-500' : 'text-emerald-500'}`}>
                                                    {cond}
                                                </span>
                                                {delta !== undefined && delta !== 0 && (
                                                    <span className={`text-[9px] font-bold ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {delta > 0 ? '+' : ''}{delta}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* MIN */}
                                        <td className={`sticky left-[305px] z-30 ${SK} text-center border-b border-slate-800/50 shadow-[4px_0_12px_rgba(0,0,0,0.5)]`}>
                                            <span className={`text-xs font-mono font-semibold ${getMinColor(totalMins)}`}>{totalMins}</span>
                                        </td>

                                        {/* GANTT BAR */}
                                        <td className="p-0 h-9 border-b border-slate-800/50">
                                            <GanttBar
                                                playerId={p.id}
                                                stints={stints}
                                                dragging={dragging}
                                                onMouseDown={handleBarMouseDown}
                                                onMouseMove={handleBarMouseMove}
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
                        <span className="text-[10px] font-bold text-red-500 uppercase">혹사 경고: {validation.over42.join(', ')}</span>
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
        prev.onViewPlayer === next.onViewPlayer
);
