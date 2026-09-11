
import React, { useState, useRef, useEffect } from 'react';
import { FastForward, ArrowLeft, ChevronDown, ChevronsRight, Play, RefreshCw } from 'lucide-react';
import type { RoomTeamMetaMap } from '../../types/multiDraft';
import { resolveTeamDisplay } from './teamMetaLookup';
import { getRealTeamLogoUrl, getTeamLogoUrl } from '../../utils/constants';

// public/logos/real/ 로고 세트 — DraftBoard.tsx와 동일한 폴백 체인(신규 로고 세트 실패 시
// 구버전 → 플레이스홀더). size는 className으로 직접 제어(호출부마다 크기가 달라 TeamLogo의
// 프리셋 size prop 대신 className 하나로 단순화).
const RealTeamLogo: React.FC<{ teamId: string; teamName?: string; className?: string }> = ({ teamId, teamName = '', className = '' }) => (
    <img
        src={getRealTeamLogoUrl(teamId)}
        alt={teamName}
        className={`object-contain ${className}`}
        onError={(e) => {
            const img = e.currentTarget;
            if (img.dataset.fallback !== 'old') {
                img.dataset.fallback = 'old';
                img.src = getTeamLogoUrl(teamId);
            } else {
                img.src = 'https://placehold.co/100x100?text=BPL';
            }
        }}
    />
);

// 싱글/루키 드래프트뷰에서 사용하는 기본 픽 제한 시간
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
    isPaused?: boolean;
    onAdvanceOnePick?: () => void;
    onSkipToMyTurn?: () => void;
    onAutoCompleteAll?: () => void;
    showAdvance: boolean;
    nextPickNumber?: number;
    nextPickTeamId?: string;
    announcement?: { pickNumber: number; teamId: string; playerName: string; position: string } | null;
    onBack?: () => void;
    teamMeta?: RoomTeamMetaMap;
    /** 현재 차례 팀이 오토픽 모드인지 (멀티 드래프트 전용, 싱글/루키 드래프트는 미전달) */
    isCurrentTeamAutoPick?: boolean;
}

export const DraftHeader: React.FC<DraftHeaderProps> = ({
    currentRound,
    currentPickInRound,
    currentTeamId,
    isUserTurn,
    picksUntilUser,
    timeRemaining,
    isPaused = false,
    onAdvanceOnePick,
    onSkipToMyTurn,
    onAutoCompleteAll,
    showAdvance,
    nextPickNumber,
    nextPickTeamId,
    announcement,
    onBack,
    teamMeta,
    isCurrentTeamAutoPick = false,
}) => {
    // Announcement 중에는 픽한 팀의 배경/로고 유지
    const displayTeamId = announcement ? announcement.teamId : currentTeamId;
    const displayDisplay = resolveTeamDisplay(displayTeamId, teamMeta);
    const displayTeamColor = displayDisplay.colorPrimary;
    const currentDisplay = resolveTeamDisplay(currentTeamId, teamMeta);
    const timerStr = `00:${String(Math.max(0, timeRemaining)).padStart(2, '0')}`;

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

    const nextDisplay = nextPickTeamId ? resolveTeamDisplay(nextPickTeamId, teamMeta) : null;

    return (
        <div className="shrink-0 relative z-30" style={{ backgroundColor: displayTeamColor }}>
            {/* Dark overlay for text readability */}
            <div className="absolute inset-0 bg-black/40" />

            {/* Background team logo watermark — isCustom(팀 이름/컬러가 커스텀인지) 여부와
                무관하게 항상 실제 로고 이미지 사용. isCustom 분기(컬러 박스+abbr 텍스트)는
                "커스텀 팀 = 매칭되는 로고 이미지가 없다"던 싱글플레이 시절 가정이었는데,
                멀티는 team_slug 기준으로 public/logos/real/에 전 팀 로고가 있어 더 이상
                맞지 않음(DraftBoard.tsx도 이미 이 가정 없이 항상 실제 로고 사용) — 사용자가
                "저건 팀배지 스타일인데 로고가 적용 안 됐다"고 정확히 짚어낸 버그. */}
            <div className="absolute inset-0 overflow-hidden flex items-center justify-center pointer-events-none">
                <div className="opacity-[0.08]" style={{ transform: 'scale(3)' }}>
                    <RealTeamLogo teamId={displayTeamId} className="w-32 h-32" />
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

                {/* Center: Announcement or Paused or Timer + Round/Pick — fixed height */}
                <div className="text-center min-w-[160px] h-[42px] flex flex-col items-center justify-center">
                    {announcement ? (
                        <div
                            className="pretendard font-black text-sm text-white leading-snug max-w-[400px]"
                            style={{ animation: 'draft-flash 0.6s ease-in-out 2' }}
                            key={announcement.pickNumber}
                        >
                            {getAnnouncementText(announcement, resolveTeamDisplay(announcement.teamId, teamMeta).name)}
                        </div>
                    ) : (
                        <>
                            <div className={`pretendard font-black text-xl leading-none ${isPaused ? 'text-amber-400' : 'text-white'}`}>
                                {isPaused ? '일시정지' : timerStr}
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
                        <span className="text-sm text-white/50 font-medium">현재 차례</span>
                        <RealTeamLogo teamId={currentTeamId} className="w-5 h-5" />
                        <span className="text-sm font-bold text-white">
                            {currentDisplay.name}
                        </span>
                        {isCurrentTeamAutoPick && (
                            <span
                                title="오토픽 진행 중"
                                className="flex items-center justify-center p-1 rounded-full bg-emerald-500 text-white"
                            >
                                <RefreshCw size={11} />
                            </span>
                        )}
                    </div>

                    {/* Separator */}
                    <div className="w-px h-5 bg-white/20" />

                    {/* User turn info */}
                    {isUserTurn ? (
                        <span className="text-sm font-bold text-emerald-300 animate-pulse">
                            내 차례입니다!
                        </span>
                    ) : picksUntilUser > 0 ? (
                        <span className="text-sm text-white/70">
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
                                다음 픽(#{nextPickNumber}, {nextDisplay?.abbr ?? ''}) 진행하기
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
        </div>
    );
};
