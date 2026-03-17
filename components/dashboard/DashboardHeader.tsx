
import React, { useState, useCallback } from 'react';
import { Loader2, Play, ChevronRight, FastForward, ChevronDown, ChevronUp } from 'lucide-react';
import { Team, Game, PlayoffSeries } from '../../types';
import { OvrBadge } from '../common/OvrBadge';
import { TeamLogo } from '../common/TeamLogo';
import { TEAM_DATA } from '../../data/teamData';
import { getTeamTheme, getButtonTheme } from '../../utils/teamTheme';
import { ROUND_NAMES, CONF_NAMES } from '../../utils/playoffLogic';
import { SeasonKeyDates } from '../../utils/seasonConfig';
import { PendingOffseasonAction } from '../../types/app';
import { DateSkipDropdown, formatDateKorean } from './DateSkipDropdown';

interface DashboardHeaderProps {
  team: Team;
  nextGame?: Game;
  opponent?: Team;
  isHome: boolean;
  myOvr: number;
  opponentOvrValue: number;
  isGameToday: boolean;
  isSimulating?: boolean;
  simProgress?: { percent: number; label: string } | null;
  onSimClick: () => void;
  onAutoSimClick?: () => void;
  currentSeries?: PlayoffSeries;
  currentSimDate?: string;
  conferenceRank?: number;
  streak?: string;
  conferenceName?: string;
  isSeasonOver?: boolean;
  pendingOffseasonAction?: PendingOffseasonAction;
  keyDates?: SeasonKeyDates;
  onSkipToDate?: (targetDate: string, label: string) => void;
  onSimulateFullSeason?: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  team, nextGame, opponent, isHome, myOvr, opponentOvrValue, isGameToday, isSimulating, simProgress, onSimClick, onAutoSimClick,
  currentSeries, currentSimDate, conferenceRank, streak, conferenceName, isSeasonOver,
  pendingOffseasonAction, keyDates, onSkipToDate, onSimulateFullSeason
}) => {
  const homeTeam = isHome ? team : opponent;
  const awayTeam = isHome ? opponent : team;
  const homeOvr = isHome ? myOvr : opponentOvrValue;
  const awayOvr = isHome ? opponentOvrValue : myOvr;

  const [pressedBtn, setPressedBtn] = useState<string | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  const isOffseasonBlocked = !!pendingOffseasonAction;
  const [isSkipDropdownOpen, setIsSkipDropdownOpen] = useState(false);

  const handleSkipToDate = useCallback((targetDate: string, label: string) => {
      if (!onSkipToDate) return;
      const ok = window.confirm(`${label} (${targetDate})까지 시뮬레이션을 진행합니다.\n계속하시겠습니까?`);
      if (ok) onSkipToDate(targetDate, label);
  }, [onSkipToDate]);

  const handleSimulateFullSeason = useCallback(() => {
      if (!onSimulateFullSeason) return;
      const ok = window.confirm('시즌 끝까지 시뮬레이션을 진행합니다.\n계속하시겠습니까?');
      if (ok) onSimulateFullSeason();
  }, [onSimulateFullSeason]);

  const teamColors = TEAM_DATA[team.id]?.colors || null;
  const theme = getTeamTheme(team.id, teamColors);
  const btnTheme = getButtonTheme(team.id, teamColors);
  const glowColor = btnTheme.glow;

  // Primary button (경기 시작 / 내일로 이동) — glossy glass gradient
  // 밝은 배경(흰색 등)은 black overlay, 어두운 배경은 white overlay
  const isLightBg = (() => {
      const hex = btnTheme.bg.replace('#', '');
      if (hex.length < 6) return false;
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return (r * 0.299 + g * 0.587 + b * 0.114) > 160;
  })();

  const primaryBtn = (id: string) => {
      const isPressed = pressedBtn === id;
      const isHovered = hoveredBtn === id;
      const hl = isLightBg ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.35)';
      const hlMid = isLightBg ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)';
      const shBot = isLightBg ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.1)';

      // 프로그레스 바 모드: 좌→우 채움 그라데이션
      const progressGradient = simProgress
          ? `linear-gradient(90deg, ${btnTheme.bg} 0%, ${btnTheme.bg} ${simProgress.percent}%, rgba(0,0,0,0.35) ${simProgress.percent + 0.5}%, rgba(0,0,0,0.25) 100%)`
          : undefined;

      return {
          style: {
              backgroundColor: btnTheme.bg,
              backgroundImage: simProgress
                  ? progressGradient
                  : isPressed
                      ? `linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.02) 40%, transparent 50%, rgba(0,0,0,0.15) 100%)`
                      : `linear-gradient(180deg, ${hl} 0%, ${hlMid} 45%, transparent 50%, ${shBot} 100%)`,
              color: btnTheme.text,
              boxShadow: isPressed
                  ? `inset 0 1px 2px rgba(0,0,0,0.2), 0 1px 4px ${glowColor}20`
                  : isHovered
                      ? `inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 24px ${glowColor}60, 0 0 48px ${glowColor}20`
                      : undefined, // breathing animation handles idle via CSS var
              '--glow-color': `${glowColor}50`,
              '--glow-dim': `${glowColor}18`,
              transform: isPressed ? 'scale(0.97)' : 'scale(1)',
              transition: simProgress ? 'background-image 0.3s ease, all 0.15s ease' : 'all 0.15s ease',
              filter: isHovered && !isPressed ? 'brightness(1.05)' : isPressed ? 'brightness(0.9)' : 'brightness(1)',
          } as React.CSSProperties,
          onMouseDown: () => !isSimulating && setPressedBtn(id),
          onMouseUp: () => setPressedBtn(null),
          onMouseEnter: () => !isSimulating && setHoveredBtn(id),
          onMouseLeave: () => { setPressedBtn(null); setHoveredBtn(null); },
      };
  };

  // Secondary button (자동 진행)
  const secondaryBtn = (id: string) => {
      const isPressed = pressedBtn === id;
      const isHovered = hoveredBtn === id;
      return {
          style: {
              backgroundColor: isHovered ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.85)',
              border: isHovered ? '1px solid rgba(255,255,255,0.25)' : '1px solid rgba(255,255,255,0.12)',
              boxShadow: isPressed ? 'none' : isHovered ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
              transform: isPressed ? 'scale(0.97)' : 'scale(1)',
              transition: 'all 0.15s ease',
              backdropFilter: 'blur(8px)',
          } as React.CSSProperties,
          onMouseDown: () => !isSimulating && setPressedBtn(id),
          onMouseUp: () => setPressedBtn(null),
          onMouseEnter: () => !isSimulating && setHoveredBtn(id),
          onMouseLeave: () => { setPressedBtn(null); setHoveredBtn(null); },
      };
  };

  const playoffRoundName = currentSeries
      ? (currentSeries.round === 4 ? '' : `${CONF_NAMES[currentSeries.conference] || currentSeries.conference} `) + (ROUND_NAMES[currentSeries.round] || `${currentSeries.round}라운드`)
      : null;

  return (
    <div className="w-full backdrop-blur-xl sticky top-0 z-[100] flex flex-col relative" style={{ backgroundColor: theme.bg, boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-black/10 pointer-events-none" />
        <div className="pl-8 pr-0 py-0 flex items-center gap-8 h-20 relative z-10">
            {/* Date + Team Status */}
            <div className="flex-1 flex flex-col gap-1.5 relative">
                {keyDates && currentSimDate && onSkipToDate ? (
                    <button
                        onClick={() => setIsSkipDropdownOpen(prev => !prev)}
                        className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
                    >
                        <span className="text-sm font-semibold" style={{ color: theme.text }}>
                            {formatDateKorean(currentSimDate)}
                        </span>
                        {isSkipDropdownOpen
                            ? <ChevronUp size={14} style={{ color: theme.text, opacity: 0.6 }} />
                            : <ChevronDown size={14} style={{ color: theme.text, opacity: 0.6 }} />
                        }
                    </button>
                ) : (
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: theme.text }}>
                            {currentSimDate ? formatDateKorean(currentSimDate) : ''}
                        </span>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: theme.text }}>{conferenceName} {conferenceRank}위</span>
                    <span className="font-bold" style={{ color: theme.text, opacity: 0.2 }}>|</span>
                    <span className="text-sm font-semibold" style={{ color: theme.text }}>
                        {streak?.startsWith('W') ? '🔥' : streak?.startsWith('L') ? '❄️' : ''} {streak}
                    </span>
                </div>
                {/* Skip Dropdown */}
                {keyDates && currentSimDate && (
                    <DateSkipDropdown
                        isOpen={isSkipDropdownOpen}
                        onClose={() => setIsSkipDropdownOpen(false)}
                        currentSimDate={currentSimDate}
                        keyDates={keyDates}
                        onSkipToDate={handleSkipToDate}
                        onSimulateFullSeason={handleSimulateFullSeason}
                        isSimulating={!!isSimulating}
                        themeText={theme.text}
                        isOffseason={isSeasonOver}
                    />
                )}
            </div>

            {/* Matchup — absolute center */}
            {nextGame ? (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-8 z-20">
                {/* Away Team */}
                <div className="flex items-center gap-3">
                    {awayTeam ? (
                        <>
                            <TeamLogo teamId={awayTeam.id} size="lg" />
                            <div className="hidden sm:flex flex-col">
                                <span className="text-sm font-bold leading-tight truncate max-w-[100px]" style={{ color: theme.text }}>{awayTeam.name}</span>
                                <span className="text-xs font-bold" style={{ color: theme.text, opacity: 0.7 }}>{awayTeam.wins}W-{awayTeam.losses}L</span>
                            </div>
                            <OvrBadge value={awayOvr} size="md" className="!w-7 !h-7 !text-xs" />
                        </>
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-800 animate-pulse"></div>
                    )}
                </div>

                {/* Center: Match Info */}
                <div className="flex flex-col items-center justify-center px-4 border-x border-white/5 min-w-[160px]">
                    {currentSeries ? (
                        <div className="flex flex-col items-center">
                            <span className="text-xs font-semibold" style={{ color: theme.text }}>{playoffRoundName}</span>
                            <span className="text-sm font-semibold" style={{ color: theme.text }}>
                                {awayTeam?.name}{' '}
                                {awayTeam?.id === currentSeries.higherSeedId ? currentSeries.higherSeedWins : currentSeries.lowerSeedWins}
                                {' - '}
                                {awayTeam?.id === currentSeries.higherSeedId ? currentSeries.lowerSeedWins : currentSeries.higherSeedWins}
                                {' '}{homeTeam?.name}
                            </span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center">
                            <span className="text-sm font-semibold" style={{ color: theme.text }}>다음 경기</span>
                            <span className="text-sm font-semibold" style={{ color: theme.text }}>{nextGame?.date || 'SCHEDULED'}</span>
                        </div>
                    )}
                </div>

                {/* Home Team */}
                <div className="flex items-center gap-3">
                    {homeTeam ? (
                        <>
                            <OvrBadge value={homeOvr} size="md" className="!w-7 !h-7 !text-xs" />
                            <div className="hidden sm:flex flex-col items-end">
                                <span className="text-sm font-bold leading-tight truncate max-w-[100px]" style={{ color: theme.text }}>{homeTeam.name}</span>
                                <span className="text-xs font-bold" style={{ color: theme.text, opacity: 0.7 }}>{homeTeam.wins}W-{homeTeam.losses}L</span>
                            </div>
                            <TeamLogo teamId={homeTeam.id} size="lg" />
                        </>
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-800 animate-pulse"></div>
                    )}
                </div>
            </div>
            ) : (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                <span className="text-sm font-bold" style={{ color: theme.text, opacity: 0.5 }}>다음 일정 없음</span>
            </div>
            )}

            {/* Right: Simulation Action — flush to top/bottom/right edges */}
            {(
            <div className="self-stretch flex flex-col w-[220px] shrink-0 ml-auto"
                 style={{ borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
                {isGameToday && onAutoSimClick ? (
                    <>
                        {/* 경기 시작 — 60% */}
                        <button
                            onClick={onSimClick}
                            disabled={isSimulating || isOffseasonBlocked}
                            {...primaryBtn('sim')}
                            className={`flex-[6] flex items-center justify-center gap-2.5 px-6 font-semibold text-lg tracking-wider disabled:opacity-40 disabled:cursor-not-allowed select-none ${!isSimulating && !isOffseasonBlocked ? 'animate-btn-breathe' : ''}`}
                        >
                            {simProgress ? (
                                <><Loader2 size={18} className="animate-spin" /> {simProgress.label}</>
                            ) : isSimulating ? (
                                <><Loader2 size={18} className="animate-spin" /> 처리 중</>
                            ) : (
                                <><Play size={16} fill="currentColor" /> 경기 시작</>
                            )}
                        </button>
                        {/* 구분선 */}
                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.25)' }} />
                        {/* 자동 진행 — 40% */}
                        <button
                            onClick={onAutoSimClick}
                            disabled={isSimulating || isOffseasonBlocked}
                            {...primaryBtn('auto')}
                            className="flex-[4] flex items-center justify-center gap-2 px-6 font-semibold text-lg tracking-wider disabled:opacity-40 disabled:cursor-not-allowed select-none"
                        >
                            <FastForward size={14} fill="currentColor" />
                            자동 진행
                        </button>
                    </>
                ) : (
                    /* 내일로 이동 — full height */
                    <button
                        onClick={onSimClick}
                        disabled={isSimulating || isOffseasonBlocked}
                        {...primaryBtn('sim')}
                        className="flex-1 flex items-center justify-center gap-2.5 px-6 font-semibold text-lg tracking-wider disabled:opacity-40 disabled:cursor-not-allowed select-none"
                    >
                        {simProgress ? (
                            <><Loader2 size={18} className="animate-spin" /> {simProgress.label}</>
                        ) : (
                            <><ChevronRight size={18} /> 내일로 이동</>
                        )}
                    </button>
                )}
            </div>
            )}
        </div>
    </div>
  );
};

