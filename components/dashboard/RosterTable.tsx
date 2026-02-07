
import React, { useMemo, useState } from 'react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { DepthChartEditor } from './DepthChartEditor';
import { AlertCircle } from 'lucide-react';

interface RosterTableProps {
  mode: 'mine' | 'opponent';
  team: Team;
  opponent?: Team;
  healthySorted: Player[];
  injuredSorted: Player[];
  oppHealthySorted: Player[];
  tactics: GameTactics;
  onUpdateTactics: (t: GameTactics) => void;
  onViewPlayer: (p: Player) => void;
  depthChart?: DepthChart | null; 
  onUpdateDepthChart?: (dc: DepthChart) => void;
}

export const RosterTable: React.FC<RosterTableProps> = ({ 
  mode, team, healthySorted, tactics, onUpdateTactics, onViewPlayer,
  depthChart, onUpdateDepthChart
}) => {
    const [lastSelected, setLastSelected] = useState<{pid: string, min: number} | null>(null);

    // 1. Group Players by Position based on Depth Chart
    const groupedRotation = useMemo(() => {
        if (!depthChart || mode !== 'mine') {
            // Fallback if no depth chart: Just put everyone in a single list or by pos
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
    }, [depthChart, team.roster, healthySorted, mode]);

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
        if (mode !== 'mine') return null;
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
    }, [tactics.rotationMap, team.roster, mode]);

    if (mode === 'opponent') {
        return (
            <div className="p-8 text-slate-500 text-center uppercase oswald tracking-widest py-32">
                상대 전력 데이터는 기록 탭에서 확인 가능합니다.
            </div>
        );
    }

    const posKeys = ['PG', 'SG', 'SF', 'PF', 'C', 'RES'];

    return (
        <div className="flex flex-col h-full bg-slate-950/20 overflow-hidden">
            {/* Header: Depth Chart Editor */}
            <div className="flex-shrink-0 border-b border-white/5">
                <DepthChartEditor 
                    team={team} 
                    tactics={tactics} 
                    depthChart={depthChart || null} 
                    onUpdateDepthChart={onUpdateDepthChart || (() => {})} 
                    onUpdateTactics={onUpdateTactics}
                />
            </div>

            {/* Validation Bar */}
            {validation && (validation.under5.length > 0 || validation.over5.length > 0 || validation.over42.length > 0) && (
                <div className="bg-red-500/10 border-b border-red-500/20 px-8 py-3 flex flex-wrap gap-4 items-center animate-in slide-in-from-top-2">
                    <AlertCircle size={16} className="text-red-500" />
                    {validation.under5.length > 0 && (
                        <span className="text-[10px] font-bold text-red-400 uppercase">인원 부족: {validation.under5[0]}분~</span>
                    )}
                    {validation.over5.length > 0 && (
                        <span className="text-[10px] font-bold text-orange-400 uppercase">인원 초과: {validation.over5[0]}분~</span>
                    )}
                    {validation.over42.length > 0 && (
                        <span className="text-[10px] font-bold text-red-500 uppercase">42분 초과: {validation.over42[0]}</span>
                    )}
                </div>
            )}

            {/* Rotation Grid Table */}
            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left border-separate border-spacing-0">
                    <thead className="sticky top-0 z-30 bg-slate-900 shadow-lg">
                        <tr className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">
                            {/* POS Column */}
                            <th className="py-3 px-0 w-12 text-center border-b border-r border-slate-800 border-white/10 sticky left-0 bg-slate-900 z-40">POS</th>
                            
                            {/* Player Info */}
                            <th className="py-3 px-3 w-[160px] bg-slate-900 border-b border-white/10 sticky left-12 z-40 border-r border-slate-800">PLAYER</th>
                            <th className="py-3 px-1 w-10 text-center border-b border-white/10 sticky left-[calc(3rem+160px)] bg-slate-900 z-40 border-r border-slate-800">OVR</th>
                            <th className="py-3 px-1 w-10 text-center border-b border-white/10 sticky left-[calc(3rem+200px)] bg-slate-900 z-40 border-r border-slate-800">MIN</th>
                            
                            {/* Minutes Header */}
                            {Array.from({length: 48}).map((_, i) => (
                                <th key={i} className={`w-8 min-w-[2rem] text-center border-b border-white/10 text-[8px] ${(i+1)%12 === 0 ? 'border-r border-white/20' : ''}`}>
                                    {i + 1}
                                </th>
                            ))}
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

                                return (
                                    <tr key={p.id} className="hover:bg-white/5 group border-b border-slate-800">
                                        {/* Merged Position Column */}
                                        {index === 0 && (
                                            <td 
                                                rowSpan={players.length} 
                                                className="text-center sticky left-0 bg-slate-900/95 z-20 border-r border-slate-800 align-middle border-b border-slate-800"
                                            >
                                                <span className={`text-[10px] font-bold tracking-widest ${isRes ? 'text-slate-600' : 'text-slate-500'}`}>
                                                    {pos}
                                                </span>
                                            </td>
                                        )}

                                        {/* Name */}
                                        <td className="py-2 px-3 sticky left-12 bg-slate-900/95 z-20 border-r border-slate-800 cursor-pointer" onClick={() => onViewPlayer(p)}>
                                            <span className={`text-xs font-bold truncate block ${isRes ? 'text-slate-500' : 'text-slate-200 group-hover:text-indigo-400'}`}>
                                                {p.name}
                                            </span>
                                        </td>

                                        {/* OVR */}
                                        <td className="text-center sticky left-[calc(3rem+160px)] bg-slate-900/95 z-20 border-r border-slate-800">
                                            <span className={`text-xs font-black font-mono ${isRes ? 'text-slate-600' : 'text-slate-400'}`}>{ovr}</span>
                                        </td>

                                        {/* Total Minutes */}
                                        <td className="text-center sticky left-[calc(3rem+200px)] bg-slate-900/95 z-20 border-r border-slate-800">
                                            <span className={`text-xs font-mono font-black ${totalMins > 42 ? 'text-red-500' : (isRes ? 'text-slate-600' : 'text-indigo-400')}`}>
                                                {totalMins}
                                            </span>
                                        </td>

                                        {/* Minute Grid */}
                                        {playerMap.map((active, i) => {
                                            const countAtMin = validation?.minuteCounts[i] || 0;
                                            const isError = countAtMin !== 5;
                                            
                                            return (
                                                <td 
                                                    key={i} 
                                                    onClick={() => handleToggleMinute(p.id, i)}
                                                    className={`
                                                        h-8 w-8 min-w-[2rem] border-l border-white/5 cursor-pointer transition-all relative
                                                        ${(i+1)%12 === 0 ? 'border-r border-white/20' : ''}
                                                        hover:bg-white/10
                                                    `}
                                                >
                                                    {active && (
                                                        <div className={`
                                                            absolute inset-1 rounded-md shadow-sm
                                                            ${isError ? 'bg-red-500/80' : 'bg-emerald-500'}
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
        </div>
    );
};
