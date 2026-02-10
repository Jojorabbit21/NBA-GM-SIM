import React, { useMemo } from 'react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { OvrBadge } from '../common/OvrBadge';
import { calculatePlayerOvr } from '../../utils/constants';

interface RotationMatrixProps {
    team: Team;
    tactics: GameTactics;
    depthChart: DepthChart | null;
    healthySorted: Player[];
    onUpdateTactics: (t: GameTactics) => void;
    onViewPlayer: (p: Player) => void;
}

export const RotationMatrix: React.FC<RotationMatrixProps> = ({
    team,
    tactics,
    healthySorted,
    onUpdateTactics,
    onViewPlayer
}) => {
    // Calculate total minutes allocated per player
    const minutesDistribution = useMemo(() => {
        const counts: Record<string, number> = {};
        Object.entries(tactics.rotationMap || {}).forEach(([pid, schedule]) => {
            counts[pid] = schedule.filter(Boolean).length;
        });
        return counts;
    }, [tactics.rotationMap]);

    const totalMinutesAllocated = Object.values(minutesDistribution).reduce((a, b) => a + b, 0);

    const toggleMinute = (playerId: string, minute: number) => {
        const currentMap = { ...(tactics.rotationMap || {}) };
        
        // Ensure array exists
        if (!currentMap[playerId]) {
            currentMap[playerId] = Array(48).fill(false);
        }
        
        const newSchedule = [...currentMap[playerId]];
        newSchedule[minute] = !newSchedule[minute];
        currentMap[playerId] = newSchedule;

        onUpdateTactics({ ...tactics, rotationMap: currentMap });
    };

    // Sorting: Starters first, then by Minutes Descending, then OVR
    const sortedPlayers = useMemo(() => {
        const starterIds = Object.values(tactics.starters).filter(Boolean);
        
        return [...healthySorted].sort((a, b) => {
            const isStarterA = starterIds.includes(a.id);
            const isStarterB = starterIds.includes(b.id);
            if (isStarterA !== isStarterB) return isStarterA ? -1 : 1;
            
            const minA = minutesDistribution[a.id] || 0;
            const minB = minutesDistribution[b.id] || 0;
            if (minA !== minB) return minB - minA;
            
            return calculatePlayerOvr(b) - calculatePlayerOvr(a);
        });
    }, [healthySorted, tactics.starters, minutesDistribution]);

    // Sticky styling constants
    const stickyBodyBg = "bg-slate-900";
    const stickyBorder = "border-r border-slate-800";
    const stickyBottom = "border-b border-slate-800/50"; // Standard row border

    // Column Widths
    const W_PLAYER = 180;
    const W_MIN = 60;
    const W_COND = 60;

    return (
        <div className="flex flex-col h-full bg-slate-950/30 overflow-hidden relative">
            {/* Header / Legend */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/50 text-xs font-bold text-slate-400">
                <span>ROTATION TIMELINE (48 MIN)</span>
                <span className={totalMinutesAllocated === 240 ? 'text-emerald-400' : 'text-amber-400'}>
                    Total: {totalMinutesAllocated} / 240 Min
                </span>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full border-collapse">
                    <thead className="sticky top-0 z-40 bg-slate-950 shadow-md">
                        <tr>
                            <th className="sticky left-0 z-50 bg-slate-950 p-2 text-left border-r border-slate-800 border-b text-[10px] text-slate-500 font-black uppercase" style={{ width: W_PLAYER, minWidth: W_PLAYER }}>PLAYER</th>
                            <th className="sticky z-50 bg-slate-950 p-2 text-center border-r border-slate-800 border-b text-[10px] text-slate-500 font-black uppercase" style={{ left: W_PLAYER, width: W_MIN, minWidth: W_MIN }}>MIN</th>
                            <th className="sticky z-50 bg-slate-950 p-2 text-center border-r border-slate-800 border-b text-[10px] text-slate-500 font-black uppercase" style={{ left: W_PLAYER + W_MIN, width: W_COND, minWidth: W_COND }}>COND</th>
                            
                            {/* Quarter Headers */}
                            {[1, 2, 3, 4].map(q => (
                                <th key={q} colSpan={12} className={`text-center border-b border-slate-800 text-[10px] text-slate-500 font-black uppercase bg-slate-900/50 ${q < 4 ? 'border-r border-slate-700/50' : ''}`}>
                                    Q{q}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sortedPlayers.map(p => {
                            const minutes = minutesDistribution[p.id] || 0;
                            const schedule = tactics.rotationMap?.[p.id] || Array(48).fill(false);
                            const condition = p.condition !== undefined ? p.condition : 100;
                            
                            // Colors
                            let condColor = 'text-emerald-400';
                            if (condition < 80) condColor = 'text-amber-400';
                            if (condition < 60) condColor = 'text-red-400';

                            const ovr = calculatePlayerOvr(p);

                            return (
                                <tr key={p.id} className="group hover:bg-slate-800/30 transition-colors">
                                    {/* Player Info (Sticky) */}
                                    <td className={`sticky left-0 z-30 ${stickyBodyBg} ${stickyBorder} ${stickyBottom} p-2 cursor-pointer hover:bg-slate-800`} onClick={() => onViewPlayer(p)}>
                                        <div className="flex items-center gap-3">
                                            <OvrBadge value={ovr} size="sm" className="!w-6 !h-6 !text-xs !mx-0" />
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-xs font-bold text-white truncate">{p.name}</span>
                                                <span className="text-[9px] font-black text-slate-500">{p.position}</span>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Minutes (Sticky) */}
                                    <td className={`sticky z-30 ${stickyBodyBg} ${stickyBorder} ${stickyBottom} text-center`} style={{ left: W_PLAYER }}>
                                        <span className={`text-xs font-bold font-mono ${minutes > 35 ? 'text-red-400' : 'text-slate-300'}`}>{minutes}</span>
                                    </td>

                                    {/* Condition (Sticky) */}
                                    <td className={`sticky z-30 ${stickyBodyBg} ${stickyBorder} ${stickyBottom} text-center`} style={{ left: W_PLAYER + W_MIN }}>
                                        <span className={`text-[10px] font-black ${condColor}`}>
                                            {Math.round(condition)}%
                                        </span>
                                    </td>

                                    {/* Timeline Grid */}
                                    {Array.from({ length: 48 }).map((_, m) => {
                                        const isActive = schedule[m];
                                        // Determine background color for cell
                                        let bgClass = isActive ? 'bg-indigo-600' : 'bg-transparent';
                                        if (isActive && minutes > 38) bgClass = 'bg-red-500'; // Overworked warning visual

                                        // Quarter borders
                                        const isQuarterEnd = (m + 1) % 12 === 0 && m !== 47;
                                        const borderClass = isQuarterEnd ? 'border-r border-slate-600' : 'border-r border-slate-800/30';

                                        return (
                                            <td 
                                                key={m} 
                                                className={`p-0 h-10 min-w-[12px] border-b border-slate-800/50 cursor-pointer hover:bg-white/10 ${borderClass}`}
                                                onClick={() => toggleMinute(p.id, m)}
                                                title={`Minute ${m + 1}`}
                                            >
                                                <div className={`w-full h-full transition-colors ${bgClass}`}></div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};