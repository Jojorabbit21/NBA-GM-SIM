
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
    const userTeamData = TEAM_DATA[userTeamId];
    const userPrimaryColor = userTeamData?.colors.primary || '#4f46e5';
    const currentTeamColor = TEAM_DATA[currentTeamId]?.colors.primary || '#6366f1';

    return (
        <div
            ref={scrollContainerRef}
            className="h-full overflow-auto"
            style={{ scrollbarWidth: 'thin' } as React.CSSProperties}
        >
            {/* Transposed: columns = teams, rows = rounds */}
            <table className="border-collapse w-max min-w-full">
                <thead className="sticky top-0 z-20 bg-slate-950">
                    <tr>
                        {/* Round column header (sticky left) */}
                        <th className="sticky left-0 z-30 bg-slate-950 min-w-[90px] px-2 py-2 text-left font-bold text-slate-500 text-[10px] border-b border-r border-slate-800">
                            라운드
                        </th>
                        {/* Team column headers */}
                        {teamIds.map(teamId => {
                            const isUser = teamId === userTeamId;
                            return (
                                <th
                                    key={teamId}
                                    className={`w-[120px] min-w-[120px] max-w-[120px] px-1 py-2.5 text-center text-[11px] font-bold uppercase border-b border-slate-800 ${
                                        isUser ? 'text-white' : 'text-slate-400'
                                    }`}
                                    style={isUser ? {
                                        borderLeft: `2px solid ${userPrimaryColor}`,
                                        borderRight: `2px solid ${userPrimaryColor}`,
                                        borderBottom: `2px solid ${userPrimaryColor}`,
                                        backgroundColor: `${userPrimaryColor}0c`,
                                    } : {}}
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
                                className="border-b h-[76px]"
                                style={{ borderBottomColor: 'rgba(30,41,59,0.3)' }}
                            >
                                {/* Round label (sticky left) */}
                                <td className="sticky left-0 bg-slate-950 px-2 py-1 border-r border-slate-800/50 z-10">
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

                                    // User column border style
                                    const userColBorder = isUserCol ? {
                                        borderLeft: `2px solid ${userPrimaryColor}`,
                                        borderRight: `2px solid ${userPrimaryColor}`,
                                    } : {};

                                    return (
                                        <td
                                            key={teamId}
                                            ref={isCurrent ? currentCellRef : undefined}
                                            className="p-0.5 text-center"
                                            style={{
                                                ...userColBorder,
                                                ...(isUserCol && !pick && !isCurrent ? {
                                                    backgroundColor: `${userPrimaryColor}08`,
                                                } : {}),
                                            }}
                                        >
                                            {pick ? (
                                                /* Picked cell: full position-color background */
                                                <div
                                                    className="rounded-lg h-full flex flex-col items-center justify-center gap-0.5 px-1.5 py-1"
                                                    style={{ backgroundColor: `${posColor}20` }}
                                                >
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
                                                /* Current pick cell: glow effect */
                                                <div
                                                    className="rounded-lg h-full flex items-center justify-center"
                                                    style={{
                                                        boxShadow: `inset 0 0 0 2px ${currentTeamColor}`,
                                                        backgroundColor: `${currentTeamColor}15`,
                                                    }}
                                                >
                                                    <span className="text-sm animate-pulse font-bold" style={{ color: currentTeamColor }}>
                                                        ···
                                                    </span>
                                                </div>
                                            ) : (
                                                /* Empty cell */
                                                <div className="rounded-lg h-full flex items-center justify-center hover:bg-white/[0.02]">
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
