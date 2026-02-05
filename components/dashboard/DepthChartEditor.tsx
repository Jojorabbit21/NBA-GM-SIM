
import React, { useEffect } from 'react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { getOvrBadgeStyle } from '../SharedComponents';
import { calculatePlayerOvr } from '../../utils/constants';
import { Users, Info } from 'lucide-react';

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
        <div className="flex flex-col w-full">
            {/* Header Section */}
            <div className="px-8 py-6 bg-slate-900/30 border-b border-white/5 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                    <Users size={20} className="text-indigo-400" />
                    <h3 className="text-lg font-black uppercase text-white oswald tracking-tight">뎁스 차트 (Depth Chart)</h3>
                </div>
                <div className="flex items-start gap-2 text-slate-400 text-xs font-medium bg-slate-900/50 p-3 rounded-lg border border-white/5">
                    <Info size={14} className="flex-shrink-0 mt-0.5 text-indigo-400" />
                    <p>
                        각 포지션별 1~3순위 선수를 설정하세요. <span className="text-white font-bold">주전(Starter)</span> 변경 시 선발 라인업에 즉시 반영됩니다.
                        동일 포지션 내 중복 선택은 불가능합니다.
                    </p>
                </div>
            </div>

            {/* Table Section */}
            <div className="p-0">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-900/60 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
                            <th className="py-3 px-6 w-24 text-center border-r border-slate-800/50">POS</th>
                            <th className="py-3 px-4 w-1/3 text-center border-r border-slate-800/50 text-indigo-400">주전 (Starter)</th>
                            <th className="py-3 px-4 w-1/3 text-center border-r border-slate-800/50 text-slate-300">벤치 (Bench)</th>
                            <th className="py-3 px-4 w-1/3 text-center text-slate-500">써드 (Third)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {positions.map(pos => (
                            <tr key={pos} className="hover:bg-white/5 transition-colors">
                                <td className="py-4 px-4 text-center border-r border-slate-800/50 bg-slate-900/20">
                                    <span className="text-lg font-black text-white">{pos}</span>
                                </td>
                                {[0, 1, 2].map(depthIndex => {
                                    const selectedId = depthChart[pos][depthIndex];
                                    const selectedPlayer = team.roster.find(p => p.id === selectedId);
                                    const ovr = selectedPlayer ? calculatePlayerOvr(selectedPlayer) : 0;

                                    return (
                                        <td key={`${pos}-${depthIndex}`} className={`p-3 border-r border-slate-800/50 last:border-0 ${depthIndex === 0 ? 'bg-indigo-500/5' : ''}`}>
                                            <div className="flex flex-col gap-2">
                                                <select 
                                                    className={`w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-indigo-500 transition-all ${!selectedId ? 'text-slate-500' : ''}`}
                                                    value={selectedId || ""}
                                                    onChange={(e) => handleChange(pos, depthIndex, e.target.value)}
                                                >
                                                    <option value="">- Empty -</option>
                                                    {sortedRoster.map(p => (
                                                        <option key={p.id} value={p.id}>
                                                            {p.name} ({p.position}) - {calculatePlayerOvr(p)}
                                                        </option>
                                                    ))}
                                                </select>
                                                
                                                {selectedPlayer && (
                                                    <div className="flex items-center gap-3 px-1 animate-in fade-in duration-200">
                                                        <div className={getOvrBadgeStyle(ovr) + " !w-6 !h-6 !text-xs !mx-0"}>{ovr}</div>
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-[10px] font-bold text-slate-300 truncate">{selectedPlayer.name}</span>
                                                            <span className="text-[9px] text-slate-500">{selectedPlayer.height}cm</span>
                                                        </div>
                                                        {selectedPlayer.health !== 'Healthy' && (
                                                            <span className={`ml-auto px-1.5 py-0.5 rounded-[3px] text-[8px] font-black uppercase ${selectedPlayer.health === 'Injured' ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500'}`}>
                                                                {selectedPlayer.health === 'Injured' ? 'OUT' : 'DTD'}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
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
