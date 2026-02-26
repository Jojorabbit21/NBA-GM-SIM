
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
    draftOrder: string[];
    userTeamId: string;
    positionColors: Record<string, string>;
}

// OVR tier color (inline text, not badge)
const getOvrColor = (ovr: number): string => {
    if (ovr >= 90) return '#f0abfc'; // fuchsia-300
    if (ovr >= 85) return '#93c5fd'; // blue-300
    if (ovr >= 80) return '#6ee7b7'; // emerald-300
    if (ovr >= 75) return '#fcd34d'; // amber-300
    if (ovr >= 70) return '#94a3b8'; // slate-400
    return '#78716c'; // stone-500
};

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

            if (cellRect.left < containerRect.left + 120 || cellRect.right > containerRect.right) {
                container.scrollLeft += cellRect.left - containerRect.left - 160;
            }
            if (cellRect.top < containerRect.top + 30 || cellRect.bottom > containerRect.bottom) {
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
            <table className="border-collapse text-[10px] w-max min-w-full">
                <thead className="sticky top-0 z-20 bg-slate-950">
                    <tr>
                        <th className="sticky left-0 z-30 bg-slate-950 min-w-[100px] px-2 py-1.5 text-left font-bold text-slate-500 text-[9px] uppercase border-b border-r border-slate-800">
                            Team
                        </th>
                        {Array.from({ length: totalRounds }, (_, i) => {
                            const round = i + 1;
                            const isPast = round < currentRound;
                            const isCurrent = round === currentRound;
                            return (
                                <th
                                    key={i}
                                    className={`min-w-[100px] px-1 py-1.5 text-center font-bold text-[9px] uppercase border-b border-slate-800 ${
                                        isCurrent ? 'text-indigo-400 bg-indigo-500/5' : isPast ? 'text-slate-600' : 'text-slate-500'
                                    }`}
                                >
                                    R{round}
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {teamIds.map(teamId => {
                        const isUserTeam = teamId === userTeamId;
                        const td = TEAM_DATA[teamId];
                        return (
                            <tr
                                key={teamId}
                                className="h-8 border-b hover:bg-white/[0.02]"
                                style={{
                                    borderBottomColor: 'rgba(30,41,59,0.3)',
                                    ...(isUserTeam ? {
                                        borderLeft: `2px solid ${userPrimaryColor}`,
                                        backgroundColor: `${userPrimaryColor}08`,
                                    } : {}),
                                }}
                            >
                                <td className="sticky left-0 bg-slate-950 px-2 py-1 border-r border-slate-800/50 z-10">
                                    <div className="flex items-center gap-1.5">
                                        <TeamLogo teamId={teamId} size="xs" className="w-4 h-4" />
                                        <span className={`text-[11px] font-semibold truncate ${isUserTeam ? 'text-white font-bold' : 'text-slate-300'}`}>
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
                                            className={`px-1 py-0.5 text-center ${
                                                isCurrent
                                                    ? ''
                                                    : pick
                                                        ? 'bg-slate-900/40'
                                                        : 'bg-transparent'
                                            }`}
                                            style={isCurrent ? {
                                                boxShadow: `inset 0 0 0 1.5px ${currentTeamColor}`,
                                                backgroundColor: `${currentTeamColor}10`,
                                            } : {}}
                                        >
                                            {pick ? (
                                                <div
                                                    className="flex items-center gap-1 max-w-[95px] mx-auto"
                                                    style={{ borderLeft: `2px solid ${positionColors[pick.position] || '#64748b'}`, paddingLeft: '4px' }}
                                                >
                                                    <span
                                                        className="text-[9px] font-bold shrink-0"
                                                        style={{ color: getOvrColor(pick.ovr) }}
                                                    >
                                                        {pick.ovr}
                                                    </span>
                                                    <span className="text-[10px] font-semibold text-slate-200 truncate">
                                                        {pick.playerName}
                                                    </span>
                                                </div>
                                            ) : isCurrent ? (
                                                <div className="text-[9px] animate-pulse" style={{ color: currentTeamColor }}>
                                                    ···
                                                </div>
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
