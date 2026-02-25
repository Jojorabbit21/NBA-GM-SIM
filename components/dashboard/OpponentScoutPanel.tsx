
import React, { useMemo } from 'react';
import { Player, Team } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';
import { TeamLogo } from '../common/TeamLogo';
import { Table, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';

interface OpponentScoutPanelProps {
    opponent?: Team;
    oppHealthySorted: Player[];
    onViewPlayer: (p: Player) => void;
}

// Helper for color coding attributes
const getGradeColor = (val: number) => {
    if (val >= 90) return 'text-fuchsia-400';
    if (val >= 80) return 'text-emerald-400';
    if (val >= 70) return 'text-amber-400';
    return 'text-slate-500';
};

export const OpponentScoutPanel: React.FC<OpponentScoutPanelProps> = ({ 
    opponent, 
    oppHealthySorted, 
    onViewPlayer 
}) => {
    
    if (!opponent) return <div className="p-8 text-slate-500 text-center">상대 팀 데이터가 없습니다.</div>;

    // 1. Define Columns & Fixed Widths for Data Columns
    const WIDTHS = {
        POS: 60,
        OVR: 50,
        ATTR: 45,
        STAT: 55
    };

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
            <div className="flex-shrink-0 px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                 <div className="flex items-center gap-3">
                     <TeamLogo teamId={opponent.id} size="md" />
                     <div>
                         <h4 className="text-sm font-black text-white uppercase tracking-tight">{opponent.city} {opponent.name}</h4>
                         <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">OPPONENT SCOUTING</span>
                     </div>
                 </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 min-h-0 p-0">
                <Table 
                    className="border-0 rounded-none shadow-none" 
                    style={{ tableLayout: 'fixed', width: '100%', minWidth: '1050px' }} 
                >
                    <colgroup>
                        <col style={{ width: WIDTHS.POS }} />
                        <col /> 
                        <col style={{ width: WIDTHS.OVR }} />
                        {ATTR_COLS.map((_, i) => <col key={`c-attr-${i}`} style={{ width: WIDTHS.ATTR }} />)}
                        {STAT_COLS.map((_, i) => <col key={`c-stat-${i}`} style={{ width: WIDTHS.STAT }} />)}
                    </colgroup>

                    <thead className="bg-slate-950 sticky top-0 z-40 shadow-sm">
                        <tr className="border-b border-slate-800 bg-slate-950 h-8">
                            <th colSpan={3} className="py-1 px-4 border-r border-slate-800/50"></th>
                            <th colSpan={6} className="py-1 px-2 text-center border-r border-slate-800/50">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">KEY ATTRIBUTES</span>
                            </th>
                            <th colSpan={9} className="py-1 px-2 text-center">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">SEASON STATS (AVG)</span>
                            </th>
                        </tr>
                        <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-t border-slate-800 border-b border-slate-800 h-10">
                            <TableHeaderCell align="center" className="border-r border-slate-800/50">POS</TableHeaderCell>
                            <TableHeaderCell align="left" className="px-4 border-r border-slate-800/50">PLAYER</TableHeaderCell>
                            <TableHeaderCell align="center" className="border-r border-slate-800/50">OVR</TableHeaderCell>
                            
                            {ATTR_COLS.map(col => (
                                <TableHeaderCell key={col.label} align="center" className="border-r border-slate-800/30 last:border-r-slate-800/50" title={col.tooltip}>{col.label}</TableHeaderCell>
                            ))}

                            {STAT_COLS.map(col => (
                                <TableHeaderCell key={col.label} align="center" className="text-slate-400">{col.label}</TableHeaderCell>
                            ))}
                        </tr>
                    </thead>
                    <TableBody>
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
                                <TableRow key={p.id} onClick={() => onViewPlayer(p)}>
                                    <TableCell align="center" className="border-r border-slate-800/50">
                                        <span className={`text-xs font-semibold ${isStarter ? 'text-indigo-400' : 'text-slate-500'}`}>{p.position}</span>
                                    </TableCell>
                                    <TableCell className="px-4 border-r border-slate-800/50">
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-xs font-semibold text-slate-200 group-hover:text-white group-hover:underline truncate">{p.name}</span>
                                            {p.health !== 'Healthy' && (
                                                <span className="text-[9px] font-black text-red-500 uppercase">{p.health}</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell align="center" className="border-r border-slate-800/50">
                                        <div className="flex justify-center">
                                            <OvrBadge value={ovr} size="sm" className="!w-7 !h-7 !text-xs" />
                                        </div>
                                    </TableCell>

                                    {attrValues.map((val, idx) => (
                                        <TableCell key={`attr-${idx}`} align="center" className={`text-xs font-semibold font-mono border-r border-slate-800/30 last:border-r-slate-800/50 ${getGradeColor(val)}`}>
                                            {val}
                                        </TableCell>
                                    ))}
                                    
                                    {statValues.map((val, idx) => (
                                        <TableCell key={`stat-${idx}`} align="center" className="font-mono font-semibold text-xs text-slate-300">
                                            {val}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                    {teamAverages && (
                        <tfoot className="bg-slate-900 border-t-2 border-slate-800 sticky bottom-0 z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
                            <tr>
                                <td className="border-r border-slate-800/50"></td>
                                <td className="px-4 text-left border-r border-slate-800/50">
                                    <span className="text-xs font-black text-indigo-400 uppercase tracking-widest">TEAM AVERAGE</span>
                                </td>
                                <td className="text-center border-r border-slate-800/50">
                                    <div className="flex justify-center">
                                        <OvrBadge value={teamAverages.ovr} size="sm" className="!w-7 !h-7 !text-xs" />
                                    </div>
                                </td>
                                
                                <td className={`py-2.5 px-2 text-center text-xs font-semibold font-mono border-r border-slate-800/30 ${getGradeColor(teamAverages.ins)}`}>{teamAverages.ins}</td>
                                <td className={`py-2.5 px-2 text-center text-xs font-semibold font-mono border-r border-slate-800/30 ${getGradeColor(teamAverages.out)}`}>{teamAverages.out}</td>
                                <td className={`py-2.5 px-2 text-center text-xs font-semibold font-mono border-r border-slate-800/30 ${getGradeColor(teamAverages.plm)}`}>{teamAverages.plm}</td>
                                <td className={`py-2.5 px-2 text-center text-xs font-semibold font-mono border-r border-slate-800/30 ${getGradeColor(teamAverages.def)}`}>{teamAverages.def}</td>
                                <td className={`py-2.5 px-2 text-center text-xs font-semibold font-mono border-r border-slate-800/30 ${getGradeColor(teamAverages.reb)}`}>{teamAverages.reb}</td>
                                <td className={`py-2.5 px-2 text-center text-xs font-semibold font-mono border-r border-slate-800/50 ${getGradeColor(teamAverages.ath)}`}>{teamAverages.ath}</td>

                                <td className="font-mono font-semibold text-xs text-slate-300 py-2.5 px-2" align="center">{teamAverages.mp}</td>
                                <td className="font-mono font-semibold text-xs text-slate-300 py-2.5 px-2" align="center">{teamAverages.pts}</td>
                                <td className="font-mono font-semibold text-xs text-slate-300 py-2.5 px-2" align="center">{teamAverages.rebs}</td>
                                <td className="font-mono font-semibold text-xs text-slate-300 py-2.5 px-2" align="center">{teamAverages.ast}</td>
                                <td className="font-mono font-semibold text-xs text-slate-300 py-2.5 px-2" align="center">{teamAverages.stl}</td>
                                <td className="font-mono font-semibold text-xs text-slate-300 py-2.5 px-2" align="center">{teamAverages.blk}</td>
                                <td className="font-mono font-semibold text-xs text-slate-300 py-2.5 px-2" align="center">{teamAverages.fg}</td>
                                <td className="font-mono font-semibold text-xs text-slate-300 py-2.5 px-2" align="center">{teamAverages.p3}</td>
                                <td className="font-mono font-semibold text-xs text-slate-300 py-2.5 px-2" align="center">{teamAverages.ts}</td>
                            </tr>
                        </tfoot>
                    )}
                </Table>
            </div>
        </div>
    );
};
