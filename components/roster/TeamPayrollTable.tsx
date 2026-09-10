
import React, { useMemo, useState } from 'react';
import type { Team, Player } from '../../types';
import { formatMoneyFull } from '../../utils/formatMoney';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';
import { Table, TableBody, TableRow, TableHeaderCell, TableCell, TableFoot } from '../common/Table';
import { PlayerHoverCard } from '../common/PlayerHoverCard';

// RosterGrid.tsx(로스터/능력치/선수 기록 탭)와 동일한 디자인 언어 — 2단 헤더(그룹행+라벨행),
// !rounded-none 풀블리드 테이블, 이름|포지션|나이|오버롤 다중 sticky 컬럼.
const WIDTHS = { NAME: 180, POS: 60, AGE: 50, OVR: 60, CAPPCT: 70 };
const LEFT_POS = WIDTHS.NAME;
const LEFT_AGE = WIDTHS.NAME + WIDTHS.POS;
const LEFT_OVR = WIDTHS.NAME + WIDTHS.POS + WIDTHS.AGE;
const LEFT_CAPPCT = WIDTHS.NAME + WIDTHS.POS + WIDTHS.AGE + WIDTHS.OVR;
const INFO_COL_WIDTH = WIDTHS.NAME + WIDTHS.POS + WIDTHS.AGE + WIDTHS.OVR + WIDTHS.CAPPCT;

const getStickyStyle = (left: number, width: number, isLast = false): React.CSSProperties => ({
    left, width, minWidth: width, maxWidth: width,
    position: 'sticky', zIndex: 30,
    borderRight: isLast ? undefined : 'none',
});

/** 리그별 샐러리캡 세부 설정 — 마스터 스위치(capEnabled) + 항목별 개별 on/off + 금액. */
export interface RosterCapSettings {
    capEnabled: boolean;
    salaryCapAmount: number;
    luxuryTaxEnabled: boolean;
    luxuryTaxAmount: number;
    apron1Enabled: boolean;
    apron1Amount: number;
    apron2Enabled: boolean;
    apron2Amount: number;
    salaryFloorEnabled: boolean;
    salaryFloorAmount: number;
}

interface TeamPayrollTableProps {
    team: Team;
    capSettings: RosterCapSettings;
    /** 페이롤 테이블의 첫 번째 시즌 컬럼 연도(예: 2026 → "2026-27") — 계약의 currentYear가 이 시즌을 가리킨다고 가정. */
    baseSeasonYear: number;
    onPlayerClick?: (player: Player) => void;
    /** 선수 이름 hover 시 능력치+스탯 팝업 표시 — 멀티플레이어 전용 기능이라 지정된 경우에만 켜짐.
     *  (지금은 capSettings 미지정 시 "재정" 탭 자체가 숨겨져 싱글플레이어에선 우연히 안전하지만,
     *  RosterGrid/RosterOverviewGrid/RosterStatsStack 등 다른 형제 컴포넌트와 게이트 방식을
     *  통일해 향후 capSettings가 싱글에도 노출되는 변경이 생겨도 안전하도록 함.) */
    enableHoverCard?: boolean;
}

// 시즌 컬럼 인덱스(0=현재 시즌) 기준 선수의 그 해 연봉 — 계약이 없거나 범위 밖이면 0.
function salaryAtCol(p: Player, colIndex: number): number {
    if (!p.contract) return 0;
    const idx = colIndex + p.contract.currentYear;
    return idx >= 0 && idx < p.contract.years.length ? p.contract.years[idx] : 0;
}

// Cap% 컬러 스케일 — 캡 바 임계값(플로어/캡/사치세/에이프런)과 동일한 팔레트를 재사용해
// 계약 규모(미니멈~슈퍼맥스)를 한눈에 구분: 회색(미니멈) → 초록(롤플레이어/MLE) →
// 주황(우수한 선발) → 오렌지(맥스 근처) → 빨강(슈퍼맥스급 캡 점유율).
function capPctColor(pct: number): string {
    if (pct < 5) return '#64748b';
    if (pct < 15) return '#10b981';
    if (pct < 25) return '#f59e0b';
    if (pct < 35) return '#f97316';
    return '#ef4444';
}

export const TeamPayrollTable: React.FC<TeamPayrollTableProps> = ({ team, capSettings, baseSeasonYear, onPlayerClick, enableHoverCard = false }) => {
    // 연도 컬럼 헤더를 클릭하면 그 시즌 연봉 기준으로 정렬 — 기본은 0번(현재 시즌) 내림차순.
    const [sortCol, setSortCol] = useState(0);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const handleSort = (colIndex: number) => {
        setSortCol(colIndex);
        setSortDirection(prev => (sortCol === colIndex && prev === 'desc') ? 'asc' : 'desc');
    };

    const { players, seasonColumns, totals } = useMemo(() => {
        const sorted = [...team.roster].sort((a, b) => sortDirection === 'asc'
            ? salaryAtCol(a, sortCol) - salaryAtCol(b, sortCol)
            : salaryAtCol(b, sortCol) - salaryAtCol(a, sortCol));

        const cols: string[] = [];
        for (let y = baseSeasonYear; y < baseSeasonYear + 6; y++) {
            cols.push(`${y}-${String(y + 1).slice(-2)}`);
        }

        const colTotals = new Array(cols.length).fill(0);
        for (const p of sorted) {
            if (!p.contract) continue;
            for (let i = 0; i < p.contract.years.length; i++) {
                const colIdx = i - p.contract.currentYear;
                if (colIdx >= 0 && colIdx < cols.length) colTotals[colIdx] += p.contract.years[i];
            }
        }
        for (const d of (team.deadMoney ?? [])) {
            const ci = cols.indexOf(d.season);
            if (ci >= 0) colTotals[ci] += d.amount;
        }

        return { players: sorted, seasonColumns: cols, totals: colTotals };
    }, [team.roster, team.deadMoney, baseSeasonYear, sortCol, sortDirection]);

    // 잔여 계약기간 전체(표에 보이는 6개 시즌 컬럼 범위를 넘어서도) 합산 — 계약 만료 시즌까지 전부.
    const remainingTotal = useMemo(() => {
        const map = new Map<string, number>();
        for (const p of players) {
            if (!p.contract) { map.set(p.id, 0); continue; }
            let sum = 0;
            for (let i = p.contract.currentYear; i < p.contract.years.length; i++) sum += p.contract.years[i];
            map.set(p.id, sum);
        }
        return map;
    }, [players]);

    const currentPayroll = totals[0] ?? 0;

    // 현재 페이롤(0번 시즌 컬럼)과의 차이를 보여줄 하단 행 — 개별 on/off된 것만.
    // 미래 시즌 컬럼은 리그가 향후 캡 금액을 저장하지 않아 값이 없으므로 0번 컬럼만 채움.
    const diffRows = useMemo(() => (
        [
            capSettings.capEnabled &&       { label: '캡 대비',        v: capSettings.salaryCapAmount },
            capSettings.luxuryTaxEnabled && { label: '사치세 대비',     v: capSettings.luxuryTaxAmount },
            capSettings.apron1Enabled &&    { label: '1차 에이프런 대비', v: capSettings.apron1Amount },
            capSettings.apron2Enabled &&    { label: '2차 에이프런 대비', v: capSettings.apron2Amount },
        ].filter((r): r is { label: string; v: number } => !!r)
    ), [capSettings]);

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* [2026-09-07] "현재 페이롤" 막대 그래프 섹션 제거 — 재정 탭 스크롤 렉 조사 중
                사용자 요청으로 삭제(합성 테스트로는 이 섹션이 원인이 아닌 것으로 측정됐지만,
                원인을 못 찾은 채로 일단 제거). 캡/사치세/에이프런 임계값 자체는 아래 "합계" 밑
                대비 행(diffRows)에서 계속 보여준다. */}

            <div className="flex-1 min-h-0">
            <Table style={{ tableLayout: 'fixed', minWidth: '100%' }} fullHeight className="!rounded-none !border-x-0 !border-t-0 !bg-slate-950">
                <colgroup>
                    <col style={{ width: WIDTHS.NAME }} />
                    <col style={{ width: WIDTHS.POS }} />
                    <col style={{ width: WIDTHS.AGE }} />
                    <col style={{ width: WIDTHS.OVR }} />
                    <col style={{ width: WIDTHS.CAPPCT }} />
                    {seasonColumns.map((_, i) => <col key={i} />)}
                    <col style={{ width: 140 }} />
                </colgroup>
                <thead className="bg-slate-950 sticky top-0 z-40 shadow-sm">
                    {/* Header Row 1: 그룹 */}
                    <tr className="h-10">
                        <th colSpan={5} className="bg-slate-950 border-b border-r border-slate-800 sticky left-0 z-50 align-middle">
                            <div className="h-full flex items-center justify-center">
                                <span className="text-sm font-black text-slate-500 uppercase ko-normal">선수 정보</span>
                            </div>
                        </th>
                        <th colSpan={seasonColumns.length} className="bg-slate-950 border-b border-slate-800 px-2 align-middle">
                            <div className="h-full flex items-center justify-center">
                                <span className="text-sm font-black text-slate-400 uppercase ko-normal">시즌별 페이롤</span>
                            </div>
                        </th>
                        <th className="bg-slate-950 border-b border-l border-slate-800 px-2 align-middle" />
                    </tr>
                    {/* Header Row 2: 라벨 */}
                    <tr className="h-10 text-slate-500 text-sm font-black uppercase">
                        <TableHeaderCell style={{ ...getStickyStyle(0, WIDTHS.NAME), zIndex: 50 }} align="left" className="pl-4 bg-slate-950">이름</TableHeaderCell>
                        <TableHeaderCell style={{ ...getStickyStyle(LEFT_POS, WIDTHS.POS), zIndex: 50 }} className="bg-slate-950">포지션</TableHeaderCell>
                        <TableHeaderCell style={{ ...getStickyStyle(LEFT_AGE, WIDTHS.AGE), zIndex: 50 }} className="bg-slate-950">나이</TableHeaderCell>
                        <TableHeaderCell style={{ ...getStickyStyle(LEFT_OVR, WIDTHS.OVR), zIndex: 50 }} className="bg-slate-950">오버롤</TableHeaderCell>
                        <TableHeaderCell style={{ ...getStickyStyle(LEFT_CAPPCT, WIDTHS.CAPPCT, true), zIndex: 50 }} className="bg-slate-950 border-r border-slate-800">Cap%</TableHeaderCell>
                        {seasonColumns.map((col, i) => (
                            <TableHeaderCell
                                key={col} align="right" className="pr-4 border-r border-r-slate-800/30"
                                sortable onSort={() => handleSort(i)} sortDirection={sortCol === i ? sortDirection : null}
                            >
                                {col}
                            </TableHeaderCell>
                        ))}
                        <TableHeaderCell align="right" className="pr-4 border-l border-slate-800">총액</TableHeaderCell>
                    </tr>
                </thead>
                <TableBody>
                    {players.map(p => (
                        <TableRow key={p.id} className="group" onClick={onPlayerClick ? () => onPlayerClick(p) : undefined}>
                            <TableCell align="left" style={getStickyStyle(0, WIDTHS.NAME)} className="pl-4 bg-slate-900 group-hover:bg-slate-800 transition-colors">
                                <PlayerHoverCard player={p} teamAbbr={team.abbr} enabled={enableHoverCard}>
                                    <span className="text-sm font-semibold text-slate-200 truncate">{p.name}</span>
                                </PlayerHoverCard>
                            </TableCell>
                            <TableCell style={getStickyStyle(LEFT_POS, WIDTHS.POS)} className="text-slate-500 font-semibold text-sm bg-slate-900 group-hover:bg-slate-800 transition-colors text-center">{p.position}</TableCell>
                            <TableCell style={getStickyStyle(LEFT_AGE, WIDTHS.AGE)} className="text-slate-500 font-semibold text-sm bg-slate-900 group-hover:bg-slate-800 transition-colors text-center">{p.age}</TableCell>
                            <TableCell style={getStickyStyle(LEFT_OVR, WIDTHS.OVR)} className="bg-slate-900 group-hover:bg-slate-800 transition-colors text-center">
                                <div className="flex justify-center"><OvrBadge value={calculatePlayerOvr(p)} size="sm" className="!w-7 !h-7 !text-xs !shadow-none" /></div>
                            </TableCell>
                            <TableCell style={getStickyStyle(LEFT_CAPPCT, WIDTHS.CAPPCT, true)} className="border-r border-slate-800 bg-slate-900 group-hover:bg-slate-800 transition-colors text-center">
                                {capSettings.salaryCapAmount > 0 ? (
                                    <span className="text-sm font-bold" style={{ color: capPctColor((salaryAtCol(p, 0) / capSettings.salaryCapAmount) * 100) }}>
                                        {((salaryAtCol(p, 0) / capSettings.salaryCapAmount) * 100).toFixed(1)}%
                                    </span>
                                ) : (
                                    <span className="text-sm font-medium text-slate-600">-</span>
                                )}
                            </TableCell>
                            {seasonColumns.map((col, i) => {
                                const contractIdx = p.contract ? i + p.contract.currentYear : -1;
                                const amount = p.contract && contractIdx >= 0 && contractIdx < p.contract.years.length
                                    ? p.contract.years[contractIdx] : null;
                                return (
                                    <TableCell key={col} align="right" className="pr-4 border-r border-r-slate-800/30">
                                        <span className="font-medium text-sm text-slate-300">
                                            {amount != null ? formatMoneyFull(amount) : <span className="text-slate-600">-</span>}
                                        </span>
                                    </TableCell>
                                );
                            })}
                            <TableCell align="right" className="pr-4 border-l border-l-slate-800">
                                <span className="font-semibold text-sm text-slate-200">{formatMoneyFull(remainingTotal.get(p.id) ?? 0)}</span>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
                <TableFoot className="bg-slate-900 border-t-2 border-slate-800">
                    <tr className="h-10">
                        <TableCell colSpan={5} align="left" style={getStickyStyle(0, INFO_COL_WIDTH, true)} className="pl-4 bg-slate-950 font-black text-indigo-400 text-sm uppercase border-r border-slate-800">
                            합계
                        </TableCell>
                        {totals.map((t, i) => (
                            <TableCell key={i} align="right" className="pr-4 border-r border-r-slate-800/30">
                                <span className="font-semibold text-sm text-white">{formatMoneyFull(t)}</span>
                            </TableCell>
                        ))}
                        <TableCell align="right" className="pr-4 border-l border-l-slate-800 bg-slate-950" />
                    </tr>
                    {diffRows.map(row => {
                        const diff = row.v - currentPayroll;
                        return (
                            <tr key={row.label} className="h-9 border-t border-slate-800/50">
                                <TableCell colSpan={5} align="left" style={getStickyStyle(0, INFO_COL_WIDTH, true)} className="pl-4 bg-slate-950 font-semibold text-slate-400 text-sm border-r border-slate-800">
                                    {row.label}
                                </TableCell>
                                {seasonColumns.map((col, i) => (
                                    <TableCell key={col} align="right" className="pr-4 border-r border-r-slate-800/30 bg-slate-950">
                                        {i === 0 ? (
                                            <span className={`font-semibold text-sm ${diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {diff >= 0 ? '+' : ''}{formatMoneyFull(diff)}
                                            </span>
                                        ) : (
                                            <span className="text-slate-700">-</span>
                                        )}
                                    </TableCell>
                                ))}
                                <TableCell align="right" className="pr-4 border-l border-l-slate-800 bg-slate-950">
                                    <span className="text-slate-700">-</span>
                                </TableCell>
                            </tr>
                        );
                    })}
                </TableFoot>
            </Table>
            </div>
        </div>
    );
};
