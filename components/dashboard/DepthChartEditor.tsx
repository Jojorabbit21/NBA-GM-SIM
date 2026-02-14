
import React, { useEffect } from 'react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { ChevronDown, Wand2, RotateCcw } from 'lucide-react';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';

interface DepthChartEditorProps {
    team: Team;
    tactics: GameTactics;
    depthChart: DepthChart | null;
    onUpdateDepthChart: (dc: DepthChart) => void;
    onUpdateTactics: (t: GameTactics) => void;
}

export const DepthChartEditor: React.FC<DepthChartEditorProps> = ({
    team,
    tactics,
    depthChart,
    onUpdateDepthChart,
    onUpdateTactics
}) => {
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

    const handleAutoFill = () => {
        const usedIds = new Set<string>();
        const positions: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
        const availablePlayers = [...team.roster]
            .filter(p => p.health !== 'Injured')
            .sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));

        const newChart: DepthChart = {
            PG: [null, null, null], SG: [null, null, null], SF: [null, null, null],
            PF: [null, null, null], C: [null, null, null]
        };

        for (let depth = 0; depth < 3; depth++) {
            positions.forEach(pos => {
                let match = availablePlayers.find(p => p.position.includes(pos) && !usedIds.has(p.id));
                if (!match) {
                    match = availablePlayers.find(p => !usedIds.has(p.id));
                }
                if (match) {
                    newChart[pos][depth] = match.id;
                    usedIds.add(match.id);
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
                    <button 
                        onClick={handleAutoFill}
                        className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all text-xs font-bold uppercase tracking-wider shadow-md active:scale-95"
                    >
                        <Wand2 size={14} />
                        <span>AI 자동 설정</span>
                    </button>
                    <button 
                        onClick={handleResetChart}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg transition-all text-xs font-bold uppercase tracking-wider shadow-sm active:scale-95"
                    >
                        <RotateCcw size={14} />
                        <span>초기화</span>
                    </button>
                </div>
            </div>
            <Table className="border-0 rounded-none shadow-none">
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
                                <TableCell key={`${String(pos)}-${depthIndex}`} className={`p-0 border-r border-slate-800/50 ${depthIndex === 0 ? 'bg-indigo-900/5' : ''}`}>
                                    <div className="relative group w-full h-full">
                                        <select 
                                            className={`w-full h-full appearance-none bg-transparent border-none rounded-none pl-4 pr-10 py-2 text-xs font-semibold text-white focus:outline-none focus:ring-0 cursor-pointer hover:bg-white/5 transition-all ${!depthChart[pos][depthIndex] ? 'text-slate-500' : ''}`}
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
