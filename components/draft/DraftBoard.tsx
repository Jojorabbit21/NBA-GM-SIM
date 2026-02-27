
import React, { useRef, useEffect } from 'react';
import { TEAM_DATA } from '../../data/teamData';

export interface BoardPick {
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

            // Horizontal scroll: keep current cell visible
            if (cellRect.left < containerRect.left + 80 || cellRect.right > containerRect.right) {
                container.scrollLeft += cellRect.left - containerRect.left - 100;
            }
            // Vertical scroll: keep current cell visible
            if (cellRect.top < containerRect.top + 40 || cellRect.bottom > containerRect.bottom) {
                container.scrollTop += cellRect.top - containerRect.top - 60;
            }
        }
    }, [currentPickIndex]);

    // Build lookup: picksByTeamAndRound[teamId][round] = BoardPick
    const picksByTeamAndRound: Record<string, Record<number, BoardPick>> = {};
    picks.forEach(p => {
        if (!picksByTeamAndRound[p.teamId]) picksByTeamAndRound[p.teamId] = {};
        picksByTeamAndRound[p.teamId][p.round] = p;
    });

    const currentTeamId = draftOrder[currentPickIndex] || '';
    const currentRound = Math.floor(currentPickIndex / teamIds.length) + 1;
    const currentTeamColor = TEAM_DATA[currentTeamId]?.colors.primary || '#6366f1';

    return (
        <div
            ref={scrollContainerRef}
            className="h-full overflow-auto"
            style={{ scrollbarWidth: 'thin' } as React.CSSProperties}
        >
            {/* Transposed: columns = teams, rows = rounds */}
            <table className="w-max min-w-full" style={{ borderCollapse: 'separate', borderSpacing: '2px', margin: '-2px' }}>
                <thead className="sticky top-0 z-20 bg-slate-950">
                    <tr>
                        {/* Round column header (sticky left) */}
                        <th
                            className="sticky left-0 z-30 bg-slate-950 min-w-[90px] px-2 py-2 text-left font-bold text-slate-500 text-[10px]"
                            style={{ boxShadow: '1px 0 0 0 rgb(2,6,23), 0 1px 0 0 rgb(2,6,23)' }}
                        >
                            라운드
                        </th>
                        {/* Team column headers */}
                        {teamIds.map(teamId => {
                            const isUser = teamId === userTeamId;
                            return (
                                <th
                                    key={teamId}
                                    className={`w-[120px] min-w-[120px] max-w-[120px] px-1 py-2.5 text-center text-[11px] font-bold uppercase ${
                                        isUser ? 'text-white' : 'text-slate-400'
                                    }`}
                                    style={{
                                        ...(isUser ? { backgroundColor: 'rgba(245,158,11,0.12)' } : {}),
                                        boxShadow: '1px 0 0 0 rgb(2,6,23), -1px 0 0 0 rgb(2,6,23)',
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
                            <tr
                                key={round}
                                className="h-[76px]"
                            >
                                {/* Round label (sticky left) */}
                                <td
                                    className="sticky left-0 bg-slate-950 px-2 py-1 z-10"
                                    style={{ boxShadow: '0 1px 0 0 rgb(2,6,23), 0 -1px 0 0 rgb(2,6,23)' }}
                                >
                                    <div className="flex items-center gap-1">
                                        <span className={`text-[11px] font-bold whitespace-nowrap ${
                                            isCurrentRound ? 'text-indigo-400' : isPast ? 'text-slate-600' : 'text-slate-500'
                                        }`}>
                                            {round}라운드
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

                                    return (
                                        <td
                                            key={teamId}
                                            ref={isCurrent ? currentCellRef : undefined}
                                            className="p-0 text-center rounded-lg"
                                            style={{
                                                ...(pick
                                                    ? { backgroundColor: isUserCol ? `color-mix(in srgb, ${posColor}20, rgba(245,158,11,0.10))` : `${posColor}20` }
                                                    : isCurrent
                                                        ? { backgroundColor: `${currentTeamColor}15`, boxShadow: `inset 0 0 0 2px ${currentTeamColor}` }
                                                        : isUserCol
                                                            ? { backgroundColor: 'rgba(245,158,11,0.08)' }
                                                            : {}
                                                ),
                                            }}
                                        >
                                            {pick ? (
                                                /* Picked cell */
                                                <div className="h-full flex flex-col items-center justify-center gap-0.5 px-1.5">
                                                    <span
                                                        className="text-[9px] font-bold uppercase opacity-60"
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
                                                /* Current pick cell */
                                                <div className="h-full flex items-center justify-center">
                                                    <span className="text-sm animate-pulse font-bold" style={{ color: currentTeamColor }}>
                                                        ···
                                                    </span>
                                                </div>
                                            ) : (
                                                /* Empty cell */
                                                <div className="h-full flex items-center justify-center">
                                                    <span className="text-[10px] text-slate-700">—</span>
                                                </div>
                                            )}
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
