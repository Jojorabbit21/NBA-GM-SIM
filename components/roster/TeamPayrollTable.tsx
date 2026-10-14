
import { flattenRemainingYears, hasNextContract } from '../../services/contracts/contractLifecycle';
import React, { useMemo } from 'react';
import type { Team, Player } from '../../types';
import type { DeadMoneyEntry } from '../../types/team';
import { formatMoneyFull } from '../../utils/formatMoney';
import { Money } from '../common/Money';
import { estimatePlayerYOS } from '../../utils/constants';
import { previewFAStatusAfterContract } from '../../services/multi/negotiation/rfaEligibility';
import { usePlayerCareerHistoryBatch } from '../../hooks/usePlayerCareerHistoryBatch';
import { useTableSort } from '../../hooks/useTableSort';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableGroupHeaderCell, TableCell, TableFoot } from '../common/Table';
import { PlayerInfoColGroup, PlayerInfoHeaderCells, PlayerInfoCells, PLAYER_INFO_TOTAL_WIDTH } from './PlayerInfoColumns';

// RosterGrid.tsx(로스터/능력치/선수 기록 탭)와 동일한 디자인 언어 — 2단 헤더(그룹행+라벨행),
// 풀블리드(flush) 테이블, 이름|포지션|나이|오버롤 다중 sticky 컬럼(PlayerInfoColumns 공용).
const CAPPCT_WIDTH = 70;
const LEFT_CAPPCT = PLAYER_INFO_TOTAL_WIDTH;
const INFO_COL_WIDTH = PLAYER_INFO_TOTAL_WIDTH + CAPPCT_WIDTH;

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
// [2026-10-01] 현재 계약 뒤에 이미 체결된 다음 계약(nextContract)이 있으면 그 연차도 이어서 센다.
function salaryAtCol(p: Player, colIndex: number): number {
    if (!p.contract) return 0;
    return flattenRemainingYears(p.contract)[colIndex]?.amount ?? 0;
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

interface PayrollSeasonCell {
    amount: number | null;
    className: string;
    title?: string;
    chip?: { label: string; title: string; className: string };
}

interface PayrollRowProps {
    player?: Player;            // 데드캡 축소 행이면 undefined
    fallbackName?: string;
    teamAbbr: string;
    enableHoverCard: boolean;
    onClick?: () => void;
    twoWay: boolean;            // 행 opacity-60
    capPct: number | null;      // null이면 '-'
    seasonCells: PayrollSeasonCell[];
    total: number;
    totalClassName: string;     // 선수 행 'text-slate-200', 데드 행 'italic text-red-400'
}

// [2026-10-13] 선수 행과 데드캡 행이 같은 마크업을 복붙하던 것을 하나로 합침 — 한쪽만 고치는 회귀가 구조적으로 불가능.
const PayrollRow: React.FC<PayrollRowProps> = ({
    player, fallbackName, teamAbbr, enableHoverCard, onClick, twoWay, capPct, seasonCells, total, totalClassName,
}) => (
    <TableRow className={twoWay ? 'opacity-60' : ''} onClick={onClick}>
        <PlayerInfoCells
            player={player}
            fallbackName={fallbackName}
            teamAbbr={teamAbbr}
            clickable={!!onClick}
            enableHoverCard={enableHoverCard}
            showInjury={false}
        />
        <TableCell stickyLeft={LEFT_CAPPCT} width={CAPPCT_WIDTH}>
            {capPct != null ? (
                <span className="text-sm font-bold" style={{ color: capPctColor(capPct) }}>{capPct.toFixed(1)}%</span>
            ) : (
                <span className="text-sm font-medium text-slate-600">-</span>
            )}
        </TableCell>
        {seasonCells.map((c, i) => (
            <TableCell key={i} align="right" className={`pr-4 ${i === 0 ? 'bg-white/[0.04]' : ''}`}>
                {c.amount != null ? (
                    <span className={`font-medium text-sm tabular-nums ${c.className}`} title={c.title}>
                        {formatMoneyFull(c.amount)}
                    </span>
                ) : c.chip ? (
                    <span title={c.chip.title} className={`font-bold text-sm ${c.chip.className}`}>{c.chip.label}</span>
                ) : (
                    <span className="text-slate-600">-</span>
                )}
            </TableCell>
        ))}
        <TableCell align="right" className="pr-4 border-l border-l-slate-800">
            <span className={`font-semibold text-sm tabular-nums ${totalClassName}`}>{formatMoneyFull(total)}</span>
        </TableCell>
    </TableRow>
);


export const TeamPayrollTable: React.FC<TeamPayrollTableProps> = ({ team, capSettings, baseSeasonYear, onPlayerClick, enableHoverCard = false }) => {
    // 연도 컬럼 헤더를 클릭하면 그 시즌 연봉 기준으로 정렬 — 기본은 0번(현재 시즌) 내림차순.
    const { sortConfig, sortProps } = useTableSort<number>({ key: 0, direction: 'desc' });

    const { players, seasonColumns, totals } = useMemo(() => {
        const sorted = [...team.roster].sort((a, b) => sortConfig.direction === 'asc'
            ? salaryAtCol(a, sortConfig.key) - salaryAtCol(b, sortConfig.key)
            : salaryAtCol(b, sortConfig.key) - salaryAtCol(a, sortConfig.key));

        const cols: string[] = [];
        for (let y = baseSeasonYear; y < baseSeasonYear + 6; y++) {
            cols.push(`${y}-${String(y + 1).slice(-2)}`);
        }

        // [2026-09-16] 투웨이 계약은 실제 CBA상 샐러리캡에 전혀 잡히지 않는다 — 개별 선수
        // 행에는 그대로 본인 연봉을 보여주되(정보성), "합계"/캡·사치세·에이프런 대비 행에는
        // 합산하지 않는다(services/fa/faMarketBuilder.ts의 calcTeamPayroll과 동일 원칙).
        const colTotals = new Array(cols.length).fill(0);
        for (const p of sorted) {
            if (!p.contract || p.contract.type === 'two_way') continue;
            // [2026-10-01] 다음 계약(연장) 연차까지 합계에 포함 — 현재 계약만 세면 연장 선수의 미래 시즌이 비어 보인다.
            flattenRemainingYears(p.contract).forEach((fy, colIdx) => {
                if (colIdx < cols.length) colTotals[colIdx] += fy.amount;
            });
        }
        for (const d of (team.deadMoney ?? [])) {
            const ci = cols.indexOf(d.season);
            if (ci >= 0) colTotals[ci] += d.amount;
        }

        return { players: sorted, seasonColumns: cols, totals: colTotals };
    }, [team.roster, team.deadMoney, baseSeasonYear, sortConfig]);

    // 잔여 계약기간 전체(표에 보이는 6개 시즌 컬럼 범위를 넘어서도) 합산 — 계약 만료 시즌까지 전부.
    const remainingTotal = useMemo(() => {
        const map = new Map<string, number>();
        for (const p of players) {
            if (!p.contract) { map.set(p.id, 0); continue; }
            const sum = flattenRemainingYears(p.contract).reduce((acc, fy) => acc + fy.amount, 0);
            map.set(p.id, sum);
        }
        return map;
    }, [players]);

    // useLeagueRawStats.ts가 2026-09-07에 성능 이유로 career_history를 select에서 뺀 채라
    // (250명+ 리그 전체에 무거운 JSONB를 매번 얹으면 병목), 이 팀 로스터(15~20명) 범위로만
    // 좁혀 별도 조회 — YOS를 draftYear 역산이 아니라 실제 커리어 기록으로 정확히 계산하기
    // 위함(estimatePlayerYOS는 그래도 이 조회가 비어있는 선수를 위해 draftYear 폴백을 유지).
    const rosterIds = useMemo(() => team.roster.map(p => p.id), [team.roster]);
    const { data: careerHistoryMap } = usePlayerCareerHistoryBatch(rosterIds);

    // 계약 만료 "다음 해" 컬럼에 UFA/RFA 칩을 띄우기 위한 미리보기 — services/multi/negotiation/
    // rfaEligibility.ts의 previewFAStatusAfterContract() 재사용(트리거 없는 순수 판정 로직,
    // "이 계약이 이대로 끝까지 간다면" 가정). two-way는 null을 반환해 칩이 안 뜬다.
    const faStatusPreview = useMemo(() => {
        const map = new Map<string, ReturnType<typeof previewFAStatusAfterContract>>();
        for (const p of players) {
            if (!p.contract) { map.set(p.id, null); continue; }
            const careerHistory = careerHistoryMap?.[p.id] ?? p.career_history;
            const careerYOS = estimatePlayerYOS({ ...p, career_history: careerHistory }, baseSeasonYear);
            map.set(p.id, previewFAStatusAfterContract(p.contract, careerYOS));
        }
        return map;
    }, [players, baseSeasonYear, careerHistoryMap]);

    const currentPayroll = totals[0] ?? 0;

    // [2026-09-21] 데드캡 — 처음엔 "합계" 행에만 조용히 합산했더니 어디서 온 금액인지 안 보인다는
    // 지적을 받음("재정 탭에 데드캡 행이 안 보인다"). 이후 요청대로 방출된 선수를 로스터에서
    // 지우지 않고 별도 색상의 행으로 계속 보여주는 방식으로 변경 — team.roster엔 이미 없는
    // 선수라 DeadMoneyEntry(playerId/playerName/amount/season)만으로 행을 그린다(포지션/나이/
    // 오버롤 정보 없음, "-"로 표시). 데드캡이 해소돼 team.deadMoney에서 그 항목이 빠지면
    // (release_player 재정의 시 정리 로직이 붙는 시점) 이 행도 자동으로 사라진다 — 별도의
    // "해소" 판정 로직은 필요 없다.
    //
    // [2026-09-21 정정] waive가 원래 계약 스케줄 그대로(연도별 실제 금액이 각자의 원래
    // 시즌에) 데드캡을 남기도록 바뀌면서, 방출 선수 1명당 항목이 여러 개(잔여 연수만큼)
    // 생길 수 있게 됐다 — 예전처럼 항목 하나당 행 하나씩 그리면 같은 선수가 시즌마다
    // 중복된 행으로 여러 번 나온다. playerId로 묶어 로스터 선수 행과 동일하게 "한 선수 =
    // 한 행, 여러 시즌 컬럼에 걸쳐 표시"로 그린다.
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
            <Table variant="flush" fullHeight>
                <colgroup>
                    <PlayerInfoColGroup />
                    <col style={{ width: CAPPCT_WIDTH }} />
                    {seasonColumns.map((_, i) => <col key={i} />)}
                    <col style={{ width: 140 }} />
                </colgroup>
                <TableHead noRow>
                    {/* Header Row 1: 그룹 */}
                    <tr className="h-10">
                        <TableGroupHeaderCell colSpan={5} stickyLeft={0}>선수 정보</TableGroupHeaderCell>
                        <TableGroupHeaderCell colSpan={seasonColumns.length}>시즌별 페이롤</TableGroupHeaderCell>
                        <TableGroupHeaderCell />
                    </tr>
                    {/* Header Row 2: 라벨 */}
                    <tr className="h-10 text-slate-400 text-sm font-bold">
                        <PlayerInfoHeaderCells ovrLabel="오버롤" />
                        <TableHeaderCell stickyLeft={LEFT_CAPPCT} width={CAPPCT_WIDTH}>Cap%</TableHeaderCell>
                        {seasonColumns.map((col, i) => (
                            <TableHeaderCell key={col} align="right" className="pr-4" {...sortProps(i)}>
                                {col}
                            </TableHeaderCell>
                        ))}
                        <TableHeaderCell align="right" className="pr-4">총액</TableHeaderCell>
                    </tr>
                </TableHead>
                <TableBody>
                    {players.map(p => {
                        // [2026-10-01] 현재 계약 + 이미 체결된 다음 계약(nextContract)을 한 줄로 편 배열로 표시.
                        const flat = p.contract ? flattenRemainingYears(p.contract) : [];
                        const seasonCells: PayrollSeasonCell[] = seasonColumns.map((_, i) => {
                            const fy = flat[i];
                            const amount = fy ? fy.amount : null;
                            const opt = fy?.option;
                            const className = opt?.type === 'team'
                                ? 'italic text-sky-400'
                                : opt?.type === 'player'
                                    ? 'italic text-emerald-400'
                                    : fy?.segment === 'next'
                                        ? 'text-amber-300'   // 다음 계약(연장) 연차 — 현재 계약과 구분
                                        : 'text-slate-300';
                            // 마지막 연차 바로 다음 컬럼에만 UFA/RFA 칩 표시 — 다음 계약이 있으면 칩 없음
                            // (previewFAStatusAfterContract가 null을 돌려줌).
                            const faStatus = p.contract && i === flat.length && !hasNextContract(p.contract)
                                ? faStatusPreview.get(p.id)
                                : null;
                            return {
                                amount,
                                className,
                                title: fy?.segment === 'next' ? '연장 계약(이미 체결된 다음 계약) 연차' : undefined,
                                chip: faStatus ? {
                                    label: faStatus.status,
                                    title: faStatus.status === 'RFA' ? 'Restricted Free Agent' : 'Unrestricted Free Agent',
                                    className: faStatus.status === 'RFA' ? 'text-violet-400' : 'text-emerald-400',
                                } : undefined,
                            };
                        });
                        // 투웨이는 샐러리캡에 전혀 잡히지 않아 Cap%가 의미 없음 — "-" 표시.
                        const capPct = p.contract?.type === 'two_way' || capSettings.salaryCapAmount <= 0
                            ? null
                            : (salaryAtCol(p, 0) / capSettings.salaryCapAmount) * 100;
                        return (
                            <PayrollRow
                                key={p.id}
                                player={p}
                                teamAbbr={team.abbr}
                                enableHoverCard={enableHoverCard}
                                onClick={onPlayerClick ? () => onPlayerClick(p) : undefined}
                                twoWay={p.contract?.type === 'two_way'}
                                capPct={capPct}
                                seasonCells={seasonCells}
                                total={remainingTotal.get(p.id) ?? 0}
                                totalClassName="text-slate-200"
                            />
                        );
                    })}
                    {/* [2026-09-21] 방출된 선수 — team.roster엔 없지만 데드캡이 남아있는 동안 계속 표시한다.
                        선수 행과 같은 PayrollRow를 쓰고 데드캡 금액 텍스트만 빨간 이탤릭(범례에서 색으로만 구분).
                        d.player가 없으면(드물게 meta_players 조회 실패) 이름만 보이는 축소 행으로 폴백.
                        [2026-09-21 정정] waive가 원래 계약 스케줄 그대로(연도별) 데드캡을 남기게 되면서 한 선수당
                        여러 시즌에 항목이 걸쳐 생길 수 있어, playerId로 묶은 deadRows(그룹)를 시즌 컬럼별로
                        조회해 한 선수당 한 행만 그린다.
                        [2026-10-13] 선수 행과 PayrollRow 공유 — 둘 중 하나만 고치는 회귀가 구조적으로 사라짐. */}
                    {deadRows.map((g, i) => {
                        const p = g.player;
                        const amountAt = (season: string) => g.entries.filter(e => e.season === season).reduce((s, e) => s + e.amount, 0);
                        const totalAll = g.entries.reduce((s, e) => s + e.amount, 0);
                        const col0Amount = amountAt(seasonColumns[0]);
                        const seasonCells: PayrollSeasonCell[] = seasonColumns.map(col => {
                            const amt = amountAt(col);
                            return { amount: amt > 0 ? amt : null, className: 'italic text-red-400' };
                        });
                        // 방출 선수의 Cap%는 남은 계약이 아니라 실제로 이번 시즌 캡에 잡히는 데드캡 기준.
                        const capPct = capSettings.salaryCapAmount > 0 && col0Amount > 0
                            ? (col0Amount / capSettings.salaryCapAmount) * 100
                            : null;
                        return (
                            <PayrollRow
                                key={`dead-${g.playerId}-${i}`}
                                player={p}
                                fallbackName={g.playerName}
                                teamAbbr={team.abbr}
                                enableHoverCard={enableHoverCard}
                                onClick={p && onPlayerClick ? () => onPlayerClick(p) : undefined}
                                twoWay={p?.contract?.type === 'two_way'}
                                capPct={capPct}
                                seasonCells={seasonCells}
                                total={totalAll}
                                totalClassName="italic text-red-400"
                            />
                        );
                    })}
                </TableBody>
                <TableFoot>
                    <tr className="h-10">
                        <TableCell colSpan={5} align="left" stickyLeft={0} width={INFO_COL_WIDTH} className="pl-4 font-bold text-indigo-400 text-sm">
                            합계
                        </TableCell>
                        {totals.map((t, i) => (
                            <TableCell key={i} align="right" className="pr-4">
                                <span className="font-semibold text-sm text-white tabular-nums">{formatMoneyFull(t)}</span>
                            </TableCell>
                        ))}
                        <TableCell align="right" className="pr-4 border-l border-l-slate-800" />
                    </tr>
                    {diffRows.map(row => {
                        const diff = row.v - currentPayroll;
                        return (
                            <tr key={row.label} className="h-9 border-t border-slate-800">
                                <TableCell colSpan={5} align="left" stickyLeft={0} width={INFO_COL_WIDTH} className="pl-4 font-semibold text-slate-400 text-sm">
                                    {row.label}
                                </TableCell>
                                {seasonColumns.map((col, i) => (
                                    <TableCell key={col} align="right" className="pr-4">
                                        {i === 0 ? (
                                            <Money value={diff} format="full" signed className="font-semibold text-sm" />
                                        ) : (
                                            <span className="text-slate-700">-</span>
                                        )}
                                    </TableCell>
                                ))}
                                <TableCell align="right" className="pr-4 border-l border-l-slate-800">
                                    <span className="text-slate-700">-</span>
                                </TableCell>
                            </tr>
                        );
                    })}
                    {/* Glossary — 로스터 탭(RosterOverviewGrid.tsx) 하단 "정규 계약 슬롯" 푸터와
                        동일한 h-40 높이. 연도별 금액에 적용되는 이탤릭+색상(하늘색/초록색/빨간색)이
                        각각 팀/플레이어 옵션/데드캡을 뜻한다는 걸 테이블 안에서 바로 확인할 수 있게 안내. */}
                    <tr className="h-40 border-t border-slate-800">
                        <TableCell colSpan={5 + seasonColumns.length + 1} className="px-4">
                            <div className="h-40 flex items-start justify-end gap-6 pt-3">
                                <span className="text-sm font-semibold text-slate-500">범례</span>
                                <span className="flex items-center gap-2 text-sm font-semibold">
                                    <span className="w-3 h-3 rounded-sm bg-sky-400" />
                                    <span className="text-slate-400">팀 옵션</span>
                                </span>
                                <span className="flex items-center gap-2 text-sm font-semibold">
                                    <span className="w-3 h-3 rounded-sm bg-emerald-400" />
                                    <span className="text-slate-400">플레이어 옵션</span>
                                </span>
                                <span className="flex items-center gap-2 text-sm font-semibold">
                                    <span className="w-3 h-3 rounded-sm bg-red-400" />
                                    <span className="text-slate-400">데드캡</span>
                                </span>
                            </div>
                        </TableCell>
                    </tr>
                </TableFoot>
            </Table>
            </div>
        </div>
    );
};
