
import React, { useMemo, useState } from 'react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { getOvrBadgeStyle } from '../SharedComponents';
import { AlertCircle, Timer } from 'lucide-react';

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
    
    // [Design Update] Quarter borders are now thinner (border-r instead of border-r-2) and Slate-600
    const quarterBorder = "border-r border-slate-600"; 
    const headerBottomBorder = "border-b border-slate-600";

    return (
        <div className="flex flex-col h-full bg-slate-950/20 overflow-hidden">
             {/* Rotation Chart Title */}
             {/* [Design Update] Added top indigo border to distinguish from depth chart */}
             <div className="px-6 py-4 bg-slate-900 border-t-2 border-t-indigo-500 border-b border-slate-800 flex items-center gap-3 flex-shrink-0">
                 <Timer size={20} className="text-indigo-400"/>
                 <span className="text-base font-black text-white uppercase tracking-widest oswald">로테이션 차트</span>
            </div>

            {/* Rotation Grid Table */}
            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left border-separate border-spacing-0">
                    <thead className="sticky top-0 z-30 bg-slate-900 shadow-lg">
                        {/* 1st Header Row: Sticky Info & Quarter Labels */}
                        <tr className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">
                            {/* Sticky Left Columns (RowSpan 2) */}
                            {/* [Design Update] Changed border colors to slate-600 and width to 1px */}
                            {/* Widths: POS(50) + PLAYER(160) + OVR(40) + COND(40) = 290px -> MIN starts at 290px */}
                            
                            <th rowSpan={2} className={`py-3 px-0 w-[50px] min-w-[50px] max-w-[50px] text-center ${headerBottomBorder} border-r border-slate-800 sticky left-0 bg-slate-900 z-40`}>POS</th>
                            
                            <th rowSpan={2} className={`py-3 px-3 w-[160px] min-w-[160px] max-w-[160px] bg-slate-900 ${headerBottomBorder} sticky left-[50px] z-40 border-r border-slate-800`}>PLAYER</th>
                            
                            <th rowSpan={2} className={`py-3 px-1 w-[40px] min-w-[40px] max-w-[40px] text-center ${headerBottomBorder} border-slate-800 sticky left-[210px] bg-slate-900 z-40 border-r border-slate-800`}>OVR</th>
                            
                            {/* [NEW] COND Column */}
                            <th rowSpan={2} className={`py-3 px-1 w-[40px] min-w-[40px] max-w-[40px] text-center ${headerBottomBorder} border-slate-800 sticky left-[250px] bg-slate-900 z-40 border-r border-slate-800`}>COND</th>
                            
                            {/* MIN Column - Shifted Left to 290px */}
                            <th rowSpan={2} className={`py-3 px-1 w-[40px] min-w-[40px] max-w-[40px] text-center ${headerBottomBorder} border-slate-800 sticky left-[290px] bg-slate-900 z-40 ${quarterBorder}`}>MIN</th>
                            
                            {/* Quarter Headers */}
                            <th colSpan={12} className={`text-center py-1 bg-slate-800/50 text-slate-400 border-b border-slate-700 ${quarterBorder}`}>1Q</th>
                            <th colSpan={12} className={`text-center py-1 bg-slate-800/50 text-slate-400 border-b border-slate-700 ${quarterBorder}`}>2Q</th>
                            <th colSpan={12} className={`text-center py-1 bg-slate-800/50 text-slate-400 border-b border-slate-700 ${quarterBorder}`}>3Q</th>
                            <th colSpan={12} className="text-center py-1 bg-slate-800/50 text-slate-400 border-b border-slate-800">4Q</th>
                        </tr>
                        {/* 2nd Header Row: Minutes */}
                        <tr className={`text-[8px] font-black text-slate-600 uppercase tracking-tighter bg-slate-900 ${headerBottomBorder}`}>
                             {Array.from({length: 48}).map((_, i) => {
                                const isQuarterEnd = (i+1)%12 === 0 && (i+1) !== 48;
                                return (
                                    <th 
                                        key={i} 
                                        className={`w-8 min-w-[2rem] h-6 text-center ${headerBottomBorder} ${isQuarterEnd ? quarterBorder : 'border-r border-r-slate-800/50'}`}
                                    >
                                        {i + 1}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {posKeys.map(pos => {
                            const players = groupedRotation[pos];
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
                                    <tr key={p.id} className="hover:bg-white/5 group border-b border-slate-800">
                                        {/* Merged Position Column */}
                                        {index === 0 && (
                                            <td 
                                                rowSpan={players.length} 
                                                className="text-center sticky left-0 bg-slate-900/95 z-20 border-r border-slate-800 align-middle border-b border-slate-800 w-[50px] min-w-[50px] max-w-[50px]"
                                            >
                                                <span className={`text-[10px] font-bold tracking-widest ${isRes ? 'text-slate-600' : 'text-slate-500'}`}>
                                                    {pos}
                                                </span>
                                            </td>
                                        )}

                                        {/* Name */}
                                        <td className="py-2 px-3 sticky left-[50px] bg-slate-900/95 z-20 border-r border-slate-800 border-b border-slate-800 cursor-pointer w-[160px] min-w-[160px] max-w-[160px]" onClick={() => onViewPlayer(p)}>
                                            <span className={`text-xs font-bold truncate block ${isRes ? 'text-slate-500' : 'text-slate-200 group-hover:text-indigo-400'}`}>
                                                {p.name}
                                            </span>
                                        </td>

                                        {/* OVR - Font Size Increased to text-xs */}
                                        <td className="text-center sticky left-[210px] bg-slate-900/95 z-20 border-r border-slate-800 border-b border-slate-800 w-[40px] min-w-[40px] max-w-[40px]">
                                            <div className={`${getOvrBadgeStyle(ovr)} !w-6 !h-6 !text-xs !rounded-md !shadow-none ${isRes ? 'opacity-50 grayscale' : ''}`}>
                                                {ovr}
                                            </div>
                                        </td>
                                        
                                        {/* [NEW] COND */}
                                        <td className="text-center sticky left-[250px] bg-slate-900/95 z-20 border-r border-slate-800 border-b border-slate-800 w-[40px] min-w-[40px] max-w-[40px]">
                                            <span className={`text-[10px] font-black ${condColor}`}>
                                                {condition}%
                                            </span>
                                        </td>

                                        {/* Total Minutes (Sticky pos shifted) */}
                                        <td className={`text-center sticky left-[290px] bg-slate-900/95 z-20 border-b border-slate-800 w-[40px] min-w-[40px] max-w-[40px] ${quarterBorder}`}>
                                            <span className={`text-xs font-mono font-black ${totalMins > 42 ? 'text-red-500' : (isRes ? 'text-slate-600' : 'text-indigo-400')}`}>
                                                {totalMins}
                                            </span>
                                        </td>

                                        {/* Minute Grid */}
                                        {playerMap.map((active, i) => {
                                            const countAtMin = validation?.minuteCounts[i] || 0;
                                            const isError = countAtMin !== 5;
                                            // 12, 24, 36 min separators (Not 48)
                                            const isQuarterEnd = (i+1)%12 === 0 && (i+1) !== 48;
                                            
                                            return (
                                                <td 
                                                    key={i} 
                                                    onClick={() => handleToggleMinute(p.id, i)}
                                                    className={`
                                                        h-8 w-8 min-w-[2rem] cursor-pointer transition-all relative border-b border-b-slate-800
                                                        ${isQuarterEnd ? quarterBorder : 'border-r border-r-slate-800/50'}
                                                        hover:bg-white/10
                                                    `}
                                                >
                                                    {active && (
                                                        <div className={`
                                                            absolute inset-0
                                                            ${isError 
                                                                ? 'bg-red-500/20' 
                                                                : 'bg-emerald-500/20'}
                                                        `}></div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            });
                        })}
                    </tbody>
                </table>
            </div>

            {/* Validation Bar - Moved to Bottom */}
            {validation && (validation.under5.length > 0 || validation.over5.length > 0 || validation.over42.length > 0) && (
                <div className="bg-red-500/10 border-t border-red-500/20 px-8 py-3 flex flex-wrap gap-4 items-center animate-in slide-in-from-bottom-2">
                    <AlertCircle size={20} className="text-red-500" />
                    {validation.under5.length > 0 && (
                        <span className="text-xs font-bold text-red-400">출전 선수가 5명 미만인 구간이 있습니다.</span>
                    )}
                    {validation.over5.length > 0 && (
                        <span className="text-xs font-bold text-orange-400">출전 선수가 5명 이상인 구간이 있습니다.</span>
                    )}
                    {validation.over42.length > 0 && (
                        <span className="text-xs font-bold text-red-500 uppercase">42분 초과: {validation.over42[0]}</span>
                    )}
                </div>
            )}
        </div>
    );
};
