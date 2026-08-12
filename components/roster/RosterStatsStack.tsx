
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Team, Player, Game } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell, TableFoot } from '../common/Table';
import { Dropdown } from '../common/Dropdown';
import { useLeaderboardData } from '../../hooks/useLeaderboardData';
import { PLAYER_COLUMNS, ColumnDef, StatCategory } from '../../data/leaderboardConfig';
import { getHeatmapStyle } from '../../utils/heatmapUtils';

interface RosterStatsStackProps {
    team: Team;
    schedule: Game[];
    onPlayerClick: (player: Player, teamId?: string, teamName?: string) => void;
}

// [2026-08-11] 4개를 세로로 붙여놓으니 산만하다는 피드백으로, 테이블 하나 + 드롭다운으로 카테고리
// 전환하는 방식으로 변경(스택 방식 폐기).
const CATEGORIES: { key: StatCategory; label: string; defaultSort: string }[] = [
    { key: 'Traditional', label: 'TRADITIONAL', defaultSort: 'pts' },
    { key: 'Advanced',    label: 'ADVANCED',    defaultSort: 'ts%' },
    { key: 'Shooting',    label: 'SHOOTING',    defaultSort: 'g' },
    { key: 'Defense',     label: 'DEFENSE',     defaultSort: 'stl' },
];

const WIDTHS = { NAME: 180, POS: 60, AGE: 50, OVR: 60 };

// ── 값/포맷/히트맵 로직 — LeaderboardTable.tsx의 Players 모드 계산과 동일한 공식을 그대로
// 옮겨왔다(고급 스탯 공식을 새로 재구현하는 위험을 피하기 위함). 순수 함수라 화면 스타일과
// 무관하게 안전하게 재사용 가능.
function formatValue(val: number, format?: string): string {
    if (format === 'percent') {
        const pct = val * 100;
        return (pct >= 100 ? '100' : pct.toFixed(1)) + '%';
    }
    if (format === 'number') return val.toFixed(1);
    if (format === 'integer') return Math.round(val).toString();
    return String(val);
}

function getStatCellValue(
    s: any,
    col: ColumnDef,
    statRanges: Record<string, { min: number; max: number }>,
): { text: string; raw: number; bgStyle?: React.CSSProperties } {
    const g = s.g || 1;

    if (col.key.startsWith('zone_')) {
        if (col.key.endsWith('_m') || col.key.endsWith('_a')) {
            const val = (s[col.key] || 0) / g;
            return { text: val.toFixed(1), raw: val, bgStyle: col.isHeatmap ? getHeatmapStyle(col.key, val, statRanges, true, col.isInverse) : undefined };
        }
        if (col.key.endsWith('_pct')) {
            const val = s[col.key] || 0;
            return { text: formatValue(val, col.format), raw: val, bgStyle: col.isHeatmap ? getHeatmapStyle(col.key, val, statRanges, true, col.isInverse) : undefined };
        }
        return { text: '', raw: 0 };
    }

    let rawVal = 0;
    if (col.key === 'g') rawVal = s.g;
    else if (col.key === 'mp') rawVal = s.mp / g;
    else if (col.key === 'pts') rawVal = s.pts / g;
    else if (col.key === 'reb') rawVal = s.reb / g;
    else if (col.key === 'oreb') rawVal = (s.offReb || 0) / g;
    else if (col.key === 'dreb') rawVal = (s.defReb || 0) / g;
    else if (col.key === 'ast') rawVal = s.ast / g;
    else if (col.key === 'stl') rawVal = s.stl / g;
    else if (col.key === 'blk') rawVal = s.blk / g;
    else if (col.key === 'tov') rawVal = s.tov / g;
    else if (col.key === 'pf') rawVal = (s.pf || 0) / g;
    else if (col.key === 'fgm') rawVal = s.fgm / g;
    else if (col.key === 'fga') rawVal = s.fga / g;
    else if (col.key === 'p3m') rawVal = s.p3m / g;
    else if (col.key === 'p3a') rawVal = s.p3a / g;
    else if (col.key === 'ftm') rawVal = s.ftm / g;
    else if (col.key === 'fta') rawVal = s.fta / g;
    else if (col.key === 'pm') rawVal = s.plusMinus / g;
    else if (col.key === 'fg%') rawVal = s.fga > 0 ? s.fgm / s.fga : 0;
    else if (col.key === '3p%') rawVal = s.p3a > 0 ? s.p3m / s.p3a : 0;
    else if (col.key === 'ft%') rawVal = s.fta > 0 ? s.ftm / s.fta : 0;
    else if (col.key === 'ts%') {
        const tsa = s.fga + 0.44 * s.fta;
        rawVal = tsa > 0 ? s.pts / (2 * tsa) : 0;
    } else {
        // Advanced 등 useLeaderboardData에서 이미 계산돼 있는 값(efg%, tov%, usg% ...)
        rawVal = typeof s[col.key] === 'number' ? s[col.key] : 0;
    }

    return {
        text: formatValue(rawVal, col.format),
        raw: rawVal,
        bgStyle: col.isHeatmap ? getHeatmapStyle(col.key, rawVal, statRanges, true, col.isInverse) : undefined,
    };
}

const getStickyStyle = (left: number, width: number, isLast: boolean = false) => ({
    left, width, minWidth: width, maxWidth: width,
    position: 'sticky' as const,
    zIndex: 30,
    borderRight: isLast ? undefined : 'none',
});

// 2행 그룹 헤더(존별 스탯: Shooting/Defense) — LeaderboardTable.tsx와 동일한 그룹핑 알고리즘
type Row1Item = { type: 'nogroup'; col: ColumnDef } | { type: 'group'; label: string; colSpan: number };
function buildHeaderRows(cols: ColumnDef[]) {
    const row1: Row1Item[] = [];
    const hasGroups = cols.some(c => c.attrGroup);
    if (!hasGroups) return null;
    cols.forEach(col => {
        if (!col.attrGroup) {
            row1.push({ type: 'nogroup', col });
        } else {
            const last = row1[row1.length - 1];
            if (last && last.type === 'group' && last.label === col.attrGroup) {
                (last as { type: 'group'; label: string; colSpan: number }).colSpan++;
            } else {
                row1.push({ type: 'group', label: col.attrGroup, colSpan: 1 });
            }
        }
    });
    return row1;
}

const CategoryTable: React.FC<{
    team: Team;
    schedule: Game[];
    category: StatCategory;
    defaultSort: string;
    onPlayerClick: (player: Player, teamId?: string, teamName?: string) => void;
}> = ({ team, schedule, category, defaultSort, onPlayerClick }) => {
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: defaultSort, direction: 'desc' });
    const { sortedData, statRanges } = useLeaderboardData(
        [team], schedule, [], sortConfig, 'Players', [], [], '', category, 'regular',
    );
    const handleSort = (key: string) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
    };

    const cols = PLAYER_COLUMNS.filter(c => c.category === category);
    const headerRow1 = buildHeaderRows(cols);

    const LEFT_POS = WIDTHS.NAME;
    const LEFT_AGE = WIDTHS.NAME + WIDTHS.POS;
    const LEFT_OVR = WIDTHS.NAME + WIDTHS.POS + WIDTHS.AGE;

    // 팀 평균(단순 평균 — 정밀 가중평균 대신 각 선수 값의 산술 평균)
    const averages: Record<string, number> = {};
    if (sortedData.length > 0) {
        cols.forEach(col => {
            let sum = 0;
            sortedData.forEach((p: any) => { sum += getStatCellValue(p.stats, col, statRanges).raw; });
            averages[col.key] = sum / sortedData.length;
        });
    }

    return (
        <div className="flex-1 min-h-0">
            <Table style={{ tableLayout: 'fixed', minWidth: '100%' }} fullHeight className="!rounded-none !border-x-0 !border-t-0 !bg-slate-950">
                <colgroup>
                    <col style={{ width: WIDTHS.NAME }} />
                    <col style={{ width: WIDTHS.POS }} />
                    <col style={{ width: WIDTHS.AGE }} />
                    <col style={{ width: WIDTHS.OVR }} />
                    {cols.map(c => <col key={c.key} style={{ width: c.width }} />)}
                </colgroup>
                <TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm" noRow>
                    {headerRow1 && (
                        <tr className="h-10">
                            <th colSpan={4} className="bg-slate-950 border-b border-r border-slate-800 sticky left-0 z-50 align-middle">
                                <div className="h-full flex items-center justify-center">
                                    <span className="text-sm font-black text-slate-500 uppercase tracking-widest">선수 정보</span>
                                </div>
                            </th>
                            {headerRow1.map((item, i) => item.type === 'group' ? (
                                <th key={i} colSpan={item.colSpan} className="bg-slate-950 border-b border-r border-slate-800 px-2 align-middle">
                                    <div className="h-full flex items-center justify-center">
                                        <span className="text-sm font-black text-slate-400 uppercase tracking-widest">{item.label}</span>
                                    </div>
                                </th>
                            ) : (
                                <th key={i} className="bg-slate-950 border-b border-slate-800" />
                            ))}
                        </tr>
                    )}
                    <tr className="h-10 text-slate-500 text-sm font-black uppercase tracking-widest">
                        <TableHeaderCell style={{ ...getStickyStyle(0, WIDTHS.NAME), zIndex: 50 }} align="left" className="pl-4 bg-slate-950">이름</TableHeaderCell>
                        <TableHeaderCell style={{ ...getStickyStyle(LEFT_POS, WIDTHS.POS), zIndex: 50 }} className="bg-slate-950">포지션</TableHeaderCell>
                        <TableHeaderCell style={{ ...getStickyStyle(LEFT_AGE, WIDTHS.AGE), zIndex: 50 }} className="bg-slate-950">나이</TableHeaderCell>
                        <TableHeaderCell style={{ ...getStickyStyle(LEFT_OVR, WIDTHS.OVR, true), zIndex: 50 }} className="bg-slate-950 border-r border-slate-800">OVR</TableHeaderCell>
                        {cols.map(c => (
                            <TableHeaderCell
                                key={c.key}
                                width={c.width}
                                className={`border-r border-slate-800 ${sortConfig.key === c.key ? 'text-indigo-400' : ''}`}
                                sortable={c.sortable}
                                onSort={() => c.sortable && handleSort(c.key)}
                                sortDirection={sortConfig.key === c.key ? sortConfig.direction : null}
                            >
                                {c.label}
                            </TableHeaderCell>
                        ))}
                    </tr>
                </TableHead>
                <TableBody>
                    {sortedData.map((p: any) => {
                        const originalPlayer = team.roster.find(r => r.id === p.id) || p;
                        return (
                            <TableRow key={p.id} className="group">
                                <TableCell align="left" style={getStickyStyle(0, WIDTHS.NAME)} className="pl-4 bg-slate-900 group-hover:bg-slate-800 transition-colors">
                                    <span
                                        className="text-sm font-semibold text-slate-200 truncate hover:text-indigo-400 cursor-pointer transition-colors"
                                        onClick={() => onPlayerClick(originalPlayer, team.id, team.name)}
                                    >
                                        {p.name}
                                    </span>
                                </TableCell>
                                <TableCell style={getStickyStyle(LEFT_POS, WIDTHS.POS)} className="text-slate-500 font-semibold text-sm bg-slate-900 group-hover:bg-slate-800 transition-colors text-center">{p.position}</TableCell>
                                <TableCell style={getStickyStyle(LEFT_AGE, WIDTHS.AGE)} className="text-slate-500 font-semibold text-sm bg-slate-900 group-hover:bg-slate-800 transition-colors text-center">{p.age}</TableCell>
                                <TableCell style={getStickyStyle(LEFT_OVR, WIDTHS.OVR, true)} className="border-r border-slate-800 bg-slate-900 group-hover:bg-slate-800 transition-colors text-center">
                                    <div className="flex justify-center"><OvrBadge value={calculatePlayerOvr(originalPlayer)} size="sm" className="!w-7 !h-7 !text-xs !shadow-none" /></div>
                                </TableCell>
                                {cols.map(c => {
                                    if (p.stats.mp === 0 && c.key !== 'g') {
                                        return <TableCell key={c.key} align="center" className="border-r border-slate-800/30"><span className="font-medium text-sm text-slate-600">-</span></TableCell>;
                                    }
                                    const { text, bgStyle } = getStatCellValue(p.stats, c, statRanges);
                                    return (
                                        <TableCell key={c.key} align="center" style={bgStyle} className="border-r border-slate-800/30">
                                            <span className="font-medium text-sm text-white tabular-nums">{text}</span>
                                        </TableCell>
                                    );
                                })}
                            </TableRow>
                        );
                    })}
                </TableBody>
                {sortedData.length > 0 && (
                    <TableFoot className="bg-slate-900 border-t-2 border-slate-800 sticky bottom-0 z-20 shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
                        <tr className="h-10">
                            <TableCell style={getStickyStyle(0, WIDTHS.NAME)} className="pl-4 text-left bg-slate-950 font-black text-indigo-400 text-sm uppercase tracking-widest">팀 평균</TableCell>
                            <TableCell style={getStickyStyle(LEFT_POS, WIDTHS.POS)} className="bg-slate-950" />
                            <TableCell style={getStickyStyle(LEFT_AGE, WIDTHS.AGE)} className="bg-slate-950" />
                            <TableCell style={getStickyStyle(LEFT_OVR, WIDTHS.OVR, true)} className="border-r border-slate-800 bg-slate-950" />
                            {cols.map(c => (
                                <TableCell key={c.key} align="center" className="border-r border-slate-800/30">
                                    <span className="font-medium text-sm text-slate-400 tabular-nums">{formatValue(averages[c.key] ?? 0, c.format)}</span>
                                </TableCell>
                            ))}
                        </tr>
                    </TableFoot>
                )}
            </Table>
        </div>
    );
};

export const RosterStatsStack: React.FC<RosterStatsStackProps> = ({ team, schedule, onPlayerClick }) => {
    const [category, setCategory] = useState<StatCategory>('Traditional');
    const current = CATEGORIES.find(c => c.key === category) ?? CATEGORIES[0];

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="shrink-0 px-4 py-3 border-b border-slate-800 bg-slate-950">
                <Dropdown
                    trigger={
                        <button className="flex items-center gap-1 text-sm font-black text-slate-400 uppercase tracking-tight hover:text-white transition-colors group">
                            <span>{current.label}</span>
                            <ChevronDown size={14} className="text-slate-600 group-hover:text-white mt-0.5" />
                        </button>
                    }
                    items={CATEGORIES.map(c => ({
                        id: c.key,
                        label: <span className="text-sm">{c.label}</span>,
                        onClick: () => setCategory(c.key),
                        active: c.key === category,
                    }))}
                    width="w-40"
                    align="left"
                />
            </div>
            <CategoryTable
                key={category}
                team={team}
                schedule={schedule}
                category={category}
                defaultSort={current.defaultSort}
                onPlayerClick={onPlayerClick}
            />
        </div>
    );
};
