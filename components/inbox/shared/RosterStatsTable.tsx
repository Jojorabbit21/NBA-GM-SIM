import React from 'react';
import { OvrBadge } from '../../common/OvrBadge';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../common/Table';
import { fmtStatVal } from './inboxUtils';

interface RosterStatRow {
    id: string;
    name: string;
    position: string;
    ovr: number;
    g: number;
    mpg: number;
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    tov: number;
    fgm: number;
    fga: number;
    fgPct: number;
    p3m: number;
    p3a: number;
    p3Pct: number;
    ftm: number;
    fta: number;
    ftPct: number;
    pm: number;
}

interface RosterStatsTableProps {
    rosterStats?: RosterStatRow[];
    sectionLabel: string;
    onPlayerClick?: (id: string) => void;
    /** SeasonReview 전용: 선수 헤더에 sticky가 없음 */
    stickyPlayerCol?: boolean;
}

export const RosterStatsTable: React.FC<RosterStatsTableProps> = ({ rosterStats, sectionLabel, onPlayerClick, stickyPlayerCol = true }) => {
    if (!rosterStats || rosterStats.length === 0) return null;

    return (
        <div>
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">{sectionLabel}</h3>
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <Table className="!rounded-none !border-0 !shadow-none" style={{ minWidth: '100%' }}>
                        <TableHead className="bg-slate-950">
                            <TableHeaderCell align="left" className={`pl-4 min-w-[140px]${stickyPlayerCol ? ' sticky left-0 bg-slate-950 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.5)]' : ''}`}>선수</TableHeaderCell>
                            <TableHeaderCell align="center" className="w-10">POS</TableHeaderCell>
                            <TableHeaderCell align="center" className="w-10">OVR</TableHeaderCell>
                            <TableHeaderCell align="center" className="w-10">G</TableHeaderCell>
                            <TableHeaderCell align="center" className="w-12">MIN</TableHeaderCell>
                            <TableHeaderCell align="center" className="w-12">PTS</TableHeaderCell>
                            <TableHeaderCell align="center" className="w-12">REB</TableHeaderCell>
                            <TableHeaderCell align="center" className="w-12">AST</TableHeaderCell>
                            <TableHeaderCell align="center" className="w-12">STL</TableHeaderCell>
                            <TableHeaderCell align="center" className="w-12">BLK</TableHeaderCell>
                            <TableHeaderCell align="center" className="w-12">TOV</TableHeaderCell>
                            <TableHeaderCell align="center" className="w-12">FGM</TableHeaderCell>
                            <TableHeaderCell align="center" className="w-12">FGA</TableHeaderCell>
                            <TableHeaderCell align="center" className="w-12">FG%</TableHeaderCell>
                            <TableHeaderCell align="center" className="w-12">3PM</TableHeaderCell>
                            <TableHeaderCell align="center" className="w-12">3PA</TableHeaderCell>
                            <TableHeaderCell align="center" className="w-12">3P%</TableHeaderCell>
                            <TableHeaderCell align="center" className="w-12">FTM</TableHeaderCell>
                            <TableHeaderCell align="center" className="w-12">FTA</TableHeaderCell>
                            <TableHeaderCell align="center" className="w-12">FT%</TableHeaderCell>
                            <TableHeaderCell align="center" className="w-12">+/-</TableHeaderCell>
                        </TableHead>
                        <TableBody>
                            {rosterStats.map(p => (
                                <TableRow
                                    key={p.id}
                                    onClick={onPlayerClick ? () => onPlayerClick(p.id) : undefined}
                                    className={onPlayerClick ? 'cursor-pointer' : 'hover:bg-white/5'}
                                >
                                    <TableCell className={`pl-4${stickyPlayerCol ? ' sticky left-0 bg-slate-900 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.3)]' : ''}`}>
                                        <span className={`text-xs font-bold text-slate-300${onPlayerClick ? ' group-hover:text-white transition-colors' : ''}`}>{p.name}</span>
                                    </TableCell>
                                    <TableCell align="center" className="text-xs text-slate-500">{p.position}</TableCell>
                                    <TableCell align="center"><OvrBadge value={p.ovr} size="sm" /></TableCell>
                                    <TableCell align="center" className="text-xs font-mono text-slate-400">{p.g}</TableCell>
                                    <TableCell align="center" className="text-xs font-mono text-slate-400">{p.mpg}</TableCell>
                                    <TableCell align="center" className="text-xs font-mono text-slate-300">{p.pts}</TableCell>
                                    <TableCell align="center" className="text-xs font-mono text-slate-300">{p.reb}</TableCell>
                                    <TableCell align="center" className="text-xs font-mono text-slate-300">{p.ast}</TableCell>
                                    <TableCell align="center" className="text-xs font-mono text-slate-300">{p.stl}</TableCell>
                                    <TableCell align="center" className="text-xs font-mono text-slate-300">{p.blk}</TableCell>
                                    <TableCell align="center" className="text-xs font-mono text-slate-300">{p.tov}</TableCell>
                                    <TableCell align="center" className="text-xs font-mono text-slate-400">{p.fgm}</TableCell>
                                    <TableCell align="center" className="text-xs font-mono text-slate-400">{p.fga}</TableCell>
                                    <TableCell align="center" className="text-xs font-mono text-slate-400">{fmtStatVal(p.fgPct, 'pct')}</TableCell>
                                    <TableCell align="center" className="text-xs font-mono text-slate-400">{p.p3m}</TableCell>
                                    <TableCell align="center" className="text-xs font-mono text-slate-400">{p.p3a}</TableCell>
                                    <TableCell align="center" className="text-xs font-mono text-slate-400">{fmtStatVal(p.p3Pct, 'pct')}</TableCell>
                                    <TableCell align="center" className="text-xs font-mono text-slate-400">{p.ftm}</TableCell>
                                    <TableCell align="center" className="text-xs font-mono text-slate-400">{p.fta}</TableCell>
                                    <TableCell align="center" className="text-xs font-mono text-slate-400">{fmtStatVal(p.ftPct, 'pct')}</TableCell>
                                    <TableCell align="center" className={`text-xs font-mono ${p.pm > 0 ? 'text-emerald-400' : p.pm < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                        {p.pm > 0 ? '+' : ''}{p.pm}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
};
