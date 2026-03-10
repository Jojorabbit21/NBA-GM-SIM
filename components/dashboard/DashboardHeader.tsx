
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Team, Game, PlayoffSeries } from '../../types';
import { OvrBadge } from '../common/OvrBadge';
import { TeamLogo } from '../common/TeamLogo';
import { TEAM_DATA } from '../../data/teamData';
import { getTeamTheme, getButtonTheme } from '../../utils/teamTheme';

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

  const teamColors = TEAM_DATA[team.id]?.colors || null;
  const theme = getTeamTheme(team.id, teamColors);

  // Frosted glass + neon glow button
  const btnTheme = getButtonTheme(team.id, teamColors);

  const glowColor = btnTheme.glow;
  const SHADOW_NORMAL = [
      `inset 0 1px 1px rgba(255,255,255,0.2)`,
      `inset 0 -1px 1px rgba(0,0,0,0.15)`,
      `0 0 16px ${glowColor}40`,
      `0 4px 12px rgba(0,0,0,0.3)`,
  ].join(', ');

  const SHADOW_PRESSED = [
      `inset 0 1px 3px rgba(0,0,0,0.3)`,
      `inset 0 -1px 1px rgba(255,255,255,0.05)`,
      `0 0 8px ${glowColor}25`,
      `0 1px 3px rgba(0,0,0,0.2)`,
  ].join(', ');

  const btn3d = (id: string) => ({
      style: {
          backgroundColor: btnTheme.bg,
          color: btnTheme.text,
          boxShadow: pressedBtn === id ? SHADOW_PRESSED : SHADOW_NORMAL,
          transform: pressedBtn === id ? 'translateY(1px) scale(0.98)' : 'translateY(0) scale(1)',
          transition: 'all 0.1s ease',
          border: '1px solid rgba(255,255,255,0.15)',
      } as React.CSSProperties,
      onMouseDown: () => !isSimulating && setPressedBtn(id),
      onMouseUp: () => setPressedBtn(null),
      onMouseLeave: () => setPressedBtn(null),
  });

  const playoffRoundName = currentSeries ? (
      currentSeries.round === 0 ? "플레이-인 토너먼트" : 
      currentSeries.round === 4 ? "BPL 파이널" :
      currentSeries.round === 3 ? `${currentSeries.conference} 컨퍼런스 파이널` :
      currentSeries.round === 2 ? `${currentSeries.conference} 컨퍼런스 2라운드` :
      `${currentSeries.conference} 컨퍼런스 1라운드`
  ) : null;

  return (
    <div className="w-full border-b border-white/5 backdrop-blur-xl sticky top-0 z-[100] flex flex-col relative overflow-hidden" style={{ backgroundColor: theme.bg }}>
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-black/10 pointer-events-none" />
        <div className="px-8 py-3 flex items-center gap-8 h-20 relative z-10">
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

            {/* Matchup */}
            {nextGame ? (
            <div className="flex items-center gap-8 shrink-0">
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

                {/* Center: Match Info (Replaced VS with Date/Series) */}
                <div className="flex flex-col items-center justify-center px-4 border-x border-white/5 min-w-[160px]">
                    {currentSeries ? (
                        <div className="flex flex-col items-center">
                            <span className="text-xs font-semibold" style={{ color: theme.text }}>{playoffRoundName}</span>
                            <span className="text-sm font-semibold" style={{ color: theme.text }}>Series: {currentSeries.higherSeedWins} - {currentSeries.lowerSeedWins}</span>
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
            <div className="flex items-center gap-4 shrink-0">
                <div className="flex flex-col items-center justify-center px-6 min-w-[160px]">
                    <span className="text-sm font-bold" style={{ color: theme.text, opacity: 0.5 }}>다음 일정 없음</span>
                </div>
            </div>
            )}

            {/* Right: Simulation Action */}
            {!isSeasonOver && (
            <div className="flex-1 flex items-center justify-end gap-3">
                {isGameToday && onAutoSimClick && (
                    <button
                        onClick={onAutoSimClick}
                        disabled={isSimulating}
                        {...btn3d('auto')}
                        className="flex items-center justify-center gap-2 px-5 h-10 rounded-xl font-black text-sm uppercase tracking-wider min-w-[130px] disabled:opacity-50 disabled:cursor-not-allowed select-none"
                    >
                        자동 진행
                    </button>
                )}

                <button
                    onClick={onSimClick}
                    disabled={isSimulating}
                    {...btn3d('sim')}
                    className="flex items-center justify-center gap-2 px-6 h-10 rounded-xl font-black text-sm uppercase tracking-wider min-w-[180px] disabled:opacity-50 disabled:cursor-not-allowed select-none"
                >
                    {isSimulating ? (
                        <><Loader2 size={16} className="animate-spin" /> 처리 중</>
                    ) : (
                        isGameToday ? '경기 시작' : '내일로 이동'
                    )}
                </button>
            </div>
            )}
        </div>
    </div>
  );
};

