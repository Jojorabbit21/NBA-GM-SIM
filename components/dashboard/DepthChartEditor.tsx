
import React, { useEffect, useState, useRef } from 'react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';

interface DepthChartEditorProps {
    team: Team;
    tactics: GameTactics;
    depthChart: DepthChart | null;
    onUpdateDepthChart: (dc: DepthChart) => void;
    onUpdateTactics: (t: GameTactics) => void;
}

type AutoFillMode = 'Ability' | 'Stamina';

const DepthChartEditorInner: React.FC<DepthChartEditorProps> = ({
    team,
    tactics,
    depthChart,
    onUpdateDepthChart,
    onUpdateTactics
}) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!depthChart) {
            const initialChart: DepthChart = {
                PG: [tactics.starters.PG || null, null, null],
                SG: [tactics.starters.SG || null, null, null],
                SF: [tactics.starters.SF || null, null, null],
                PF: [tactics.starters.PF || null, null, null],
                C:  [tactics.starters.C || null, null, null],
            };
            onUpdateDepthChart(initialChart);
        }
    }, [depthChart, tactics.starters, onUpdateDepthChart]);

    // Comparator for Ability First Logic
    const compareByAbility = (a: Player, b: Player, pos: string) => {
        const ovrDiff = calculatePlayerOvr(b) - calculatePlayerOvr(a);
        if (ovrDiff !== 0) return ovrDiff;

        // Tie-breaker based on position specific stats
        if (pos === 'PG') return b.plm - a.plm;
        if (pos === 'SG' || pos === 'SF') return b.out - a.out;
        if (pos === 'PF' || pos === 'C') return b.ins - a.ins;
        return 0;
    };

    const handleAutoFill = (mode: AutoFillMode) => {
        const usedIds = new Set<string>();
        const positions: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
        
        const newChart: DepthChart = {
            PG: [null, null, null], SG: [null, null, null], SF: [null, null, null],
            PF: [null, null, null], C: [null, null, null]
        };

        // Helper to get candidates for a position
        const getCandidates = (pos: string) => {
            return team.roster.filter(p => 
                p.health !== 'Injured' && 
                p.position.includes(pos) && 
                !usedIds.has(p.id)
            );
        };

        positions.forEach(pos => {
            let candidates = getCandidates(pos);

            if (mode === 'Ability') {
                // Sort by Ability
                candidates.sort((a, b) => compareByAbility(a, b, pos));
                
                // Assign Top 3
                for (let depth = 0; depth < 3; depth++) {
                    if (candidates[depth]) {
                        newChart[pos][depth] = candidates[depth].id;
                        usedIds.add(candidates[depth].id);
                    }
                }
            } else if (mode === 'Stamina') {
                // Filter out exhausted players (< 20)
                candidates = candidates.filter(p => (p.condition ?? 100) >= 20);

                // Split into Starter Candidates (>= 70) and Reserves
                const starterPool = candidates.filter(p => (p.condition ?? 100) >= 70).sort((a, b) => compareByAbility(a, b, pos));
                const reservePool = candidates.filter(p => (p.condition ?? 100) < 70).sort((a, b) => compareByAbility(a, b, pos));
                
                // 1. Assign Starter (Depth 0)
                let starter = starterPool.shift(); // Take best condition+ability player
                if (!starter && reservePool.length > 0) {
                    // Fallback: If no one has >70 condition, take best available to prevent empty slot
                    starter = reservePool.shift();
                }

                if (starter) {
                    newChart[pos][0] = starter.id;
                    usedIds.add(starter.id);
                }

                // 2. Assign Bench (Depth 1) & Third (Depth 2) from remaining pool
                const remaining = [...starterPool, ...reservePool].sort((a, b) => compareByAbility(a, b, pos));
                
                if (remaining[0]) {
                    newChart[pos][1] = remaining[0].id;
                    usedIds.add(remaining[0].id);
                }
                if (remaining[1]) {
                    newChart[pos][2] = remaining[1].id;
                    usedIds.add(remaining[1].id);
                }
            }
        });

        // Fill empty slots with any remaining players (Fallback for safety)
        for (let depth = 0; depth < 3; depth++) {
            positions.forEach(pos => {
                if (!newChart[pos][depth]) {
                    const fallback = team.roster.find(p => 
                        !usedIds.has(p.id) && p.health !== 'Injured'
                    );
                    if (fallback) {
                        newChart[pos][depth] = fallback.id;
                        usedIds.add(fallback.id);
                    }
                }
            });
        }

        const newStarters = {
            PG: newChart.PG[0] || '',
            SG: newChart.SG[0] || '',
            SF: newChart.SF[0] || '',
            PF: newChart.PF[0] || '',
            C:  newChart.C[0] || ''
        };

        onUpdateTactics({ ...tactics, starters: newStarters });
        onUpdateDepthChart(newChart);
        setIsDropdownOpen(false);
    };

    const handleResetChart = () => {
        const resetChart: DepthChart = {
            PG: [null, null, null], SG: [null, null, null], SF: [null, null, null],
            PF: [null, null, null], C: [null, null, null]
        };
        
        const resetStarters = { PG: '', SG: '', SF: '', PF: '', C: '' };

        onUpdateDepthChart(resetChart);
        onUpdateTactics({ ...tactics, starters: resetStarters });
    };

    const handleChange = (pos: keyof DepthChart, depthIndex: number, playerId: string) => {
        const newChart = { ...depthChart! };
        const newRow = [...newChart[pos]];
        const newVal = playerId === "" ? null : playerId;
        newRow[depthIndex] = newVal;

        if (newVal) {
            for (let i = 0; i < 3; i++) {
                if (i !== depthIndex && newRow[i] === newVal) newRow[i] = null;
            }
        }
        newChart[pos] = newRow;

        if (depthIndex === 0 && newVal) {
            positions.forEach(p => {
                if (p !== pos && newChart[p][0] === newVal) {
                    const otherRow = [...newChart[p]];
                    otherRow[0] = null;
                    newChart[p] = otherRow;
                }
            });
            const newStarters = { ...tactics.starters, [pos]: newVal };
            onUpdateTactics({ ...tactics, starters: newStarters });
        }
        onUpdateDepthChart(newChart);
    };

    if (!depthChart) return null;
    const sortedRoster = [...team.roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
    const positions: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];

    return (
        <div className="flex flex-col w-full bg-slate-950/30 border-t border-white/5">
            <div className="px-6 py-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="text-base font-black text-white uppercase tracking-widest oswald">뎁스 차트</span>
                </div>
                <div className="flex gap-2">
                    <div className="relative flex shadow-md group" ref={dropdownRef}>
                        <button 
                            onClick={() => handleAutoFill('Ability')}
                            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-l-lg transition-all text-xs font-bold uppercase tracking-wider active:scale-95 border-r border-indigo-700/50"
                        >
                            <span>코치에게 위임</span>
                        </button>
                        <button 
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className={`px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-r-lg transition-all active:bg-indigo-700 ${isDropdownOpen ? 'bg-indigo-700' : ''}`}
                        >
                            <ChevronDown size={14} className={`transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isDropdownOpen && (
                            <div className="absolute top-full right-0 mt-2 w-32 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                <div className="p-1">
                                    <button 
                                        onClick={() => handleAutoFill('Ability')}
                                        className="w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-all flex flex-col gap-0.5"
                                    >
                                        <span>능력치 우선</span>
                                    </button>
                                    <button 
                                        onClick={() => handleAutoFill('Stamina')}
                                        className="w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-all flex flex-col gap-0.5"
                                    >
                                        <span>체력 우선</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <button 
                        onClick={handleResetChart}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg transition-all text-xs font-bold uppercase tracking-wider shadow-sm active:scale-95"
                    >
                        <RotateCcw size={14} />
                        <span>초기화</span>
                    </button>
                </div>
            </div>
            <Table className="border-0 !rounded-none shadow-none">
                <TableHead>
                    <TableHeaderCell align="center" className="w-16 border-r border-slate-800/50 py-2">POS</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-1/3 border-r border-slate-800/50 py-2 text-indigo-400">주전 (Starter)</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-1/3 border-r border-slate-800/50 py-2 text-slate-300">벤치 (Bench)</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-1/3 border-r border-slate-800/50 py-2 text-slate-500">써드 (Third)</TableHeaderCell>
                </TableHead>
                <TableBody>
                    {positions.map(pos => (
                        <TableRow key={String(pos)} className="hover:bg-slate-900/40 transition-colors">
                            <TableCell align="center" className="py-1.5 px-4 border-r border-slate-800/50 bg-slate-950/20">
                                <span className="text-xs font-semibold text-slate-500">{String(pos)}</span>
                            </TableCell>
                            {[0, 1, 2].map(depthIndex => (
                                <TableCell key={`${String(pos)}-${depthIndex}`} className={`!p-0 border-r border-slate-800/50 ${depthIndex === 0 ? 'bg-indigo-900/5' : ''}`}>
                                    <div className="relative group w-full h-full">
                                        <select 
                                            className={`w-full h-full appearance-none bg-transparent border-none rounded-none pl-4 pr-10 py-3 text-xs font-semibold text-white focus:outline-none focus:ring-0 cursor-pointer hover:bg-white/5 transition-all ${!depthChart[pos][depthIndex] ? 'text-slate-500' : ''}`}
                                            value={depthChart[pos][depthIndex] || ""}
                                            onChange={(e) => handleChange(pos, depthIndex, e.target.value)}
                                        >
                                            <option value="" className="bg-slate-900 text-slate-500">선수 선택</option>
                                            {sortedRoster.map(p => (
                                                <option key={p.id} value={p.id} className="bg-slate-900 text-white text-xs font-semibold">{p.name} - {p.position}</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-white transition-colors">
                                            <ChevronDown size={14} strokeWidth={2} />
                                        </div>
                                    </div>
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
};

// rotationMap 변경 시에는 재렌더 불필요 — starters와 depthChart 변경 시에만 재렌더
export const DepthChartEditor = React.memo(
    DepthChartEditorInner,
    (prev: DepthChartEditorProps, next: DepthChartEditorProps) =>
        prev.depthChart === next.depthChart &&
        prev.tactics.starters === next.tactics.starters &&
        prev.team === next.team &&
        prev.onUpdateDepthChart === next.onUpdateDepthChart &&
        prev.onUpdateTactics === next.onUpdateTactics
);
