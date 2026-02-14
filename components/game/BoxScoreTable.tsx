
import React, { useState, useMemo } from 'react';
import { Team, PlayerBoxScore } from '../../types';
import { Crown, Shield, Lock, Unlock } from 'lucide-react';
import { OvrBadge } from '../common/OvrBadge';
import { TeamLogo } from '../common/TeamLogo';
import { calculatePlayerOvr } from '../../utils/constants';
import { TEAM_DATA } from '../../data/teamData';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';

export interface GameStatLeaders {
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    tov: number;
}

interface BoxScoreTableProps {
    team: Team;
    box: PlayerBoxScore[];
    isFirst?: boolean;
    mvpId?: string;
    leaders: GameStatLeaders;
}

type SortKey = 'default' | 'mp' | 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'tov' | 'pf' | 'fgm' | 'fg%' | 'p3m' | '3p%' | 'ftm' | 'ft%' | 'pm';

export const BoxScoreTable: React.FC<BoxScoreTableProps> = ({ team, box, isFirst, mvpId, leaders }) => {
    // Default sort state preserves the "Starters First, then Minutes" logic
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'default', direction: 'desc' });

    const handleSort = (key: SortKey) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const getSortValue = (p: PlayerBoxScore, key: SortKey): number => {
        switch (key) {
            case 'mp': return p.mp;
            case 'pts': return p.pts;
            case 'reb': return p.reb;
            case 'ast': return p.ast;
            case 'stl': return p.stl;
            case 'blk': return p.blk;
            case 'tov': return p.tov;
            case 'pf': return p.pf;
            case 'fgm': return p.fgm;
            case 'fg%': return p.fga > 0 ? p.fgm / p.fga : 0;
            case 'p3m': return p.p3m;
            case '3p%': return p.p3a > 0 ? p.p3m / p.p3a : 0;
            case 'ftm': return p.ftm;
            case 'ft%': return p.fta > 0 ? p.ftm / p.fta : 0;
            case 'pm': return p.plusMinus;
            default: return 0;
        }
    };

    // Sort players
    const sortedBox = useMemo(() => {
        const data = [...box];
        
        if (sortConfig.key === 'default') {
            // Original Default: Starters (GS=1) first, then by MP desc
            return data.sort((a, b) => {
                if (a.gs !== b.gs) return b.gs - a.gs;
                return b.mp - a.mp;
            });
        }

        return data.sort((a, b) => {
            const valA = getSortValue(a, sortConfig.key);
            const valB = getSortValue(b, sortConfig.key);
            return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
        });
    }, [box, sortConfig]);

    // Calculate Team Totals
    const totals = useMemo(() => {
        return box.reduce((acc, p) => ({
            mp: acc.mp + p.mp,
            pts: acc.pts + p.pts,
            reb: acc.reb + p.reb,
            ast: acc.ast + p.ast,
            stl: acc.stl + p.stl,
            blk: acc.blk + p.blk,
            tov: acc.tov + p.tov,
            pf: acc.pf + (p.pf || 0),
            fgm: acc.fgm + p.fgm,
            fga: acc.fga + p.fga,
            p3m: acc.p3m + p.p3m,
            p3a: acc.p3a + p.p3a,
            ftm: acc.ftm + p.ftm,
            fta: acc.fta + p.fta,
            offReb: acc.offReb + (p.offReb || 0),
            defReb: acc.defReb + (p.defReb || 0),
        }), {
            mp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
            fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, offReb: 0, defReb: 0
        });
    }, [box]);

    // Updated: Central Alignment for Stats
    const totalCellClass = "py-3 px-2 text-center text-xs font-semibold text-slate-300 font-mono tabular-nums bg-slate-800/50 border-t border-slate-700";

    const formatPct = (m: number, a: number) => {
        if (a === 0) return '-';
        return ((m / a) * 100).toFixed(1) + '%';
    };

    const teamColor = TEAM_DATA[team.id]?.colors.primary || '#6366f1';

    // Helper for Header Cells to reduce verbosity
    const SortableHeader = ({ label, sKey, width }: { label: string, sKey: SortKey, width?: string }) => (
        <TableHeaderCell 
            align="center" 
            className={`w-${width || '12'} ${label === 'PTS' ? 'text-slate-300' : ''}`}
            sortable 
            onSort={() => handleSort(sKey)}
            sortDirection={sortConfig.key === sKey ? sortConfig.direction : null}
        >
            {label}
        </TableHeaderCell>
    );

    return (
        // UI Fix: Removed rounded-xl and overflow-hidden, used border-y instead of full border for seamless integration
        <div className="w-full bg-slate-900 border-y border-slate-800 relative">
            {/* Team Color Top Border */}
            <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: teamColor }}></div>

            <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between mt-0.5">
                <div className="flex items-center gap-3">
                    <TeamLogo teamId={team.id} size="md" />
                    <span className="text-sm font-black text-white uppercase tracking-wider">{team.name}</span>
                </div>
            </div>
            
            {/* Table Component with styling overrides */}
            <Table className="!rounded-none !border-0 !shadow-none">
                <TableHead>
                    <TableHeaderCell align="left" className="px-4 sticky left-0 bg-slate-950 z-20 w-40 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">PLAYER</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-12">POS</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-10">OVR</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-10">FAT</TableHeaderCell>
                    
                    <SortableHeader label="MIN" sKey="mp" />
                    <SortableHeader label="PTS" sKey="pts" />
                    <SortableHeader label="REB" sKey="reb" />
                    <SortableHeader label="AST" sKey="ast" />
                    <SortableHeader label="STL" sKey="stl" />
                    <SortableHeader label="BLK" sKey="blk" />
                    <SortableHeader label="TOV" sKey="tov" />
                    <SortableHeader label="PF" sKey="pf" />
                    
                    <SortableHeader label="FG" sKey="fgm" width="16" />
                    <SortableHeader label="FG%" sKey="fg%" width="14" />
                    <SortableHeader label="3P" sKey="p3m" width="16" />
                    <SortableHeader label="3P%" sKey="3p%" width="14" />
                    <SortableHeader label="FT" sKey="ftm" width="16" />
                    <SortableHeader label="FT%" sKey="ft%" width="14" />
                    
                    <TableHeaderCell 
                        align="center" 
                        className="w-14 pr-4" 
                        sortable 
                        onSort={() => handleSort('pm')}
                        sortDirection={sortConfig.key === 'pm' ? sortConfig.direction : null}
                    >
                        +/-
                    </TableHeaderCell>
                </TableHead>
                <TableBody>
                    {sortedBox.map(p => {
                        const playerInfo = team.roster.find(rp => rp.id === p.playerId);
                        const ovr = playerInfo ? calculatePlayerOvr(playerInfo) : 70;
                        const isMvp = p.playerId === mvpId;
                        
                        const effect = p.matchupEffect || 0;
                        const isBuff = effect > 0;
                        const isDebuff = effect < 0;

                        // Condition Color Logic (Fatigue Calculation Fix)
                        // p.condition is remaining stamina (0-100). Fatigue = 100 - p.condition.
                        const currentCondition = p.condition ?? 100;
                        const fatigueUsed = 100 - currentCondition;
                        
                        let fatColor = 'text-emerald-500';
                        if (fatigueUsed > 25) fatColor = 'text-red-500';
                        else if (fatigueUsed > 15) fatColor = 'text-amber-500';

                        return (
                            <TableRow key={p.playerId} className={isMvp ? 'bg-amber-900/10' : ''}>
                                <TableCell className="px-4 sticky left-0 bg-slate-900 group-hover:bg-slate-800 transition-colors z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs font-semibold truncate max-w-[100px] ${isMvp ? 'text-amber-200' : 'text-slate-200'}`}>{p.playerName}</span>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            {isMvp && <Crown size={12} className="text-amber-400 fill-amber-400 animate-pulse" />}
                                            {p.isStopper && (
                                                <div className="flex items-center justify-center" title="Ace Stopper">
                                                    <Shield size={12} className="text-cyan-400 fill-cyan-900" />
                                                </div>
                                            )}
                                            {p.isAceTarget && (
                                                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${isDebuff ? 'bg-red-950/50 border-red-500/30' : isBuff ? 'bg-emerald-950/50 border-emerald-500/30' : 'bg-slate-800 border-slate-600/30'}`}>
                                                    {isDebuff ? (
                                                        <Lock size={10} className="text-red-400" />
                                                    ) : (
                                                        <Unlock size={10} className={isBuff ? "text-emerald-400" : "text-slate-400"} />
                                                    )}
                                                    <span className={`text-[9px] font-black leading-none ${isDebuff ? 'text-red-400' : isBuff ? 'text-emerald-400' : 'text-slate-400'}`}>
                                                        {effect > 0 ? '+' : ''}{effect}%
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell align="center" className="text-xs font-semibold text-slate-500">{playerInfo?.position || '-'}</TableCell>
                                <TableCell align="center">
                                    <div className="flex justify-center">
                                        <OvrBadge value={ovr} size="sm" className="!w-7 !h-7 !text-xs !shadow-none" />
                                    </div>
                                </TableCell>
                                <TableCell align="center">
                                    <span className={`text-xs font-semibold font-mono ${fatColor}`}>{Math.round(fatigueUsed)}</span>
                                </TableCell>
                                <TableCell variant="stat" align="center" className="text-xs font-semibold" value={Math.round(p.mp)} />
                                <TableCell variant="stat" align="center" className="text-xs font-semibold text-slate-200" value={p.pts} />
                                <TableCell variant="stat" align="center" className="text-xs font-semibold" value={p.reb} />
                                <TableCell variant="stat" align="center" className="text-xs font-semibold" value={p.ast} />
                                <TableCell variant="stat" align="center" className="text-xs font-semibold" value={p.stl} />
                                <TableCell variant="stat" align="center" className="text-xs font-semibold" value={p.blk} />
                                <TableCell variant="stat" align="center" className="text-xs font-semibold" value={p.tov} />
                                <TableCell variant="stat" align="center" className="text-xs font-semibold" value={p.pf} />
                                <TableCell variant="stat" align="center" className="text-xs font-semibold" value={`${p.fgm}/${p.fga}`} />
                                <TableCell variant="stat" align="center" className="text-xs font-semibold text-slate-400" value={formatPct(p.fgm, p.fga)} />
                                <TableCell variant="stat" align="center" className="text-xs font-semibold" value={`${p.p3m}/${p.p3a}`} />
                                <TableCell variant="stat" align="center" className="text-xs font-semibold text-slate-400" value={formatPct(p.p3m, p.p3a)} />
                                <TableCell variant="stat" align="center" className="text-xs font-semibold" value={`${p.ftm}/${p.fta}`} />
                                <TableCell variant="stat" align="center" className="text-xs font-semibold text-slate-400" value={formatPct(p.ftm, p.fta)} />
                                <TableCell align="center" className="pr-4">
                                    <span className={`font-mono font-semibold text-xs tabular-nums ${p.plusMinus > 0 ? 'text-emerald-400' : p.plusMinus < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                        {p.plusMinus > 0 ? '+' : ''}{p.plusMinus}
                                    </span>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
                <tfoot>
                    <tr>
                        <td className="py-3 px-4 sticky left-0 bg-slate-800 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.5)] border-t border-slate-700">
                            <span className="text-xs font-black text-white uppercase tracking-wider">TEAM TOTALS</span>
                        </td>
                        <td className={totalCellClass} colSpan={3}></td>
                        <td className={totalCellClass}>{Math.round(totals.mp)}</td>
                        <td className={totalCellClass}>{totals.pts}</td>
                        <td className={totalCellClass}>{totals.reb}</td>
                        <td className={totalCellClass}>{totals.ast}</td>
                        <td className={totalCellClass}>{totals.stl}</td>
                        <td className={totalCellClass}>{totals.blk}</td>
                        <td className={totalCellClass}>{totals.tov}</td>
                        <td className={totalCellClass}>{totals.pf}</td>
                        
                        <td className={totalCellClass}>{totals.fgm}/{totals.fga}</td>
                        <td className={totalCellClass}>{formatPct(totals.fgm, totals.fga)}</td>
                        
                        <td className={totalCellClass}>{totals.p3m}/{totals.p3a}</td>
                        <td className={totalCellClass}>{formatPct(totals.p3m, totals.p3a)}</td>
                        
                        <td className={totalCellClass}>{totals.ftm}/{totals.fta}</td>
                        <td className={totalCellClass}>{formatPct(totals.ftm, totals.fta)}</td>
                        
                        <td className={totalCellClass}>-</td>
                    </tr>
                </tfoot>
            </Table>
        </div>
    );
};
