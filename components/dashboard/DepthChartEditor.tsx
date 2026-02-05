
import React, { useEffect } from 'react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { getOvrBadgeStyle } from '../SharedComponents';
import { calculatePlayerOvr } from '../../utils/constants';
import { ChevronDown } from 'lucide-react';

interface DepthChartEditorProps {
    team: Team;
    tactics: GameTactics;
    depthChart: DepthChart | null;
    onUpdateDepthChart: (dc: DepthChart) => void;
    onUpdateTactics: (t: GameTactics) => void; // To sync starters
}

export const DepthChartEditor: React.FC<DepthChartEditorProps> = ({
    team,
    tactics,
    depthChart,
    onUpdateDepthChart,
    onUpdateTactics
}) => {
    // 1. Initialize Depth Chart if null
    useEffect(() => {
        if (!depthChart) {
            // Default initialization based on current starters
            const initialChart: DepthChart = {
                PG: [tactics.starters.PG, null, null],
                SG: [tactics.starters.SG, null, null],
                SF: [tactics.starters.SF, null, null],
                PF: [tactics.starters.PF, null, null],
                C:  [tactics.starters.C, null, null],
            };
            onUpdateDepthChart(initialChart);
        }
    }, [depthChart, tactics.starters, onUpdateDepthChart]);

    if (!depthChart) return null;

    // Helper: Get Sorted Roster for Dropdown (Healthy + Injured)
    const sortedRoster = [...team.roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));

    const positions: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];

    // Handle Change
    const handleChange = (pos: keyof DepthChart, depthIndex: number, playerId: string) => {
        const newChart = { ...depthChart };
        const newRow = [...newChart[pos]];
        
        // If empty string, set to null
        const newVal = playerId === "" ? null : playerId;
        
        // 1. Set new value
        newRow[depthIndex] = newVal;

        // [Constraint Check 1: Row Uniqueness]
        // 같은 행(포지션) 내에서 중복 방지
        if (newVal) {
            for (let i = 0; i < 3; i++) {
                if (i !== depthIndex && newRow[i] === newVal) {
                    newRow[i] = null;
                }
            }
        }

        newChart[pos] = newRow;

        // [Constraint Check 2: Starter Uniqueness across Positions]
        // If changing a Starter (index 0), remove this player from OTHER Starter slots
        if (depthIndex === 0 && newVal) {
            positions.forEach(p => {
                if (p !== pos && newChart[p][0] === newVal) {
                    const otherRow = [...newChart[p]];
                    otherRow[0] = null; // Clear the other starter slot
                    newChart[p] = otherRow;
                }
            });
            
            // [Sync] Update GameTactics Starters
            const newStarters = { ...tactics.starters };
            newStarters[pos] = newVal; // Update this position
            
            onUpdateTactics({ ...tactics, starters: newStarters });
        }

        onUpdateDepthChart(newChart);
    };

    return (
        <div className="flex flex-col w-full bg-slate-950/30 border-t border-white/5">
            {/* Table Section */}
            <div className="p-0">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-950 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800/80">
                            <th className="py-4 px-4 w-16 text-center border-r border-slate-800/50">POS</th>
                            <th className="py-4 px-4 w-1/3 text-center border-r border-slate-800/50 text-indigo-400">주전 (Starter)</th>
                            <th className="py-4 px-4 w-1/3 text-center border-r border-slate-800/50 text-slate-300">벤치 (Bench)</th>
                            <th className="py-4 px-4 w-1/3 text-center text-slate-500">써드 (Third)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {positions.map(pos => (
                            <tr key={pos} className="hover:bg-slate-900/40 transition-colors">
                                <td className="py-4 px-4 text-center border-r border-slate-800/50 bg-slate-950/20">
                                    <span className="text-sm font-black text-white">{pos}</span>
                                </td>
                                {[0, 1, 2].map(depthIndex => {
                                    const selectedId = depthChart[pos][depthIndex];
                                    
                                    return (
                                        <td key={`${pos}-${depthIndex}`} className={`p-0 border-r border-slate-800/50 last:border-0 ${depthIndex === 0 ? 'bg-indigo-900/5' : ''}`}>
                                            <div className="relative group w-full h-full">
                                                <select 
                                                    className={`w-full h-full appearance-none bg-transparent border-none rounded-none pl-4 pr-10 py-4 text-xs font-bold text-white focus:outline-none focus:ring-0 cursor-pointer hover:bg-white/5 transition-all ${!selectedId ? 'text-slate-500' : ''}`}
                                                    value={selectedId || ""}
                                                    onChange={(e) => handleChange(pos, depthIndex, e.target.value)}
                                                >
                                                    <option value="" className="bg-slate-900 text-slate-500">선수 선택</option>
                                                    {sortedRoster.map(p => (
                                                        <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                                                            {p.name} - {p.position}
                                                        </option>
                                                    ))}
                                                </select>
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-white transition-colors">
                                                    <ChevronDown size={14} strokeWidth={2} />
                                                </div>
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
