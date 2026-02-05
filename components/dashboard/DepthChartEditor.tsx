
import React, { useEffect } from 'react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { getOvrBadgeStyle } from '../SharedComponents';
import { calculatePlayerOvr } from '../../utils/constants';
import { Users } from 'lucide-react';

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
    // Group by position? Or just alphabetical? OVR sort is best.
    const sortedRoster = [...team.roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));

    const positions: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
    const labels = ['주전 (Starter)', '벤치 (Bench)', '써드 (Third)'];

    // Handle Change
    const handleChange = (pos: keyof DepthChart, depthIndex: number, playerId: string) => {
        const newChart = { ...depthChart };
        const newRow = [...newChart[pos]];
        
        // If empty string, set to null
        const newVal = playerId === "" ? null : playerId;
        newRow[depthIndex] = newVal;
        newChart[pos] = newRow;

        // [Constraint Check: Starter Uniqueness]
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
            
            // Also need to check if we cleared any other starter slot, 
            // but tactics.starters structure doesn't support 'null', so we might leave them as is
            // or find the next best player? 
            // For now, let's just update the explicit change. 
            // If we cleared a starter in DepthChart, we should probably update tactics too, 
            // but tactics.starters requires a string.
            // Let's iterate all positions to sync fully.
            
            positions.forEach(p => {
                const sId = newChart[p][0];
                if (sId) newStarters[p] = sId;
            });
            
            onUpdateTactics({ ...tactics, starters: newStarters });
        }

        onUpdateDepthChart(newChart);
    };

    return (
        <div className="flex flex-col h-full bg-slate-900/20">
            <div className="p-8 border-b border-white/5 bg-slate-900/50">
                <div className="flex items-center gap-3 mb-2">
                    <Users size={24} className="text-indigo-400" />
                    <h3 className="text-xl font-black uppercase text-white oswald tracking-tight">뎁스 차트 관리</h3>
                </div>
                <p className="text-xs text-slate-400 font-bold">
                    각 포지션별 선수 운용 순위를 설정합니다. 주전 슬롯 변경 시 실제 로테이션의 선발 명단에도 반영됩니다.
                </p>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                <div className="bg-slate-950/40 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-900/80 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
                                <th className="py-4 px-6 w-24 text-center border-r border-slate-800">POS</th>
                                <th className="py-4 px-4 w-1/3 text-center border-r border-slate-800 text-indigo-400">주전 (Starter)</th>
                                <th className="py-4 px-4 w-1/3 text-center border-r border-slate-800 text-slate-300">벤치 (Bench)</th>
                                <th className="py-4 px-4 w-1/3 text-center text-slate-500">써드 (Third)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {positions.map(pos => (
                                <tr key={pos} className="hover:bg-white/5 transition-colors">
                                    <td className="py-4 px-4 text-center border-r border-slate-800 bg-slate-900/30">
                                        <span className="text-lg font-black text-white">{pos}</span>
                                    </td>
                                    {[0, 1, 2].map(depthIndex => {
                                        const selectedId = depthChart[pos][depthIndex];
                                        const selectedPlayer = team.roster.find(p => p.id === selectedId);
                                        const ovr = selectedPlayer ? calculatePlayerOvr(selectedPlayer) : 0;

                                        return (
                                            <td key={`${pos}-${depthIndex}`} className={`p-3 border-r border-slate-800 last:border-0 ${depthIndex === 0 ? 'bg-indigo-900/10' : ''}`}>
                                                <div className="flex flex-col gap-2">
                                                    <select 
                                                        className={`w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-indigo-500 transition-all ${!selectedId ? 'text-slate-500' : ''}`}
                                                        value={selectedId || ""}
                                                        onChange={(e) => handleChange(pos, depthIndex, e.target.value)}
                                                    >
                                                        <option value="">- 선택 안함 -</option>
                                                        {sortedRoster.map(p => (
                                                            <option key={p.id} value={p.id}>
                                                                {p.name} ({p.position}) - OVR {calculatePlayerOvr(p)}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    
                                                    {selectedPlayer && (
                                                        <div className="flex items-center gap-3 px-1 animate-in fade-in duration-200">
                                                            <div className={getOvrBadgeStyle(ovr) + " !w-6 !h-6 !text-xs !mx-0"}>{ovr}</div>
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-bold text-slate-300">{selectedPlayer.name}</span>
                                                                <span className="text-[9px] text-slate-500">{selectedPlayer.height}cm / {selectedPlayer.age}세</span>
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
        </div>
    );
};
