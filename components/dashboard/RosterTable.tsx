
import React, { useMemo } from 'react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { DepthChartEditor } from './DepthChartEditor';
import { StartingLineup } from '../roster/StartingLineup';
import { RotationMatrix } from './RotationMatrix';
import { GanttChartSquare, Users } from 'lucide-react';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';
import { TeamLogo } from '../common/TeamLogo';

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

// Helper for color coding attributes
const getGradeColor = (val: number) => {
    if (val >= 90) return 'text-fuchsia-400';
    if (val >= 80) return 'text-emerald-400';
    if (val >= 70) return 'text-amber-400';
    return 'text-slate-500';
};

export const RosterTable: React.FC<RosterTableProps> = ({ 
  mode, team, healthySorted, tactics, onUpdateTactics, onViewPlayer,
  depthChart, onUpdateDepthChart, oppHealthySorted, opponent
}) => {
    
    // 상대 전력 분석 모드 (Opponent Analysis)
    if (mode === 'opponent') {
        if (!opponent) return <div className="p-8 text-slate-500 text-center">상대 팀 데이터가 없습니다.</div>;

        // 1. Define Columns
        const ATTR_COLS = [
            { label: 'INS', key: 'ins', tooltip: 'Inside Scoring' },
            { label: 'OUT', key: 'out', tooltip: 'Outside Scoring' },
            { label: 'PLM', key: 'plm', tooltip: 'Playmaking' },
            { label: 'DEF', key: 'def', tooltip: 'Defense' },
            { label: 'REB', key: 'reb', tooltip: 'Rebounding' },
            { label: 'ATH', key: 'ath', tooltip: 'Athleticism' },
        ];

        const STAT_COLS = [
            { label: 'MIN' },
            { label: 'PTS' },
            { label: 'REB' },
            { label: 'AST' },
            { label: 'STL' },
            { label: 'BLK' },
            { label: 'FG%' },
            { label: '3P%' },
            { label: 'TS%' },
        ];
        
        // Unified Stat Style
        const statCellClass = "py-2.5 px-2 text-center text-xs font-mono font-bold text-slate-300 w-11";

        // 2. Calculate Averages
        const teamAverages = useMemo(() => {
            const count = oppHealthySorted.length;
            if (count === 0) return null;

            const sum = oppHealthySorted.reduce((acc, p) => {
                const s = p.stats;
                const g = s.g || 1;
                
                // Attributes
                acc.ovr += calculatePlayerOvr(p);
                acc.ins += p.ins;
                acc.out += p.out;
                acc.plm += p.plm;
                acc.def += p.def;
                acc.reb += p.reb;
                acc.ath += p.ath;

                // Stats (Per Game)
                acc.mp += s.mp / g;
                acc.pts += s.pts / g;
                acc.rebs += s.reb / g;
                acc.ast += s.ast / g;
                acc.stl += s.stl / g;
                acc.blk += s.blk / g;
                
                // For percentages, we sum the totals then divide at end for simplicity in this context
                // (Though mathematically team FG% should be Total FGM / Total FGA)
                // Here we calculate "Average Player's Percentage"
                acc.fgm += s.fgm; acc.fga += s.fga;
                acc.p3m += s.p3m; acc.p3a += s.p3a;
                acc.tsNum += s.pts; acc.tsDenom += 2 * (s.fga + 0.44 * s.fta);

                return acc;
            }, { 
                ovr: 0, ins: 0, out: 0, plm: 0, def: 0, reb: 0, ath: 0, 
                mp: 0, pts: 0, rebs: 0, ast: 0, stl: 0, blk: 0,
                fgm: 0, fga: 0, p3m: 0, p3a: 0, tsNum: 0, tsDenom: 0
            });

            return {
                ovr: Math.round(sum.ovr / count),
                ins: Math.round(sum.ins / count),
                out: Math.round(sum.out / count),
                plm: Math.round(sum.plm / count),
                def: Math.round(sum.def / count),
                reb: Math.round(sum.reb / count),
                ath: Math.round(sum.ath / count),
                
                mp: (sum.mp / count).toFixed(1),
                pts: (sum.pts / count).toFixed(1),
                rebs: (sum.rebs / count).toFixed(1),
                ast: (sum.ast / count).toFixed(1),
                stl: (sum.stl / count).toFixed(1),
                blk: (sum.blk / count).toFixed(1),
                
                fg: sum.fga > 0 ? ((sum.fgm / sum.fga) * 100).toFixed(1) + '%' : '-',
                p3: sum.p3a > 0 ? ((sum.p3m / sum.p3a) * 100).toFixed(1) + '%' : '-',
                ts: sum.tsDenom > 0 ? ((sum.tsNum / sum.tsDenom) * 100).toFixed(1) + '%' : '-',
            };
        }, [oppHealthySorted]);


        return (
            <div className="flex flex-col h-full bg-slate-950/20 overflow-hidden animate-in fade-in duration-500">
                {/* Header Info */}
                <div className="flex-shrink-0 px-6 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                     <div className="flex items-center gap-3">
                         <TeamLogo teamId={opponent.id} size="md" />
                         <div>
                             <h4 className="text-sm font-black text-white uppercase tracking-tight">{opponent.city} {opponent.name}</h4>
                             <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">OPPONENT SCOUTING</span>
                         </div>
                     </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-20 bg-slate-900 shadow-md">
                            {/* Group Header Row */}
                            <tr className="border-b border-slate-800 bg-slate-950">
                                <th colSpan={3} className="py-1 px-4 border-r border-slate-800/50"></th>
                                <th colSpan={6} className="py-1 px-2 text-center border-r border-slate-800/50">
                                    <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">KEY ATTRIBUTES</span>
                                </th>
                                <th colSpan={9} className="py-1 px-2 text-center bg-slate-900/50">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">SEASON STATS (AVG)</span>
                                </th>
                            </tr>
                            {/* Column Header Row */}
                            <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
                                <th className="py-3 px-4 w-16 text-center border-r border-slate-800/50">POS</th>
                                <th className="py-3 px-4 text-left min-w-[140px]">PLAYER</th>
                                <th className="py-3 px-2 w-14 text-center border-r border-slate-800/50">OVR</th>
                                
                                {/* Attributes */}
                                {ATTR_COLS.map(col => (
                                    <th key={col.label} className="py-3 px-2 text-center w-10 border-r border-slate-800/30 last:border-r-slate-800/50" title={col.tooltip}>{col.label}</th>
                                ))}

                                {/* Stats */}
                                {STAT_COLS.map(col => (
                                    <th key={col.label} className="py-3 px-2 text-center w-11 text-slate-400">{col.label}</th>
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

                                const statValues = [val_min, val_pts, val_reb, val_ast, val_stl, val_blk, val_fg, val_3p, val_ts];
                                const attrValues = [p.ins, p.out, p.plm, p.def, p.reb, p.ath];

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
                                            <div className="flex justify-center">
                                                <OvrBadge value={ovr} size="sm" className="!w-7 !h-7 !text-xs" />
                                            </div>
                                        </td>

                                        {/* Attributes Cells */}
                                        {attrValues.map((val, idx) => (
                                            <td key={`attr-${idx}`} className={`py-2.5 px-2 text-center text-xs font-black font-mono border-r border-slate-800/30 last:border-r-slate-800/50 ${getGradeColor(val)}`}>
                                                {val}
                                            </td>
                                        ))}
                                        
                                        {/* Stats Cells */}
                                        {statValues.map((val, idx) => (
                                            <td key={`stat-${idx}`} className={statCellClass}>
                                                {val}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                        {/* Footer: Team Averages */}
                        {teamAverages && (
                            <tfoot className="bg-slate-900 border-t-2 border-slate-800 sticky bottom-0 z-20 shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
                                <tr>
                                    <td className="py-3 px-4 text-center border-r border-slate-800/50">
                                    </td>
                                    <td className="py-3 px-4 text-left">
                                        <span className="text-xs font-black text-indigo-400 uppercase tracking-widest">TEAM AVERAGE</span>
                                    </td>
                                    <td className="py-3 px-2 text-center border-r border-slate-800/50">
                                        <div className="flex justify-center">
                                            <OvrBadge value={teamAverages.ovr} size="sm" className="!w-7 !h-7 !text-xs" />
                                        </div>
                                    </td>
                                    
                                    {/* Attributes Avg */}
                                    <td className={`py-2.5 px-2 text-center text-xs font-black font-mono border-r border-slate-800/30 ${getGradeColor(teamAverages.ins)}`}>{teamAverages.ins}</td>
                                    <td className={`py-2.5 px-2 text-center text-xs font-black font-mono border-r border-slate-800/30 ${getGradeColor(teamAverages.out)}`}>{teamAverages.out}</td>
                                    <td className={`py-2.5 px-2 text-center text-xs font-black font-mono border-r border-slate-800/30 ${getGradeColor(teamAverages.plm)}`}>{teamAverages.plm}</td>
                                    <td className={`py-2.5 px-2 text-center text-xs font-black font-mono border-r border-slate-800/30 ${getGradeColor(teamAverages.def)}`}>{teamAverages.def}</td>
                                    <td className={`py-2.5 px-2 text-center text-xs font-black font-mono border-r border-slate-800/30 ${getGradeColor(teamAverages.reb)}`}>{teamAverages.reb}</td>
                                    <td className={`py-2.5 px-2 text-center text-xs font-black font-mono border-r border-slate-800/50 ${getGradeColor(teamAverages.ath)}`}>{teamAverages.ath}</td>

                                    {/* Stats Avg */}
                                    <td className={statCellClass}>{teamAverages.mp}</td>
                                    <td className={statCellClass}>{teamAverages.pts}</td>
                                    <td className={statCellClass}>{teamAverages.rebs}</td>
                                    <td className={statCellClass}>{teamAverages.ast}</td>
                                    <td className={statCellClass}>{teamAverages.stl}</td>
                                    <td className={statCellClass}>{teamAverages.blk}</td>
                                    <td className={statCellClass}>{teamAverages.fg}</td>
                                    <td className={statCellClass}>{teamAverages.p3}</td>
                                    <td className={statCellClass}>{teamAverages.ts}</td>
                                </tr>
                            </tfoot>
                        )}
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
                    <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center gap-3">
                        <GanttChartSquare size={20} className="text-indigo-400"/>
                        <span className="text-base font-black text-white uppercase tracking-widest oswald">뎁스 차트</span>
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
