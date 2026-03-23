
import React, { useRef, useEffect, useMemo } from 'react';
import { TEAM_DATA } from '../../data/teamData';

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
}

export const DraftBoard: React.FC<DraftBoardProps> = ({
    teamIds,
    totalRounds,
    picks,
    currentPickIndex,
    draftOrder,
    userTeamId,
    positionColors,
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

    return (
        <div
            ref={scrollContainerRef}
            className="h-full overflow-auto"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' } as React.CSSProperties}
        >
            {/* Transposed: columns = teams, rows = rounds */}
            <table className="w-max min-w-full" style={{ borderCollapse: 'separate', borderSpacing: '2px', margin: '-2px' }}>
                <thead className="sticky top-0 z-20 bg-slate-950">
                    <tr>
                        {/* Round column header (sticky left) */}
                        <th
                            className="sticky left-0 z-30 bg-slate-950 min-w-[90px] px-2 py-2 text-center font-bold text-slate-500 text-xs"
                            style={{ boxShadow: '1px 0 0 0 rgb(2,6,23), 0 1px 0 0 rgb(2,6,23)' }}
                        >
                            라운드
                        </th>
                        {/* Team column headers */}
                        {teamIds.map(teamId => {
                            const isUser = teamId === userTeamId;
                            const teamData = TEAM_DATA[teamId];
                            const teamColor = teamData?.colors.primary || '#6366f1';
                            const teamTextColor = teamData?.colors.text || '#FFFFFF';
                            return (
                                <th
                                    key={teamId}
                                    className="w-[120px] min-w-[120px] max-w-[120px] px-1 py-2.5 text-center text-xs font-bold uppercase"
                                    style={{
                                        backgroundColor: teamColor,
                                        color: teamTextColor,
                                        boxShadow: isUser
                                            ? `inset 0 0 0 2px rgba(245,158,11,0.7), 1px 0 0 0 rgb(2,6,23), -1px 0 0 0 rgb(2,6,23)`
                                            : '1px 0 0 0 rgb(2,6,23), -1px 0 0 0 rgb(2,6,23)',
                                    }}
                                >
                                    {teamId.toUpperCase()}
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
                                    style={{ boxShadow: '0 1px 0 0 rgb(2,6,23), 0 -1px 0 0 rgb(2,6,23)' }}
                                >
                                    <div className="flex flex-col items-center gap-0.5">
                                        <span className={`text-[11px] font-black whitespace-nowrap ${
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
                                                        {pickNum != null && (
                                                            <span className="text-[9px] opacity-40 font-bold text-slate-300">
                                                                #{pickNum}
                                                            </span>
                                                        )}
                                                        <span
                                                            className="text-xs font-bold uppercase opacity-60"
                                                            style={{ color: posColor }}
                                                        >
                                                            {pick.position}
                                                        </span>
                                                        <span
                                                            className="text-[12px] font-bold text-center leading-tight break-words line-clamp-2"
                                                            style={{ color: posColor }}
                                                        >
                                                            {pick.playerName}
                                                        </span>
                                                    </div>
                                                ) : isCurrent ? (
                                                    <div className="h-full flex flex-col items-center justify-center gap-0.5 animate-pulse">
                                                        {pickNum != null && (
                                                            <span className="text-[9px] opacity-40 font-bold text-slate-300">
                                                                #{pickNum}
                                                            </span>
                                                        )}
                                                        <span className="text-[11px] font-bold text-emerald-400">
                                                            선택 중...
                                                        </span>
                                                    </div>
                                                ) : pickNum != null ? (
                                                    <div className="h-full flex items-end justify-center pb-1.5">
                                                        <span className="text-[9px] opacity-25 font-bold text-slate-400">
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
