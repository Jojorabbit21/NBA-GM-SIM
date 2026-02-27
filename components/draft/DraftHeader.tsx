
import React from 'react';
import { FastForward, ArrowLeft } from 'lucide-react';
import { TeamLogo } from '../common/TeamLogo';
import { TEAM_DATA } from '../../data/teamData';

export const PICK_TIME_LIMIT = 30;

interface DraftHeaderProps {
    currentRound: number;
    currentPickInRound: number;
    currentTeamId: string;
    isUserTurn: boolean;
    picksUntilUser: number;
    timeRemaining: number;
    onSkipToMyTurn?: () => void;
    showSkip: boolean;
    onBack: () => void;
}

export const DraftHeader: React.FC<DraftHeaderProps> = ({
    currentRound,
    currentPickInRound,
    currentTeamId,
    isUserTurn,
    picksUntilUser,
    timeRemaining,
    onSkipToMyTurn,
    showSkip,
    onBack,
}) => {
    const currentTeamData = TEAM_DATA[currentTeamId];
    const currentTeamColor = currentTeamData?.colors.primary || '#6366f1';
    const timerStr = `00:${String(Math.max(0, timeRemaining)).padStart(2, '0')}`;
    const timerPct = (Math.max(0, timeRemaining) / PICK_TIME_LIMIT) * 100;

    return (
        <div className="shrink-0 relative overflow-hidden" style={{ backgroundColor: currentTeamColor }}>
            {/* Dark overlay for text readability */}
            <div className="absolute inset-0 bg-black/40" />

            {/* Background team logo watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="opacity-[0.08]" style={{ transform: 'scale(3)' }}>
                    <TeamLogo teamId={currentTeamId} size="3xl" />
                </div>
            </div>

            {/* Main content — 3-column grid */}
            <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center px-5 py-2.5">
                {/* Left: Back + Draft Room label */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={onBack}
                        className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                    >
                        <ArrowLeft size={16} />
                    </button>
                    <span className="text-sm font-bold text-white/80">
                        드래프트 룸
                    </span>
                </div>

                {/* Center: Timer + Round/Pick */}
                <div className="text-center min-w-[120px]">
                    <div className="pretendard font-black text-xl tracking-wider text-white leading-none">
                        {timerStr}
                    </div>
                    <div className="text-xs text-white/60 font-bold mt-0.5">
                        {currentRound}라운드 #{currentPickInRound}픽
                    </div>
                </div>

                {/* Right: Current team + user turn info */}
                <div className="flex items-center justify-end gap-3">
                    {/* Current team on the clock */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-white/50 font-medium">현재 차례</span>
                        <TeamLogo teamId={currentTeamId} size="xs" className="w-5 h-5" />
                        <span className="text-xs font-bold text-white">
                            {currentTeamData?.name || currentTeamId.toUpperCase()}
                        </span>
                    </div>

                    {/* Separator */}
                    <div className="w-px h-5 bg-white/20" />

                    {/* User turn info or skip */}
                    {isUserTurn ? (
                        <span className="text-xs font-bold text-emerald-300 animate-pulse">
                            내 차례입니다!
                        </span>
                    ) : picksUntilUser > 0 ? (
                        <>
                            <span className="text-xs text-white/70">
                                <span className="font-bold text-white">{picksUntilUser}</span>픽 후 내 차례입니다
                            </span>
                            {showSkip && (
                                <button
                                    onClick={onSkipToMyTurn}
                                    className="shrink-0 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white font-bold flex items-center gap-1.5 transition-colors border border-white/10"
                                >
                                    <FastForward size={12} />
                                    내 차례까지 건너뛰기
                                </button>
                            )}
                        </>
                    ) : null}
                </div>
            </div>

            {/* Timer progress bar at bottom border */}
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/20">
                <div
                    className="h-full bg-blue-500 transition-all duration-1000 ease-linear"
                    style={{ width: `${timerPct}%` }}
                />
            </div>
        </div>
    );
};
