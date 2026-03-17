
import React, { useState, useRef, useEffect } from 'react';
import { FastForward, ArrowLeft, ChevronDown, ChevronsRight, Play } from 'lucide-react';
import { TeamLogo } from '../common/TeamLogo';
import { TEAM_DATA } from '../../data/teamData';

export const PICK_TIME_LIMIT = 30;

// Commissioner-style announcement templates
// {pick} = pick number, {team} = team name, {player} = player name, {pos} = position
const ANNOUNCEMENT_TEMPLATES = [
    '{year} 드래프트 {pick}픽, {team}의 선택은... {player}!',
    '{team}, {pick}번째 픽으로 {pos} {player} 선수를 지명합니다!',
    '{pick}픽 {team}! {pos} 포지션 {player}를 선택했습니다!',
    '{team}이 {pick}픽으로 {player}를 선택합니다!',
    '드래프트 {pick}순위, {team}의 지명 선수는 {player}입니다!',
    '{year} 드래프트 {pick}번 지명권, {team} — {player}!',
    '{team}, {pos} {player}를 {pick}픽으로 낙점!',
    '{pick}번 지명! {team}이 {player}를 선택합니다!',
] as const;

const DRAFT_YEAR = new Date().getFullYear();

function getAnnouncementText(a: { pickNumber: number; teamId: string; playerName: string; position: string }, teamName: string): string {
    const template = ANNOUNCEMENT_TEMPLATES[a.pickNumber % ANNOUNCEMENT_TEMPLATES.length];
    const year = DRAFT_YEAR;
    return template
        .replace('{year}', String(year))
        .replace('{pick}', String(a.pickNumber))
        .replace('{team}', teamName)
        .replace('{player}', a.playerName)
        .replace('{pos}', a.position);
}

interface DraftHeaderProps {
    currentRound: number;
    currentPickInRound: number;
    currentTeamId: string;
    isUserTurn: boolean;
    picksUntilUser: number;
    timeRemaining: number;
    onAdvanceOnePick?: () => void;
    onSkipToMyTurn?: () => void;
    onAutoCompleteAll?: () => void;
    showAdvance: boolean;
    nextPickNumber?: number;
    nextPickTeamId?: string;
    announcement?: { pickNumber: number; teamId: string; playerName: string; position: string } | null;
    onBack?: () => void;
}

export const DraftHeader: React.FC<DraftHeaderProps> = ({
    currentRound,
    currentPickInRound,
    currentTeamId,
    isUserTurn,
    picksUntilUser,
    timeRemaining,
    onAdvanceOnePick,
    onSkipToMyTurn,
    onAutoCompleteAll,
    showAdvance,
    nextPickNumber,
    nextPickTeamId,
    announcement,
    onBack,
}) => {
    // Announcement 중에는 픽한 팀의 배경/로고 유지
    const displayTeamId = announcement ? announcement.teamId : currentTeamId;
    const displayTeamData = TEAM_DATA[displayTeamId];
    const displayTeamColor = displayTeamData?.colors.primary || '#6366f1';
    const currentTeamData = TEAM_DATA[currentTeamId];
    const timerStr = `00:${String(Math.max(0, timeRemaining)).padStart(2, '0')}`;
    const timerPct = (Math.max(0, timeRemaining) / PICK_TIME_LIMIT) * 100;

    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on click outside
    useEffect(() => {
        if (!dropdownOpen) return;
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [dropdownOpen]);

    // Close dropdown when user turn arrives
    useEffect(() => {
        if (isUserTurn) setDropdownOpen(false);
    }, [isUserTurn]);

    const nextTeamData = nextPickTeamId ? TEAM_DATA[nextPickTeamId] : null;

    return (
        <div className="shrink-0 relative z-30" style={{ backgroundColor: displayTeamColor }}>
            {/* Dark overlay for text readability */}
            <div className="absolute inset-0 bg-black/40" />

            {/* Background team logo watermark */}
            <div className="absolute inset-0 overflow-hidden flex items-center justify-center pointer-events-none">
                <div className="opacity-[0.08]" style={{ transform: 'scale(3)' }}>
                    <TeamLogo teamId={displayTeamId} size="3xl" />
                </div>
            </div>

            {/* Main content — 3-column grid */}
            <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center px-5 py-2.5">
                {/* Left: Back + Draft Room label */}
                <div className="flex items-center gap-2">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                        >
                            <ArrowLeft size={16} />
                        </button>
                    )}
                    <span className="text-sm font-bold text-white/80">
                        드래프트 룸
                    </span>
                </div>

                {/* Center: Announcement or Timer + Round/Pick — fixed height */}
                <div className="text-center min-w-[160px] h-[42px] flex flex-col items-center justify-center">
                    {announcement ? (
                        <div
                            className="pretendard font-black text-sm text-white leading-snug tracking-wide max-w-[400px]"
                            style={{ animation: 'draft-flash 0.6s ease-in-out 2' }}
                            key={announcement.pickNumber}
                        >
                            {getAnnouncementText(announcement, TEAM_DATA[announcement.teamId]?.name || announcement.teamId.toUpperCase())}
                        </div>
                    ) : (
                        <>
                            <div className="pretendard font-black text-xl tracking-wider text-white leading-none">
                                {timerStr}
                            </div>
                            <div className="text-xs text-white/60 font-bold mt-0.5">
                                {currentRound}라운드 #{currentPickInRound}픽
                            </div>
                        </>
                    )}
                </div>

                {/* Right: Current team + user turn info + advance control */}
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

                    {/* User turn info */}
                    {isUserTurn ? (
                        <span className="text-xs font-bold text-emerald-300 animate-pulse">
                            내 차례입니다!
                        </span>
                    ) : picksUntilUser > 0 ? (
                        <span className="text-xs text-white/70">
                            <span className="font-bold text-white">{picksUntilUser}</span>픽 후 내 차례입니다
                        </span>
                    ) : null}

                    {/* Split Dropdown Button — visible when !isUserTurn */}
                    {showAdvance && nextPickTeamId && (
                        <div ref={dropdownRef} className="relative flex items-stretch">
                            {/* Primary action: advance one pick */}
                            <button
                                onClick={onAdvanceOnePick}
                                className="px-3 py-2 rounded-l-lg bg-white/10 hover:bg-white/20 text-xs text-white font-bold flex items-center gap-1.5 transition-colors border border-white/10 border-r-0"
                            >
                                <Play size={10} fill="currentColor" />
                                다음 픽(#{nextPickNumber}, {nextTeamData?.abbr || nextPickTeamId?.toUpperCase()}) 진행하기
                            </button>

                            {/* Chevron trigger: opens dropdown */}
                            <button
                                onClick={() => setDropdownOpen(v => !v)}
                                className="px-2 py-2 rounded-r-lg bg-white/10 hover:bg-white/20 text-xs text-white font-bold flex items-center transition-colors border border-white/10 border-l-white/5"
                            >
                                <ChevronDown size={12} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Dropdown panel */}
                            {dropdownOpen && (
                                <div className="absolute top-full right-0 mt-1 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-50">
                                    <div className="p-1">
                                        <button
                                            onClick={() => { onSkipToMyTurn?.(); setDropdownOpen(false); }}
                                            className="w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-all flex items-center gap-2"
                                        >
                                            <FastForward size={12} />
                                            내 차례까지 자동 드래프트
                                        </button>
                                        <button
                                            onClick={() => { onAutoCompleteAll?.(); setDropdownOpen(false); }}
                                            className="w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-all flex items-center gap-2"
                                        >
                                            <ChevronsRight size={12} />
                                            전체 드래프트 자동 진행
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
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
