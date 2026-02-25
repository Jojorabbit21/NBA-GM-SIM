
import React from 'react';
import { CalendarClock, FastForward, Clock } from 'lucide-react';
import { Team, Game, PlayoffSeries } from '../../types';
import { Button } from '../common/Button';
import { OvrBadge } from '../common/OvrBadge';
import { TeamLogo } from '../common/TeamLogo';

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
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({ 
  team, nextGame, opponent, isHome, myOvr, opponentOvrValue, isGameToday, isSimulating, onSimClick, onAutoSimClick,
  currentSeries, currentSimDate
}) => {
  const homeTeam = isHome ? team : opponent;
  const awayTeam = isHome ? opponent : team;
  const homeOvr = isHome ? myOvr : opponentOvrValue;
  const awayOvr = isHome ? opponentOvrValue : myOvr;

  const playoffRoundName = currentSeries ? (
      currentSeries.round === 0 ? "Play-In Tournament" : 
      currentSeries.round === 4 ? "NBA Finals" : 
      currentSeries.round === 3 ? `${currentSeries.conference} Conference Finals` :
      currentSeries.round === 2 ? `${currentSeries.conference} Conference Semifinals` :
      `${currentSeries.conference} Conference Round 1`
  ) : null;

  return (
    <div className="w-full bg-slate-900/90 border-b border-white/5 backdrop-blur-xl sticky top-0 z-[100] flex flex-col">
        <div className="px-8 py-3 flex items-center justify-between gap-8 h-20">
            {/* Date */}
            <div className="flex items-center gap-3 shrink-0 pr-4 border-r border-white/5">
                <Clock size={14} className="text-slate-500" />
                <span className="text-sm font-bold text-white oswald tracking-wider">{currentSimDate}</span>
                <div className="w-1.5 h-1.5 rounded-full animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.5)] bg-emerald-500"></div>
            </div>

            {/* Matchup */}
            <div className="flex items-center gap-8 min-w-0">
                {/* Away Team */}
                <div className="flex items-center gap-3">
                    {awayTeam ? (
                        <>
                            <TeamLogo teamId={awayTeam.id} size="lg" />
                            <div className="hidden sm:flex flex-col">
                                <span className="text-sm font-black text-white oswald uppercase leading-tight truncate max-w-[100px]">{awayTeam.name}</span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase">{awayTeam.wins}W-{awayTeam.losses}L</span>
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
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Upcoming Game</span>
                            <span className="text-sm font-black text-white oswald tracking-widest">{nextGame?.date || 'SCHEDULED'}</span>
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
                                <span className="text-[10px] font-bold text-slate-500 uppercase">{homeTeam.wins}W-{homeTeam.losses}L</span>
                            </div>
                            <TeamLogo teamId={homeTeam.id} size="lg" />
                        </>
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-800 animate-pulse"></div>
                    )}
                </div>
            </div>

            {/* Right: Simulation Action */}
            <div className="flex items-center gap-3">
                {isGameToday && onAutoSimClick && (
                    <Button 
                        onClick={onAutoSimClick} 
                        disabled={isSimulating} 
                        variant="secondary"
                        size="md"
                        icon={<FastForward size={16} />}
                        className="min-w-[130px] h-10 !rounded-xl"
                    >
                        자동 진행
                    </Button>
                )}

                <Button 
                    onClick={onSimClick} 
                    disabled={isSimulating} 
                    variant={isGameToday ? 'brand' : 'secondary'}
                    size="md"
                    isLoading={isSimulating}
                    loadingText="처리 중"
                    icon={!isSimulating && <CalendarClock size={16} />}
                    className="min-w-[180px] h-10 !rounded-xl"
                >
                    {isGameToday ? '경기 시작' : '내일로 이동'}
                </Button>
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
