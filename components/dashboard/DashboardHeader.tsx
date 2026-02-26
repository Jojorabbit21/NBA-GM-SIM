
import React, { useState } from 'react';
import { CalendarClock, FastForward, Loader2 } from 'lucide-react';
import { Team, Game, PlayoffSeries } from '../../types';
import { Button } from '../common/Button';
import { OvrBadge } from '../common/OvrBadge';
import { TeamLogo } from '../common/TeamLogo';
import { TEAM_DATA } from '../../data/teamData';
import { getTeamTheme } from '../../utils/teamTheme';

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
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  team, nextGame, opponent, isHome, myOvr, opponentOvrValue, isGameToday, isSimulating, onSimClick, onAutoSimClick,
  currentSeries, currentSimDate, conferenceRank, streak, conferenceName
}) => {
  const homeTeam = isHome ? team : opponent;
  const awayTeam = isHome ? opponent : team;
  const homeOvr = isHome ? myOvr : opponentOvrValue;
  const awayOvr = isHome ? opponentOvrValue : myOvr;

  const [pressedBtn, setPressedBtn] = useState<string | null>(null);

  const teamColors = TEAM_DATA[team.id]?.colors || null;
  const theme = getTeamTheme(team.id, teamColors);

  // 3D Button helpers
  const darken = (hex: string, amount: number) => {
      const n = parseInt(hex.replace('#', ''), 16);
      const r = Math.max(0, (n >> 16) - amount);
      const g = Math.max(0, ((n >> 8) & 0xff) - amount);
      const b = Math.max(0, (n & 0xff) - amount);
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  };
  const btnBg = teamColors?.primary || '#4f46e5';
  const btnShadow = darken(btnBg, 50);
  const btnText = teamColors?.text || '#ffffff';

  const btn3d = (id: string) => ({
      style: {
          backgroundColor: btnBg,
          color: btnText,
          boxShadow: pressedBtn === id
              ? `0 1px 0 0 ${btnShadow}, 0 2px 4px rgba(0,0,0,0.2)`
              : `0 4px 0 0 ${btnShadow}, 0 6px 12px rgba(0,0,0,0.2)`,
          transform: pressedBtn === id ? 'translateY(3px)' : 'translateY(0)',
          transition: 'all 0.08s ease',
      } as React.CSSProperties,
      onMouseDown: () => !isSimulating && setPressedBtn(id),
      onMouseUp: () => setPressedBtn(null),
      onMouseLeave: () => setPressedBtn(null),
  });

  const playoffRoundName = currentSeries ? (
      currentSeries.round === 0 ? "Play-In Tournament" : 
      currentSeries.round === 4 ? "NBA Finals" : 
      currentSeries.round === 3 ? `${currentSeries.conference} Conference Finals` :
      currentSeries.round === 2 ? `${currentSeries.conference} Conference Semifinals` :
      `${currentSeries.conference} Conference Round 1`
  ) : null;

  return (
    <div className="w-full border-b border-white/5 backdrop-blur-xl sticky top-0 z-[100] flex flex-col relative overflow-hidden" style={{ backgroundColor: theme.bg }}>
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-black/10 pointer-events-none" />
        <div className="px-8 py-3 flex items-center gap-8 h-20 relative z-10">
            {/* Date + Team Status */}
            <div className="flex-1 flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-black uppercase tracking-widest oswald" style={{ color: TEAM_DATA[team.id]?.colors?.text || '#94a3b8' }}>현재 날짜 :</span>
                    <span className="text-sm font-semibold text-white tracking-wider">{currentSimDate}</span>
                </div>
                <div className="h-px bg-white/10" />
                <div className="flex items-center gap-2">
                    <span className="text-sm font-black uppercase tracking-widest oswald" style={{ color: TEAM_DATA[team.id]?.colors?.text || '#94a3b8' }}>{conferenceName} {conferenceRank}위</span>
                    <span className="text-white/20 font-bold">|</span>
                    <span className={`text-sm font-black oswald tracking-wider ${streak?.startsWith('W') ? 'text-emerald-400' : streak?.startsWith('L') ? 'text-red-400' : 'text-slate-500'}`}>
                        {streak?.startsWith('W') ? '🔥' : streak?.startsWith('L') ? '❄️' : ''} {streak}
                    </span>
                </div>
            </div>

            {/* Matchup */}
            <div className="flex items-center gap-8 shrink-0">
                {/* Away Team */}
                <div className="flex items-center gap-3">
                    {awayTeam ? (
                        <>
                            <TeamLogo teamId={awayTeam.id} size="lg" />
                            <div className="hidden sm:flex flex-col">
                                <span className="text-sm font-black text-white oswald uppercase leading-tight truncate max-w-[100px]">{awayTeam.name}</span>
                                <span className="text-[10px] font-bold uppercase" style={{ color: TEAM_DATA[awayTeam.id]?.colors?.text || '#94a3b8' }}>{awayTeam.wins}W-{awayTeam.losses}L</span>
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
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest leading-none mb-1">{playoffRoundName}</span>
                            <span className="text-sm font-black text-white oswald uppercase tracking-tighter">Series: {currentSeries.higherSeedWins} - {currentSeries.lowerSeedWins}</span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center">
                            <span className="text-sm font-black uppercase tracking-widest leading-none mb-1 oswald" style={{ color: TEAM_DATA[team.id]?.colors?.text || '#94a3b8' }}>다음 경기</span>
                            <span className="text-sm font-semibold text-white tracking-widest">{nextGame?.date || 'SCHEDULED'}</span>
                        </div>
                    )}
                </div>

                {/* Home Team */}
                <div className="flex items-center gap-3">
                    {homeTeam ? (
                        <>
                            <OvrBadge value={homeOvr} size="md" className="!w-7 !h-7 !text-xs" />
                            <div className="hidden sm:flex flex-col items-end">
                                <span className="text-sm font-black text-white oswald uppercase leading-tight truncate max-w-[100px]">{homeTeam.name}</span>
                                <span className="text-[10px] font-bold uppercase" style={{ color: TEAM_DATA[homeTeam.id]?.colors?.text || '#94a3b8' }}>{homeTeam.wins}W-{homeTeam.losses}L</span>
                            </div>
                            <TeamLogo teamId={homeTeam.id} size="lg" />
                        </>
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-800 animate-pulse"></div>
                    )}
                </div>
            </div>

            {/* Right: Simulation Action */}
            <div className="flex-1 flex items-center justify-end gap-3">
                {isGameToday && onAutoSimClick && (
                    <button
                        onClick={onAutoSimClick}
                        disabled={isSimulating}
                        {...btn3d('auto')}
                        className="flex items-center justify-center gap-2 px-5 h-10 rounded-xl font-black text-sm uppercase tracking-wider min-w-[130px] disabled:opacity-50 disabled:cursor-not-allowed select-none"
                    >
                        <FastForward size={16} />
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
                        <><CalendarClock size={16} /> {isGameToday ? '경기 시작' : '내일로 이동'}</>
                    )}
                </button>
            </div>
        </div>
    </div>
  );
};

// [Fix] Add missing DashboardReviewBanners component as requested by views/DashboardView.tsx
interface DashboardReviewBannersProps {
  onShowSeasonReview: () => void;
  onShowPlayoffReview: () => void;
  hasPlayoffHistory: boolean;
  showSeasonBanner: boolean;
  showPlayoffBanner: boolean;
}

export const DashboardReviewBanners: React.FC<DashboardReviewBannersProps> = ({
  onShowSeasonReview,
  onShowPlayoffReview,
  hasPlayoffHistory,
  showSeasonBanner,
  showPlayoffBanner
}) => {
  if (!showSeasonBanner && !showPlayoffBanner) return null;
  
  return (
    <div className="w-full max-w-[1900px] flex flex-col gap-4">
      {showSeasonBanner && (
        <div className="bg-gradient-to-r from-orange-600 to-orange-800 p-6 rounded-3xl flex items-center justify-between shadow-xl animate-in slide-in-from-top-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-xl font-black text-white oswald uppercase tracking-wider">정규시즌 종료</h3>
            <p className="text-sm font-bold text-orange-100 opacity-80">이번 시즌의 최종 성적과 통계를 확인하세요.</p>
          </div>
          <Button onClick={onShowSeasonReview} variant="secondary" className="!bg-white !text-orange-700 !border-none hover:!bg-orange-50 font-black">
            시즌 리포트 보기
          </Button>
        </div>
      )}
      {showPlayoffBanner && (
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 p-6 rounded-3xl flex items-center justify-between shadow-xl animate-in slide-in-from-top-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-xl font-black text-white oswald uppercase tracking-wider">포스트시즌 종료</h3>
            <p className="text-sm font-bold text-indigo-100 opacity-80">플레이오프 여정의 마침표를 확인하세요.</p>
          </div>
          <Button onClick={onShowPlayoffReview} variant="secondary" className="!bg-white !text-indigo-700 !border-none hover:!bg-indigo-50 font-black">
            플레이오프 리포트 보기
          </Button>
        </div>
      )}
    </div>
  );
};
