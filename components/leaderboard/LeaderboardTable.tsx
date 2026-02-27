
import React from 'react';
import { Player } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';
import { TeamLogo } from '../common/TeamLogo';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';
import { PLAYER_COLUMNS, TEAM_COLUMNS, ColumnDef, ViewMode, StatCategory } from '../../data/leaderboardConfig';
import { getHeatmapStyle } from '../../utils/heatmapUtils';

interface LeaderboardTableProps {
    data: any[];
    mode: ViewMode;
    statCategory: StatCategory;
    sortConfig: { key: string; direction: 'asc' | 'desc' };
    onSort: (key: string) => void;
    onRowClick: (item: any) => void;
    statRanges: Record<string, { min: number, max: number }>;
    showHeatmap: boolean;
    currentPage: number;
    itemsPerPage: number;
}

export const LeaderboardTable: React.FC<LeaderboardTableProps> = ({
    data, mode, statCategory, sortConfig, onSort, onRowClick, statRanges, showHeatmap, currentPage, itemsPerPage
}) => {
    
    // Select column config based on mode
    const allColumns = mode === 'Players' ? PLAYER_COLUMNS : TEAM_COLUMNS;
    
    // Filter columns based on category
    // Common columns are always shown. 
    const visibleColumns = allColumns.filter(c => c.category === 'Common' || c.category === statCategory);

    // Helpers
    const getStickyStyle = (col: ColumnDef, isLastSticky: boolean) => {
        if (col.stickyLeft === undefined) return undefined;
        return {
            left: col.stickyLeft,
            width: col.width,
            minWidth: col.width,
            maxWidth: col.width,
            position: 'sticky' as 'sticky',
            zIndex: 30,
            borderRight: isLastSticky ? undefined : 'none',
            boxShadow: 'none',
            clipPath: col.stickyShadow ? 'inset(0 -15px 0 0)' : undefined
        };
    };

    const formatValue = (val: number, format?: string) => {
        if (format === 'percent') return (val * 100).toFixed(1) + '%';
        if (format === 'number') return val.toFixed(1);
        return val;
    };

    const contentTextClass = "text-xs font-medium text-white font-mono tabular-nums";

    // Attributes 탭일 때 카테고리 그룹 행 생성
    const attrGroupRow = statCategory === 'Attributes' ? (() => {
        const groups: { label: string; colSpan: number; }[] = [];
        let currentGroup = '';
        for (const col of visibleColumns) {
            const group = col.attrGroup || '';
            if (group && group !== currentGroup) {
                groups.push({ label: group, colSpan: 1 });
                currentGroup = group;
            } else if (group && group === currentGroup) {
                groups[groups.length - 1].colSpan++;
            } else {
                // Common 컬럼 (sticky: #, PLAYER, POS, OVR)
                groups.push({ label: '', colSpan: 1 });
                currentGroup = '';
            }
        }
        return groups;
    })() : null;

    // 카테고리별 배경색
    const groupColorMap: Record<string, string> = {
        'INSIDE': 'bg-rose-900/40 text-rose-300',
        'OUTSIDE': 'bg-sky-900/40 text-sky-300',
        'PLAYMAKING': 'bg-amber-900/40 text-amber-300',
        'DEFENSE': 'bg-emerald-900/40 text-emerald-300',
        'REBOUND': 'bg-orange-900/40 text-orange-300',
        'ATHLETIC': 'bg-purple-900/40 text-purple-300',
    };

    return (
        <Table className="!rounded-none !border-0 !shadow-none" fullHeight style={{ tableLayout: 'fixed', minWidth: '100%' }}>
            <colgroup>
                {visibleColumns.map(col => (
                    <col key={col.key} style={{ width: col.width }} />
                ))}
            </colgroup>

            <TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm" noRow={!!attrGroupRow}>
                {attrGroupRow ? (
                    <>
                        {/* 1열: 카테고리 그룹 */}
                        <tr className="h-6">
                            {attrGroupRow.map((g, i) => {
                                if (!g.label) {
                                    // Common 스티키 셀
                                    const col = visibleColumns[attrGroupRow.slice(0, i).reduce((s, x) => s + x.colSpan, 0)];
                                    const stickyStyle = col?.stickyLeft !== undefined ? {
                                        position: 'sticky' as const, left: col.stickyLeft, zIndex: 50,
                                    } : undefined;
                                    return <th key={i} colSpan={g.colSpan} className="bg-slate-950 border-r border-slate-800/30" style={stickyStyle} />;
                                }
                                return (
                                    <th key={i} colSpan={g.colSpan}
                                        className={`text-[9px] font-black uppercase tracking-widest text-center border-r border-slate-800/50 ${groupColorMap[g.label] || 'bg-slate-900/40 text-slate-400'}`}
                                    >
                                        {g.label}
                                    </th>
                                );
                            })}
                        </tr>
                        {/* 2열: 개별 능력치 컬럼명 */}
                        <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest h-8">
                            {visibleColumns.map((col, idx) => {
                                const isLastSticky = (visibleColumns[idx+1] && visibleColumns[idx+1].stickyLeft === undefined) || !visibleColumns[idx+1];
                                const style = getStickyStyle(col, isLastSticky);
                                return (
                                    <TableHeaderCell
                                        key={col.key}
                                        style={style}
                                        stickyLeft={col.stickyLeft !== undefined}
                                        align={col.key === 'name' ? 'left' : 'center'}
                                        className={`border-r border-slate-800 bg-slate-950 ${sortConfig.key === col.key ? 'text-indigo-400 font-bold' : 'text-slate-400'} ${col.key === 'name' ? 'pl-4' : ''}`}
                                        sortable={col.sortable}
                                        onSort={() => col.sortable && onSort(col.key)}
                                        sortDirection={sortConfig.key === col.key ? sortConfig.direction : null}
                                    >
                                        {col.label}
                                    </TableHeaderCell>
                                );
                            })}
                        </tr>
                    </>
                ) : (
                    visibleColumns.map((col, idx) => {
                        const isLastSticky = (visibleColumns[idx+1] && visibleColumns[idx+1].stickyLeft === undefined) || !visibleColumns[idx+1];
                        const style = getStickyStyle(col, isLastSticky);

                        return (
                            <TableHeaderCell
                                key={col.key}
                                style={style}
                                stickyLeft={col.stickyLeft !== undefined}
                                align={col.key === 'name' ? 'left' : 'center'}
                                className={`border-r border-slate-800 bg-slate-950 ${sortConfig.key === col.key ? 'text-indigo-400 font-bold' : 'text-slate-400'} ${col.key === 'name' ? 'pl-4' : ''}`}
                                sortable={col.sortable}
                                onSort={() => col.sortable && onSort(col.key)}
                                sortDirection={sortConfig.key === col.key ? sortConfig.direction : null}
                            >
                                {col.label}
                            </TableHeaderCell>
                        );
                    })
                )}
            </TableHead>

            <TableBody>
                {data.map((item, index) => {
                    const rank = (currentPage - 1) * itemsPerPage + index + 1;
                    const rankColor = rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-slate-300' : rank === 3 ? 'text-amber-600' : 'text-slate-600';
                    const stickyCellClass = "bg-slate-900 group-hover:bg-slate-800 transition-colors z-30";

                    return (
                        <TableRow key={mode === 'Players' ? item.id : item.id} onClick={() => onRowClick(item)} className="group h-10">
                            {visibleColumns.map((col, idx) => {
                                const isLastSticky = (visibleColumns[idx+1] && visibleColumns[idx+1].stickyLeft === undefined) || !visibleColumns[idx+1];
                                const style = getStickyStyle(col, isLastSticky);
                                
                                // --- Data Access ---
                                let cellContent: React.ReactNode = null;
                                let bgStyle = undefined;

                                if (mode === 'Players') {
                                    const p = item as Player & { teamName: string; teamId: string };
                                    const s = p.stats as any; // Cast to any to access dynamic zone keys
                                    const g = s.g || 1;

                                    if (col.key === 'rank') cellContent = rank;
                                    else if (col.key === 'name') {
                                        cellContent = (
                                            <div className="flex items-center gap-3">
                                                <TeamLogo teamId={p.teamId} size="sm" />
                                                <span className="text-xs font-semibold text-slate-200 truncate group-hover:text-indigo-300 block">{p.name}</span>
                                            </div>
                                        );
                                    }
                                    else if (col.key === 'position') cellContent = p.position;
                                    else if (col.key === 'ovr') cellContent = <div className="flex justify-center"><OvrBadge value={calculatePlayerOvr(p)} size="sm" className="!w-7 !h-7 !text-xs !shadow-none" /></div>;
                                    
                                    // Handle Attribute Columns (direct Player property access, no per-game division)
                                    else if (col.category === 'Attributes') {
                                        const prop = col.playerProp || col.key;
                                        cellContent = (p as any)[prop] ?? 0;
                                    }

                                    // Handle Zone Stats (Dynamic Keys)
                                    else if (col.key.startsWith('zone_')) {
                                         // For Makers/Attempts, calculate per game
                                         if (col.key.endsWith('_m') || col.key.endsWith('_a')) {
                                             const val = (s[col.key] || 0) / g;
                                             cellContent = val.toFixed(1);
                                             if (col.isHeatmap) {
                                                 bgStyle = getHeatmapStyle(col.key, val, statRanges, showHeatmap, col.isInverse);
                                             }
                                         }
                                         // For PCT, use pre-calculated value
                                         else if (col.key.endsWith('_pct')) {
                                             const val = s[col.key] || 0;
                                             cellContent = formatValue(val, col.format);
                                             if (col.isHeatmap) {
                                                 bgStyle = getHeatmapStyle(col.key, val, statRanges, showHeatmap, col.isInverse);
                                             }
                                         }
                                    }
                                    
                                    // Standard Stats
                                    else {
                                        // Need to map column key to player stat key
                                        let rawVal = 0;
                                        // Mapping logic (simplified for common keys)
                                        if (col.key === 'g') rawVal = s.g;
                                        else if (col.key === 'mp') rawVal = s.mp/g;
                                        else if (col.key === 'pts') rawVal = s.pts/g;
                                        else if (col.key === 'reb') rawVal = s.reb/g;
                                        else if (col.key === 'oreb') rawVal = (s.offReb||0)/g;
                                        else if (col.key === 'dreb') rawVal = (s.defReb||0)/g;
                                        else if (col.key === 'ast') rawVal = s.ast/g;
                                        else if (col.key === 'stl') rawVal = s.stl/g;
                                        else if (col.key === 'blk') rawVal = s.blk/g;
                                        else if (col.key === 'tov') rawVal = s.tov/g;
                                        else if (col.key === 'pf') rawVal = (s.pf||0)/g;
                                        else if (col.key === 'pm') rawVal = s.plusMinus/g;
                                        else if (col.key === 'fg%') rawVal = s.fga>0 ? s.fgm/s.fga : 0;
                                        else if (col.key === '3p%') rawVal = s.p3a>0 ? s.p3m/s.p3a : 0;
                                        else if (col.key === 'ft%') rawVal = s.fta>0 ? s.ftm/s.fta : 0;
                                        else if (col.key === 'ts%') {
                                            const tsa = s.fga + 0.44 * s.fta;
                                            rawVal = tsa>0 ? s.pts / (2*tsa) : 0;
                                        }
                                        // Advanced stats: pre-calculated in useLeaderboardData (efg%, tov%, usg%, ast%, orb%, drb%, trb%, stl%, blk%, 3par, ftr)
                                        else {
                                            rawVal = typeof s[col.key] === 'number' ? s[col.key] : 0;
                                        }

                                        cellContent = formatValue(rawVal, col.format);
                                        if (col.isHeatmap) {
                                            bgStyle = getHeatmapStyle(col.key, rawVal, statRanges, showHeatmap, col.isInverse);
                                        }
                                    }

                                } else {
                                    // TEAM Mode
                                    const t = item;
                                    const s = t.stats;

                                    if (col.key === 'rank') cellContent = rank;
                                    else if (col.key === 'name') {
                                        cellContent = (
                                            <div className="flex items-center gap-3">
                                                <TeamLogo teamId={t.id} size="sm" />
                                                <span className="text-xs font-semibold text-slate-200 uppercase truncate">{t.name}</span>
                                            </div>
                                        );
                                    }
                                    else if (col.key === 'wins') cellContent = t.wins;
                                    else if (col.key === 'losses') cellContent = t.losses;
                                    else if (col.key === 'winPct') cellContent = ((t.wins+t.losses)>0 ? t.wins/(t.wins+t.losses) : 0).toFixed(3);
                                    
                                    else {
                                        // Team Stats are already pre-calculated averages in the hook
                                        let rawVal = s[col.key];
                                        if (rawVal !== undefined) {
                                            cellContent = formatValue(rawVal, col.format);
                                            if (col.isHeatmap) {
                                                bgStyle = getHeatmapStyle(col.key, rawVal, statRanges, showHeatmap, col.isInverse);
                                            }
                                        }
                                    }
                                }

                                const stickyClass = col.stickyLeft !== undefined ? stickyCellClass : "";
                                const rankClass = col.key === 'rank' ? rankColor : "";
                                
                                // [Fix] Correct text size and weight for +/- column
                                let finalTextColor = contentTextClass;
                                if (col.key === 'pm') {
                                    const val = parseFloat(cellContent as string);
                                    const color = val > 0 ? 'text-emerald-400' : val < 0 ? 'text-red-400' : 'text-slate-500';
                                    finalTextColor = `text-xs font-medium font-mono tabular-nums ${color}`;
                                } else if (col.category === 'Attributes') {
                                    const val = Number(cellContent);
                                    const color = val >= 90 ? 'text-fuchsia-400' : val >= 80 ? 'text-emerald-400' : val >= 70 ? 'text-amber-400' : 'text-slate-500';
                                    finalTextColor = `text-xs font-black font-mono tabular-nums ${color}`;
                                }
                                
                                const alignClass = col.key === 'name' ? 'pl-4' : 'text-center';

                                return (
                                    <TableCell 
                                        key={col.key}
                                        style={{...style, ...bgStyle}}
                                        stickyLeft={col.stickyLeft !== undefined}
                                        className={`border-r border-slate-800/30 ${stickyClass} ${rankClass} ${finalTextColor} ${alignClass}`}
                                    >
                                        {col.key === 'pm' && parseFloat(cellContent as string) > 0 ? '+' : ''}
                                        {cellContent}
                                    </TableCell>
                                );
                            })}
                        </TableRow>
                    );
                })}
                {data.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={visibleColumns.length} className="py-20 text-center text-slate-500 font-bold uppercase tracking-widest">
                            데이터가 없습니다.
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
    );
};
