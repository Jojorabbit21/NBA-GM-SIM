
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Team, Player, Game } from '../../types';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell, TableFoot, TableGroupHeaderCell } from '../common/Table';
import { Dropdown } from '../common/Dropdown';
import { useLeaderboardData } from '../../hooks/useLeaderboardData';
import type { TeamAdvancedStatsMap } from '../../hooks/useTeamSeasonAdvancedStats';
import { useTableSort } from '../../hooks/useTableSort';
import { PLAYER_COLUMNS, ColumnDef, StatCategory } from '../../data/leaderboardConfig';
import { getHeatmapStyle } from '../../utils/heatmapUtils';
import { PlayerInfoColGroup, PlayerInfoHeaderCells, PlayerInfoCells, PlayerInfoFooterCells } from './PlayerInfoColumns';

interface RosterStatsStackProps {
    team: Team;
    schedule: Game[];
    onPlayerClick: (player: Player, teamId?: string, teamName?: string) => void;
    /** 선수 이름 hover 시 능력치+스탯 팝업 표시 — 멀티플레이어 전용 기능이라 지정된 경우에만 켜짐. */
    enableHoverCard?: boolean;
    /** 멀티 전용 — 선수 STL%/USG% 팀 분모를 서버 RPC 기준으로 맞춤(useLeaderboardData teamAdvanced 참고). */
    teamAdvanced?: TeamAdvancedStatsMap;
}

// [2026-08-11] 4개를 세로로 붙여놓으니 산만하다는 피드백으로, 테이블 하나 + 드롭다운으로 카테고리
// 전환하는 방식으로 변경(스택 방식 폐기).
const CATEGORIES: { key: StatCategory; label: string; defaultSort: string }[] = [
    { key: 'Traditional', label: 'TRADITIONAL', defaultSort: 'pts' },
    { key: 'Advanced',    label: 'ADVANCED',    defaultSort: 'ts%' },
    { key: 'Shooting',    label: 'SHOOTING',    defaultSort: 'g' },
    { key: 'Defense',     label: 'DEFENSE',     defaultSort: 'stl' },
];

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
    enableHoverCard?: boolean;
    teamAdvanced?: TeamAdvancedStatsMap;
}> = ({ team, schedule, category, defaultSort, onPlayerClick, enableHoverCard, teamAdvanced }) => {
    const { sortConfig, sortProps } = useTableSort({ key: defaultSort, direction: 'desc' });
    // includeZeroGamePlayers: true — 리더보드와 달리 "선수 기록" 탭은 아직 한 경기도
    // 못 뛴 로스터 선수도 그대로 보여줘야 한다(사용자 요청). 스탯 값은 전부 0으로 나온다.
    const { sortedData, statRanges } = useLeaderboardData(
        [team], schedule, [], sortConfig, 'Players', [], [], '', category, 'regular', true, teamAdvanced,
    );

    const cols = PLAYER_COLUMNS.filter(c => c.category === category);
    const headerRow1 = buildHeaderRows(cols);

    // 팀 평균(단순 평균 — 정밀 가중평균 대신 각 선수 값의 산술 평균). includeZeroGamePlayers로
    // 0경기 선수도 목록엔 표시되지만, 그 선수들의 0값이 팀 평균을 실제보다 낮게 끌어내리면
    // 안 되므로 평균 계산에서는 제외한다(목록 표시와 집계 기준을 분리).
    const playedData = sortedData.filter((p: any) => (p.stats?.g ?? 0) > 0);
    const averages: Record<string, number> = {};
    if (playedData.length > 0) {
        cols.forEach(col => {
            let sum = 0;
            playedData.forEach((p: any) => { sum += getStatCellValue(p.stats, col, statRanges).raw; });
            averages[col.key] = sum / playedData.length;
        });
    }

    return (
        <div className="flex-1 min-h-0">
            <Table variant="flush" fullHeight>
                <colgroup>
                    <PlayerInfoColGroup />
                    {cols.map(c => <col key={c.key} style={{ width: c.width }} />)}
                </colgroup>
                <TableHead noRow>
                    {headerRow1 && (
                        <tr className="h-10">
                            <TableGroupHeaderCell colSpan={4} stickyLeft={0}>선수 정보</TableGroupHeaderCell>
                            {headerRow1.map((item, i) => item.type === 'group'
                                ? <TableGroupHeaderCell key={i} colSpan={item.colSpan}>{item.label}</TableGroupHeaderCell>
                                : <TableGroupHeaderCell key={i} />
                            )}
                        </tr>
                    )}
                    <tr className="h-10 text-slate-400 text-sm font-bold">
                        <PlayerInfoHeaderCells />
                        {cols.map(c => (
                            <TableHeaderCell
                                key={c.key}
                                width={c.width}
                                className={sortConfig.key === c.key ? 'text-indigo-400' : ''}
                                {...(c.sortable ? sortProps(c.key) : {})}
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
                            <TableRow key={p.id}>
                                <PlayerInfoCells
                                    player={originalPlayer}
                                    teamAbbr={team.abbr}
                                    onClick={pl => onPlayerClick(pl, team.id, team.name)}
                                    enableHoverCard={enableHoverCard}
                                />
                                {cols.map(c => {
                                    // [2026-09-16] 0경기(또는 0분) 선수도 "-" 대신 0(0.0/0.0% 등 컬럼 포맷 그대로)로
                                    // 표시 — getStatCellValue가 g=s.g||1로 나눗셈을 안전하게 처리해 그대로 호출해도 된다.
                                    const { text, bgStyle } = getStatCellValue(p.stats, c, statRanges);
                                    return (
                                        <TableCell key={c.key} align="center" style={bgStyle}>
                                            <span className="font-medium text-sm text-white tabular-nums">{text}</span>
                                        </TableCell>
                                    );
                                })}
                            </TableRow>
                        );
                    })}
                </TableBody>
                {sortedData.length > 0 && (
                    <TableFoot>
                        <tr className="h-10">
                            <PlayerInfoFooterCells label="팀 평균" />
                            {cols.map(c => (
                                <TableCell key={c.key} align="center">
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

export const RosterStatsStack: React.FC<RosterStatsStackProps> = ({ team, schedule, onPlayerClick, enableHoverCard = false, teamAdvanced }) => {
    const [category, setCategory] = useState<StatCategory>('Traditional');
    const current = CATEGORIES.find(c => c.key === category) ?? CATEGORIES[0];

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="shrink-0 px-4 py-3 border-b border-slate-800 bg-slate-950">
                <Dropdown
                    trigger={
                        <button className="flex items-center gap-1 text-sm font-black text-slate-400 tracking-tight hover:text-white transition-colors group">
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
                enableHoverCard={enableHoverCard}
                teamAdvanced={teamAdvanced}
            />
        </div>
    );
};
