
import React from 'react';
import { Player } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell, TableGroupHeaderCell } from '../common/Table';
import { PLAYER_COLUMNS, TEAM_COLUMNS, ColumnDef, ViewMode, StatCategory, getAttrValue } from '../../data/leaderboardConfig';
import { getHeatmapStyle } from '../../utils/heatmapUtils';
import { PlayerHoverCard } from '../common/PlayerHoverCard';
import { TableEmptyRow } from '../common/EmptyState';

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
    /** 선수 이름에 hover 시 능력치+스탯 요약 팝업 표시 — 멀티플레이어 전용 기능이라
     *  호출부에서 명시적으로 켜야 함(싱글플레이어는 미지정 시 기본 false). */
    enableHoverCard?: boolean;
}

// 고정 열(stickyLeft 숫자)은 Table이 position/left/배경/z-index를 붙인다(2026-10-13). 여기선 폭과,
// 마지막 고정 열의 우측 그림자 클립만 style로 넘긴다.
const stickyProps = (col: ColumnDef) => ({
    stickyLeft: col.stickyLeft,
    width: col.width,
    style: col.stickyLeft !== undefined && col.stickyShadow ? { clipPath: 'inset(0 -15px 0 0)' } : undefined,
});

const formatValue = (val: number, format?: string) => {
    if (format === 'percent') {
        const pct = val * 100;
        return (pct >= 100 ? '100' : pct.toFixed(1)) + '%';
    }
    if (format === 'number') return val.toFixed(1);
    if (format === 'integer') return Math.round(val).toString();
    return val;
};

const contentTextClass = "text-sm font-medium text-white tabular-nums";

export const LeaderboardTable: React.FC<LeaderboardTableProps> = ({
    data, mode, statCategory, sortConfig, onSort, onRowClick, statRanges, showHeatmap, currentPage, itemsPerPage, enableHoverCard = false
}) => {

    // Select column config based on mode
    const allColumns = mode === 'Players' ? PLAYER_COLUMNS : TEAM_COLUMNS;

    // Filter columns based on category
    // Common columns are always shown.
    const visibleColumns = allColumns.filter(c => c.category === 'Common' || c.category === statCategory);

    // Attributes / Defense 탭: 2행 그룹 헤더 데이터 생성
    // row1 — non-grouped cols: rowSpan=2 / grouped cols: 그룹 레이블(colSpan)
    // row2 — grouped cols 개별 레이블만
    type Row1Item = { type: 'nogroup'; col: ColumnDef } | { type: 'group'; label: string; colSpan: number };
    const headerData = (statCategory === 'Attributes' || statCategory === 'Defense' || statCategory === 'Shooting') ? (() => {
        const row1: Row1Item[] = [];
        const row2: ColumnDef[] = [];
        visibleColumns.forEach(col => {
            if (!col.attrGroup) {
                row1.push({ type: 'nogroup', col });
            } else {
                row2.push(col);
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

    // 열 헤더 셀 하나 — 데이터 유무 분기 양쪽과 1행/2행 헤더가 전부 같은 셀을 쓴다(예전엔 같은 블록이 6벌).
    const headerCell = (col: ColumnDef, extra?: { rowSpan?: number }) => (
        <TableHeaderCell
            key={col.key}
            rowSpan={extra?.rowSpan}
            {...stickyProps(col)}
            align={col.key === 'name' ? 'left' : 'center'}
            className={`${sortConfig.key === col.key ? 'text-indigo-400 font-bold' : 'text-slate-400'} ${col.key === 'name' ? 'pl-4' : ''}`}
            sortable={col.sortable}
            onSort={() => col.sortable && onSort(col.key)}
            sortDirection={sortConfig.key === col.key ? sortConfig.direction : null}
        >
            {col.label}
        </TableHeaderCell>
    );

    const renderHead = () => (
        <TableHead noRow>
            {headerData ? (
                <>
                    <tr className="text-slate-400 text-sm font-bold h-7">
                        {headerData.row1.map((item, i) => item.type === 'nogroup'
                            ? headerCell(item.col, { rowSpan: 2 })
                            : <TableGroupHeaderCell key={i} colSpan={item.colSpan} className="text-slate-400">{item.label}</TableGroupHeaderCell>
                        )}
                    </tr>
                    <tr className="text-slate-400 text-sm font-bold h-7">
                        {headerData.row2.map(col => headerCell(col))}
                    </tr>
                </>
            ) : (
                <tr className="text-slate-400 text-sm font-bold h-10">
                    {visibleColumns.map(col => headerCell(col))}
                </tr>
            )}
        </TableHead>
    );

    const colGroup = (
        <colgroup>
            {visibleColumns.map(col => (
                <col key={col.key} style={{ width: col.width }} />
            ))}
        </colgroup>
    );

    if (data.length === 0) {
        return (
            <div className="relative h-full">
                <Table variant="flush" className="custom-scrollbar-hide" fullHeight tableStyle={{ tableLayout: 'fixed', minWidth: '100%' }}>
                    {colGroup}
                    {renderHead()}
                    <TableBody>
                        <TableEmptyRow colSpan={visibleColumns.length}>데이터가 없습니다.</TableEmptyRow>
                    </TableBody>
                </Table>
            </div>
        );
    }

    return (
        <Table variant="flush" className="custom-scrollbar-hide" fullHeight tableStyle={{ tableLayout: 'fixed', minWidth: '100%' }}>
            {colGroup}
            {renderHead()}

            <TableBody>
                {data.map((item, index) => {
                    const rank = (currentPage - 1) * itemsPerPage + index + 1;
                    const rankColor = rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-slate-300' : rank === 3 ? 'text-amber-600' : 'text-slate-600';

                    return (
                        <TableRow key={mode === 'Players' ? item.id : item.id} className={mode === 'Players' ? 'h-10' : 'h-11'}>
                            {visibleColumns.map((col) => {
                                // --- Data Access ---
                                let cellContent: React.ReactNode = null;
                                let bgStyle = undefined;

                                if (mode === 'Players') {
                                    const p = item as Player & {
                                        teamName: string; teamId: string;
                                        teamColorPrimary?: string | null; teamColorSecondary?: string | null; teamAbbr?: string | null;
                                    };
                                    const s = p.stats as any; // Cast to any to access dynamic zone keys
                                    const g = s.g || 1;

                                    if (col.key === 'rank') cellContent = rank;
                                    else if (col.key === 'name') {
                                        cellContent = (
                                            <PlayerHoverCard player={p} teamAbbr={p.teamAbbr} enabled={enableHoverCard}>
                                                <span onClick={() => onRowClick(item)} className="text-sm font-semibold text-slate-200 truncate hover:text-indigo-300 cursor-pointer block">{p.name}</span>
                                            </PlayerHoverCard>
                                        );
                                    }
                                    else if (col.key === 'team') cellContent = p.teamAbbr;
                                    else if (col.key === 'position') cellContent = p.position;
                                    else if (col.key === 'ovr') cellContent = <div className="flex justify-center"><OvrBadge value={calculatePlayerOvr(p)} size="sm" /></div>;

                                    // Handle Attribute Columns — 단일/콤보(압축) 능력치 공용 조회
                                    else if (col.category === 'Attributes') {
                                        cellContent = getAttrValue(p, col.key);
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
                                        else if (col.key === 'tovForced') rawVal = (s.tovForced||0)/g;
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
                                            <span onClick={() => onRowClick(item)} className="text-sm font-semibold text-slate-200 truncate hover:text-indigo-300 cursor-pointer">{t.name}</span>
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

                                const rankClass = col.key === 'rank' ? rankColor : "";

                                // [Fix] Correct text size and weight for +/- column
                                let finalTextColor = contentTextClass;
                                if (col.key === 'pm') {
                                    const val = parseFloat(cellContent as string);
                                    const color = val > 0 ? 'text-emerald-400' : val < 0 ? 'text-red-400' : 'text-slate-500';
                                    finalTextColor = `text-sm font-medium tabular-nums ${color}`;
                                } else if (col.category === 'Attributes') {
                                    const val = Number(cellContent);
                                    const color = val >= 90 ? 'text-fuchsia-400' : val >= 80 ? 'text-emerald-400' : val >= 70 ? 'text-amber-400' : 'text-slate-500';
                                    finalTextColor = `text-sm font-black tabular-nums ${color}`;
                                }

                                const sticky = stickyProps(col);
                                return (
                                    <TableCell
                                        key={col.key}
                                        stickyLeft={sticky.stickyLeft}
                                        width={sticky.width}
                                        style={{ ...sticky.style, ...bgStyle }}
                                        align={col.key === 'name' ? 'left' : 'center'}
                                        className={`${rankClass} ${finalTextColor} ${col.key === 'name' ? 'pl-4' : ''}`}
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
