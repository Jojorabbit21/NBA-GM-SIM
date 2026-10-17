
import React, { useMemo } from 'react';
import { Player, Team } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { getPositionStars } from '../../utils/positionRating';
import { StarRating } from '../common/StarRating';
import { Table, TableHead, TableBody, TableFoot, TableRow, TableHeaderCell, TableCell } from '../common/Table';
import { Money } from '../common/Money';
import { getCurrentSeasonSalary, getContractAav } from '../../utils/contract';
import { Button } from '../common/Button';
import { useTableSort, sortByConfig } from '../../hooks/useTableSort';
import { PlayerInfoColGroup, PlayerInfoHeaderCells, PlayerInfoCells } from './PlayerInfoColumns';

interface RosterOverviewGridProps {
    team: Team;
    /** [2026-10-14] "포지션 레이팅" 열 — 리그 전체에서 같은 포지션 선수들 사이의 OVR 백분위 별점(선수 상세의 "포지션 평점"과 같은 계산).
     *  미전달이면 열은 그대로 두고 '-' 표시. */
    allTeams?: Team[];
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
    /** [2026-10-17] 멀티 전용 — 지정되면 이름 오른쪽에 "체력" 열(바 + 수치). 값 null = 진행 중 경기라 비공개("경기 중"),
     * 맵에 없는 선수는 "—". 싱글은 전달하지 않아 열 자체가 없다. */
    playerConditions?: Map<string, number | null>;
}

const DEFAULT_MAX_ROSTER_SIZE = 15;
const DEFAULT_TWO_WAY_SLOTS = 3;

// 이름|포지션|나이|OVR 4열은 PlayerInfoColumns.tsx(PLAYER_INFO_WIDTHS)
const WIDTHS = { HEIGHT: 70, WEIGHT: 70, REMAINING: 80, PAY: 130, AAV: 130, RATING: 140, POS_RATING: 140, RELEASE: 90 };

const getSortValue = (p: Player, key: string): number | string => {
    if (key === 'name') return p.name;
    if (key === 'position') return p.position;
    if (key === 'age') return p.age;
    if (key === 'ovr') return calculatePlayerOvr(p);
    if (key === 'height') return p.height ?? 0;
    if (key === 'weight') return p.weight ?? 0;
    if (key === 'contractYears') return p.contractYears ?? 0;
    if (key === 'pay') return getCurrentSeasonSalary(p);
    if (key === 'aav') return getContractAav(p);
    return 0;
};

export const RosterOverviewGrid: React.FC<RosterOverviewGridProps> = ({ team, allTeams, onPlayerClick, enableHoverCard = false, onReleasePlayer, releasingId, maxRosterSize = DEFAULT_MAX_ROSTER_SIZE, twoWaySlots = DEFAULT_TWO_WAY_SLOTS, showTwoWaySlots = true, playerConditions }) => {
    const withCondition = !!playerConditions;
    const { sortConfig, sortProps } = useTableSort({ key: 'ovr', direction: 'desc' });

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

    // 체력 정렬: 비공개(null)·미조회 선수는 맨 뒤(-1)
    const sortedRoster = useMemo(
        () => sortByConfig(team.roster, sortConfig, (p, key) =>
            key === 'condition' ? (playerConditions?.get(p.id) ?? -1) : getSortValue(p, key)),
        [team.roster, sortConfig, playerConditions],
    );

    // 포지션 레이팅 — 리그 전체 선수 풀을 한 번만 평탄화하고 선수별 별점을 맵으로(행마다 리그 전체를 다시 훑지 않도록).
    const positionStarsById = useMemo(() => {
        if (!allTeams) return null;
        const allPlayers = allTeams.flatMap(t => t.roster ?? []);
        return new Map(team.roster.map(p => [p.id, getPositionStars(p, allPlayers)]));
    }, [allTeams, team.roster]);

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0">
                <Table variant="flush" fullHeight>
                    <colgroup>
                        <PlayerInfoColGroup withCondition={withCondition} />
                        <col style={{ width: WIDTHS.RATING }} />
                        <col style={{ width: WIDTHS.POS_RATING }} />
                        <col style={{ width: WIDTHS.HEIGHT }} />
                        <col style={{ width: WIDTHS.WEIGHT }} />
                        <col style={{ width: WIDTHS.PAY }} />
                        <col style={{ width: WIDTHS.AAV }} />
                        <col style={{ width: WIDTHS.REMAINING }} />
                        {onReleasePlayer && <col style={{ width: WIDTHS.RELEASE }} />}
                    </colgroup>
                    <TableHead>
                        <PlayerInfoHeaderCells sortProps={sortProps} withCondition={withCondition} />
                        <TableHeaderCell width={WIDTHS.RATING}>리그 레이팅</TableHeaderCell>
                        <TableHeaderCell width={WIDTHS.POS_RATING}>포지션 레이팅</TableHeaderCell>
                        <TableHeaderCell width={WIDTHS.HEIGHT} {...sortProps('height')}>키</TableHeaderCell>
                        <TableHeaderCell width={WIDTHS.WEIGHT} {...sortProps('weight')}>몸무게</TableHeaderCell>
                        <TableHeaderCell width={WIDTHS.PAY} align="right" {...sortProps('pay')}>급여</TableHeaderCell>
                        <TableHeaderCell width={WIDTHS.AAV} align="right" {...sortProps('aav')}>AAV</TableHeaderCell>
                        <TableHeaderCell width={WIDTHS.REMAINING} {...sortProps('contractYears')}>잔여계약</TableHeaderCell>
                        {onReleasePlayer && <TableHeaderCell width={WIDTHS.RELEASE}>방출</TableHeaderCell>}
                    </TableHead>
                    <TableBody>
                        {sortedRoster.map(p => (
                            <TableRow key={p.id}>
                                <PlayerInfoCells
                                    player={p} teamAbbr={team.abbr} onClick={onPlayerClick} enableHoverCard={enableHoverCard}
                                    withCondition={withCondition}
                                    condition={playerConditions?.has(p.id) ? (playerConditions.get(p.id) as number | null) : undefined}
                                />
                                <TableCell align="center">
                                    <div className="flex justify-center"><StarRating ovr={calculatePlayerOvr(p)} size="lg" /></div>
                                </TableCell>
                                <TableCell align="center" className="text-sm text-slate-500">
                                    {positionStarsById?.get(p.id) != null
                                        ? <div className="flex justify-center"><StarRating stars={positionStarsById.get(p.id)!} size="lg" /></div>
                                        : '-'}
                                </TableCell>
                                <TableCell align="center" className="text-sm text-white">{p.height ? `${p.height}cm` : '-'}</TableCell>
                                <TableCell align="center" className="text-sm text-white">{p.weight ? `${p.weight}kg` : '-'}</TableCell>
                                <TableCell align="right" className="text-sm text-white">{p.contract ? <Money value={getCurrentSeasonSalary(p)} format="full" /> : '-'}</TableCell>
                                <TableCell align="right" className="text-sm text-white">{p.contract ? <Money value={getContractAav(p)} format="full" /> : '-'}</TableCell>
                                <TableCell align="center" className="text-sm text-white">{p.contract ? `${p.contractYears}년` : '-'}</TableCell>
                                {onReleasePlayer && (
                                    <TableCell align="center">
                                        <Button
                                            variant="danger"
                                            size="sm"
                                            shape="md"
                                            onClick={() => onReleasePlayer(p)}
                                            disabled={releasingId != null}
                                        >
                                            방출
                                        </Button>
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                    </TableBody>
                    {/* 컨테이너 하단에 고정(fixed)되지 않고 로스터 행 바로 아래에 붙도록 <tfoot>으로
                        렌더링 — 위 TableBody와 같은 스크롤 영역 안에 있어 마지막 행 다음에 자연스럽게
                        이어지고, 로스터가 길어 표가 스크롤될 때도 body와 함께 움직인다. */}
                    <TableFoot>
                        <tr>
                            <td colSpan={(onReleasePlayer ? 12 : 11) + (withCondition ? 1 : 0)} className="px-4">
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
