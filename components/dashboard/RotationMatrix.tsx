
import React, { useMemo, useState } from 'react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';
import { AlertCircle, RotateCcw, Wand2 } from 'lucide-react';
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

    const groupedRotation = useMemo(() => {
        if (!depthChart) return { 'ALL': healthySorted };
        const groups: Record<string, Player[]> = { 'PG': [], 'SG': [], 'SF': [], 'PF': [], 'C': [], 'RES': [] };
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

    const handleAutoAllocation = () => {
        if (!depthChart) return;
        const newMap: Record<string, boolean[]> = {};
        const positions: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
        
        team.roster.forEach(p => { newMap[p.id] = Array(48).fill(false); });

        positions.forEach(pos => {
            const starterId = depthChart[pos][0];
            const benchId = depthChart[pos][1];

            if (starterId && newMap[starterId]) {
                const map = newMap[starterId];
                for (let i = 0; i <= 8; i++) map[i] = true;
                for (let i = 16; i <= 32; i++) map[i] = true;
                for (let i = 40; i <= 47; i++) map[i] = true;
            }

            if (benchId && newMap[benchId]) {
                const map = newMap[benchId];
                for (let i = 9; i <= 15; i++) map[i] = true;
                for (let i = 33; i <= 39; i++) map[i] = true;
            } else if (starterId && !benchId) {
                newMap[starterId] = Array(48).fill(true);
            }
        });

        onUpdateTactics({ ...tactics, rotationMap: newMap });
    };

    const handleToggleMinute = (playerId: string, minute: number) => {
        const currentMap = tactics.rotationMap || {};
        const newMap = { ...currentMap };
        if (!newMap[playerId]) newMap[playerId] = Array(48).fill(false);
        const playerMap = [...newMap[playerId]];
        const quarter = Math.floor(minute / 12);
        
        if (lastSelected && lastSelected.pid === playerId && Math.floor(lastSelected.min / 12) === quarter && lastSelected.min !== minute) {
            const start = Math.min(lastSelected.min, minute);
            const end = Math.max(lastSelected.min, minute);
            const targetVal = !playerMap[minute];
            for (let i = start; i <= end; i++) playerMap[i] = targetVal;
            setLastSelected(null);
        } else {
            playerMap[minute] = !playerMap[minute];
            setLastSelected({ pid: playerId, min: minute });
        }
        newMap[playerId] = playerMap;
        onUpdateTactics({ ...tactics, rotationMap: newMap });
    };

    const handleResetRotation = () => {
        if (!window.confirm("로테이션 설정을 전부 초기화하시겠습니까?")) return;
        const newMap: Record<string, boolean[]> = {};
        team.roster.forEach(p => { newMap[p.id] = Array(48).fill(false); });
        onUpdateTactics({ ...tactics, rotationMap: newMap });
    };

    const validation = useMemo(() => {
        const minuteCounts = Array(48).fill(0);
        const over42: string[] = [];
        const under5: number[] = [];
        const over5: number[] = [];
        const mapData = tactics.rotationMap || {};
        Object.entries(mapData).forEach(([pid, map]) => {
            if (map.filter(Boolean).length > 42) over42.push(team.roster.find(p => p.id === pid)?.name || pid);
            map.forEach((active, i) => { if (active) minuteCounts[i]++; });
        });
        minuteCounts.forEach((count, i) => {
            if (count < 5) under5.push(i + 1);
            else if (count > 5) over5.push(i + 1);
        });
        return { over42, under5, over5, minuteCounts };
    }, [tactics.rotationMap, team.roster]);

    const posKeys = ['PG', 'SG', 'SF', 'PF', 'C', 'RES'];
    const stickyHeaderBg = "bg-slate-950";
    const stickyBodyBg = "bg-slate-900"; 
    const stickyBorder = "border-r border-slate-800"; 
    const stickyBottom = "border-b border-slate-800";
    const gridBorder = "border-r border-slate-800/50"; 
    const gridBottom = "border-b border-slate-800/50";
    // [Update] Increased visibility for quarter dividers (2px width, stronger color)
    const quarterDivider = "!border-r-2 !border-r-indigo-500/50"; 

    const getMinColor = (mins: number) => {
        if (mins === 0) return 'text-slate-600';
        if (mins > 42) return 'text-red-500';
        if (mins > 34) return 'text-amber-500';
        if (mins > 20) return 'text-indigo-400';
        return 'text-emerald-400';
    };

    return (
        <div className="flex flex-col h-full bg-slate-950/20 overflow-hidden">
             <div className="px-6 py-4 bg-slate-800 border-t-2 border-t-indigo-500 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
                 <div className="flex items-center gap-3">
                    <span className="text-base font-black text-white uppercase tracking-widest oswald">로테이션 차트</span>
                 </div>
                 
                 <div className="flex gap-2">
                    <button 
                        onClick={handleAutoAllocation}
                        className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all text-xs font-bold uppercase tracking-wider shadow-md active:scale-95"
                    >
                        <Wand2 size={14} />
                        <span>AI 자동 배분</span>
                    </button>
                    <button 
                        onClick={handleResetRotation}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg transition-all text-xs font-bold uppercase tracking-wider shadow-sm active:scale-95"
                    >
                        <RotateCcw size={14} />
                        <span>초기화</span>
                    </button>
                 </div>
            </div>

            <div className="flex-1 min-h-0">
                <Table className="!rounded-none !border-t-0 border-x-0 border-b-0 shadow-none" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                    <thead className={`${stickyHeaderBg} sticky top-0 z-50`}>
                        <tr className="text-[9px] font-black text-slate-500 uppercase tracking-tighter h-8">
                            <th rowSpan={2} className={`sticky left-0 z-50 ${stickyHeaderBg} ${stickyBorder} ${stickyBottom} w-[50px] min-w-[50px] text-center !rounded-none`}>POS</th>
                            <th rowSpan={2} className={`sticky left-[50px] z-50 ${stickyHeaderBg} ${stickyBorder} ${stickyBottom} w-[160px] min-w-[160px] text-left px-3 !rounded-none`}>PLAYER</th>
                            <th rowSpan={2} className={`sticky left-[210px] z-50 ${stickyHeaderBg} ${stickyBorder} ${stickyBottom} w-[40px] min-w-[40px] text-center !rounded-none`}>OVR</th>
                            <th rowSpan={2} className={`sticky left-[250px] z-50 ${stickyHeaderBg} ${stickyBorder} ${stickyBottom} w-[40px] min-w-[40px] text-center !rounded-none`}>COND</th>
                            <th rowSpan={2} className={`sticky left-[290px] z-50 ${stickyHeaderBg} ${stickyBottom} w-[50px] min-w-[50px] text-center shadow-[4px_0_12px_rgba(0,0,0,0.5)] !rounded-none`}>MIN</th>
                            <th colSpan={12} className={`text-center ${stickyHeaderBg} text-slate-400 ${quarterDivider} border-b border-slate-800 !rounded-none`}>1Q</th>
                            <th colSpan={12} className={`text-center ${stickyHeaderBg} text-slate-400 ${quarterDivider} border-b border-slate-800 !rounded-none`}>2Q</th>
                            <th colSpan={12} className={`text-center ${stickyHeaderBg} text-slate-400 ${quarterDivider} border-b border-slate-800 !rounded-none`}>3Q</th>
                            <th colSpan={12} className={`text-center ${stickyHeaderBg} text-slate-400 ${stickyBottom} !rounded-none`}>4Q</th>
                        </tr>
                        <tr className={`text-[10px] font-black text-slate-600 uppercase tracking-tighter h-6 ${gridBottom}`}>
                             {Array.from({length: 48}).map((_, i) => (
                                <th key={i} className={`w-8 min-w-[2rem] text-center ${stickyHeaderBg} ${(i+1)%12 === 0 && (i+1) !== 48 ? quarterDivider : 'border-r border-slate-800/30'} !rounded-none`}>{i + 1}</th>
                            ))}
                        </tr>
                    </thead>
                    <TableBody>
                        {posKeys.map(pos => {
                            const players = (groupedRotation as any)[pos];
                            if (!players || players.length === 0) return null;
                            return players.map((p: Player, index: number) => {
                                const playerMap = (tactics.rotationMap && tactics.rotationMap[p.id]) || Array(48).fill(false);
                                const totalMins = playerMap.filter(Boolean).length;
                                return (
                                    <TableRow key={p.id} className="hover:bg-white/5 group h-9">
                                        {index === 0 && (
                                            <td rowSpan={players.length} className={`sticky left-0 z-30 ${stickyBodyBg} text-center align-middle ${stickyBorder} ${stickyBottom}`}>
                                                <span className="text-[10px] font-bold tracking-widest text-slate-500">{String(pos)}</span>
                                            </td>
                                        )}
                                        <td className={`sticky left-[50px] z-30 ${stickyBodyBg} px-3 cursor-pointer ${stickyBorder} ${stickyBottom}`} onClick={() => onViewPlayer(p)}>
                                            <span className={`text-xs font-semibold truncate block ${pos === 'RES' ? 'text-slate-500' : 'text-slate-200 group-hover:text-indigo-400'}`}>{p.name}</span>
                                        </td>
                                        <td className={`sticky left-[210px] z-30 ${stickyBodyBg} text-center ${stickyBorder} ${stickyBottom}`}>
                                            <div className="flex justify-center"><OvrBadge value={calculatePlayerOvr(p)} size="sm" className="!w-6 !h-6 !text-xs !shadow-none" /></div>
                                        </td>
                                        <td className={`sticky left-[250px] z-30 ${stickyBodyBg} text-center ${stickyBorder} ${stickyBottom}`}>
                                            <span className={`text-xs font-semibold ${(p.condition || 100) < 70 ? 'text-red-500' : (p.condition || 100) < 90 ? 'text-amber-500' : 'text-emerald-500'}`}>{Math.round(p.condition || 100)}</span>
                                        </td>
                                        <td className={`sticky left-[290px] z-30 ${stickyBodyBg} text-center ${stickyBottom} shadow-[4px_0_12px_rgba(0,0,0,0.5)]`}>
                                            <span className={`text-xs font-mono font-semibold ${getMinColor(totalMins)}`}>{totalMins}</span>
                                        </td>
                                        {playerMap.map((active: boolean, i: number) => (
                                            <td key={i} onClick={() => handleToggleMinute(p.id, i)} className={`p-0 cursor-pointer relative transition-all ${gridBottom} ${(i+1)%12 === 0 && (i+1) !== 48 ? quarterDivider : 'border-r border-slate-800/30'} hover:bg-white/10`}>
                                                {active && <div className={`w-full h-full absolute inset-0 ${validation?.minuteCounts[i] !== 5 ? 'bg-red-500/30 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.5)]' : 'bg-emerald-500/30 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.5)]'}`}></div>}
                                            </td>
                                        ))}
                                    </TableRow>
                                );
                            });
                        })}
                    </TableBody>
                </Table>
            </div>
            {validation && (validation.under5.length > 0 || validation.over5.length > 0 || validation.over42.length > 0) && (
                <div className="bg-red-500/10 border-t border-red-500/20 px-6 py-2 flex flex-wrap gap-4 items-center animate-in slide-in-from-bottom-2 shrink-0">
                    <AlertCircle size={16} className="text-red-500" />
                    {validation.under5.length > 0 && <span className="text-[10px] font-bold text-red-400">5명 미만: {validation.under5.length}개 구간</span>}
                    {validation.over5.length > 0 && <span className="text-[10px] font-bold text-orange-400">5명 초과: {validation.over5.length}개 구간</span>}
                    {validation.over42.length > 0 && <span className="text-[10px] font-bold text-red-500 uppercase">혹사 경고: {validation.over42.join(', ')}</span>}
                </div>
            )}
        </div>
    );
};
