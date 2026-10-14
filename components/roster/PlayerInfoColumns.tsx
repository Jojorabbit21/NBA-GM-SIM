// PlayerInfoColumns.tsx — 로스터 계열 표(로스터/능력치/선수 기록/재정)의 왼쪽 고정 4열 "이름 | 포지션 | 나이 | OVR". [2026-10-13]
// 네 표가 각자 들고 있던 WIDTHS·LEFT_* 상수, 정렬 가능한 sticky 헤더 4개, 이름 셀(호버카드+TW 배지+부상 배지),
// 포지션/나이/OVR 셀, 푸터의 "팀 평균" 4칸을 한 곳에 모았다(docs/plan/ui-audit/08-roster.md 후보 1·7·9·10).
// sticky 위치·불투명 배경·z-index는 Table의 `stickyLeft={px}`가 처리하므로 여기선 오프셋만 넘긴다.
import React from 'react';
import type { Player } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { TableHeaderCell, TableCell } from '../common/Table';
import { OvrBadge } from '../common/OvrBadge';
import { Badge } from '../common/Badge';
import { PlayerHoverCard } from '../common/PlayerHoverCard';
import { InjuryStatusBadge } from '../common/InjuryStatusBadge';
import { formatPlayerActiveInjuryLabel } from '../../services/multi/activeInjuryStatus';
import type { HeaderSortProps } from '../../hooks/useTableSort';

export const PLAYER_INFO_WIDTHS = { NAME: 180, POS: 60, AGE: 50, OVR: 60 } as const;
/** 각 열의 sticky left 오프셋(앞 열 너비 누적합) */
export const PLAYER_INFO_LEFT = {
    NAME: 0,
    POS: PLAYER_INFO_WIDTHS.NAME,
    AGE: PLAYER_INFO_WIDTHS.NAME + PLAYER_INFO_WIDTHS.POS,
    OVR: PLAYER_INFO_WIDTHS.NAME + PLAYER_INFO_WIDTHS.POS + PLAYER_INFO_WIDTHS.AGE,
} as const;
/** 4열 합계 — 재정 탭처럼 뒤에 sticky 열을 더 붙일 때 다음 오프셋으로 쓴다 */
export const PLAYER_INFO_TOTAL_WIDTH = PLAYER_INFO_LEFT.OVR + PLAYER_INFO_WIDTHS.OVR;

export type PlayerInfoSortKey = 'name' | 'position' | 'age' | 'ovr';

/** `<colgroup>` 안의 앞 4개 `<col>` */
export const PlayerInfoColGroup: React.FC = () => (
    <>
        <col style={{ width: PLAYER_INFO_WIDTHS.NAME }} />
        <col style={{ width: PLAYER_INFO_WIDTHS.POS }} />
        <col style={{ width: PLAYER_INFO_WIDTHS.AGE }} />
        <col style={{ width: PLAYER_INFO_WIDTHS.OVR }} />
    </>
);

/** 헤더 4칸. `sortProps`(useTableSort)를 넘기면 네 열 모두 정렬 가능, 없으면 정렬 없음(선수 기록·재정 탭). */
export const PlayerInfoHeaderCells: React.FC<{
    sortProps?: (key: PlayerInfoSortKey) => HeaderSortProps;
    ovrLabel?: string;
}> = ({ sortProps, ovrLabel = 'OVR' }) => {
    const s = (key: PlayerInfoSortKey) => (sortProps ? sortProps(key) : {});
    return (
        <>
            <TableHeaderCell stickyLeft={PLAYER_INFO_LEFT.NAME} width={PLAYER_INFO_WIDTHS.NAME} align="left" className="pl-4" {...s('name')}>이름</TableHeaderCell>
            <TableHeaderCell stickyLeft={PLAYER_INFO_LEFT.POS} width={PLAYER_INFO_WIDTHS.POS} {...s('position')}>포지션</TableHeaderCell>
            <TableHeaderCell stickyLeft={PLAYER_INFO_LEFT.AGE} width={PLAYER_INFO_WIDTHS.AGE} {...s('age')}>나이</TableHeaderCell>
            <TableHeaderCell stickyLeft={PLAYER_INFO_LEFT.OVR} width={PLAYER_INFO_WIDTHS.OVR} {...s('ovr')}>{ovrLabel}</TableHeaderCell>
        </>
    );
};

/** 투웨이 계약 꼬리표 — 5곳에서 같은 className을 복붙하던 것 */
export const TwoWayBadge: React.FC = () => (
    <Badge variant="warning" size="xs" shape="square" title="Two-Way 계약">TW</Badge>
);

/** 표 셀 안 OVR 배지(28px, 가운데) */
export const OvrTableBadge: React.FC<{ value: number }> = ({ value }) => (
    <div className="flex justify-center"><OvrBadge value={value} size="table" /></div>
);

interface PlayerInfoCellsProps {
    /** 없으면 `fallbackName`만 보이는 축소 행(재정 탭 데드캡 — meta_players 조회 실패 시) */
    player?: Player;
    fallbackName?: string;
    teamAbbr: string;
    /** 이름 클릭. 행 전체가 클릭을 받는 표(재정 탭)는 onClick 대신 `clickable`만 켠다. */
    onClick?: (player: Player) => void;
    clickable?: boolean;
    enableHoverCard?: boolean;
    /** 부상/출장정지 배지(기본 true). 재정 탭은 표시하지 않는다(계약 정보 화면). */
    showInjury?: boolean;
    /** 이름 아래 줄(능력치 탭의 health 텍스트 등) */
    nameExtra?: React.ReactNode;
}

/** 바디 4칸: 이름(호버카드·TW·부상) | 포지션 | 나이 | OVR */
export const PlayerInfoCells: React.FC<PlayerInfoCellsProps> = ({
    player, fallbackName, teamAbbr, onClick, clickable = !!onClick, enableHoverCard = false, showInjury = true, nameExtra,
}) => {
    const nameClass = `min-w-0 text-sm font-semibold text-slate-200 truncate ${clickable ? 'hover:text-indigo-400 hover:underline cursor-pointer' : ''}`;
    return (
        <>
            <TableCell align="left" stickyLeft={PLAYER_INFO_LEFT.NAME} width={PLAYER_INFO_WIDTHS.NAME} className="pl-4">
                <div className="flex flex-col">
                    <span className="flex items-center gap-1.5 min-w-0">
                        {player ? (
                            <PlayerHoverCard player={player} teamAbbr={teamAbbr} enabled={enableHoverCard}>
                                <span className={nameClass} onClick={onClick ? () => onClick(player) : undefined}>{player.name}</span>
                            </PlayerHoverCard>
                        ) : (
                            <span className="min-w-0 text-sm font-semibold text-slate-200 truncate">{fallbackName}</span>
                        )}
                        {player?.contract?.type === 'two_way' && <TwoWayBadge />}
                        {showInjury && player?.activeInjurySeverity && (
                            <InjuryStatusBadge
                                severity={player.activeInjurySeverity}
                                title={formatPlayerActiveInjuryLabel(player) ?? undefined}
                                size={16}
                                iconSize={12}
                                strokeWidth={4}
                            />
                        )}
                    </span>
                    {nameExtra}
                </div>
            </TableCell>
            <TableCell stickyLeft={PLAYER_INFO_LEFT.POS} width={PLAYER_INFO_WIDTHS.POS} className="text-slate-400 font-medium text-sm">{player?.position ?? '-'}</TableCell>
            <TableCell stickyLeft={PLAYER_INFO_LEFT.AGE} width={PLAYER_INFO_WIDTHS.AGE} className="text-slate-400 font-medium text-sm">{player?.age ?? '-'}</TableCell>
            <TableCell stickyLeft={PLAYER_INFO_LEFT.OVR} width={PLAYER_INFO_WIDTHS.OVR}>
                {player ? <OvrTableBadge value={calculatePlayerOvr(player)} /> : <span className="text-slate-600 text-sm">-</span>}
            </TableCell>
        </>
    );
};

/** 푸터(팀 평균 등) 4칸: 라벨(indigo) | 빈칸 | 평균 나이 | 평균 OVR 배지 */
export const PlayerInfoFooterCells: React.FC<{ label: React.ReactNode; age?: number; ovr?: number }> = ({ label, age, ovr }) => (
    <>
        <TableCell align="left" stickyLeft={PLAYER_INFO_LEFT.NAME} width={PLAYER_INFO_WIDTHS.NAME} className="pl-4 font-bold text-indigo-400 text-sm">{label}</TableCell>
        <TableCell stickyLeft={PLAYER_INFO_LEFT.POS} width={PLAYER_INFO_WIDTHS.POS} />
        <TableCell stickyLeft={PLAYER_INFO_LEFT.AGE} width={PLAYER_INFO_WIDTHS.AGE} className="font-medium text-slate-400 text-sm">{age}</TableCell>
        <TableCell stickyLeft={PLAYER_INFO_LEFT.OVR} width={PLAYER_INFO_WIDTHS.OVR}>
            {ovr != null && <OvrTableBadge value={ovr} />}
        </TableCell>
    </>
);
