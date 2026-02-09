
import React, { useMemo, useState } from 'react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';
import { AlertCircle, Timer } from 'lucide-react';
import { Table, TableBody, TableRow } from '../common/Table';

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
    depthChart,
    healthySorted,
    onUpdateTactics,
    onViewPlayer
}) => {
    const [lastSelected, setLastSelected] = useState<{pid: string, min: number} | null>(null);

    // 1. Group Players by Position based on Depth Chart
    const groupedRotation = useMemo(() => {
        if (!depthChart) {
            return { 'ALL': healthySorted };
        }

        const groups: Record<string, Player[]> = {
            'PG': [], 'SG': [], 'SF': [], 'PF': [], 'C': [], 'RES': []
        };
        const usedIds = new Set<string>();

        // Fill Positions from Depth Chart
        const positions: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
        positions.forEach(pos => {
            depthChart[pos].forEach(id => {
                if (id) {
                    const p = team.roster.find(rp => rp.id === id);
                    if (p && p.health !== 'Injured') {
                        groups[pos].push(p);
                        usedIds.add(id);
                    }
                }
            });
        });

        // Add remaining healthy players to Reserves
        healthySorted.forEach(p => {
             if (!usedIds.has(p.id)) {
                 groups['RES'].push(p);
             }
        });

        return groups;
    }, [depthChart, team.roster, healthySorted]);

    const handleToggleMinute = (playerId: string, minute: number) => {
        const currentMap = tactics.rotationMap || {};
        const newMap = { ...currentMap };
        
        if (!newMap[playerId]) newMap[playerId] = Array(48).fill(false);
        const playerMap = [...newMap[playerId]];

        const quarter = Math.floor(minute / 12);
        
        // Range Selection Logic
        if (lastSelected && lastSelected.pid === playerId && 
            Math.floor(lastSelected.min / 12) === quarter && lastSelected.min !== minute) {
            
            const start = Math.min(lastSelected.min, minute);
            const end = Math.max(lastSelected.min, minute);
            const targetVal = !playerMap[minute];

            for (let i = start; i <= end; i++) {
                playerMap[i] = targetVal;
            }
            setLastSelected(null);
        } else {
            playerMap[minute] = !playerMap[minute];
            setLastSelected({ pid: playerId, min: minute });
        }

        newMap[playerId] = playerMap;
        onUpdateTactics({ ...tactics, rotationMap: newMap });
    };

    // Validation
    const validation = useMemo(() => {
        const minuteCounts = Array(48).fill(0);
        const over42: string[] = [];
        const under5: number[] = [];
        const over5: number[] = [];

        const mapData = tactics.rotationMap || {};

        Object.entries(mapData).forEach(([pid, map]) => {
            const playerMins = map.filter(Boolean).length;
            if (playerMins > 42) over42.push(team.roster.find(p => p.id === pid)?.name || pid);
            
            map.forEach((active, i) => {
                if (active) minuteCounts[i]++;
            });
        });

        minuteCounts.forEach((count, i) => {
            if (count < 5) under5.push(i + 1);
            else if (count > 5) over5.push(i + 1);
        });

        return { over42, under5, over5, minuteCounts };
    }, [tactics.rotationMap, team.roster]);

    const posKeys = ['PG', 'SG', 'SF', 'PF', 'C', 'RES'];
    
    // Styling Constants
    // [Fix] Use box-shadow for the right border of sticky columns.
    // This avoids border-collapse transparency issues where scrolling content bleeds through.
    // #334155 is slate-700
    const stickyRightShadow = "shadow-[1px_0_0_0_#334155]"; 
    
    // Solid bottom border for sticky rows/cells is usually fine, but consistent shadow usage is safer for stacking contexts.
    // We stick to border-b for vertical separation as it doesn't suffer the same horizontal bleed issue.
    const stickyBottom = "border-b border-slate-700";
    
    // Grid borders (Scrollable area) - Semi-transparent for aesthetics
    const gridBorder = "border-r border-slate-700/50"; 
    const gridBottom = "border-b border-slate-700/50";

    return (
        <div className="flex flex-col h-full bg-slate-950/20 overflow-hidden">
             {/* Rotation Chart Title */}
             <div className="px-6 py-4 bg-slate-900 border-t-2 border-t-indigo-500 border-b border-slate-800 flex items-center gap-3 flex-shrink-0">
                 <Timer size={20} className="text-indigo-400"/>
                 <span className="text-base font-black text-white uppercase tracking-widest oswald">로테이션 차트</span>
            </div>

            {/* Rotation Grid Table */}
            {/* Using shared Table wrapper for consistent styling */}
            <div className="flex-1 min-h-0">
                <Table className="border-0 rounded-none shadow-none">
                    <thead className="bg-slate-900 sticky top-0 z-50">
                        {/* 1st Header Row: Info & Quarters */}
                        <tr className="text-[9px] font-black text-slate-500 uppercase tracking-tighter h-8">
                            {/* Sticky Columns Header Block - Using Box Shadow for Right Edge */}
                            <th rowSpan={2} className={`sticky left-0 z-50 bg-slate-900 ${stickyRightShadow} ${stickyBottom} w-[50px] min-w-[50px] text-center`}>POS</th>
                            <th rowSpan={2} className={`sticky left-[50px] z-50 bg-slate-900 ${stickyRightShadow} ${stickyBottom} w-[160px] min-w-[160px] text-left px-3`}>PLAYER</th>
                            <th rowSpan={2} className={`sticky left-[210px] z-50 bg-slate-900 ${stickyRightShadow} ${stickyBottom} w-[40px] min-w-[40px] text-center`}>OVR</th>
                            <th rowSpan={2} className={`sticky left-[250px] z-50 bg-slate-900 ${stickyRightShadow} ${stickyBottom} w-[40px] min-w-[40px] text-center`}>COND</th>
                            <th rowSpan={2} className={`sticky left-[290px] z-50 bg-slate-900 ${stickyRightShadow} ${stickyBottom} w-[40px] min-w-[40px] text-center`}>MIN</th>
                            
                            {/* Scrollable Quarter Headers - Transparent Borders */}
                            <th colSpan={12} className={`text-center bg-slate-800/50 text-slate-400 ${gridBorder} ${gridBottom}`}>1Q</th>
                            <th colSpan={12} className={`text-center bg-slate-800/50 text-slate-400 ${gridBorder} ${gridBottom}`}>2Q</th>
                            <th colSpan={12} className={`text-center bg-slate-800/50 text-slate-400 ${gridBorder} ${gridBottom}`}>3Q</th>
                            <th colSpan={12} className={`text-center bg-slate-800/50 text-slate-400 ${gridBottom}`}>4Q</th>
                        </tr>

                        {/* 2nd Header Row: Minute Numbers */}
                        <tr className={`text-[8px] font-black text-slate-600 uppercase tracking-tighter h-6 ${gridBottom}`}>
                             {Array.from({length: 48}).map((_, i) => {
                                const isQuarterEnd = (i+1)%12 === 0 && (i+1) !== 48;
                                return (
                                    <th 
                                        key={i} 
                                        className={`w-8 min-w-[2rem] text-center bg-slate-900 ${isQuarterEnd ? gridBorder : 'border-r border-slate-800/30'}`}
                                    >
                                        {i + 1}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>

                    <TableBody>
                        {posKeys.map(pos => {
                            const players = (groupedRotation as Record<string, Player[]>)[pos];
                            if (!players || players.length === 0) return null;

                            return players.map((p, index) => {
                                const ovr = calculatePlayerOvr(p);
                                const playerMap = (tactics.rotationMap && tactics.rotationMap[p.id]) || Array(48).fill(false);
                                const totalMins = playerMap.filter(Boolean).length;
                                const isRes = pos === 'RES';
                                
                                const condition = p.condition ?? 100;
                                let condColor = 'text-emerald-500';
                                if (condition < 70) condColor = 'text-red-500';
                                else if (condition < 90) condColor = 'text-amber-500';

                                return (
                                    <TableRow key={p.id} className="hover:bg-white/5 group h-9">
                                        {/* Sticky Columns Body Block - Using Box Shadow */}
                                        
                                        {/* Merged Position Cell */}
                                        {index === 0 && (
                                            <td 
                                                rowSpan={players.length} 
                                                className={`sticky left-0 z-30 bg-slate-900 text-center align-middle ${stickyRightShadow} ${stickyBottom}`}
                                            >
                                                <span className={`text-[10px] font-bold tracking-widest ${isRes ? 'text-slate-600' : 'text-slate-500'}`}>
                                                    {String(pos)}
                                                </span>
                                            </td>
                                        )}

                                        {/* Player Name */}
                                        <td 
                                            className={`sticky left-[50px] z-30 bg-slate-900 px-3 cursor-pointer ${stickyRightShadow} ${stickyBottom}`}
                                            onClick={() => onViewPlayer(p)}
                                        >
                                            <span className={`text-xs font-bold truncate block ${isRes ? 'text-slate-500' : 'text-slate-200 group-hover:text-indigo-400'}`}>
                                                {p.name}
                                            </span>
                                        </td>

                                        {/* OVR */}
                                        <td className={`sticky left-[210px] z-30 bg-slate-900 text-center ${stickyRightShadow} ${stickyBottom}`}>
                                            <div className="flex justify-center">
                                                <OvrBadge value={ovr} size="sm" className={`!w-6 !h-6 !text-xs !shadow-none ${isRes ? 'opacity-50 grayscale' : ''}`} />
                                            </div>
                                        </td>
                                        
                                        {/* Condition */}
                                        <td className={`sticky left-[250px] z-30 bg-slate-900 text-center ${stickyRightShadow} ${stickyBottom}`}>
                                            <span className={`text-[10px] font-black ${condColor}`}>
                                                {condition}%
                                            </span>
                                        </td>

                                        {/* Total Minutes */}
                                        <td className={`sticky left-[290px] z-30 bg-slate-900 text-center ${stickyRightShadow} ${stickyBottom}`}>
                                            <span className={`text-xs font-mono font-black ${totalMins > 42 ? 'text-red-500' : (isRes ? 'text-slate-600' : 'text-indigo-400')}`}>
                                                {totalMins}
                                            </span>
                                        </td>

                                        {/* Minute Grid Cells - Transparent Borders */}
                                        {playerMap.map((active, i) => {
                                            const countAtMin = validation?.minuteCounts[i] || 0;
                                            const isError = countAtMin !== 5;
                                            const isQuarterEnd = (i+1)%12 === 0 && (i+1) !== 48;
                                            
                                            return (
                                                <td 
                                                    key={i} 
                                                    onClick={() => handleToggleMinute(p.id, i)}
                                                    className={`
                                                        p-0 cursor-pointer relative transition-all ${gridBottom}
                                                        ${isQuarterEnd ? gridBorder : 'border-r border-slate-800/30'}
                                                        hover:bg-white/10
                                                    `}
                                                >
                                                    {active && (
                                                        <div className={`
                                                            w-full h-full absolute inset-0
                                                            ${isError ? 'bg-red-500/30 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.5)]' : 'bg-emerald-500/30 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.5)]'}
                                                        `}></div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </TableRow>
                                );
                            });
                        })}
                    </TableBody>
                </Table>
            </div>

            {/* Validation Bar */}
            {validation && (validation.under5.length > 0 || validation.over5.length > 0 || validation.over42.length > 0) && (
                <div className="bg-red-500/10 border-t border-red-500/20 px-6 py-2 flex flex-wrap gap-4 items-center animate-in slide-in-from-bottom-2 shrink-0">
                    <AlertCircle size={16} className="text-red-500" />
                    {validation.under5.length > 0 && (
                        <span className="text-[10px] font-bold text-red-400">5명 미만: {validation.under5.length}개 구간</span>
                    )}
                    {validation.over5.length > 0 && (
                        <span className="text-[10px] font-bold text-orange-400">5명 초과: {validation.over5.length}개 구간</span>
                    )}
                    {validation.over42.length > 0 && (
                        <span className="text-[10px] font-bold text-red-500 uppercase">혹사 경고: {validation.over42.join(', ')}</span>
                    )}
                </div>
            )}
        </div>
    );
};
