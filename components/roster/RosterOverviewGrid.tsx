
import React, { useMemo, useState } from 'react';
import { Player, Team } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';
import { StarRating } from '../common/StarRating';
import { Table, TableHead, TableBody, TableFoot, TableRow, TableHeaderCell, TableCell } from '../common/Table';
import { assignArchetypes, getArchetypeDisplayInfo, getTraitTagDisplayInfo } from '../../services/playerDevelopment/archetypeEvaluator';
import type { PlayerArchetypeState } from '../../types/archetype';
import { formatMoney } from '../../utils/formatMoney';
import { PlayerHoverCard } from '../common/PlayerHoverCard';
import { InjuryStatusBadge } from '../common/InjuryStatusBadge';
import { formatPlayerActiveInjuryLabel } from '../../services/multi/activeInjuryStatus';

interface RosterOverviewGridProps {
    team: Team;
    onPlayerClick: (player: Player) => void;
    /** 선수 이름 hover 시 능력치+스탯 팝업 표시 — 멀티플레이어 전용 기능이라 지정된 경우에만 켜짐. */
    enableHoverCard?: boolean;
    /** 지정된 경우에만 각 행에 "방출" 버튼 컬럼이 추가됨(멀티플레이어, 내 팀 볼 때만 RosterView가 전달). */
    onReleasePlayer?: (player: Player) => void;
    /** 방출 처리 중인 선수 id — 버튼 로딩/비활성 표시용. */
    releasingId?: string | null;
    /** 팀당 최대 로스터 인원(정규 계약 슬롯 상한) — 미지정 시 NBA 기본 정원 15명.
     * 멀티플레이어는 leagues.max_roster_size(15~20, 어드민 설정)를 그대로 전달한다. */
    maxRosterSize?: number;
    /** 팀당 Two-Way 계약 슬롯 상한 — 미지정 시 기본 3명. 멀티플레이어는
     * leagues.two_way_slots(1~5, 어드민 설정)를 그대로 전달한다. */
    twoWaySlots?: number;
    /** [2026-09-17] 푸터의 "투웨이 슬롯" 항목 표시 여부(기본 true). 멀티플레이어에서 CBA 규정
     * (leagues.cba_rules_enabled)이 꺼진 리그는 즉시계약 RPC(sign_free_agent)만 쓰고 투웨이
     * 계약이라는 경로 자체가 없어 슬롯이 남아 있어도 쓸 수 없다 — "3자리 남았는데 계약이 막힌다"는
     * 혼란을 없애기 위해 그런 리그에선 아예 숨긴다. */
    showTwoWaySlots?: boolean;
}

const DEFAULT_MAX_ROSTER_SIZE = 15;
const DEFAULT_TWO_WAY_SLOTS = 3;

type SortConfig = { key: string; direction: 'asc' | 'desc' };

const WIDTHS = {
    NAME: 180, POS: 60, AGE: 50, OVR: 60,
    HEIGHT: 70, WEIGHT: 70, SALARY: 110, REMAINING: 80, AAV: 110,
    ARCHETYPE: 150, SECONDARY: 150, TAGS: 220, RATING: 140, RELEASE: 90,
};

function getPlayerArchetypeState(p: Player): PlayerArchetypeState {
    return p.archetypeState ?? assignArchetypes(p, '2025-26');
}

// 잔여 계약기간(현재 시즌 포함) 동안의 평균 연봉 — AAV(Average Annual Value).
function getRemainingAav(p: Player): number {
    if (!p.contract || p.contractYears <= 0) return 0;
    const remainingTotal = p.contract.years.slice(p.contract.currentYear).reduce((s, v) => s + v, 0);
    return remainingTotal / p.contractYears;
}

const getStickyStyle = (left: number, width: number, isLast: boolean = false) => ({
    left, width, minWidth: width, maxWidth: width,
    position: 'sticky' as const,
    zIndex: 30,
    borderRight: isLast ? undefined : 'none',
});

export const RosterOverviewGrid: React.FC<RosterOverviewGridProps> = ({ team, onPlayerClick, enableHoverCard = false, onReleasePlayer, releasingId, maxRosterSize = DEFAULT_MAX_ROSTER_SIZE, twoWaySlots = DEFAULT_TWO_WAY_SLOTS, showTwoWaySlots = true }) => {
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'ovr', direction: 'desc' });

    // "정규 계약" = 투웨이(two-way)가 아닌 모든 계약. 실제 NBA도 투웨이 2명은 15명 정원과
    // 별개 슬롯이라 여기서 제외한다 — 계약 데이터가 아직 없는 선수(p.contract undefined,
    // 올타임 레전드 등 일부 데이터 공백)는 실제로는 정규 로스터를 차지하고 있으므로 기본적으로
    // 정규 계약으로 취급.
    const regularContractCount = useMemo(
        () => team.roster.filter(p => p.contract?.type !== 'two_way').length,
        [team.roster],
    );
    const twoWayCount = useMemo(
        () => team.roster.filter(p => p.contract?.type === 'two_way').length,
        [team.roster],
    );

    const handleSort = (key: string) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
    };

    const getSortValue = (p: Player, key: string): number | string => {
        if (key === 'name') return p.name;
        if (key === 'position') return p.position;
        if (key === 'age') return p.age;
        if (key === 'ovr') return calculatePlayerOvr(p);
        if (key === 'height') return p.height ?? 0;
        if (key === 'weight') return p.weight ?? 0;
        if (key === 'salary') return p.salary ?? 0;
        if (key === 'contractYears') return p.contractYears ?? 0;
        if (key === 'aav') return getRemainingAav(p);
        return 0;
    };

    const sortedRoster = useMemo(() => {
        return [...team.roster].sort((a, b) => {
            const aVal = getSortValue(a, sortConfig.key);
            const bVal = getSortValue(b, sortConfig.key);
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return sortConfig.direction === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        });
    }, [team.roster, sortConfig]);

    const LEFT_POS = WIDTHS.NAME;
    const LEFT_AGE = WIDTHS.NAME + WIDTHS.POS;
    const LEFT_OVR = WIDTHS.NAME + WIDTHS.POS + WIDTHS.AGE;

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0">
                <Table style={{ tableLayout: 'fixed', minWidth: '100%' }} fullHeight className="!rounded-none !border-x-0 !border-t-0 !bg-slate-950">
                    <colgroup>
                        <col style={{ width: WIDTHS.NAME }} />
                        <col style={{ width: WIDTHS.POS }} />
                        <col style={{ width: WIDTHS.AGE }} />
                        <col style={{ width: WIDTHS.OVR }} />
                        <col style={{ width: WIDTHS.RATING }} />
                        <col style={{ width: WIDTHS.HEIGHT }} />
                        <col style={{ width: WIDTHS.WEIGHT }} />
                        <col style={{ width: WIDTHS.SALARY }} />
                        <col style={{ width: WIDTHS.REMAINING }} />
                        <col style={{ width: WIDTHS.AAV }} />
                        <col style={{ width: WIDTHS.ARCHETYPE }} />
                        <col style={{ width: WIDTHS.SECONDARY }} />
                        <col style={{ width: WIDTHS.TAGS }} />
                        {onReleasePlayer && <col style={{ width: WIDTHS.RELEASE }} />}
                    </colgroup>
                    <TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm" noRow>
                        <tr className="h-10 text-slate-500 text-sm font-black uppercase tracking-widest">
                            <TableHeaderCell
                                style={{ ...getStickyStyle(0, WIDTHS.NAME), zIndex: 50 }}
                                align="left" className="pl-4 bg-slate-950"
                                sortable onSort={() => handleSort('name')} sortDirection={sortConfig.key === 'name' ? sortConfig.direction : null}
                            >이름</TableHeaderCell>
                            <TableHeaderCell
                                style={{ ...getStickyStyle(LEFT_POS, WIDTHS.POS), zIndex: 50 }}
                                className="bg-slate-950"
                                sortable onSort={() => handleSort('position')} sortDirection={sortConfig.key === 'position' ? sortConfig.direction : null}
                            >포지션</TableHeaderCell>
                            <TableHeaderCell
                                style={{ ...getStickyStyle(LEFT_AGE, WIDTHS.AGE), zIndex: 50 }}
                                className="bg-slate-950"
                                sortable onSort={() => handleSort('age')} sortDirection={sortConfig.key === 'age' ? sortConfig.direction : null}
                            >나이</TableHeaderCell>
                            <TableHeaderCell
                                style={{ ...getStickyStyle(LEFT_OVR, WIDTHS.OVR, true), zIndex: 50 }}
                                className="bg-slate-950 border-r border-slate-800"
                                sortable onSort={() => handleSort('ovr')} sortDirection={sortConfig.key === 'ovr' ? sortConfig.direction : null}
                            >OVR</TableHeaderCell>
                            <TableHeaderCell width={WIDTHS.RATING} className="border-r border-slate-800">레이팅</TableHeaderCell>
                            <TableHeaderCell width={WIDTHS.HEIGHT} className="border-r border-slate-800" sortable onSort={() => handleSort('height')} sortDirection={sortConfig.key === 'height' ? sortConfig.direction : null}>키</TableHeaderCell>
                            <TableHeaderCell width={WIDTHS.WEIGHT} className="border-r border-slate-800" sortable onSort={() => handleSort('weight')} sortDirection={sortConfig.key === 'weight' ? sortConfig.direction : null}>몸무게</TableHeaderCell>
                            <TableHeaderCell width={WIDTHS.SALARY} className="border-r border-slate-800" sortable onSort={() => handleSort('salary')} sortDirection={sortConfig.key === 'salary' ? sortConfig.direction : null}>샐러리</TableHeaderCell>
                            <TableHeaderCell width={WIDTHS.REMAINING} className="border-r border-slate-800" sortable onSort={() => handleSort('contractYears')} sortDirection={sortConfig.key === 'contractYears' ? sortConfig.direction : null}>잔여계약</TableHeaderCell>
                            <TableHeaderCell width={WIDTHS.AAV} className="border-r border-slate-800" sortable onSort={() => handleSort('aav')} sortDirection={sortConfig.key === 'aav' ? sortConfig.direction : null}>AAV</TableHeaderCell>
                            <TableHeaderCell colSpan={2} className="border-r border-slate-800">아키타입</TableHeaderCell>
                            <TableHeaderCell width={WIDTHS.TAGS} align="left" className="pl-3">태그</TableHeaderCell>
                            {onReleasePlayer && <TableHeaderCell width={WIDTHS.RELEASE}>방출</TableHeaderCell>}
                        </tr>
                    </TableHead>
                    <TableBody>
                        {sortedRoster.map(p => {
                            const archetypeState = getPlayerArchetypeState(p);
                            const primaryInfo = getArchetypeDisplayInfo(archetypeState.primary);
                            const secondaryInfo = archetypeState.secondary ? getArchetypeDisplayInfo(archetypeState.secondary) : null;
                            const tagInfos = archetypeState.tags.slice(0, 3).map(t => getTraitTagDisplayInfo(t));

                            return (
                                <TableRow key={p.id} className="group">
                                    <TableCell align="left" style={getStickyStyle(0, WIDTHS.NAME)} className="pl-4 bg-slate-900 group-hover:bg-slate-800">
                                        <span className="flex items-center gap-1.5 min-w-0">
                                            <PlayerHoverCard player={p} teamAbbr={team.abbr} enabled={enableHoverCard}>
                                                <span className="min-w-0 text-sm font-semibold text-white truncate hover:text-indigo-400 hover:underline cursor-pointer" onClick={() => onPlayerClick(p)}>{p.name}</span>
                                            </PlayerHoverCard>
                                            {p.contract?.type === 'two_way' && (
                                                <span
                                                    title="Two-Way 계약"
                                                    className="shrink-0 px-1 py-0.5 rounded text-[10px] font-bold leading-none bg-amber-500/15 text-amber-400 border border-amber-500/40"
                                                >TW</span>
                                            )}
                                            {p.activeInjurySeverity && (
                                                <InjuryStatusBadge
                                                    severity={p.activeInjurySeverity}
                                                    title={formatPlayerActiveInjuryLabel(p) ?? undefined}
                                                    size={16}
                                                    iconSize={12}
                                                    strokeWidth={4}
                                                />
                                            )}
                                        </span>
                                    </TableCell>
                                    <TableCell style={getStickyStyle(LEFT_POS, WIDTHS.POS)} className="text-slate-500 font-semibold text-sm bg-slate-900 group-hover:bg-slate-800 text-center">{p.position}</TableCell>
                                    <TableCell style={getStickyStyle(LEFT_AGE, WIDTHS.AGE)} className="text-slate-500 font-semibold text-sm bg-slate-900 group-hover:bg-slate-800 text-center">{p.age}</TableCell>
                                    <TableCell style={getStickyStyle(LEFT_OVR, WIDTHS.OVR, true)} className="border-r border-slate-800 bg-slate-900 group-hover:bg-slate-800 text-center">
                                        <div className="flex justify-center"><OvrBadge value={calculatePlayerOvr(p)} size="sm" className="!w-7 !h-7 !text-xs !shadow-none" /></div>
                                    </TableCell>
                                    <TableCell align="center" className="border-r border-slate-800/30">
                                        <div className="flex justify-center"><StarRating ovr={calculatePlayerOvr(p)} size="lg" /></div>
                                    </TableCell>
                                    <TableCell align="center" className="border-r border-slate-800/30 text-sm text-white">{p.height ? `${p.height}cm` : '-'}</TableCell>
                                    <TableCell align="center" className="border-r border-slate-800/30 text-sm text-white">{p.weight ? `${p.weight}kg` : '-'}</TableCell>
                                    <TableCell align="center" className="border-r border-slate-800/30 text-sm text-white">{p.contract ? formatMoney(p.salary) : '-'}</TableCell>
                                    <TableCell align="center" className="border-r border-slate-800/30 text-sm text-white">{p.contract ? `${p.contractYears}년` : '-'}</TableCell>
                                    <TableCell align="center" className="border-r border-slate-800 text-sm text-white">{p.contract ? formatMoney(getRemainingAav(p)) : '-'}</TableCell>
                                    <TableCell align="center" className="border-r border-slate-800/30 text-sm text-white truncate">{primaryInfo.label}</TableCell>
                                    <TableCell align="center" className="border-r border-slate-800/30 text-sm text-white truncate">{secondaryInfo ? secondaryInfo.label : ''}</TableCell>
                                    <TableCell align="left" className="pl-3">
                                        <div className="flex flex-wrap gap-1">
                                            {tagInfos.length === 0 && <span className="text-sm text-slate-600">-</span>}
                                            {tagInfos.map((t, i) => (
                                                <span
                                                    key={i}
                                                    className="text-sm text-white whitespace-nowrap"
                                                >
                                                    {t.label}{i < tagInfos.length - 1 ? ',' : ''}
                                                </span>
                                            ))}
                                        </div>
                                    </TableCell>
                                    {onReleasePlayer && (
                                        <TableCell align="center">
                                            <button
                                                onClick={() => onReleasePlayer(p)}
                                                disabled={releasingId != null}
                                                className="px-2.5 py-1 rounded-md text-sm font-bold bg-red-900/60 hover:bg-red-800 text-red-200 transition-colors whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                                방출
                                            </button>
                                        </TableCell>
                                    )}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                    {/* 컨테이너 하단에 고정(fixed)되지 않고 로스터 행 바로 아래에 붙도록 <tfoot>으로
                        렌더링 — 위 TableBody와 같은 스크롤 영역 안에 있어 마지막 행 다음에 자연스럽게
                        이어지고, 로스터가 길어 표가 스크롤될 때도 body와 함께 움직인다. */}
                    <TableFoot>
                        <tr>
                            <td colSpan={onReleasePlayer ? 14 : 13} className="px-4">
                                <div className="h-40 flex items-start justify-end gap-4 pt-3">
                                    <span className="text-sm font-semibold text-slate-400">
                                        정규 계약 슬롯{' '}
                                        <span className={regularContractCount >= maxRosterSize ? 'text-red-400' : 'text-slate-400'}>
                                            {String(regularContractCount).padStart(2, '0')}/{String(maxRosterSize).padStart(2, '0')}
                                        </span>
                                    </span>
                                    {showTwoWaySlots && (
                                        <span className="text-sm font-semibold text-slate-400">
                                            투웨이 슬롯{' '}
                                            <span className={twoWayCount >= twoWaySlots ? 'text-red-400' : 'text-slate-400'}>
                                                {twoWayCount}/{twoWaySlots}
                                            </span>
                                        </span>
                                    )}
                                </div>
                            </td>
                        </tr>
                    </TableFoot>
                </Table>
            </div>
        </div>
    );
};
