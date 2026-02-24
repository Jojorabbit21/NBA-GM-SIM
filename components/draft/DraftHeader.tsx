
import React from 'react';
import { FastForward, ArrowLeft } from 'lucide-react';
import { TeamLogo } from '../common/TeamLogo';
import { TEAM_DATA } from '../../data/teamData';

interface DraftHeaderProps {
    currentPickIndex: number;
    totalPicks: number;
    currentRound: number;
    currentPickInRound: number;
    currentTeamId: string;
    isUserTurn: boolean;
    onFastForward?: () => void;
    showFastForward: boolean;
    onBack: () => void;
}

export const DraftHeader: React.FC<DraftHeaderProps> = ({
    currentPickIndex,
    totalPicks,
    currentRound,
    currentPickInRound,
    currentTeamId,
    isUserTurn,
    onFastForward,
    showFastForward,
    onBack,
}) => {
    const teamData = TEAM_DATA[currentTeamId];
    const progressPct = totalPicks > 0 ? (currentPickIndex / totalPicks) * 100 : 0;

    return (
        <div className="shrink-0 bg-slate-950 border-b border-slate-800 px-3 py-1.5 relative">
            <div className="flex items-center justify-between h-8">
                {/* Left: Back + Round & Pick */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft size={16} />
                    </button>
                    <span className="oswald font-black text-xs uppercase text-white tracking-wider">
                        ROUND {currentRound}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold">
                        PICK #{currentPickInRound}
                    </span>
                </div>

                {/* Center: Current Team */}
                <div className="flex items-center gap-2">
                    <TeamLogo teamId={currentTeamId} size="xs" />
                    <span className="text-xs font-bold text-slate-200">
                        {teamData ? `${teamData.city} ${teamData.name}` : currentTeamId.toUpperCase()}
                    </span>
                    {isUserTurn && (
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-sm font-bold uppercase animate-pulse">
                            YOUR PICK
                        </span>
                    )}
                </div>

                {/* Right: Progress + Fast Forward */}
                <div className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-500 font-mono">
                        {currentPickIndex + 1}/{totalPicks}
                    </span>
                    {showFastForward && (
                        <button
                            onClick={onFastForward}
                            className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-indigo-600 text-[10px] text-slate-300 hover:text-white font-bold flex items-center gap-1 transition-colors"
                        >
                            <FastForward size={10} />
                            빨리감기
                        </button>
                    )}
                </div>
            </div>
            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-800">
                <div
                    className="h-full bg-indigo-600 transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                />
            </div>
        </div>
    );
};
