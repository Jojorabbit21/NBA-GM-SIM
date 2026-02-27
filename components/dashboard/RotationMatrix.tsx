
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';
import { AlertCircle, RotateCcw, ChevronDown } from 'lucide-react';
import { Table, TableBody, TableRow } from '../common/Table';

interface RotationMatrixProps {
    team: Team;
    tactics: GameTactics;
    depthChart: DepthChart | null;
    healthySorted: Player[];
    onUpdateTactics: (t: GameTactics) => void;
    onViewPlayer: (p: Player) => void;
}

type AllocationMode = 'Overwork' | 'Balanced' | 'Socialist';

export const RotationMatrix: React.FC<RotationMatrixProps> = ({
    team,
    tactics,
    depthChart,
    healthySorted,
    onUpdateTactics,
    onViewPlayer
}) => {
    const [lastSelected, setLastSelected] = useState<{pid: string, min: number} | null>(null);
    const [isAiDropdownOpen, setIsAiDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsAiDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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

    const handleAllocation = (mode: AllocationMode) => {
        if (!depthChart) return;
        const newMap: Record<string, boolean[]> = {};
        const positions: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
        
        team.roster.forEach(p => { newMap[p.id] = Array(48).fill(false); });

        // Helper to fill minutes (1-based start/end to 0-based index)
        const fill = (id: string, start: number, end: number) => {
            if (!newMap[id]) newMap[id] = Array(48).fill(false);
            for (let i = start - 1; i < end; i++) newMap[id][i] = true;
        };

        positions.forEach(pos => {
            const starterId = depthChart[pos][0];
            const benchId = depthChart[pos][1];
            const thirdId = depthChart[pos][2];

            if (mode === 'Overwork') {
                // 주전 혹사 (36분 / 12분)
                if (starterId) {
                    fill(starterId, 1, 12);
                    fill(starterId, 19, 24);
                    fill(starterId, 25, 36);
                    fill(starterId, 43, 48);
                }
                if (benchId) {
                    fill(benchId, 13, 18);
                    fill(benchId, 37, 42);
                } else if (starterId) {
                    // Fallback: No bench, Starter plays bench minutes
                    fill(starterId, 13, 18);
                    fill(starterId, 37, 42);
                }
            } else if (mode === 'Balanced') {
                // 균형 분배 (26분 / 18분 / 4분)
                if (starterId) {
                    fill(starterId, 1, 8);
                    fill(starterId, 21, 24);
                    fill(starterId, 25, 32);
                    fill(starterId, 43, 48);
                }
                if (benchId) {
                    fill(benchId, 9, 12);
                    fill(benchId, 17, 20);
                    fill(benchId, 33, 36);
                    fill(benchId, 37, 42);
                }
                
                // Third handling
                if (thirdId) {
                    fill(thirdId, 13, 16);
                } else if (starterId) {
                    // Fallback: No third, Starter gets third's minutes
                    fill(starterId, 13, 16);
                }
                
                // Safety Fallback if no bench
                if (starterId && !benchId) {
                    fill(starterId, 9, 12);
                    fill(starterId, 17, 20);
                    fill(starterId, 33, 36);
                    fill(starterId, 37, 42);
                }
            } else if (mode === 'Socialist') {
                // 공산 농구 (20분 / 16분 / 12분)
                if (starterId) {
                    fill(starterId, 1, 6);
                    fill(starterId, 21, 24);
                    fill(starterId, 25, 30);
                    fill(starterId, 45, 48);
                }
                if (benchId) {
                    fill(benchId, 7, 10);
                    fill(benchId, 13, 16);
                    fill(benchId, 31, 34);
                    fill(benchId, 37, 40);
                }

                // Third handling with specific fallback split
                if (thirdId) {
                    fill(thirdId, 11, 12);
                    fill(thirdId, 17, 20);
                    fill(thirdId, 35, 36);
                    fill(thirdId, 41, 44);
                } else {
                    // Fallback: No third
                    // 17~20, 41~44 to Starter
                    if (starterId) {
                        fill(starterId, 17, 20);
                        fill(starterId, 41, 44);
                    }
                    // 11~12, 35~36 to Bench
                    if (benchId) {
                        fill(benchId, 11, 12);
                        fill(benchId, 35, 36);
                    } else if (starterId) {
                        // If no bench either, starter takes these too
                        fill(starterId, 11, 12);
                        fill(starterId, 35, 36);
                    }
                }
                
                // Safety Fallback if no bench
                if (starterId && !benchId) {
                    fill(starterId, 7, 10);
                    fill(starterId, 13, 16);
                    fill(starterId, 31, 34);
                    fill(starterId, 37, 40);
                }
            }
        });

        onUpdateTactics({ ...tactics, rotationMap: newMap });
        setIsAiDropdownOpen(false);
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

    const handleResetPlayer = (playerId: string) => {
        const currentMap = tactics.rotationMap || {};
        const newMap = { ...currentMap, [playerId]: Array(48).fill(false) };
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
             <div className="px-6 py-4 bg-slate-800 border-t border-slate-700 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
                 <div className="flex items-center gap-3">
                    <span className="text-base font-black text-white uppercase tracking-widest oswald">로테이션 차트</span>
                 </div>
                 
                 <div className="flex gap-2">
                    <div className="relative flex shadow-md group" ref={dropdownRef}>
                        <button 
                            onClick={() => handleAllocation('Overwork')}
                            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-l-lg transition-all text-xs font-bold uppercase tracking-wider active:scale-95 border-r border-indigo-700/50"
                        >
                            <span>코치에게 위임</span>
                        </button>
                        <button 
                            onClick={() => setIsAiDropdownOpen(!isAiDropdownOpen)}
                            className={`px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-r-lg transition-all active:bg-indigo-700 ${isAiDropdownOpen ? 'bg-indigo-700' : ''}`}
                        >
                            <ChevronDown size={14} className={`transition-transform duration-200 ${isAiDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isAiDropdownOpen && (
                            <div className="absolute top-full right-0 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                <div className="p-1">
                                    <button 
                                        onClick={() => handleAllocation('Overwork')}
                                        className="w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-all flex flex-col gap-0.5"
                                    >
                                        <span>주전 혹사 (기본)</span>
                                        <span className="text-[9px] text-slate-500 font-normal">주전 36분 / 벤치 12분</span>
                                    </button>
                                    <button 
                                        onClick={() => handleAllocation('Balanced')}
                                        className="w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-all flex flex-col gap-0.5"
                                    >
                                        <span>균형 분배</span>
                                        <span className="text-[9px] text-slate-500 font-normal">주전 26분 / 벤치 18분 / 써드 4분</span>
                                    </button>
                                    <button 
                                        onClick={() => handleAllocation('Socialist')}
                                        className="w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-all flex flex-col gap-0.5"
                                    >
                                        <span>공산 농구</span>
                                        <span className="text-[9px] text-slate-500 font-normal">주전 20분 / 벤치 16분 / 써드 12분</span>
                                    </button>
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

            <div className="flex-1 min-h-0">
                <Table className="!rounded-none !border-t-0 border-x-0 border-b-0 shadow-none">
                    <thead className={`${stickyHeaderBg} sticky top-0 z-50`}>
                        <tr className="text-[9px] font-black text-slate-500 uppercase tracking-tighter h-8">
                            <th rowSpan={2} className={`sticky left-0 z-50 ${stickyHeaderBg} ${stickyBorder} ${stickyBottom} w-[50px] min-w-[50px] text-center !rounded-none`}>POS</th>
                            <th rowSpan={2} className={`sticky left-[50px] z-50 ${stickyHeaderBg} ${stickyBorder} ${stickyBottom} w-[160px] min-w-[160px] text-left px-3 !rounded-none`}>PLAYER</th>
                            <th rowSpan={2} className={`sticky left-[210px] z-50 ${stickyHeaderBg} ${stickyBorder} ${stickyBottom} w-[40px] min-w-[40px] text-center !rounded-none`}>OVR</th>
                            <th rowSpan={2} className={`sticky left-[250px] z-50 ${stickyHeaderBg} ${stickyBorder} ${stickyBottom} w-[55px] min-w-[55px] text-center !rounded-none`}>COND</th>
                            <th rowSpan={2} className={`sticky left-[305px] z-50 ${stickyHeaderBg} border-r-2 border-r-indigo-500/50 ${stickyBottom} w-[40px] min-w-[40px] text-center shadow-[4px_0_12px_rgba(0,0,0,0.5)] !rounded-none`}>MIN</th>
                            <th colSpan={12} className={`text-center ${stickyHeaderBg} text-slate-400 ${quarterDivider} border-b border-slate-800 !rounded-none`}>1Q</th>
                            <th colSpan={12} className={`text-center ${stickyHeaderBg} text-slate-400 ${quarterDivider} border-b border-slate-800 !rounded-none`}>2Q</th>
                            <th colSpan={12} className={`text-center ${stickyHeaderBg} text-slate-400 ${quarterDivider} border-b border-slate-800 !rounded-none`}>3Q</th>
                            <th colSpan={12} className={`text-center ${stickyHeaderBg} text-slate-400 ${stickyBottom} !rounded-none`}>4Q</th>
                        </tr>
                        <tr className={`text-xs font-black text-slate-600 uppercase tracking-tighter h-6 ${gridBottom}`}>
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
                                const cond = Math.round(p.condition || 100);
                                const delta = p.conditionDelta;

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
                                            <div className="flex items-center justify-center gap-1">
                                                <span className={`text-xs font-mono font-semibold ${cond < 70 ? 'text-red-500' : cond < 90 ? 'text-amber-500' : 'text-emerald-500'}`}>{cond}</span>
                                                {delta !== undefined && delta !== 0 && (
                                                    <span className={`text-[9px] font-bold ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {delta > 0 ? '+' : ''}{delta}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className={`sticky left-[305px] z-30 ${stickyBodyBg} text-center align-middle border-r-2 border-r-indigo-500/50 ${stickyBottom} shadow-[4px_0_12px_rgba(0,0,0,0.5)]`}>
                                            <div className="relative flex items-center justify-center h-full">
                                                <span className={`text-xs font-mono font-semibold ${getMinColor(totalMins)} group-hover:opacity-0 transition-opacity`}>{totalMins}</span>
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
