
import React from 'react';
import { useLeaderboardData } from '../../../../hooks/useLeaderboardData';
import type { Team, Game, Player } from '../../../../types';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../../common/Table';
import { TableEmptyRow } from '../../../common/EmptyState';
import { PlayerNameLink } from '../../../common/PlayerNameLink';
import { InsightCard } from './InsightCard';

interface PlayerStatsTableProps {
    team: Team;
    schedule: Game[];
    onPlayerClick?: (player: Player) => void;
}

interface ColumnDef {
    key: string;
    label: string;
    format?: 'percent';
    compute: (s: any, g: number) => number;
}

// TeamStatRankList.tsx와 동일한 시각 스타일(같은 컴포넌트 재사용은 아님 — "값|평균|순위" 구조가
// 팀 하나 vs 리그 전체 비교용이라 선수 여러 명을 한 화면에 나열하는 이 용도엔 안 맞음). RosterStatsStack처럼
// 카테고리 드롭다운/스티키 컬럼/히트맵 없이 로스터 전원을 한 눈에 보여주는 게 목적이라 컬럼을
// 핵심 1차 스탯 몇 개로만 제한.
const COLUMNS: ColumnDef[] = [
    { key: 'mp',  label: 'MIN', compute: (s, g) => s.mp / g },
    { key: 'pts', label: 'PTS', compute: (s, g) => s.pts / g },
    { key: 'reb', label: 'REB', compute: (s, g) => s.reb / g },
    { key: 'ast', label: 'AST', compute: (s, g) => s.ast / g },
    { key: 'stl', label: 'STL', compute: (s, g) => s.stl / g },
    { key: 'blk', label: 'BLK', compute: (s, g) => s.blk / g },
    { key: 'tov', label: 'TOV', compute: (s, g) => s.tov / g },
    { key: 'pf',  label: 'PF',  compute: (s, g) => (s.pf || 0) / g },
    { key: 'fg%', label: 'FG%', format: 'percent', compute: (s) => (s.fga > 0 ? s.fgm / s.fga : 0) },
    { key: '3p%', label: '3P%', format: 'percent', compute: (s) => (s.p3a > 0 ? s.p3m / s.p3a : 0) },
    { key: 'ft%', label: 'FT%', format: 'percent', compute: (s) => (s.fta > 0 ? s.ftm / s.fta : 0) },
];

const NAME_WIDTH = 112;
const POS_WIDTH = 36;

function formatValue(val: number, format?: 'percent'): string {
    if (format === 'percent') return (val * 100).toFixed(1) + '%';
    return val.toFixed(1);
}

/** 인사이트 탭 "선수 스탯" 위젯 — 로스터 전원을 한 테이블에 1차 스탯 위주로 나열. RosterStatsStack
 *  (리더보드 스타일, 카테고리 드롭다운+스티키 컬럼+히트맵)을 그대로 옮겨오지 않고, 데이터 계산만
 *  useLeaderboardData를 재사용(중복 구현 방지)하고 화면은 TeamStatRankList와 같은 톤의 단순 표로
 *  작성 — "바디 너비를 100% 채우는 무거운 테이블은 최소화" 원칙에 맞춤. 선수명 hover의
 *  PlayerHoverCard는 항상 활성(MultiTacticsView.tsx 전용 컴포넌트라 enableHoverCard 게이트 불필요).
 *  [2026-10-13] flex-div 표 → 공용 Table(bare) + InsightCard + PlayerNameLink. */
export const PlayerStatsTable: React.FC<PlayerStatsTableProps> = ({ team, schedule, onPlayerClick }) => {
    const sortConfig = React.useMemo(() => ({ key: 'pts', direction: 'desc' as const }), []);
    const { sortedData } = useLeaderboardData(
        [team], schedule, [], sortConfig, 'Players', [], [], '', 'Traditional', 'regular',
    );

    return (
        <InsightCard title="선수 스탯">
            <Table variant="bare" dividers={false}>
                <TableHead>
                    <TableHeaderCell align="left" width={NAME_WIDTH}>이름</TableHeaderCell>
                    <TableHeaderCell width={POS_WIDTH}>POS</TableHeaderCell>
                    {COLUMNS.map(c => <TableHeaderCell key={c.key} align="right">{c.label}</TableHeaderCell>)}
                </TableHead>
                <TableBody>
                    {sortedData.length === 0 ? (
                        <TableEmptyRow colSpan={2 + COLUMNS.length}>아직 완료된 경기가 없습니다.</TableEmptyRow>
                    ) : (
                        sortedData.map((p: any, i: number) => {
                            const g = p.stats.g || 1;
                            return (
                                <TableRow key={p.id} className={i % 2 === 1 ? 'bg-slate-700/25' : ''}>
                                    <TableCell align="left" width={NAME_WIDTH} className="max-w-[112px]">
                                        <PlayerNameLink player={p as Player} teamAbbr={p.teamAbbr} onClick={onPlayerClick} className="block" />
                                    </TableCell>
                                    <TableCell width={POS_WIDTH} className="text-sm text-slate-500">{p.position}</TableCell>
                                    {COLUMNS.map(c => (
                                        <TableCell key={c.key} align="right" className="text-sm text-white tabular-nums">
                                            {formatValue(c.compute(p.stats, g), c.format)}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            );
                        })
                    )}
                </TableBody>
            </Table>
        </InsightCard>
    );
};
