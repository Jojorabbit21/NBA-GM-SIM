
import React from 'react';
import { Player, Team } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell, TableGroupHeaderCell } from '../common/Table';
import { PLAYER_COLUMNS, TEAM_COLUMNS, ColumnDef, ViewMode, StatCategory, getAttrValue } from '../../data/leaderboardConfig';
import { getHeatmapStyle } from '../../utils/heatmapUtils';
import { PlayerHoverCard } from '../common/PlayerHoverCard';
import { TeamHover } from '../common/TeamHover';
import { TableEmptyRow } from '../common/EmptyState';
import { TeamMark } from '../common/TeamMark';
import { useIsPhone } from '../../hooks/useViewportClass';

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
    if (format === 'decimal3') return val.toFixed(3).replace(/^(-?)0\./, '$1.');
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
    // [2026-10-28] 폰(<768, docs/ui/mobile-design-system.md §9-1-12): 고정 열 5개(#·PLAYER·TEAM·POS·OVR = 422px)를 가상 열 '__phone' 하나(168/160)로
    // 압축 — 순위 색 · 이름 + "팀 · POS" 캡션(팀 모드: 순위 · 로고 · 팀명). OVR은 별도 열. 나머지 열·값·히트맵은 데스크톱 코드 그대로.
    const phone = useIsPhone();
    // [2026-10-28 개정] OVR은 가상 열에 합치지 않고 데스크톱처럼 별도 정렬 열(고정 해제)로 바로 뒤에 둔다 — OVR 기준 정렬·조회 유지(사용자 지시).
    // 순위 칸은 3자리(401~)까지 들어가도록 28px.
    const PHONE_COL: ColumnDef = { key: '__phone', label: mode === 'Players' ? '선수' : '팀', width: 160, stickyLeft: 0, stickyShadow: true, category: 'Common' };
    const ovrCol = allColumns.find(c => c.key === 'ovr');
    const visibleColumns = phone
        ? [
            PHONE_COL,
            ...(mode === 'Players' && ovrCol ? [{ ...ovrCol, stickyLeft: undefined, stickyShadow: undefined }] : []),
            ...allColumns.filter(c => c.stickyLeft === undefined && (c.category === 'Common' || c.category === statCategory)),
        ]
        : allColumns.filter(c => c.category === 'Common' || c.category === statCategory);

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
            align={col.key === 'name' || col.key === '__phone' ? 'left' : 'center'}
            className={`${sortConfig.key === col.key ? 'text-indigo-400 font-bold' : 'text-slate-400'} ${col.key === 'name' ? 'pl-4' : col.key === '__phone' ? 'pl-3' : ''}`}
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
                        <TableRow key={mode === 'Players' ? item.id : item.id} className={mode === 'Players' ? 'h-10' : 'h-11'} onClick={phone ? () => onRowClick(item) : undefined}>
                            {visibleColumns.map((col) => {
                                // --- Data Access ---
                                let cellContent: React.ReactNode = null;
                                let bgStyle = undefined;

                                // 폰 가상 고정 열 — 순위·OVR·이름·팀/POS(선수) / 순위·로고·팀명(팀)
                                if (col.key === '__phone') {
                                    const sticky = stickyProps(col);
                                    // 순위는 데스크톱 # 열처럼 가운데 정렬(우측 정렬은 한 자리가 이름에 붙어 보여 2026-10-28 사용자 지적)
                                    const rankCls = `w-7 shrink-0 text-center text-[13px] font-bold tabular-nums ${rankColor}`;
                                    return (
                                        <TableCell key={col.key} stickyLeft={sticky.stickyLeft} width={sticky.width} style={sticky.style} align="left" className="pl-3 pr-2">
                                            {mode === 'Players' ? (() => {
                                                const p = item as Player & { teamAbbr?: string | null };
                                                return (
                                                    <span className="flex items-center gap-2 min-w-0">
                                                        <span className={rankCls}>{rank}</span>
                                                        <span className="flex-1 min-w-0 flex flex-col">
                                                            <span className="text-sm leading-[18px] font-semibold text-slate-200 truncate">{p.name}</span>
                                                            <span className="text-[11px] leading-[13px] font-medium text-white/70 truncate">{p.teamAbbr ?? ''} · {p.position}</span>
                                                        </span>
                                                    </span>
                                                );
                                            })() : (() => {
                                                const t = item as Team;
                                                return (
                                                    <span className="flex items-center gap-2 min-w-0">
                                                        <span className={rankCls}>{rank}</span>
                                                        <TeamMark variant="logo" teamId={t.id} teamName={t.abbr ?? t.name} size="sm" />
                                                        <span className="flex-1 min-w-0 text-sm font-semibold text-slate-200 truncate">{t.name}</span>
                                                    </span>
                                                );
                                            })()}
                                        </TableCell>
                                    );
                                }

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
                                            <TeamHover teamId={t.id}><span onClick={() => onRowClick(item)} className="text-sm font-semibold text-slate-200 truncate hover:text-indigo-300 cursor-pointer">{t.name}</span></TeamHover>
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
