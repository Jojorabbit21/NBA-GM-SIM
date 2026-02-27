
import React from 'react';
import { FastForward, ArrowLeft, ChevronRight, ChevronLeft } from 'lucide-react';
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
    picksUntilUser: number;
    userTeamId: string;
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
    picksUntilUser,
    userTeamId,
    onFastForward,
    showFastForward,
    onBack,
    teamTheme,
}) => {
    const currentTeamData = TEAM_DATA[currentTeamId];
    const currentTeamColor = currentTeamData?.colors.primary || '#6366f1';
    const userTeamData = TEAM_DATA[userTeamId];
    const userTeamColor = userTeamData?.colors.primary || '#6366f1';
    const progressPct = totalPicks > 0 ? (currentPickIndex / totalPicks) * 100 : 0;
    const totalRounds = Math.ceil(totalPicks / Object.keys(TEAM_DATA).length);
    const isSnakeReverse = currentRound % 2 === 0;

    return (
        <div className="shrink-0 bg-slate-950 border-b border-slate-800 relative overflow-hidden">
            {/* Background team logo watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="opacity-[0.03]" style={{ transform: 'scale(3.5)' }}>
                    <TeamLogo teamId={currentTeamId} size="3xl" />
                </div>
            </div>

            {/* Team color top accent line */}
            <div
                className="absolute top-0 left-0 right-0 h-[2px]"
                style={{ backgroundColor: currentTeamColor }}
            />

            {/* Main content — 3-column grid */}
            <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center px-5 py-3">
                {/* Left: Back + Round/Pick Info */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <div className="flex items-center gap-1.5">
                            <span className="oswald font-black text-lg uppercase text-white tracking-wider leading-none">
                                ROUND {currentRound}
                            </span>
                            {/* Snake direction */}
                            <span className="text-slate-600" title={isSnakeReverse ? '역순' : '정순'}>
                                {isSnakeReverse
                                    ? <ChevronLeft size={14} />
                                    : <ChevronRight size={14} />
                                }
                            </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-slate-400 font-bold font-mono">
                                PICK #{currentPickInRound}
                            </span>
                            <span className="text-[10px] text-slate-600 font-mono">
                                · {currentPickIndex + 1}/{totalPicks}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Center: On the Clock hero */}
                <div
                    className="flex items-center justify-center gap-3 px-8 py-2 rounded-xl min-w-[340px]"
                    style={{ backgroundColor: `${currentTeamColor}10` }}
                >
                    <TeamLogo teamId={currentTeamId} size="lg" />
                    <div className="text-center">
                        <div className="oswald font-black text-lg text-white uppercase tracking-wide leading-tight">
                            {currentTeamData
                                ? `${currentTeamData.city} ${currentTeamData.name}`
                                : currentTeamId.toUpperCase()}
                        </div>
                        {isUserTurn ? (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/20 text-emerald-400 px-2.5 py-0.5 rounded-md font-black uppercase tracking-wider animate-pulse mt-0.5">
                                YOUR PICK
                            </span>
                        ) : (
                            <span
                                className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-0.5 rounded-md font-black uppercase tracking-wider mt-0.5"
                                style={{
                                    backgroundColor: `${currentTeamColor}18`,
                                    color: currentTeamColor,
                                }}
                            >
                                <span
                                    className="w-1.5 h-1.5 rounded-full animate-pulse"
                                    style={{ backgroundColor: currentTeamColor }}
                                />
                                SELECTING
                            </span>
                        )}
                    </div>
                </div>

                {/* Right: Pick countdown + Fast Forward */}
                <div className="flex items-center justify-end gap-3">
                    {/* "You pick in N" indicator */}
                    {!isUserTurn && picksUntilUser > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800/50">
                            <TeamLogo teamId={userTeamId} size="xs" className="w-4 h-4" />
                            <div className="text-right">
                                <div className="text-[9px] text-slate-500 font-bold uppercase leading-none">
                                    You pick in
                                </div>
                                <div
                                    className="text-base font-black font-mono leading-tight"
                                    style={{ color: userTeamColor }}
                                >
                                    {picksUntilUser}
                                </div>
                            </div>
                        </div>
                    )}
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
                {Array.from({ length: totalRounds - 1 }, (_, i) => (
                    <div
                        key={i}
                        className="absolute top-0 w-px h-full bg-slate-700/40"
                        style={{ left: `${((i + 1) / totalRounds) * 100}%` }}
                    />
                ))}
                <div
                    className="h-full transition-all duration-500 ease-out"
                    style={{ width: `${progressPct}%`, backgroundColor: teamTheme.bg }}
                />
            </div>
        </div>
    );
};
