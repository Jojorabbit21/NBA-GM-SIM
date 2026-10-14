
import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from '../../../common/IconButton';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../../common/Table';
import { InsightCard } from './InsightCard';

export interface StatRankRow {
    key: string;
    label: string;
    value: number;
    leagueAvg: number;
    format?: 'number' | 'percent';
    rank: number;
    totalTeams: number;
}

function formatValue(val: number, format?: 'number' | 'percent'): string {
    if (format === 'percent') return (val * 100).toFixed(1) + '%';
    return val.toFixed(1);
}

function formatDiff(diff: number, format?: 'number' | 'percent'): string {
    const val = format === 'percent' ? diff * 100 : diff;
    const sign = val > 0 ? '+' : '';
    const suffix = format === 'percent' ? '%' : '';
    return `${sign}${val.toFixed(1)}${suffix}`;
}

// VisualShotChart.tsx의 랭크 색상 컨벤션과 동일(1~5위=fuchsia, 6~10=emerald, 11~30=blue)
function rankColor(rank: number): string {
    if (rank <= 5) return 'text-fuchsia-400';
    if (rank <= 10) return 'text-emerald-400';
    return 'text-blue-400';
}

export interface StatRankPage {
    title: string;
    rows: StatRankRow[];
}

/** 인사이트 탭 전용 — "스탯명 | 값 | 평균 | 리그 순위" 4열 컴팩트 위젯. 자체
 *  최대폭 제한은 없음(w-full) — 여러 개를 가로로 나열할 때 부모가 flex-1 등으로 폭을 나눠주는
 *  용도(전체 리더보드 테이블과는 별개).
 *
 *  `pages`가 2개 이상이면(예: 공격/수비) 상/하로 나눠 보여주는 대신, 헤더 좌우에 쉐브론 버튼을
 *  둬서 같은 자리에서 데이터만 스왑하는 방식으로 전환한다("< 공격 >" → "< 수비 >"). pages가
 *  1개면 쉐브론 없이 예전처럼 고정 제목만 표시.
 *  [2026-10-13] flex-div 표 → 공용 Table(bare) + InsightCard. */
export const TeamStatRankList: React.FC<{ pages: StatRankPage[] }> = ({ pages }) => {
    const [pageIndex, setPageIndex] = useState(0);
    const page = pages[pageIndex];
    const hasMultiplePages = pages.length > 1;
    const goPrev = () => setPageIndex(i => (i - 1 + pages.length) % pages.length);
    const goNext = () => setPageIndex(i => (i + 1) % pages.length);

    return (
        <InsightCard
            title={page.title}
            headerLeft={hasMultiplePages ? <IconButton label="이전" size="sm" onClick={goPrev}><ChevronLeft size={16} /></IconButton> : undefined}
            headerRight={hasMultiplePages ? <IconButton label="다음" size="sm" onClick={goNext}><ChevronRight size={16} /></IconButton> : undefined}
        >
            <Table variant="bare" dividers={false}>
                <TableHead>
                    <TableHeaderCell align="left">스탯</TableHeaderCell>
                    <TableHeaderCell align="right">값</TableHeaderCell>
                    <TableHeaderCell align="right">평균</TableHeaderCell>
                    <TableHeaderCell align="right">순위</TableHeaderCell>
                </TableHead>
                <TableBody>
                    {page.rows.map((row, i) => {
                        const diff = row.value - row.leagueAvg;
                        const diffColor = diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-slate-500';
                        return (
                            <TableRow key={row.key} className={i % 2 === 1 ? 'bg-slate-700/25' : ''}>
                                <TableCell align="left" className="text-sm text-slate-400">{row.label}</TableCell>
                                <TableCell align="right" className="text-sm text-white tabular-nums">{formatValue(row.value, row.format)}</TableCell>
                                <TableCell align="right" className="text-sm text-slate-300 tabular-nums">
                                    {formatValue(row.leagueAvg, row.format)}
                                    <span className={`ml-1 ${diffColor}`}>({formatDiff(diff, row.format)})</span>
                                </TableCell>
                                <TableCell align="right" className={`text-sm tabular-nums ${rankColor(row.rank)}`}>{row.rank}위</TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </InsightCard>
    );
};
