// PhoneRosterOverview.tsx — 폰(<768) 팀 화면 "로스터" 탭 표. [2026-10-27 모바일 팀 화면 1차]
// docs/ui/mobile-design-system.md §9-1-1, 캔버스 5행 E1·E2. 데스크톱 RosterOverviewGrid(sticky 4열 + 8열)를 폰 틀로:
//   요약 줄 36 → 공용 Table(variant flush · density phone · scroll parent · dividers 없음): sticky "선수" 열 136 + 가로 스크롤 열 7개.
//   sticky 열 = OVR 배지(table 28) + 이름 / 캡션 "POS · 나이" + ConditionBar xs + 부상 배지 12 + TW 칩. 도구 줄·열 선택·방출 열 없음.
//   정렬은 공용 useTableSort(헤더 화살표 아이콘), 기본 OVR 내림차순. 행 탭 = 선수 상세. 숫자 포맷·계산은 데스크톱과 같은 유틸.
// [2026-10-27 개정] 네이티브 <table>에서 공용 Table로 교체 — 색·선·화살표·sticky 배경을 데스크톱과 한 곳에서 관리(사용자 결정).
import React, { useMemo } from 'react';
import type { Player, Team } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { getPositionStars } from '../../utils/positionRating';
import { getCurrentSeasonSalary, getContractAav } from '../../utils/contract';
import { formatMoney } from '../../utils/formatMoney';
import { useTableSort, sortByConfig } from '../../hooks/useTableSort';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';
import { OvrBadge } from '../common/OvrBadge';
import { StarRating } from '../common/StarRating';
import { ConditionBar } from '../common/ConditionBar';
import { InjuryStatusBadge } from '../common/InjuryStatusBadge';
import { formatPlayerActiveInjuryLabel } from '../../services/multi/activeInjuryStatus';
import type { RosterCapSettings } from './TeamPayrollTable';

interface PhoneRosterOverviewProps {
    team: Team;
    allTeams?: Team[];
    onPlayerClick: (player: Player) => void;
    maxRosterSize?: number;
    twoWaySlots?: number;
    showTwoWaySlots?: boolean;
    playerConditions?: Map<string, number | null>;
    capSettings?: RosterCapSettings;
}

// §9-1-1 스크롤 열 순서·폭(폰): 키 64 · 몸무게 64 · 리그 레이팅 104 · 포지션 레이팅 104 · 급여 80 · AAV 80 · 잔여 56
// (급여는 AAV 바로 왼쪽 — 계약 열 3개가 나란히, 2026-10-27 사용자 지시)
const W = { HEIGHT: 64, WEIGHT: 64, RATING: 104, POS_RATING: 104, PAY: 80, AAV: 80, REMAINING: 56 } as const;
export const PHONE_STICKY_COL_WIDTH = 136;

function sortValue(p: Player, key: string): number {
    if (key === 'ovr') return calculatePlayerOvr(p);
    if (key === 'height') return p.height ?? 0;
    if (key === 'weight') return p.weight ?? 0;
    if (key === 'contractYears') return p.contractYears ?? 0;
    if (key === 'pay') return getCurrentSeasonSalary(p);
    if (key === 'aav') return getContractAav(p);
    return 0;
}

/** TW 칩 축소판(9px/800, 패딩 1×3, radius 3) — 캡션 줄 전용. */
const TwoWayChip: React.FC = () => (
    <span title="Two-Way 계약" className="shrink-0 text-[9px] leading-none font-extrabold text-slate-300 bg-slate-800 border border-slate-700 rounded-[3px] px-[3px] py-px">TW</span>
);

/** sticky "선수" 칸 — 능력치·선수 기록 탭도 같은 칸을 쓴다. */
export const PhonePlayerCell: React.FC<{ player: Player; condition?: number | null; showInjury?: boolean }> = ({ player, condition, showInjury = true }) => (
    <span className="flex items-center gap-2 min-w-0">
        <OvrBadge value={calculatePlayerOvr(player)} size="table" className="shrink-0" />
        <span className="flex flex-col min-w-0">
            <span className="text-sm leading-5 font-medium text-slate-200 truncate">{player.name}</span>
            <span className="flex items-center gap-1.5 text-xs leading-4 text-slate-400 min-w-0">
                <span className="shrink-0">{player.position} · {player.age}</span>
                {condition !== undefined && (
                    condition === null
                        ? <span className="text-[10px] text-slate-500">경기 중</span>
                        : <ConditionBar value={condition} size="xs" showValue={false} />
                )}
                {showInjury && player.activeInjurySeverity && (
                    <InjuryStatusBadge severity={player.activeInjurySeverity} title={formatPlayerActiveInjuryLabel(player) ?? undefined} size={12} iconSize={9} strokeWidth={4} />
                )}
                {player.contract?.type === 'two_way' && <TwoWayChip />}
            </span>
        </span>
    </span>
);

/** 요약 줄 36 — 데스크톱 TableFoot의 슬롯 정보를 표 위로(§9-1-1). 가로 스크롤 콘텐츠 밖(RosterView가 스크롤 상자 위에 고정 배치)에서 렌더 —
 *  스크롤 상자 안에 두면 sticky left가 먹지 않아 선수 열은 고정인데 이 줄만 밀렸다(2026-10-27 사용자 지적). */
export const PhoneRosterSummary: React.FC<Pick<PhoneRosterOverviewProps, 'team' | 'maxRosterSize' | 'twoWaySlots' | 'showTwoWaySlots' | 'capSettings'>> = ({ team, maxRosterSize = 15, twoWaySlots = 3, showTwoWaySlots = true, capSettings }) => {
    const regularCount = team.roster.filter(p => p.contract?.type !== 'two_way').length;
    const twoWayCount = team.roster.length - regularCount;
    const payroll = team.roster.reduce((s, p) => s + (p.contract?.type === 'two_way' ? 0 : getCurrentSeasonSalary(p)), 0);
    const capRoom = capSettings?.capEnabled ? capSettings.salaryCapAmount - payroll : null;
    return (
        <div className="shrink-0 h-9 px-4 flex items-center gap-2 text-xs font-semibold text-slate-400 whitespace-nowrap overflow-hidden border-b border-slate-800">
            <span>정규 계약 <span className={regularCount >= maxRosterSize ? 'text-red-400' : 'text-slate-200'}>{regularCount}/{maxRosterSize}</span></span>
            {showTwoWaySlots && <><span className="text-slate-700">·</span><span>투웨이 <span className={twoWayCount >= twoWaySlots ? 'text-red-400' : 'text-slate-200'}>{twoWayCount}/{twoWaySlots}</span></span></>}
            <span className="text-slate-700">·</span>
            <span>총 급여 <span className="text-slate-200 tabular-nums">{formatMoney(payroll)}</span></span>
            {capRoom != null && <><span className="text-slate-700">·</span><span>캡 여유 <span className={`tabular-nums ${capRoom >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatMoney(capRoom)}</span></span></>}
        </div>
    );
};

export const PhoneRosterOverview: React.FC<PhoneRosterOverviewProps> = ({ team, allTeams, onPlayerClick, playerConditions }) => {
    const { sortConfig, sortProps } = useTableSort({ key: 'ovr', direction: 'desc' });
    const rows = useMemo(() => sortByConfig(team.roster, sortConfig, sortValue), [team.roster, sortConfig]);

    const positionStarsById = useMemo(() => {
        if (!allTeams) return null;
        const all = allTeams.flatMap(t => t.roster ?? []);
        return new Map(team.roster.map(p => [p.id, getPositionStars(p, all)]));
    }, [allTeams, team.roster]);

    return (
        <div className="flex flex-col">
            {/* 스크롤 상자는 바깥(RosterView phone 분기의 overflow-auto 영역) 하나 — scroll="parent". 헤더는 Table이 sticky top. */}
            <Table variant="flush" density="phone" scroll="parent" dividers={false}>
                <TableHead>
                    <TableHeaderCell stickyLeft={0} width={PHONE_STICKY_COL_WIDTH} align="left" className="pl-4" {...sortProps('ovr')}>선수</TableHeaderCell>
                    <TableHeaderCell width={W.HEIGHT} {...sortProps('height')}>키</TableHeaderCell>
                    <TableHeaderCell width={W.WEIGHT} {...sortProps('weight')}>몸무게</TableHeaderCell>
                    <TableHeaderCell width={W.RATING}>리그 레이팅</TableHeaderCell>
                    <TableHeaderCell width={W.POS_RATING}>포지션 레이팅</TableHeaderCell>
                    <TableHeaderCell width={W.PAY} align="right" {...sortProps('pay')}>급여</TableHeaderCell>
                    <TableHeaderCell width={W.AAV} align="right" {...sortProps('aav')}>AAV</TableHeaderCell>
                    <TableHeaderCell width={W.REMAINING} {...sortProps('contractYears')}>잔여</TableHeaderCell>
                </TableHead>
                <TableBody>
                    {rows.map(p => {
                        const cond = playerConditions ? (playerConditions.has(p.id) ? (playerConditions.get(p.id) as number | null) : undefined) : undefined;
                        const posStars = positionStarsById?.get(p.id);
                        return (
                            <TableRow key={p.id} onClick={() => onPlayerClick(p)}>
                                <TableCell stickyLeft={0} width={PHONE_STICKY_COL_WIDTH} align="left" className="pl-4">
                                    <PhonePlayerCell player={p} condition={cond} />
                                </TableCell>
                                <TableCell align="center" className="text-sm text-white tabular-nums">{p.height ? `${p.height}cm` : '-'}</TableCell>
                                <TableCell align="center" className="text-sm text-white tabular-nums">{p.weight ? `${p.weight}kg` : '-'}</TableCell>
                                <TableCell align="center"><div className="flex justify-center"><StarRating ovr={calculatePlayerOvr(p)} size="sm" /></div></TableCell>
                                <TableCell align="center" className="text-sm text-slate-500">
                                    {posStars != null ? <div className="flex justify-center"><StarRating stars={posStars} size="sm" /></div> : '-'}
                                </TableCell>
                                <TableCell align="right" className="text-sm text-white tabular-nums">{p.contract ? formatMoney(getCurrentSeasonSalary(p)) : '-'}</TableCell>
                                <TableCell align="right" className="text-sm text-white tabular-nums">{p.contract ? formatMoney(getContractAav(p)) : '-'}</TableCell>
                                <TableCell align="center" className="text-sm text-white tabular-nums">{p.contract ? `${p.contractYears}년` : '-'}</TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
};
