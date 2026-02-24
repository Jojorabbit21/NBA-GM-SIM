
import React, { useRef, useEffect } from 'react';
import { TeamLogo } from '../common/TeamLogo';
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
    draftOrder: string[]; // snake order, length = teamIds.length * totalRounds
    userTeamId: string;
}

export const DraftBoard: React.FC<DraftBoardProps> = ({
    teamIds,
    totalRounds,
    picks,
    currentPickIndex,
    draftOrder,
    userTeamId,
}) => {
    const currentCellRef = useRef<HTMLTableCellElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (currentCellRef.current && scrollContainerRef.current) {
            const cell = currentCellRef.current;
            const container = scrollContainerRef.current;
            const cellRect = cell.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            // Horizontal scroll
            if (cellRect.left < containerRect.left + 120 || cellRect.right > containerRect.right) {
                container.scrollLeft += cellRect.left - containerRect.left - 160;
            }
            // Vertical scroll
            if (cellRect.top < containerRect.top + 30 || cellRect.bottom > containerRect.bottom) {
                container.scrollTop += cellRect.top - containerRect.top - 60;
            }
        }
    }, [currentPickIndex]);

    // Build a lookup: picksByTeamAndRound[teamId][round] = BoardPick
    const picksByTeamAndRound: Record<string, Record<number, BoardPick>> = {};
    picks.forEach(p => {
        if (!picksByTeamAndRound[p.teamId]) picksByTeamAndRound[p.teamId] = {};
        picksByTeamAndRound[p.teamId][p.round] = p;
    });

    // Find current pick's team and round
    const currentTeamId = draftOrder[currentPickIndex] || '';
    const currentRound = Math.floor(currentPickIndex / teamIds.length) + 1;

    const userTeamData = TEAM_DATA[userTeamId];
    const userPrimaryColor = userTeamData?.colors.primary || '#4f46e5';

    return (
        <div
            ref={scrollContainerRef}
            className="h-full overflow-auto"
            style={{ scrollbarWidth: 'thin' } as React.CSSProperties}
        >
            <table className="border-collapse text-[10px] w-max min-w-full">
                <thead className="sticky top-0 z-20 bg-slate-950">
                    <tr>
                        <th className="sticky left-0 z-30 bg-slate-950 min-w-[110px] px-2 py-1 text-left font-bold text-slate-500 text-[9px] uppercase border-b border-r border-slate-800">
                            Team
                        </th>
                        {Array.from({ length: totalRounds }, (_, i) => (
                            <th
                                key={i}
                                className={`min-w-[100px] px-1 py-1 text-center font-bold text-[9px] uppercase border-b border-slate-800 ${
                                    i + 1 === currentRound ? 'text-indigo-400 bg-indigo-500/5' : 'text-slate-500'
                                }`}
                            >
                                R{i + 1}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {teamIds.map(teamId => {
                        const isUserTeam = teamId === userTeamId;
                        const td = TEAM_DATA[teamId];
                        return (
                            <tr
                                key={teamId}
                                className={`h-8 border-b hover:bg-white/[0.02] ${
                                    isUserTeam ? 'border-l-2' : 'border-slate-800/30'
                                }`}
                                style={isUserTeam ? {
                                    borderLeftColor: userPrimaryColor,
                                    backgroundColor: `${userPrimaryColor}08`,
                                } : {}}
                            >
                                <td className="sticky left-0 bg-slate-950 px-2 py-1 border-r border-slate-800/50">
                                    <div className="flex items-center gap-1.5">
                                        <TeamLogo teamId={teamId} size="xs" className="w-4 h-4" />
                                        <span className={`text-xs font-semibold truncate ${isUserTeam ? 'text-white' : 'text-slate-300'}`}>
                                            {td ? td.name : teamId.toUpperCase()}
                                        </span>
                                    </div>
                                </td>
                                {Array.from({ length: totalRounds }, (_, roundIdx) => {
                                    const round = roundIdx + 1;
                                    const pick = picksByTeamAndRound[teamId]?.[round];
                                    const isCurrent = currentTeamId === teamId && currentRound === round && !pick;

                                    return (
                                        <td
                                            key={round}
                                            ref={isCurrent ? currentCellRef : undefined}
                                            className={`px-1 py-0.5 text-center border-slate-800/20 ${
                                                isCurrent
                                                    ? 'bg-indigo-500/10 ring-1 ring-indigo-500'
                                                    : pick
                                                        ? 'bg-slate-900/50'
                                                        : 'bg-transparent'
                                            }`}
                                        >
                                            {pick ? (
                                                <div className="text-[10px] font-semibold text-white truncate max-w-[90px] mx-auto">
                                                    {pick.playerName}
                                                </div>
                                            ) : isCurrent ? (
                                                <div className="text-[9px] text-indigo-400 animate-pulse">...</div>
                                            ) : null}
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
