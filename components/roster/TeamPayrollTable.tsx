
import React, { useMemo, useState } from 'react';
import type { Team, Player } from '../../types';
import { formatMoney, formatMoneyFull } from '../../utils/formatMoney';
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

const toBarPct = (v: number, max: number) => Math.min(100, Math.max(0, (v / max) * 100));

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

    // 활성화된 임계값만 캡 바에 표시 — 리그 어드민이 개별 항목을 껐으면 그 선은 아예 안 그림.
    const thresholds = useMemo(() => (
        [
            capSettings.salaryFloorEnabled && { v: capSettings.salaryFloorAmount, label: '플로어', color: '#64748b' },
            capSettings.capEnabled &&         { v: capSettings.salaryCapAmount,   label: '캡',     color: '#10b981' },
            capSettings.luxuryTaxEnabled &&   { v: capSettings.luxuryTaxAmount,   label: '사치세',  color: '#f59e0b' },
            capSettings.apron1Enabled &&      { v: capSettings.apron1Amount,      label: '1차 에이프런', color: '#f97316' },
            capSettings.apron2Enabled &&      { v: capSettings.apron2Amount,      label: '2차 에이프런', color: '#ef4444' },
        ].filter((t): t is { v: number; label: string; color: string } => !!t)
    ), [capSettings]);

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

    const maxAxis = thresholds.length > 0 ? Math.max(...thresholds.map(t => t.v), currentPayroll) * 1.1 : currentPayroll * 1.2 || 1;

    // 임계값 사이 구간을 배경색으로 채운 존(zone) 목록 — 선 대신 구간 전체를 색칠.
    // 순서는 항상 플로어<캡<사치세<1차<2차이므로, 꺼진 항목은 건너뛰고 다음 활성 임계값까지
    // 이어서 칠한다(예: 플로어를 꺼두면 0부터 바로 "캡 이하" 초록 구간으로 시작).
    const zones = useMemo(() => {
        const sorted = [...thresholds].sort((a, b) => a.v - b.v);
        const nextColor: Record<string, string> = {
            '플로어': '#10b981', '캡': '#f59e0b', '사치세': '#f97316', '1차 에이프런': '#ef4444', '2차 에이프런': '#991b1b',
        };
        const segs: { start: number; end: number; color: string }[] = [];
        let cursor = 0;
        let color = '#64748b'; // 첫 임계값 이전 구간(활성화된 게 플로어가 아니면 사실상 안 쓰임)
        for (const t of sorted) {
            segs.push({ start: cursor, end: t.v, color });
            cursor = t.v;
            color = nextColor[t.label] ?? color;
        }
        segs.push({ start: cursor, end: maxAxis, color });
        return segs;
    }, [thresholds, maxAxis]);

    // 사용자 팀의 실제 페이롤 막대(불투명도 100%) — 구간 색과 무관하게 항상 밝은 초록색으로 고정.
    const barColor = '#4ade80';

    return (
        <div className="h-full overflow-y-auto custom-scrollbar">
            {thresholds.length > 0 && (
                <div className="bg-slate-900 border-b border-slate-800 p-4">
                    <span className="text-sm font-bold text-slate-300 ko-normal block mb-3">현재 페이롤</span>
                    <div className="relative">
                        {/* 현재 페이롤 금액 — 막대 끝(핸들 자리) 바로 위에 표시 */}
                        <div
                            className="absolute bottom-full mb-1.5 -translate-x-1/2 whitespace-nowrap"
                            style={{ left: `${toBarPct(currentPayroll, maxAxis)}%` }}
                        >
                            <span className="text-sm font-bold text-white">{formatMoneyFull(currentPayroll)}</span>
                        </div>
                        <div className="relative h-3 rounded-full overflow-hidden">
                            {/* 임계값 구간 배경 — 낮은 불투명도로 은은하게 */}
                            {zones.map((z, i) => (
                                <div
                                    key={i}
                                    className="absolute inset-y-0"
                                    style={{
                                        left: `${toBarPct(z.start, maxAxis)}%`,
                                        width: `${toBarPct(z.end, maxAxis) - toBarPct(z.start, maxAxis)}%`,
                                        backgroundColor: z.color,
                                        opacity: 0.35,
                                    }}
                                />
                            ))}
                            {/* 실제 팀 페이롤 — 불투명도 100% */}
                            <div
                                className="absolute inset-y-0 left-0"
                                style={{ width: `${toBarPct(currentPayroll, maxAxis)}%`, backgroundColor: barColor }}
                            />
                        </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                        {thresholds.map(t => (
                            <div key={t.label} className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                                <span className="text-sm text-slate-400 ko-normal">{t.label} {formatMoney(t.v)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

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
                <TableFoot className="bg-slate-900 border-t-2 border-slate-800 sticky bottom-0 z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
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
