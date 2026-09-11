
import React, { useRef, useEffect, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import type { RoomTeamMetaMap } from '../../types/multiDraft';
import { resolveTeamDisplay } from './teamMetaLookup';
import { getRealTeamLogoUrl, getTeamLogoUrl } from '../../utils/constants';

// public/logos/real/ 로고 세트 — 세션 내 다른 화면들(LeagueLobbyPanel.tsx 등)과 동일한
// 폴백 체인(신규 로고 세트 실패 시 구버전 → 플레이스홀더).
function handleLogoError(e: React.SyntheticEvent<HTMLImageElement>, teamId: string) {
    const img = e.currentTarget;
    if (img.dataset.fallback !== 'old') {
        img.dataset.fallback = 'old';
        img.src = getTeamLogoUrl(teamId);
    } else {
        img.src = 'https://placehold.co/100x100?text=BPL';
    }
}

// [2026-09-11] "배경에 로고를 크게 클리핑되게" 요청 — DraftHeader.tsx의 배경 워터마크
// 패턴(overflow-hidden 컨테이너 + 확대된 저투명도 로고)을 팀 헤더 카드에도 적용. 부모(th)가
// position:relative + overflow-hidden으로 카드 경계 밖으로 나간 부분을 잘라낸다.
const TeamLogoWatermark: React.FC<{ teamId: string }> = ({ teamId }) => (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <img
            src={getRealTeamLogoUrl(teamId)}
            alt=""
            aria-hidden="true"
            className="w-full h-full object-contain opacity-20 scale-[2]"
            onError={(e) => handleLogoError(e, teamId)}
        />
    </div>
);

export interface BoardPick {
    pickNumber?: number;  // 루키 드래프트: 1~60 (슬롯 매핑용)
    round: number;
    teamId: string;
    playerId: string;
    playerName: string;
    ovr: number;
    position: string;
}

interface DraftBoardProps {
    teamIds: string[];
    totalRounds: number;
    picks: BoardPick[];
    currentPickIndex: number;
    draftOrder: string[];
    userTeamId: string;
    positionColors: Record<string, string>;
    teamMeta?: RoomTeamMetaMap;
    onlineTeamIds?: Set<string>;
    autoPickTeamIds?: Set<string>;
}

const DraftBoardComponent: React.FC<DraftBoardProps> = ({
    teamIds,
    totalRounds,
    picks,
    currentPickIndex,
    draftOrder,
    userTeamId,
    positionColors,
    teamMeta,
    onlineTeamIds,
    autoPickTeamIds,
}) => {
    const currentCellRef = useRef<HTMLTableCellElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (currentCellRef.current && scrollContainerRef.current) {
            const cell = currentCellRef.current;
            const container = scrollContainerRef.current;
            const cellRect = cell.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            if (cellRect.left < containerRect.left + 80 || cellRect.right > containerRect.right) {
                container.scrollLeft += cellRect.left - containerRect.left - 100;
            }
            if (cellRect.top < containerRect.top + 40 || cellRect.bottom > containerRect.bottom) {
                container.scrollTop += cellRect.top - containerRect.top - 60;
            }
        }
    }, [currentPickIndex]);

    // Build lookup: picksByTeamAndRound[teamId][round] = BoardPick
    const picksByTeamAndRound = useMemo(() => {
        const map: Record<string, Record<number, BoardPick>> = {};
        picks.forEach(p => {
            if (!map[p.teamId]) map[p.teamId] = {};
            map[p.teamId][p.round] = p;
        });
        return map;
    }, [picks]);

    // Build lookup: pickNumber per (teamId, round) from draftOrder
    const pickNumberMap = useMemo(() => {
        const map: Record<string, Record<number, number>> = {};
        draftOrder.forEach((teamId, idx) => {
            const round = Math.floor(idx / teamIds.length) + 1;
            if (!map[teamId]) map[teamId] = {};
            map[teamId][round] = idx + 1;
        });
        return map;
    }, [draftOrder, teamIds.length]);

    const currentTeamId = draftOrder[currentPickIndex] || '';
    const currentRound = Math.floor(currentPickIndex / teamIds.length) + 1;

    const ROUND_COL_W = 90;   // px — 라운드 열 고정 너비
    const MIN_TEAM_W  = 120;  // px — 팀 열 최소 너비 (이보다 좁아지지 않음)

    return (
        <div
            ref={scrollContainerRef}
            className="h-full overflow-auto"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' } as React.CSSProperties}
        >
            {/* Transposed: columns = teams, rows = rounds */}
            {/* table-layout:fixed + width:100% → 팀 열 균등 확장
                minWidth → 팀 수 많을 때 최소 너비 보장 후 스크롤 */}
            <table
                style={{
                    tableLayout: 'fixed',
                    width: '100%',
                    minWidth: `${ROUND_COL_W + teamIds.length * MIN_TEAM_W}px`,
                    borderCollapse: 'separate',
                    borderSpacing: '2px',
                    margin: '-2px',
                }}
            >
                <thead className="sticky top-0 z-20 bg-slate-950">
                    <tr>
                        {/* Round column header (sticky left) — 고정 너비 */}
                        <th
                            className="sticky left-0 z-30 bg-slate-950 px-2 py-2 text-center font-bold text-slate-500 text-sm"
                            style={{
                                width: ROUND_COL_W,
                                minWidth: ROUND_COL_W,
                                maxWidth: ROUND_COL_W,
                                boxShadow: '1px 0 0 0 rgb(2,6,23), 0 1px 0 0 rgb(2,6,23)',
                            }}
                        >
                            라운드
                        </th>
                        {/* Team column headers — 너비 미지정 → table-layout:fixed가 균등 분배 */}
                        {teamIds.map(teamId => {
                            const isOnline   = onlineTeamIds ? onlineTeamIds.has(teamId) : undefined;
                            const isAutoPick = autoPickTeamIds ? autoPickTeamIds.has(teamId) : false;
                            const td = resolveTeamDisplay(teamId, teamMeta);
                            return (
                                <th
                                    key={teamId}
                                    className="relative overflow-hidden px-1 h-12 text-center text-xs font-bold"
                                    title={td.name}
                                    style={{
                                        backgroundColor: td.colorPrimary,
                                        color: td.textColor,
                                        boxShadow: '1px 0 0 0 rgb(2,6,23), -1px 0 0 0 rgb(2,6,23)',
                                    }}
                                >
                                    <TeamLogoWatermark teamId={teamId} />
                                    {/* [2026-09-11] "팀명이 박스 중앙에" 요청 — abbr은 th 전체를 채우는
                                        절대배치 레이어로 완전히 중앙 정렬한다. AUTO 배지는 [2026-09-11
                                        후속] "이름 좌측으로" 요청에 따라 같은 가로 flex 행 안에서 abbr
                                        앞자리로 옮겨, 배지+이름이 한 그룹으로 정중앙 정렬된다(따로 하단에
                                        절대배치하던 이전 구조 폐기). */}
                                    <div className="absolute inset-0 flex items-center justify-center gap-1">
                                        {isAutoPick && (
                                            <span
                                                title="오토픽 진행 중"
                                                className="flex items-center justify-center p-1 rounded-full bg-emerald-500 text-white shrink-0"
                                            >
                                                <RefreshCw size={11} />
                                            </span>
                                        )}
                                        <span className="text-lg">{td.abbr}</span>
                                    </div>
                                    {/* [2026-09-11 Fix] 온라인 외곽선을 th 자체의 box-shadow로 걸면, 뒤이어
                                        그려지는 TeamLogoWatermark(반투명 이미지)가 그 위를 덮어 색이 탁해
                                        보였다(사용자 스크린샷으로 확인 — 단순 opacity 문제 아님). 워터마크·
                                        콘텐츠보다 나중(DOM 순서상 마지막 자식)에 그려지는 별도 오버레이로
                                        분리해 항상 최상단에서 또렷하게 보이도록 수정. */}
                                    {isOnline && (
                                        <div
                                            className="absolute inset-0 pointer-events-none"
                                            style={{ boxShadow: 'inset 0 0 0 2px rgba(74,222,128,1)' }}
                                        />
                                    )}
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: totalRounds }, (_, roundIdx) => {
                        const round = roundIdx + 1;
                        const isEvenRound = roundIdx % 2 === 0;
                        const isPast = round < currentRound;
                        const isCurrentRound = round === currentRound;

                        return (
                            <tr key={round} className="h-[76px]">
                                {/* Round label (sticky left) */}
                                <td
                                    className={`sticky left-0 px-2 py-1 z-10 text-center ${
                                        isCurrentRound ? 'bg-indigo-950' : 'bg-slate-950'
                                    }`}
                                    style={{
                                        width: ROUND_COL_W,
                                        minWidth: ROUND_COL_W,
                                        maxWidth: ROUND_COL_W,
                                        boxShadow: '0 1px 0 0 rgb(2,6,23), 0 -1px 0 0 rgb(2,6,23)',
                                    }}
                                >
                                    <div className="flex flex-col items-center gap-0.5">
                                        <span className={`text-sm font-black whitespace-nowrap ${
                                            isCurrentRound ? 'text-indigo-300' : isPast ? 'text-slate-600' : 'text-slate-500'
                                        }`}>
                                            R{round}
                                        </span>
                                        <span className={`text-[10px] ${
                                            isCurrentRound ? 'text-indigo-400/70' : 'text-slate-600'
                                        }`}>
                                            {isEvenRound ? '→' : '←'}
                                        </span>
                                    </div>
                                </td>

                                {/* Team cells for this round */}
                                {teamIds.map(teamId => {
                                    const pick = picksByTeamAndRound[teamId]?.[round];
                                    const isCurrent = currentTeamId === teamId && currentRound === round && !pick;
                                    const isUserCol = teamId === userTeamId;
                                    const posColor = pick ? (positionColors[pick.position] || '#64748b') : undefined;
                                    const pickNum = pickNumberMap[teamId]?.[round];

                                    return (
                                        <td
                                            key={teamId}
                                            ref={isCurrent ? currentCellRef : undefined}
                                            className="relative p-0 text-center"
                                        >
                                            <div
                                                className="absolute inset-[3px] rounded-md"
                                                style={{
                                                    ...(pick
                                                        ? { backgroundColor: isUserCol ? `color-mix(in srgb, ${posColor}20, rgba(245,158,11,0.10))` : `${posColor}20` }
                                                        : isCurrent
                                                            ? { backgroundColor: 'rgba(16,185,129,0.10)', boxShadow: 'inset 0 0 0 2px rgba(16,185,129,0.6)' }
                                                            : isUserCol
                                                                ? { backgroundColor: 'rgba(245,158,11,0.08)' }
                                                                : {}
                                                    ),
                                                }}
                                            >
                                                {pick ? (
                                                    <div className="h-full flex flex-col items-center justify-center gap-0.5 px-1.5">
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            {pickNum != null && (
                                                                <span className="text-sm opacity-40 font-bold text-slate-300">
                                                                    #{pickNum}
                                                                </span>
                                                            )}
                                                            <span
                                                                className="text-sm font-bold uppercase opacity-60"
                                                                style={{ color: posColor }}
                                                            >
                                                                {pick.position}
                                                            </span>
                                                        </div>
                                                        <span
                                                            className="text-sm font-bold text-center leading-tight break-words line-clamp-2"
                                                            style={{ color: posColor }}
                                                        >
                                                            {pick.playerName}
                                                        </span>
                                                    </div>
                                                ) : isCurrent ? (
                                                    <div className="h-full flex flex-col items-center justify-center gap-0.5 animate-pulse">
                                                        {pickNum != null && (
                                                            <span className="text-sm opacity-40 font-bold text-slate-300">
                                                                #{pickNum}
                                                            </span>
                                                        )}
                                                        <span className="text-sm font-bold text-emerald-400">
                                                            선택 중...
                                                        </span>
                                                    </div>
                                                ) : pickNum != null ? (
                                                    <div className="h-full flex items-end justify-center pb-1.5">
                                                        <span className="text-sm opacity-25 font-bold text-slate-400">
                                                            #{pickNum}
                                                        </span>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export const DraftBoard = React.memo(DraftBoardComponent);
