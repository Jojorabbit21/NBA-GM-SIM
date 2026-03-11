import React, { useState, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { GameRecapContent, Team, PlayerBoxScore } from '../../types';
import { TeamLogo } from '../common/TeamLogo';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell, TableFoot } from '../common/Table';
import type { SortKey } from './shared/inboxTypes';

interface GameRecapViewerProps {
    gameData: GameRecapContent;
    teams: Team[];
    myTeamId: string;
    onPlayerClick: (id: string) => void;
    handleViewDetails: (gameId: string) => void;
    isFetchingResult: boolean;
}

export const GameRecapViewer: React.FC<GameRecapViewerProps> = ({ gameData, teams, myTeamId, onPlayerClick, handleViewDetails, isFetchingResult }) => {
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'default', direction: 'desc' });

    const homeTeam = teams.find(t => t.id === gameData.homeTeamId);
    const awayTeam = teams.find(t => t.id === gameData.awayTeamId);

    // Extract date from gameId (format: g_YYYY-MM-DD_...)
    const gameDate = useMemo(() => {
        const parts = gameData.gameId.split('_');
        const datePart = parts.find(p => /^\d{4}-\d{2}-\d{2}$/.test(p));
        return datePart || '';
    }, [gameData.gameId]);

    // Determine win/loss based on myTeamId
    const isWin = gameData.homeTeamId === myTeamId
        ? gameData.homeScore > gameData.awayScore
        : gameData.awayScore > gameData.homeScore;

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

    const sortedBox = useMemo(() => {
        if (!gameData.userBoxScore) return [];
        const data = [...gameData.userBoxScore].filter(p => p.mp > 0);

        if (sortConfig.key === 'default') {
             // Default: Starters (GS=1) first, then by MP desc
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
    }, [gameData.userBoxScore, sortConfig]);

    const totals = useMemo(() => {
        if (!sortedBox) return null;
        return sortedBox.reduce((acc, p) => ({
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
            plusMinus: acc.plusMinus + p.plusMinus
        }), {
            mp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
            fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, plusMinus: 0
        });
    }, [sortedBox]);

    const formatPct = (m: number, a: number) => (a > 0 ? ((m/a)*100).toFixed(0) + '%' : '-');

    const SortableHeader = ({ label, sKey, width }: { label: string, sKey: SortKey, width?: string }) => (
        <TableHeaderCell
            align="center"
            className={`w-${width || 'auto'} ${label === 'PTS' ? 'text-slate-300' : 'text-slate-400'}`}
            sortable
            onSort={() => handleSort(sKey)}
            sortDirection={sortConfig.key === sKey ? sortConfig.direction : null}
        >
            {label}
        </TableHeaderCell>
    );

    const totalCellClass = "py-3 px-2 text-center text-xs font-black text-slate-300 font-mono tabular-nums bg-slate-800/80 border-t border-slate-700";

    return (
        <div className="space-y-8 max-w-5xl mx-auto">
            {/* 1. Document-style Report Header */}
            <div className="space-y-2">
                {/* Game Date */}
                {gameDate && (
                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.2em]">
                        {gameDate}
                    </p>
                )}

                {/* Matchup Row — plain text layout */}
                <div className="flex items-center gap-3 flex-wrap">
                    <TeamLogo teamId={awayTeam?.id || ''} size="sm" />
                    <span className="text-sm font-black uppercase tracking-tight text-slate-300">{awayTeam?.name}</span>
                    <span className={`text-sm font-black tabular-nums ${gameData.awayScore > gameData.homeScore ? 'text-white' : 'text-slate-500'}`}>{gameData.awayScore}</span>
                    <span className="text-slate-600 font-bold text-lg">–</span>
                    <span className={`text-sm font-black tabular-nums ${gameData.homeScore > gameData.awayScore ? 'text-white' : 'text-slate-500'}`}>{gameData.homeScore}</span>
                    <span className="text-sm font-black uppercase tracking-tight text-slate-300">{homeTeam?.name}</span>
                    <TeamLogo teamId={homeTeam?.id || ''} size="sm" />
                    <span className={`ml-1 text-[11px] font-black uppercase tracking-[0.15em] ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isWin ? '▲ WIN' : '▼ LOSS'}
                    </span>
                </div>

                {/* Divider */}
                <div className="border-t border-slate-700" />
            </div>

            {/* 2. Full Box Score */}
            {sortedBox.length > 0 && (
                <div className="space-y-4">
                    <h4 className="text-sm font-black text-slate-400 px-2 uppercase tracking-widest">
                        박스스코어
                    </h4>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                        <Table className="!rounded-none !border-0 !shadow-none">
                            <TableHead className="bg-slate-950">
                                <TableHeaderCell align="left" className="pl-6 w-40 sticky left-0 bg-slate-950 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">PLAYER</TableHeaderCell>
                                <TableHeaderCell align="center">POS</TableHeaderCell>
                                <SortableHeader label="MIN" sKey="mp" />
                                <SortableHeader label="PTS" sKey="pts" />
                                <SortableHeader label="REB" sKey="reb" />
                                <SortableHeader label="AST" sKey="ast" />
                                <SortableHeader label="STL" sKey="stl" />
                                <SortableHeader label="BLK" sKey="blk" />
                                <SortableHeader label="TOV" sKey="tov" />
                                <SortableHeader label="PF" sKey="pf" />
                                <SortableHeader label="FG" sKey="fgm" />
                                <SortableHeader label="3P" sKey="p3m" />
                                <SortableHeader label="FT" sKey="ftm" />
                                <SortableHeader label="+/-" sKey="pm" />
                            </TableHead>
                            <TableBody>
                                {sortedBox.map(p => (
                                    <TableRow key={p.playerId} onClick={() => onPlayerClick(p.playerId)}>
                                        <TableCell className="pl-6 text-xs font-bold text-slate-300 group-hover:text-white transition-colors sticky left-0 bg-slate-900 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">{p.playerName}</TableCell>
                                        <TableCell align="center" className="text-xs font-semibold text-slate-500">{teams.find(t => t.roster.some(r => r.id === p.playerId))?.roster.find(r => r.id === p.playerId)?.position || '-'}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-semibold text-slate-400">{Math.round(p.mp)}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-bold text-white">{p.pts}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-semibold text-slate-300">{p.reb}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-semibold text-slate-300">{p.ast}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-semibold text-slate-300">{p.stl}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-semibold text-slate-300">{p.blk}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-semibold text-slate-300">{p.tov}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-semibold text-slate-300">{p.pf}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-semibold text-slate-400">{p.fgm}/{p.fga}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-semibold text-slate-400">{p.p3m}/{p.p3a}</TableCell>
                                        <TableCell align="center" className="text-xs font-mono font-semibold text-slate-400">{p.ftm}/{p.fta}</TableCell>
                                        <TableCell align="center" className={`text-xs font-mono font-bold ${p.plusMinus > 0 ? 'text-emerald-400' : p.plusMinus < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                            {p.plusMinus > 0 ? '+' : ''}{p.plusMinus}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            {totals && (
                                <TableFoot>
                                    <tr>
                                        <td className="py-3 px-6 sticky left-0 bg-slate-800 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.5)] border-t border-slate-700">
                                            <span className="text-xs font-black text-white uppercase tracking-wider">TEAM TOTALS</span>
                                        </td>
                                        <td className={totalCellClass}>-</td>
                                        <td className={totalCellClass}>{Math.round(totals.mp)}</td>
                                        <td className={totalCellClass}>{totals.pts}</td>
                                        <td className={totalCellClass}>{totals.reb}</td>
                                        <td className={totalCellClass}>{totals.ast}</td>
                                        <td className={totalCellClass}>{totals.stl}</td>
                                        <td className={totalCellClass}>{totals.blk}</td>
                                        <td className={totalCellClass}>{totals.tov}</td>
                                        <td className={totalCellClass}>{totals.pf}</td>
                                        <td className={totalCellClass}>{totals.fgm}/{totals.fga}</td>
                                        <td className={totalCellClass}>{totals.p3m}/{totals.p3a}</td>
                                        <td className={totalCellClass}>{totals.ftm}/{totals.fta}</td>
                                        <td className={totalCellClass}>
                                            <span className="text-slate-600">—</span>
                                        </td>
                                    </tr>
                                </TableFoot>
                            )}
                        </Table>
                    </div>
                </div>
            )}

            {/* View Detail Button */}
            <div className="flex justify-center pt-4">
                <button
                    onClick={() => handleViewDetails(gameData.gameId)}
                    disabled={isFetchingResult}
                    className="flex items-center gap-3 px-12 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-base font-black uppercase tracking-widest transition-all shadow-[0_10px_20px_rgba(79,70,229,0.3)] border border-indigo-500/50 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 group"
                >
                    {isFetchingResult && <Loader2 className="animate-spin" size={20} />}
                    <span>상세 보고서 보기</span>
                </button>
            </div>
        </div>
    );
};
