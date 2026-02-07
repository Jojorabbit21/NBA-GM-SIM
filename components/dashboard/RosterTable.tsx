
import React from 'react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { DepthChartEditor } from './DepthChartEditor';
import { StartingLineup } from '../roster/StartingLineup';
import { RotationMatrix } from './RotationMatrix';
import { GanttChartSquare, Users } from 'lucide-react';
import { calculatePlayerOvr } from '../../utils/constants';
import { getOvrBadgeStyle } from '../SharedComponents';

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
  depthChart, onUpdateDepthChart, oppHealthySorted, opponent
}) => {
    
    // 상대 전력 분석 모드 (Opponent Analysis)
    if (mode === 'opponent') {
        if (!opponent) return <div className="p-8 text-slate-500 text-center">상대 팀 데이터가 없습니다.</div>;

        const STAT_COLS = [
            { label: 'MIN', width: 'w-10', color: 'text-slate-400' },
            { label: 'PTS', width: 'w-12', color: 'text-white' },
            { label: 'REB', width: 'w-10', color: 'text-slate-300' },
            { label: 'AST', width: 'w-10', color: 'text-slate-300' },
            { label: 'STL', width: 'w-10', color: 'text-slate-400' },
            { label: 'BLK', width: 'w-10', color: 'text-slate-400' },
            { label: 'FG%', width: 'w-14', color: 'text-amber-400' },
            { label: '3P%', width: 'w-14', color: 'text-orange-400' },
            { label: 'TS%', width: 'w-14', color: 'text-emerald-400' },
        ];

        return (
            <div className="flex flex-col h-full bg-slate-950/20 overflow-hidden animate-in fade-in duration-500">
                {/* Header Info */}
                <div className="flex-shrink-0 px-6 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                     <div className="flex items-center gap-3">
                         <img src={opponent.logo} className="w-8 h-8 object-contain" alt="" />
                         <div>
                             <h4 className="text-sm font-black text-white uppercase tracking-tight">{opponent.city} {opponent.name}</h4>
                             <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">SEASON STATS</span>
                         </div>
                     </div>
                     <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50">
                         <Users size={14} className="text-slate-400" />
                         <span className="text-xs font-bold text-slate-300">{oppHealthySorted.length} Active Players</span>
                     </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-20 bg-slate-900 shadow-md">
                            <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
                                <th className="py-3 px-4 w-16 text-center border-r border-slate-800/50">POS</th>
                                <th className="py-3 px-4 text-left">PLAYER</th>
                                <th className="py-3 px-2 w-14 text-center border-r border-slate-800/50">OVR</th>
                                <th className="py-3 px-2 w-10 text-center text-slate-400 border-r border-slate-800/50">GP</th>
                                {STAT_COLS.map(col => (
                                    <th key={col.label} className={`py-3 px-2 text-center ${col.width} ${col.color}`}>{col.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {oppHealthySorted.map((p, i) => {
                                const ovr = calculatePlayerOvr(p);
                                const isStarter = i < 5; 
                                
                                const s = p.stats;
                                const g = s.g || 1;
                                
                                const val_min = (s.mp / g).toFixed(1);
                                const val_pts = (s.pts / g).toFixed(1);
                                const val_reb = (s.reb / g).toFixed(1);
                                const val_ast = (s.ast / g).toFixed(1);
                                const val_stl = (s.stl / g).toFixed(1);
                                const val_blk = (s.blk / g).toFixed(1);
                                
                                const val_fg = s.fga > 0 ? ((s.fgm / s.fga) * 100).toFixed(1) + '%' : '-';
                                const val_3p = s.p3a > 0 ? ((s.p3m / s.p3a) * 100).toFixed(1) + '%' : '-';
                                
                                const tsa = s.fga + 0.44 * s.fta;
                                const val_ts = tsa > 0 ? ((s.pts / (2 * tsa)) * 100).toFixed(1) + '%' : '-';

                                const values = [val_min, val_pts, val_reb, val_ast, val_stl, val_blk, val_fg, val_3p, val_ts];

                                return (
                                    <tr key={p.id} className="hover:bg-white/5 transition-colors group cursor-pointer" onClick={() => onViewPlayer(p)}>
                                        <td className="py-2.5 px-4 text-center border-r border-slate-800/50">
                                            <span className={`text-xs font-bold ${isStarter ? 'text-indigo-400' : 'text-slate-500'}`}>{p.position}</span>
                                        </td>
                                        <td className="py-2.5 px-4">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-slate-200 group-hover:text-white group-hover:underline truncate">{p.name}</span>
                                                {p.health !== 'Healthy' && (
                                                    <span className="text-[9px] font-black text-red-500 uppercase">{p.health}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-2 text-center border-r border-slate-800/50">
                                            <div className={`${getOvrBadgeStyle(ovr)} !w-7 !h-7 !text-[10px] !mx-auto`}>{ovr}</div>
                                        </td>
                                        <td className="py-2.5 px-2 text-center text-xs font-mono text-slate-500 border-r border-slate-800/50">{s.g}</td>
                                        
                                        {values.map((val, idx) => (
                                            <td key={idx} className={`py-2.5 px-2 text-center text-xs font-mono font-bold ${STAT_COLS[idx].color}`}>
                                                {val}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    // 내 팀 관리 모드 (My Team Management)
    return (
        <div className="flex flex-col h-full bg-slate-950/20 overflow-hidden">
            
            {/* Module 1: Starting Lineup & Depth Chart */}
            <div className="flex-shrink-0 flex flex-col bg-slate-900/40 border-b border-slate-800">
                
                {/* Visual Starting Lineup */}
                <div className="p-6 border-b border-white/5">
                    <StartingLineup team={team} tactics={tactics} roster={team.roster} />
                </div>

                {/* Depth Chart Editor */}
                <div className="flex-col flex">
                    <div className="px-6 py-2 bg-slate-900 border-b border-slate-800 flex items-center gap-2">
                        <GanttChartSquare size={16} className="text-indigo-400"/>
                        <span className="text-xs font-black text-slate-300 uppercase tracking-widest oswald">뎁스 차트 (Depth Chart)</span>
                    </div>
                    <DepthChartEditor 
                        team={team} 
                        tactics={tactics} 
                        depthChart={depthChart || null} 
                        onUpdateDepthChart={onUpdateDepthChart || (() => {})} 
                        onUpdateTactics={onUpdateTactics}
                    />
                </div>
            </div>

            {/* Module 2: Rotation Chart */}
            <div className="flex-1 min-h-0 overflow-hidden">
                <RotationMatrix 
                    team={team}
                    tactics={tactics}
                    depthChart={depthChart || null}
                    healthySorted={healthySorted}
                    onUpdateTactics={onUpdateTactics}
                    onViewPlayer={onViewPlayer}
                />
            </div>

        </div>
    );
};
