
import React, { useState } from 'react';
import { Loader2, Play, ChevronRight, FastForward } from 'lucide-react';
import { Team, Game, PlayoffSeries } from '../../types';
import { OvrBadge } from '../common/OvrBadge';
import { TeamLogo } from '../common/TeamLogo';
import { TEAM_DATA } from '../../data/teamData';
import { getTeamTheme, getButtonTheme } from '../../utils/teamTheme';
import { ROUND_NAMES, CONF_NAMES } from '../../utils/playoffLogic';

interface DashboardHeaderProps {
  team: Team;
  nextGame?: Game;
  opponent?: Team;
  isHome: boolean;
  myOvr: number;
  opponentOvrValue: number;
  isGameToday: boolean;
  isSimulating?: boolean;
  onSimClick: () => void;
  onAutoSimClick?: () => void; // New prop
  currentSeries?: PlayoffSeries;
  currentSimDate?: string;
  conferenceRank?: number;
  streak?: string;
  conferenceName?: string;
  isSeasonOver?: boolean;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  team, nextGame, opponent, isHome, myOvr, opponentOvrValue, isGameToday, isSimulating, onSimClick, onAutoSimClick,
  currentSeries, currentSimDate, conferenceRank, streak, conferenceName, isSeasonOver
}) => {
  const homeTeam = isHome ? team : opponent;
  const awayTeam = isHome ? opponent : team;
  const homeOvr = isHome ? myOvr : opponentOvrValue;
  const awayOvr = isHome ? opponentOvrValue : myOvr;

  const [pressedBtn, setPressedBtn] = useState<string | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  const teamColors = TEAM_DATA[team.id]?.colors || null;
  const theme = getTeamTheme(team.id, teamColors);
  const btnTheme = getButtonTheme(team.id, teamColors);
  const glowColor = btnTheme.glow;

  // Primary button (경기 시작 / 내일로 이동)
  const primaryBtn = (id: string) => {
      const isPressed = pressedBtn === id;
      const isHovered = hoveredBtn === id;
      return {
          style: {
              backgroundColor: btnTheme.bg,
              color: btnTheme.text,
              boxShadow: isPressed
                  ? `0 2px 8px ${glowColor}30`
                  : isHovered
                      ? `0 4px 24px ${glowColor}60, 0 0 48px ${glowColor}20`
                      : undefined, // breathing animation handles idle via CSS var
              '--glow-color': `${glowColor}50`,
              '--glow-dim': `${glowColor}18`,
              transform: isPressed ? 'scale(0.97)' : 'scale(1)',
              transition: 'all 0.15s ease',
              filter: isHovered && !isPressed ? 'brightness(1.2)' : isPressed ? 'brightness(0.9)' : 'brightness(1)',
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
    <div className="w-full border-b border-white/5 backdrop-blur-xl sticky top-0 z-[100] flex flex-col relative overflow-hidden" style={{ backgroundColor: theme.bg }}>
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-black/10 pointer-events-none" />
        <div className="pl-8 pr-0 py-0 flex items-center gap-8 h-20 relative z-10">
            {/* Date + Team Status */}
            <div className="flex-1 flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: theme.text }}>현재 날짜 :</span>
                    <span className="text-sm font-semibold" style={{ color: theme.text }}>{currentSimDate}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: theme.text }}>{conferenceName} {conferenceRank}위</span>
                    <span className="font-bold" style={{ color: theme.text, opacity: 0.2 }}>|</span>
                    <span className="text-sm font-semibold" style={{ color: theme.text }}>
                        {streak?.startsWith('W') ? '🔥' : streak?.startsWith('L') ? '❄️' : ''} {streak}
                    </span>
                </div>
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
            {!isSeasonOver && (
            <div className="self-stretch flex flex-col w-[220px] shrink-0 ml-auto"
                 style={{ borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
                {isGameToday && onAutoSimClick ? (
                    <>
                        {/* 경기 시작 — 60% */}
                        <button
                            onClick={onSimClick}
                            disabled={isSimulating}
                            {...primaryBtn('sim')}
                            className={`flex-[6] flex items-center justify-center gap-2.5 px-6 font-black text-sm uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed select-none ${!isSimulating ? 'animate-btn-breathe' : ''}`}
                        >
                            {isSimulating ? (
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
                            disabled={isSimulating}
                            {...primaryBtn('auto')}
                            className="flex-[4] flex items-center justify-center gap-2 px-6 font-black text-sm uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed select-none"
                        >
                            <FastForward size={14} />
                            자동 진행
                        </button>
                    </>
                ) : (
                    /* 내일로 이동 — full height */
                    <button
                        onClick={onSimClick}
                        disabled={isSimulating}
                        {...primaryBtn('sim')}
                        className="flex-1 flex items-center justify-center gap-2.5 px-6 font-black text-sm uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed select-none"
                    >
                        {isSimulating ? (
                            <><Loader2 size={18} className="animate-spin" /> 처리 중</>
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

