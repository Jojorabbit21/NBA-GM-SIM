
import React, { useMemo, useState } from 'react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { getOvrBadgeStyle } from '../SharedComponents';
import { DepthChartEditor } from './DepthChartEditor';
import { AlertCircle, ChevronRight, UserMinus } from 'lucide-react';

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

    // 1. Determine Row Order based on Depth Chart (PG1, PG2, PG3, SG1...)
    const rotationRows = useMemo(() => {
        if (!depthChart || mode !== 'mine') return healthySorted;
        const pids: string[] = [];
        const posOrder: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
        
        posOrder.forEach(pos => {
            depthChart[pos].forEach(id => {
                if (id && !pids.includes(id)) {
                    const p = team.roster.find(rp => rp.id === id);
                    if (p && p.health !== 'Injured') pids.push(id);
                }
            });
        });
        
        return pids.map(id => team.roster.find(p => p.id === id)!);
    }, [depthChart, team.roster, healthySorted, mode]);

    const handleToggleMinute = (playerId: string, minute: number) => {
        const newMap = { ...tactics.rotationMap };
        if (!newMap[playerId]) newMap[playerId] = Array(48).fill(false);
        const playerMap = [...newMap[playerId]];

        const quarter = Math.floor(minute / 12);
        const qStart = quarter * 12;
        const qEnd = qStart + 11;

        // Range Selection Logic (within same quarter)
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

        Object.entries(tactics.rotationMap).forEach(([pid, map]) => {
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
                <div className="bg-red-500/10 border-b border-red-500/20 px-8 py-3 flex flex-wrap gap-4 items-center">
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
                    <thead className="sticky top-0 z-30 bg-slate-900 shadow-md">
                        <tr className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">
                            <th className="py-3 px-6 w-[180px] bg-slate-900 border-b border-white/10 sticky left-0 z-40">선수 (뎁스순)</th>
                            <th className="py-3 px-1 w-10 text-center border-b border-white/10">OVR</th>
                            {/* Minutes Header */}
                            {Array.from({length: 48}).map((_, i) => (
                                <th key={i} className={`w-6 text-center border-b border-white/10 text-[8px] ${(i+1)%12 === 0 ? 'border-r border-white/20' : ''}`}>
                                    {i + 1}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {rotationRows.map(p => {
                            const ovr = calculatePlayerOvr(p);
                            const playerMap = tactics.rotationMap[p.id] || Array(48).fill(false);
                            const totalMins = playerMap.filter(Boolean).length;

                            return (
                                <tr key={p.id} className="hover:bg-white/5 group">
                                    <td className="py-2 px-6 sticky left-0 bg-slate-900 z-20 shadow-lg border-r border-white/5 cursor-pointer" onClick={() => onViewPlayer(p)}>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-slate-200 group-hover:text-indigo-400 truncate">{p.name}</span>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[8px] text-slate-500 font-black">{p.position}</span>
                                                <span className={`text-[10px] font-mono font-black ${totalMins > 42 ? 'text-red-500' : 'text-indigo-400'}`}>{totalMins}m</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="text-center">
                                        <div className={getOvrBadgeStyle(ovr) + " !w-6 !h-6 !text-[10px]"}>{ovr}</div>
                                    </td>
                                    {playerMap.map((active, i) => {
                                        const countAtMin = validation?.minuteCounts[i] || 0;
                                        const isError = countAtMin !== 5;
                                        
                                        return (
                                            <td 
                                                key={i} 
                                                onClick={() => handleToggleMinute(p.id, i)}
                                                className={`
                                                    h-10 w-6 border-l border-white/5 cursor-pointer transition-all relative
                                                    ${active ? (isError ? 'bg-red-500/40' : 'bg-indigo-500/60') : 'hover:bg-white/10'}
                                                    ${(i+1)%12 === 0 ? 'border-r border-white/20' : ''}
                                                `}
                                            >
                                                {active && <div className="absolute inset-1 bg-white/20 rounded-sm"></div>}
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
