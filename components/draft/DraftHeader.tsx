
import React from 'react';
import { FastForward, ArrowLeft } from 'lucide-react';
import { TeamLogo } from '../common/TeamLogo';
import { TEAM_DATA } from '../../data/teamData';
import { TeamTheme } from '../../utils/teamTheme';

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
    teamTheme: TeamTheme;
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
    teamTheme,
}) => {
    const currentTeamData = TEAM_DATA[currentTeamId];
    const currentTeamColor = currentTeamData?.colors.primary || '#6366f1';
    const progressPct = totalPicks > 0 ? (currentPickIndex / totalPicks) * 100 : 0;
    const totalRounds = Math.ceil(totalPicks / Object.keys(TEAM_DATA).length);

    return (
        <div className="shrink-0 bg-slate-950 border-b border-slate-800 relative overflow-hidden">
            {/* Background team logo watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="opacity-[0.04]" style={{ transform: 'scale(3)' }}>
                    <TeamLogo teamId={currentTeamId} size="3xl" />
                </div>
            </div>

            {/* Subtle team color glow at top */}
            <div
                className="absolute top-0 left-0 right-0 h-[2px]"
                style={{ backgroundColor: currentTeamColor }}
            />

            {/* Main content — 3-column grid */}
            <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center px-4 py-3">
                {/* Left: Back + Round Info */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div className="flex items-baseline gap-2">
                        <span className="oswald font-black text-lg uppercase text-white tracking-wider">
                            ROUND {currentRound}
                        </span>
                        <span className="text-xs text-slate-400 font-bold font-mono">
                            PICK #{currentPickInRound}
                        </span>
                    </div>
                    <span className="text-[10px] text-slate-600 font-mono ml-1">
                        {currentPickIndex + 1}/{totalPicks}
                    </span>
                </div>

                {/* Center: On the Clock display */}
                <div
                    className="w-[320px] flex items-center justify-center gap-3 px-6 py-1.5 rounded-xl"
                    style={{ backgroundColor: `${currentTeamColor}12` }}
                >
                    <TeamLogo teamId={currentTeamId} size="lg" />
                    <div className="text-center">
                        <div className="oswald font-black text-lg text-white uppercase tracking-wide leading-tight">
                            {currentTeamData ? `${currentTeamData.city} ${currentTeamData.name}` : currentTeamId.toUpperCase()}
                        </div>
                        {isUserTurn ? (
                            <span className="inline-block text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-md font-black uppercase tracking-wider animate-pulse mt-0.5">
                                YOUR PICK
                            </span>
                        ) : (
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                ON THE CLOCK
                            </span>
                        )}
                    </div>
                </div>

                {/* Right: Fast Forward */}
                <div className="flex items-center justify-end gap-3">
                    {showFastForward && (
                        <button
                            onClick={onFastForward}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-xs text-slate-300 hover:text-white font-bold flex items-center gap-1.5 transition-colors"
                        >
                            <FastForward size={12} />
                            빨리감기
                        </button>
                    )}
                </div>
            </div>

            {/* Progress bar with round markers */}
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-slate-800">
                {/* Round markers */}
                {Array.from({ length: totalRounds - 1 }, (_, i) => (
                    <div
                        key={i}
                        className="absolute top-0 w-px h-full bg-slate-700/40"
                        style={{ left: `${((i + 1) / totalRounds) * 100}%` }}
                    />
                ))}
                {/* Progress fill */}
                <div
                    className="h-full transition-all duration-500 ease-out"
                    style={{ width: `${progressPct}%`, backgroundColor: teamTheme.bg }}
                />
            </div>
        </div>
    );
};
