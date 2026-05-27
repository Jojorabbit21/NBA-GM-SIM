
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
        if (format === 'percent') {
            const pct = val * 100;
            return (pct >= 100 ? '100' : pct.toFixed(1)) + '%';
        }
        if (format === 'number') return val.toFixed(1);
        if (format === 'integer') return Math.round(val).toString();
        return val;
    };

    const contentTextClass = "text-xs font-medium text-white font-mono tabular-nums";

    // Attributes / Defense 탭: 2행 그룹 헤더 데이터 생성
    // row1 — non-grouped cols: rowSpan=2 / grouped cols: 그룹 레이블(colSpan)
    // row2 — grouped cols 개별 레이블만
    type Row1Item = { type: 'nogroup'; col: ColumnDef; colIdx: number } | { type: 'group'; label: string; colSpan: number };
    const headerData = (statCategory === 'Attributes' || statCategory === 'Defense' || statCategory === 'Shooting') ? (() => {
        const row1: Row1Item[] = [];
        const row2: Array<{ col: ColumnDef; colIdx: number }> = [];
        visibleColumns.forEach((col, colIdx) => {
            if (!col.attrGroup) {
                row1.push({ type: 'nogroup', col, colIdx });
            } else {
                row2.push({ col, colIdx });
                const last = row1[row1.length - 1];
                if (last && last.type === 'group' && last.label === col.attrGroup) {
                    (last as { type: 'group'; label: string; colSpan: number }).colSpan++;
                } else {
                    row1.push({ type: 'group', label: col.attrGroup, colSpan: 1 });
                }
            }
        });
        return row2.length > 0 ? { row1, row2 } : null;
    })() : null;

    if (data.length === 0) {
        return (
            <div className="relative h-full">
                <Table className="!rounded-none !border-0 !shadow-none" fullHeight tableStyle={{ tableLayout: 'fixed', minWidth: '100%' }}>
                    <colgroup>
                        {visibleColumns.map(col => (
                            <col key={col.key} style={{ width: col.width }} />
                        ))}
                    </colgroup>
                    <TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm" noRow={!!headerData}>
                        {headerData ? (
                            <>
                                <tr className="text-slate-500 text-xs font-black uppercase tracking-widest h-7">
                                    {headerData.row1.map((item, i) => {
                                        if (item.type === 'nogroup') {
                                            const { col, colIdx } = item;
                                            const isLastSticky = (visibleColumns[colIdx + 1] && visibleColumns[colIdx + 1].stickyLeft === undefined) || !visibleColumns[colIdx + 1];
                                            const style = getStickyStyle(col, isLastSticky);
                                            return (
                                                <TableHeaderCell
                                                    key={col.key}
                                                    rowSpan={2}
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
                                        }
                                        return (
                                            <th key={i} colSpan={item.colSpan}
                                                className="bg-slate-950 border-b border-r border-slate-800 text-xs font-black uppercase tracking-widest text-center text-slate-400 px-2 align-middle"
                                            >
                                                {item.label}
                                            </th>
                                        );
                                    })}
                                </tr>
                                <tr className="text-slate-500 text-xs font-black uppercase tracking-widest h-7">
                                    {headerData.row2.map(({ col, colIdx }) => {
                                        const isLastSticky = (visibleColumns[colIdx + 1] && visibleColumns[colIdx + 1].stickyLeft === undefined) || !visibleColumns[colIdx + 1];
                                        const style = getStickyStyle(col, isLastSticky);
                                        return (
                                            <TableHeaderCell
                                                key={col.key}
                                                style={style}
                                                stickyLeft={col.stickyLeft !== undefined}
                                                align="center"
                                                className={`border-r border-slate-800 bg-slate-950 ${sortConfig.key === col.key ? 'text-indigo-400 font-bold' : 'text-slate-400'}`}
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
                    <TableBody />
                </Table>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-slate-500 font-bold uppercase tracking-widest text-sm">데이터가 없습니다.</span>
                </div>
            </div>
        );
    }

    return (
        <Table className="!rounded-none !border-0 !shadow-none" fullHeight tableStyle={{ tableLayout: 'fixed', minWidth: '100%' }}>
            <colgroup>
                {visibleColumns.map(col => (
                    <col key={col.key} style={{ width: col.width }} />
                ))}
            </colgroup>

            <TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm" noRow={!!headerData}>
                {headerData ? (
                    <>
                        <tr className="text-slate-500 text-xs font-black uppercase tracking-widest h-7">
                            {headerData.row1.map((item, i) => {
                                if (item.type === 'nogroup') {
                                    const { col, colIdx } = item;
                                    const isLastSticky = (visibleColumns[colIdx + 1] && visibleColumns[colIdx + 1].stickyLeft === undefined) || !visibleColumns[colIdx + 1];
                                    const style = getStickyStyle(col, isLastSticky);
                                    return (
                                        <TableHeaderCell
                                            key={col.key}
                                            rowSpan={2}
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
                                }
                                return (
                                    <th key={i} colSpan={item.colSpan}
                                        className="bg-slate-950 border-b border-r border-slate-800 text-xs font-black uppercase tracking-widest text-center text-slate-400 px-2 align-middle"
                                    >
                                        {item.label}
                                    </th>
                                );
                            })}
                        </tr>
                        <tr className="text-slate-500 text-xs font-black uppercase tracking-widest h-7">
                            {headerData.row2.map(({ col, colIdx }) => {
                                const isLastSticky = (visibleColumns[colIdx + 1] && visibleColumns[colIdx + 1].stickyLeft === undefined) || !visibleColumns[colIdx + 1];
                                const style = getStickyStyle(col, isLastSticky);
                                return (
                                    <TableHeaderCell
                                        key={col.key}
                                        style={style}
                                        stickyLeft={col.stickyLeft !== undefined}
                                        align="center"
                                        className={`border-r border-slate-800 bg-slate-950 ${sortConfig.key === col.key ? 'text-indigo-400 font-bold' : 'text-slate-400'}`}
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
                        <TableRow key={mode === 'Players' ? item.id : item.id} className="group h-10">
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
                                                <span onClick={() => onRowClick(item)} className="text-xs font-semibold text-slate-200 truncate hover:text-indigo-300 cursor-pointer block">{p.name}</span>
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
                                        else if (col.key === 'fgm') rawVal = s.fgm/g;
                                        else if (col.key === 'fga') rawVal = s.fga/g;
                                        else if (col.key === 'p3m') rawVal = s.p3m/g;
                                        else if (col.key === 'p3a') rawVal = s.p3a/g;
                                        else if (col.key === 'ftm') rawVal = s.ftm/g;
                                        else if (col.key === 'fta') rawVal = s.fta/g;
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
                                                <span onClick={() => onRowClick(item)} className="text-xs font-semibold text-slate-200 uppercase truncate hover:text-indigo-300 cursor-pointer">{t.name}</span>
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
                                
                                return (
                                    <TableCell
                                        key={col.key}
                                        style={{...style, ...bgStyle}}
                                        stickyLeft={col.stickyLeft !== undefined}
                                        align={col.key === 'name' ? 'left' : 'center'}
                                        className={`border-r border-slate-800/30 ${stickyClass} ${rankClass} ${finalTextColor} ${col.key === 'name' ? 'pl-4' : ''}`}
                                    >
                                        {col.key === 'pm' && parseFloat(cellContent as string) > 0 ? '+' : ''}
                                        {cellContent}
                                    </TableCell>
                                );
                            })}
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
};
