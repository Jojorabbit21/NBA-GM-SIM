// PhoneTeamPayroll.tsx — 폰(<768) 팀 화면 "재정" 탭. [2026-10-27 모바일 팀 화면]
// docs/ui/mobile-design-system.md §9-1-6, 캔버스 6행 E14·E15(개정: 요약 블록 상단 고정 + 축약 금액). 데스크톱 TeamPayrollTable의 폰판:
//   요약 블록(스크롤 밖 고정, 2줄 12px): 총 페이롤 · 캡 여유 / 사치세·1차·2차 에이프런 대비(켜진 항목만) — 데스크톱 푸터 "합계·대비" 행을 표 위로.
//   표(공용 Table flush/phone/parent): sticky 선수 열 136(로스터·능력치 탭과 같은 PhonePlayerCell — 부상 배지는 데스크톱처럼 숨김) → Cap% 56 →
//   시즌 6열 64(축약 `$34.8M`, 현재 시즌 열 white/4%, 팀 옵션 sky 이탤릭·플레이어 옵션 emerald 이탤릭·연장 연차 amber·데드캡 red 이탤릭·만료 다음 열 UFA/RFA 칩)
//   → 잔여 총액 72. 투웨이 행 60% 흐림(Cap% '-'·합계 제외), 방출 선수(데드캡) 행은 playerId로 묶어 1행. 정렬 = 시즌 헤더 탭(기본 현재 시즌 내림차순).
//   범례 32는 표 아래 한 줄. 계산(flattenRemainingYears·previewFAStatusAfterContract·capPctColor·합계)은 데스크톱과 동일 함수.
import React, { useMemo } from 'react';
import type { Team, Player } from '../../types';
import type { DeadMoneyEntry } from '../../types/team';
import { flattenRemainingYears, hasNextContract } from '../../services/contracts/contractLifecycle';
import { formatMoney } from '../../utils/formatMoney';
import { estimatePlayerYOS } from '../../utils/constants';
import { previewFAStatusAfterContract } from '../../services/multi/negotiation/rfaEligibility';
import { usePlayerCareerHistoryBatch } from '../../hooks/usePlayerCareerHistoryBatch';
import { useTableSort } from '../../hooks/useTableSort';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell, TableGroupHeaderCell } from '../common/Table';
import { Money } from '../common/Money';
import { capPctColor, type RosterCapSettings } from './TeamPayrollTable';
import { PhonePlayerCell, PHONE_STICKY_COL_WIDTH } from './PhoneRosterOverview';

interface PhoneTeamPayrollProps {
    team: Team;
    capSettings: RosterCapSettings;
    baseSeasonYear: number;
    onPlayerClick?: (player: Player) => void;
    playerConditions?: Map<string, number | null>;
}

const W = { CAP: 56, SEASON: 64, TOTAL: 72 } as const;

function salaryAtCol(p: Player, colIndex: number): number {
    if (!p.contract) return 0;
    return flattenRemainingYears(p.contract)[colIndex]?.amount ?? 0;
}

type SeasonCell = { amount: number | null; className: string; chip?: { label: string; className: string } };

export const PhoneTeamPayroll: React.FC<PhoneTeamPayrollProps> = ({ team, capSettings, baseSeasonYear, onPlayerClick, playerConditions }) => {
    const { sortConfig, sortProps } = useTableSort<number>({ key: 0, direction: 'desc' });

    const { players, seasonColumns, totals } = useMemo(() => {
        const sorted = [...team.roster].sort((a, b) => sortConfig.direction === 'asc'
            ? salaryAtCol(a, sortConfig.key) - salaryAtCol(b, sortConfig.key)
            : salaryAtCol(b, sortConfig.key) - salaryAtCol(a, sortConfig.key));
        const cols: string[] = [];
        for (let y = baseSeasonYear; y < baseSeasonYear + 6; y++) cols.push(`${y}-${String(y + 1).slice(-2)}`);
        const colTotals = new Array(cols.length).fill(0);
        for (const p of sorted) {
            if (!p.contract || p.contract.type === 'two_way') continue;
            flattenRemainingYears(p.contract).forEach((fy, i) => { if (i < cols.length) colTotals[i] += fy.amount; });
        }
        for (const d of (team.deadMoney ?? [])) {
            const ci = cols.indexOf(d.season);
            if (ci >= 0) colTotals[ci] += d.amount;
        }
        return { players: sorted, seasonColumns: cols, totals: colTotals };
    }, [team.roster, team.deadMoney, baseSeasonYear, sortConfig]);

    const remainingTotal = useMemo(() => new Map(players.map(p => [p.id, p.contract ? flattenRemainingYears(p.contract).reduce((a, fy) => a + fy.amount, 0) : 0])), [players]);

    const rosterIds = useMemo(() => team.roster.map(p => p.id), [team.roster]);
    const { data: careerHistoryMap } = usePlayerCareerHistoryBatch(rosterIds);
    const faStatusPreview = useMemo(() => {
        const m = new Map<string, ReturnType<typeof previewFAStatusAfterContract>>();
        for (const p of players) {
            if (!p.contract) { m.set(p.id, null); continue; }
            const careerHistory = careerHistoryMap?.[p.id] ?? p.career_history;
            m.set(p.id, previewFAStatusAfterContract(p.contract, estimatePlayerYOS({ ...p, career_history: careerHistory }, baseSeasonYear)));
        }
        return m;
    }, [players, baseSeasonYear, careerHistoryMap]);

    const deadRows = useMemo(() => {
        const groups = new Map<string, { playerId: string; playerName: string; player?: Player; entries: DeadMoneyEntry[] }>();
        for (const d of (team.deadMoney ?? [])) {
            const g = groups.get(d.playerId) ?? { playerId: d.playerId, playerName: d.playerName, player: d.player, entries: [] };
            if (!g.player && d.player) g.player = d.player;
            g.entries.push(d);
            groups.set(d.playerId, g);
        }
        return [...groups.values()];
    }, [team.deadMoney]);

    const currentPayroll = totals[0] ?? 0;
    const diffRows = [
        capSettings.capEnabled && { label: '캡 여유', v: capSettings.salaryCapAmount },
        capSettings.luxuryTaxEnabled && { label: '사치세', v: capSettings.luxuryTaxAmount },
        capSettings.apron1Enabled && { label: '1차 에이프런', v: capSettings.apron1Amount },
        capSettings.apron2Enabled && { label: '2차 에이프런', v: capSettings.apron2Amount },
    ].filter((r): r is { label: string; v: number } => !!r);

    const cond = (id: string) => playerConditions ? (playerConditions.has(id) ? (playerConditions.get(id) as number | null) : undefined) : undefined;
    const seasonCellsFor = (p: Player): SeasonCell[] => {
        const flat = p.contract ? flattenRemainingYears(p.contract) : [];
        return seasonColumns.map((_, i) => {
            const fy = flat[i];
            const opt = fy?.option;
            const className = opt?.type === 'team' ? 'italic text-sky-400' : opt?.type === 'player' ? 'italic text-emerald-400' : fy?.segment === 'next' ? 'text-amber-300' : 'text-slate-300';
            const fa = p.contract && i === flat.length && !hasNextContract(p.contract) ? faStatusPreview.get(p.id) : null;
            return { amount: fy ? fy.amount : null, className, chip: fa ? { label: fa.status, className: fa.status === 'RFA' ? 'text-violet-400' : 'text-emerald-400' } : undefined };
        });
    };

    return (
        <div className="relative flex-1 min-h-0 flex flex-col">
            {/* 요약 블록 — 데스크톱 푸터 합계·대비 행의 폰판(§9-1-6). 2줄 12/600, 켜진 항목만. */}
            <div className="shrink-0 px-4 py-2 flex flex-col gap-1 border-b border-slate-800 bg-slate-950 text-xs font-semibold text-slate-400 whitespace-nowrap overflow-hidden">
                <div className="flex items-center gap-2">
                    <span>총 페이롤 <span className="text-slate-200 tabular-nums">{formatMoney(currentPayroll)}</span></span>
                    {diffRows[0] && <><span className="text-slate-700">·</span><span>{diffRows[0].label} <Money value={diffRows[0].v - currentPayroll} signed /></span></>}
                </div>
                {diffRows.length > 1 && (
                    <div className="flex items-center gap-2">
                        {diffRows.slice(1).map((r, i) => (
                            <React.Fragment key={r.label}>
                                {i > 0 && <span className="text-slate-700">·</span>}
                                <span>{r.label} <Money value={r.v - currentPayroll} signed /></span>
                            </React.Fragment>
                        ))}
                    </div>
                )}
            </div>
            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar overscroll-x-contain">
                <Table variant="flush" density="phone" scroll="parent" dividers={false}>
                    <TableHead noRow>
                        <tr className="h-7">
                            <TableGroupHeaderCell stickyLeft={0} className="!px-4"><span className="block text-left">선수 정보</span></TableGroupHeaderCell>
                            <TableGroupHeaderCell />
                            <TableGroupHeaderCell colSpan={seasonColumns.length} className="border-l border-r border-slate-800">시즌별 페이롤</TableGroupHeaderCell>
                            <TableGroupHeaderCell />
                        </tr>
                        <tr className="h-9 text-slate-400 text-xs font-bold">
                            <TableHeaderCell stickyLeft={0} width={PHONE_STICKY_COL_WIDTH} align="left" className="pl-4">선수</TableHeaderCell>
                            <TableHeaderCell width={W.CAP}>Cap%</TableHeaderCell>
                            {seasonColumns.map((col, i) => <TableHeaderCell key={col} width={W.SEASON} align="right" {...sortProps(i)}>{col}</TableHeaderCell>)}
                            <TableHeaderCell width={W.TOTAL} align="right">총액</TableHeaderCell>
                        </tr>
                    </TableHead>
                    <TableBody>
                        {players.map(p => {
                            const twoWay = p.contract?.type === 'two_way';
                            const capPct = twoWay || capSettings.salaryCapAmount <= 0 ? null : (salaryAtCol(p, 0) / capSettings.salaryCapAmount) * 100;
                            return (
                                <TableRow key={p.id} onClick={onPlayerClick ? () => onPlayerClick(p) : undefined} className={twoWay ? 'opacity-60' : ''}>
                                    <TableCell stickyLeft={0} width={PHONE_STICKY_COL_WIDTH} align="left" className="pl-4">
                                        <PhonePlayerCell player={p} condition={cond(p.id)} showInjury={false} />
                                    </TableCell>
                                    <TableCell width={W.CAP} align="center" className="text-sm font-bold">
                                        {capPct != null ? <span style={{ color: capPctColor(capPct) }}>{capPct.toFixed(1)}%</span> : <span className="text-slate-600 font-medium">-</span>}
                                    </TableCell>
                                    {seasonCellsFor(p).map((c, i) => (
                                        <TableCell key={i} width={W.SEASON} align="right" className={`text-sm tabular-nums ${i === 0 ? 'bg-white/[0.04]' : ''}`}>
                                            {c.amount != null ? <span className={`font-medium ${c.className}`}>{formatMoney(c.amount)}</span>
                                                : c.chip ? <span className={`font-bold ${c.chip.className}`}>{c.chip.label}</span>
                                                : <span className="text-slate-600">-</span>}
                                        </TableCell>
                                    ))}
                                    <TableCell width={W.TOTAL} align="right" className="text-sm font-semibold text-slate-200 tabular-nums border-l border-slate-800">{formatMoney(remainingTotal.get(p.id) ?? 0)}</TableCell>
                                </TableRow>
                            );
                        })}
                        {deadRows.map((g, i) => {
                            const amountAt = (season: string) => g.entries.filter(e => e.season === season).reduce((s, e) => s + e.amount, 0);
                            const totalAll = g.entries.reduce((s, e) => s + e.amount, 0);
                            const col0 = amountAt(seasonColumns[0]);
                            const capPct = capSettings.salaryCapAmount > 0 && col0 > 0 ? (col0 / capSettings.salaryCapAmount) * 100 : null;
                            return (
                                <TableRow key={`dead-${g.playerId}-${i}`} onClick={g.player && onPlayerClick ? () => onPlayerClick(g.player!) : undefined}>
                                    <TableCell stickyLeft={0} width={PHONE_STICKY_COL_WIDTH} align="left" className="pl-4">
                                        {g.player ? <PhonePlayerCell player={g.player} showInjury={false} /> : <span className="text-sm font-medium text-slate-200 truncate">{g.playerName}</span>}
                                    </TableCell>
                                    <TableCell width={W.CAP} align="center" className="text-sm font-bold">
                                        {capPct != null ? <span style={{ color: capPctColor(capPct) }}>{capPct.toFixed(1)}%</span> : <span className="text-slate-600 font-medium">-</span>}
                                    </TableCell>
                                    {seasonColumns.map((col, ci) => {
                                        const amt = amountAt(col);
                                        return (
                                            <TableCell key={col} width={W.SEASON} align="right" className={`text-sm tabular-nums ${ci === 0 ? 'bg-white/[0.04]' : ''}`}>
                                                {amt > 0 ? <span className="font-medium italic text-red-400">{formatMoney(amt)}</span> : <span className="text-slate-600">-</span>}
                                            </TableCell>
                                        );
                                    })}
                                    <TableCell width={W.TOTAL} align="right" className="text-sm font-semibold italic text-red-400 tabular-nums border-l border-slate-800">{formatMoney(totalAll)}</TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
                {/* 범례 32 — 데스크톱 푸터 범례(h-40)의 한 줄판 */}
                <div className="sticky left-0 h-8 px-4 flex items-center gap-3 text-xs font-semibold text-slate-400 whitespace-nowrap overflow-hidden border-t border-slate-800">
                    <span className="text-slate-500">범례</span>
                    {[['bg-sky-400', '팀 옵션'], ['bg-emerald-400', '플레이어 옵션'], ['bg-amber-300', '연장 계약'], ['bg-red-400', '데드캡']].map(([c, l]) => (
                        <span key={l} className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm ${c}`} />{l}</span>
                    ))}
                </div>
                <div aria-hidden="true" className="h-14 pb-safe sticky left-0" />
            </div>
            <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-r from-transparent to-slate-900" />
        </div>
    );
};
