// PhoneRosterStats.tsx — 폰(<768) 팀 화면 "선수 기록" 탭. [2026-10-27 모바일 팀 화면]
// docs/ui/mobile-design-system.md §9-1-3, 캔버스 5행 E5~E9. 데스크톱 RosterStatsStack(카테고리 Dropdown 1개 + 표 1개)의 폰판:
//   카테고리 줄 44(스크롤 상자 밖 고정: SheetSelect TRADITIONAL/ADVANCED/SHOOTING/DEFENSE + "정규 시즌 · 경기당") →
//   공용 Table(flush · phone · scroll parent · dividers 없음): 그룹이 있는 카테고리(SHOOTING 존·DEFENSE 존)만 2단 헤더,
//   sticky "선수" 열 136(PhonePlayerCell — 로스터 탭과 같은 정보), 열 폭 STAT 52 · PCT 56 · 슈팅 존 60/64 · 수비 존 64,
//   셀 히트맵 = 데스크톱 getHeatmapStyle 그대로(0경기 선수는 0 표시·히트맵 없음), TableFoot "팀 평균"(출전 선수만 집계) sticky bottom.
//   데이터·값·포맷·그룹 헤더 = RosterStatsStack에서 export한 함수(useLeaderboardData · getStatCellValue · formatStatValue · buildStatHeaderRows).
import React, { useMemo, useState } from 'react';
import type { Player, Team, Game } from '../../types';
import { useLeaderboardData } from '../../hooks/useLeaderboardData';
import type { TeamAdvancedStatsMap } from '../../hooks/useTeamSeasonAdvancedStats';
import { useTableSort } from '../../hooks/useTableSort';
import { PLAYER_COLUMNS, type ColumnDef, type StatCategory } from '../../data/leaderboardConfig';
import { Table, TableHead, TableBody, TableFoot, TableRow, TableHeaderCell, TableCell, TableGroupHeaderCell } from '../common/Table';
import { SheetSelect } from '../mobile/ActionSheet';
import { STAT_CATEGORIES, getStatCellValue, formatStatValue, buildStatHeaderRows } from './RosterStatsStack';
import { PhonePlayerCell, PHONE_STICKY_COL_WIDTH } from './PhoneRosterOverview';
import { SlidersHorizontal } from 'lucide-react';
import { BottomSheet, SheetToggleRow } from '../mobile/BottomSheet';
import type { SeasonType } from '../../hooks/useLeaderboardData';

interface PhoneRosterStatsProps {
    team: Team;
    schedule: Game[];
    onPlayerClick: (player: Player, teamId?: string, teamName?: string) => void;
    teamAdvanced?: TeamAdvancedStatsMap;
    playerConditions?: Map<string, number | null>;
}

/** 폰 열 폭 — 데스크톱 WIDTHS(STAT 55 · PCT 60 · ZONE 66/76 · DEF_ZONE 76)를 §9-1-3대로 줄인다. 라벨이 12px이라 잘리지 않는다. */
function phoneWidth(col: ColumnDef): number {
    if (col.width === 55) return 52;
    if (col.width === 60) return 56;
    if (col.width === 66) return 60;
    if (col.width === 76) return 64;
    return col.width;
}
const FOOT_BOTTOM = 'calc(56px + env(safe-area-inset-bottom, 0px))';

const PhoneCategoryTable: React.FC<{
    team: Team; schedule: Game[]; category: StatCategory; defaultSort: string;
    onPlayerClick: PhoneRosterStatsProps['onPlayerClick']; teamAdvanced?: TeamAdvancedStatsMap; playerConditions?: Map<string, number | null>;
    seasonType: SeasonType; showHeatmap: boolean;
}> = ({ team, schedule, category, defaultSort, onPlayerClick, teamAdvanced, playerConditions, seasonType, showHeatmap }) => {
    const { sortConfig, sortProps } = useTableSort({ key: defaultSort, direction: 'desc' });
    // includeZeroGamePlayers: true — 데스크톱 선수 기록 탭과 같이 로스터 전원(0경기 포함).
    const { sortedData, statRanges } = useLeaderboardData(
        [team], schedule, [], sortConfig, 'Players', [], [], '', category, seasonType, true, teamAdvanced,
    );
    // leagueWide 열(PER·Win Shares)은 리그 전체가 필요해 한 팀만 넘기는 이 화면에서는 값이 틀리므로 제외
    const cols = PLAYER_COLUMNS.filter(c => c.category === category && !c.leagueWide);
    const headerRow1 = buildStatHeaderRows(cols);

    // 팀 평균 — 1경기 이상 뛴 선수만 집계(데스크톱 동일).
    const playedData = sortedData.filter((p: any) => (p.stats?.g ?? 0) > 0);
    const averages = useMemo(() => {
        const m: Record<string, number> = {};
        if (playedData.length === 0) return m;
        for (const col of cols) {
            let sum = 0;
            playedData.forEach((p: any) => { sum += getStatCellValue(p.stats, col, statRanges).raw; });
            m[col.key] = sum / playedData.length;
        }
        return m;
    }, [playedData, cols, statRanges]);

    return (
        <Table variant="flush" density="phone" scroll="parent" dividers={false}>
            <TableHead noRow>
                {headerRow1 && (
                    <tr className="h-7">
                        <TableGroupHeaderCell stickyLeft={0} className="!px-4"><span className="block text-left">선수 정보</span></TableGroupHeaderCell>
                        {headerRow1.map((item, i) => item.type === 'group'
                            ? <TableGroupHeaderCell key={i} colSpan={item.colSpan} className="border-r border-slate-800">{item.label}</TableGroupHeaderCell>
                            : <TableGroupHeaderCell key={i} />
                        )}
                    </tr>
                )}
                <tr className="h-9 text-slate-400 text-xs font-bold">
                    <TableHeaderCell stickyLeft={0} width={PHONE_STICKY_COL_WIDTH} align="left" className="pl-4">선수</TableHeaderCell>
                    {cols.map(c => (
                        <TableHeaderCell key={c.key} width={phoneWidth(c)} {...(c.sortable ? sortProps(c.key) : {})}>{c.label}</TableHeaderCell>
                    ))}
                </tr>
            </TableHead>
            <TableBody>
                {sortedData.map((p: any) => {
                    const original = team.roster.find(r => r.id === p.id) || p;
                    const played = (p.stats?.g ?? 0) > 0;
                    const cond = playerConditions ? (playerConditions.has(p.id) ? (playerConditions.get(p.id) as number | null) : undefined) : undefined;
                    return (
                        <TableRow key={p.id} onClick={() => onPlayerClick(original, team.id, team.name)}>
                            <TableCell stickyLeft={0} width={PHONE_STICKY_COL_WIDTH} align="left" className="pl-4">
                                <PhonePlayerCell player={original} condition={cond} />
                            </TableCell>
                            {cols.map(c => {
                                // 0경기 선수도 "-" 대신 0(포맷 그대로) — 히트맵은 뛴 선수에만(§9-1-3).
                                const { text, bgStyle } = getStatCellValue(p.stats, c, statRanges);
                                return (
                                    <TableCell key={c.key} width={phoneWidth(c)} align="center" style={showHeatmap && played ? bgStyle : undefined}>
                                        <span className="font-medium text-sm text-white tabular-nums">{text}</span>
                                    </TableCell>
                                );
                            })}
                        </TableRow>
                    );
                })}
            </TableBody>
            {playedData.length > 0 && (
                <TableFoot stickyBottom={FOOT_BOTTOM} className="border-b border-slate-800">
                    <tr className="h-11">
                        <TableCell stickyLeft={0} width={PHONE_STICKY_COL_WIDTH} align="left" className="pl-4 font-bold text-indigo-400 text-sm">팀 평균</TableCell>
                        {cols.map(c => (
                            <TableCell key={c.key} width={phoneWidth(c)} align="center">
                                <span className="font-medium text-sm text-slate-400 tabular-nums">{formatStatValue(averages[c.key] ?? 0, c.format)}</span>
                            </TableCell>
                        ))}
                    </tr>
                </TableFoot>
            )}
        </Table>
    );
};

/** 카테고리 줄 + 표. 세로·가로 스크롤 상자는 안에서 하나(바깥 RosterView의 공통 상자를 쓰지 않는 이유: 카테고리 줄을 상자 밖에 고정해야 함). */
export const PhoneRosterStats: React.FC<PhoneRosterStatsProps> = ({ team, schedule, onPlayerClick, teamAdvanced, playerConditions }) => {
    const [category, setCategory] = useState<StatCategory>('Traditional');
    // [2026-10-27] 데스크톱과 같은 상태(정규/플레이오프 + 색상 스케일)를 폰에서는 "필터" 버튼 → 바텀 시트의 토글 행 2개로(사용자 지시, 인라인 토글 폐기).
    const [seasonType, setSeasonType] = useState<SeasonType>('regular');
    const [showHeatmap, setShowHeatmap] = useState(true);
    const [filterOpen, setFilterOpen] = useState(false);
    const filterActive = seasonType !== 'regular' || !showHeatmap;
    const current = STAT_CATEGORIES.find(c => c.key === category) ?? STAT_CATEGORIES[0];
    return (
        <div className="relative flex-1 min-h-0 flex flex-col">
            {/* 카테고리 줄 44 — 데스크톱 RosterStatsStack 상단 줄의 폰판(§9-1-3): 좌 카테고리 시트, 우 "필터" 32(기본값과 다르면 인디고 점). */}
            <div className="shrink-0 h-11 px-4 flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-950">
                <SheetSelect<StatCategory> title="스탯 카테고리" value={category} onChange={setCategory} items={STAT_CATEGORIES.map(c => ({ value: c.key, label: c.label }))} />
                <span className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-500 whitespace-nowrap">{seasonType === 'playoff' ? '플레이오프' : '정규 시즌'} · 경기당</span>
                    <button type="button" aria-haspopup="dialog" aria-expanded={filterOpen} onClick={() => setFilterOpen(true)} className="relative h-8 pl-2.5 pr-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300 active:bg-slate-700">
                        <SlidersHorizontal size={14} />필터
                        {filterActive && <span aria-hidden="true" className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-slate-950" />}
                    </button>
                </span>
            </div>
            <BottomSheet open={filterOpen} title="기록 필터" onClose={() => setFilterOpen(false)}>
                <SheetToggleRow label="플레이오프 기록" value={seasonType === 'playoff'} onChange={v => setSeasonType(v ? 'playoff' : 'regular')} />
                <SheetToggleRow label="색상 스케일" value={showHeatmap} onChange={setShowHeatmap} />
            </BottomSheet>
            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar overscroll-x-contain">
                <PhoneCategoryTable
                    key={`${category}-${seasonType}`}
                    seasonType={seasonType}
                    showHeatmap={showHeatmap}
                    team={team}
                    schedule={schedule}
                    category={category}
                    defaultSort={current.defaultSort}
                    onPlayerClick={onPlayerClick}
                    teamAdvanced={teamAdvanced}
                    playerConditions={playerConditions}
                />
                <div aria-hidden="true" className="h-14 pb-safe" />
            </div>
            <div aria-hidden="true" className="pointer-events-none absolute right-0 top-11 bottom-0 w-6 bg-gradient-to-r from-transparent to-slate-900" />
        </div>
    );
};
