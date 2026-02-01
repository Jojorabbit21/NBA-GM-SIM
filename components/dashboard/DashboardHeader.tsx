import React from 'react';
import { Trophy, ArrowRight, Crown, BarChart3, CalendarClock, Loader2 } from 'lucide-react';
import { Team, Game, PlayoffSeries } from '../../types';
import { OvrBadge } from '../SharedComponents';

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
  onShowSeasonReview: () => void;
  onShowPlayoffReview: () => void;
  hasPlayoffHistory: boolean;
  currentSeries?: PlayoffSeries; 
}

// [Added] DashboardReviewBanners Component to fix Error 1
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
  showPlayoffBanner,
}) => {
  if (!showSeasonBanner && !showPlayoffBanner && !hasPlayoffHistory) return null;

  return (
    <div className="w-full max-w-[1900px] flex flex-col gap-4 mb-6 animate-in slide-in-from-top-4 duration-500">
      {showSeasonBanner && (
        <div className="bg-gradient-to-r from-orange-600/90 to-amber-600/90 rounded-2xl p-6 shadow-lg border border-orange-400/30 flex justify-between items-center backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-full">
              <Trophy size={24} className="text-white" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tight leading-none">Regular Season Complete</h3>
              <p className="text-sm text-orange-100 font-bold mt-1">2025-26 정규시즌이 종료되었습니다. 시즌 리포트를 확인하세요.</p>
            </div>
          </div>
          <button
            onClick={onShowSeasonReview}
            className="px-6 py-3 bg-white text-orange-600 rounded-xl font-black uppercase text-sm tracking-widest shadow-xl hover:bg-orange-50 transition-all flex items-center gap-2"
          >
            Review Season <ArrowRight size={16} />
          </button>
        </div>
      )}

      {showPlayoffBanner && (
        <div className="bg-gradient-to-r from-indigo-600/90 to-blue-600/90 rounded-2xl p-6 shadow-lg border border-indigo-400/30 flex justify-between items-center backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-full">
              <Crown size={24} className="text-white" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tight leading-none">The Championship Conclusion</h3>
              <p className="text-sm text-indigo-100 font-bold mt-1">대망의 2026 플레이오프가 막을 내렸습니다.</p>
            </div>
          </div>
          <button
            onClick={onShowPlayoffReview}
            className="px-6 py-3 bg-white text-indigo-600 rounded-xl font-black uppercase text-sm tracking-widest shadow-xl hover:bg-indigo-50 transition-all flex items-center gap-2"
          >
            Playoff Report <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* History Button (Small) if banners are hidden but history exists */}
      {!showSeasonBanner && !showPlayoffBanner && hasPlayoffHistory && (
        <div className="flex justify-end">
           <button
            onClick={onShowPlayoffReview}
            className="px-4 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all border border-slate-700"
          >
            <BarChart3 size={14} /> 지난 시즌/플레이오프 기록 보기
          </button>
        </div>
      )}
    </div>
  );
};

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({ 
  team, nextGame, opponent, isHome, myOvr, opponentOvrValue, isGameToday, isSimulating, onSimClick, currentSeries
}) => {

  const homeTeam = isHome ? team : opponent;
  const awayTeam = isHome ? opponent : team;
  
  const homeOvr = isHome ? myOvr : opponentOvrValue;
  const awayOvr = isHome ? opponentOvrValue : myOvr;

  const getSeriesInfo = () => {
    if (!currentSeries || !nextGame?.isPlayoff) return null;

    const { round, conference, id, higherSeedWins, lowerSeedWins } = currentSeries;
    const confText = conference === 'East' ? '동부' : conference === 'West' ? '서부' : '';
    const scoreText = `${higherSeedWins}-${lowerSeedWins}`;

    if (round === 0) {
        if (id.includes('8th')) return `플레이-인 8시드 결정전`;
        return `플레이-인 1라운드`;
    }
    if (round === 1) return `${confText} 1라운드 ${scoreText}`;
    if (round === 2) return `${confText} 세미파이널 ${scoreText}`;
    if (round === 3) return `${confText} 파이널 ${scoreText}`;
    if (round === 4) return `NBA 파이널 ${scoreText}`;
    
    return 'Playoffs';
  };

  const seriesText = getSeriesInfo();

  return (
    <div className="w-full max-w-[1900px] bg-slate-900/80 border border-white/10 rounded-3xl shadow-2xl backdrop-blur-md overflow-hidden flex flex-col mb-6">
        <style>{`
            @keyframes fillProgress {
                from { transform: scaleX(0); }
                to { transform: scaleX(1); }
            }
            .animate-fill-progress {
                animation: fillProgress 2s linear forwards;
                transform-origin: left;
            }
        `}</style>
        <div className="px-8 py-8 border-b border-white/5 bg-white/5 flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-12 flex-1 justify-center lg:justify-start">
                <div className="flex items-center gap-6">
                    {awayTeam ? (
                        <>
                            <img src={awayTeam.logo} className="w-16 h-16 object-contain drop-shadow-2xl" alt="" />
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl font-black text-white oswald uppercase tracking-tighter leading-none">{awayTeam.name}</span>
                                </div>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1.5">{awayTeam.wins}W - {awayTeam.losses}L</span>
                            </div>
                            <OvrBadge ovr={awayOvr || 70} className="!w-11 !h-11 !text-2xl" />
                        </>
                    ) : (
                        <div className="flex items-center gap-4 text-slate-500 opacity-50">
                            <div className="w-16 h-16 bg-slate-800 rounded-full"></div>
                            <span className="text-xl font-black oswald">TBD</span>
                        </div>
                    )}
                </div>

                <div className="flex flex-col items-center justify-center px-4 min-w-[120px]">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                        {nextGame?.date || 'NEXT EVENT'}
                    </div>
                    <div className="text-3xl font-black text-slate-200 oswald tracking-[0.1em] leading-none text-shadow-lg">
                        VS
                    </div>
                    {seriesText && (
                        <div className="mt-2 px-3 py-1 bg-indigo-600/20 border border-indigo-500/30 rounded-full">
                            <span className="text-[10px] font-black text-indigo-300 uppercase tracking-tight whitespace-nowrap">
                                {seriesText}
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-6">
                    {homeTeam ? (
                        <>
                            <OvrBadge ovr={homeOvr || 70} className="!w-11 !h-11 !text-2xl" />
                            <div className="flex flex-col items-end">
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl font-black text-white oswald uppercase tracking-tighter leading-none">{homeTeam.name}</span>
                                </div>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1.5">{homeTeam.wins}W - {homeTeam.losses}L</span>
                            </div>
                            <img src={homeTeam.logo} className="w-16 h-16 object-contain drop-shadow-2xl" alt="" />
                        </>
                    ) : (
                        <div className="flex items-center gap-4 text-slate-500 opacity-50">
                            <span className="text-xl font-black oswald">TBD</span>
                            <div className="w-16 h-16 bg-slate-800 rounded-full"></div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center pl-10 lg:border-l border-white/10">
                {isGameToday ? (
                    <button 
                        onClick={onSimClick} 
                        disabled={isSimulating} 
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 px-12 py-4 rounded-3xl font-black flex items-center justify-center gap-4 shadow-[0_0_30px_rgba(16,185,129,0.6)] transition-all hover:scale-[1.05] active:scale-95 border border-emerald-400/50 group ring-4 ring-emerald-500/20 min-w-[280px] animate-pulse"
                    >
                        {isSimulating ? <Loader2 size={22} className="animate-spin" /> : <span className="text-2xl filter drop-shadow-md group-hover:scale-110 transition-transform">🏀</span>}
                        <span className="text-xl oswald uppercase tracking-widest text-white ko-tight">{isSimulating ? '진행 중...' : '경기 시작'}</span>
                    </button>
                ) : (
                    <button 
                        onClick={onSimClick} 
                        disabled={isSimulating} 
                        className="relative bg-slate-700 hover:bg-blue-600 disabled:bg-slate-800 px-12 py-4 rounded-3xl font-black flex items-center justify-center gap-4 shadow-xl transition-all hover:scale-[1.05] active:scale-95 border border-white/10 group ring-4 ring-white/5 overflow-hidden min-w-[280px]"
                    >
                        {isSimulating && (
                            <div className="absolute inset-0 bg-blue-500/40 animate-fill-progress z-0 w-full h-full origin-left" />
                        )}
                        <div className="relative z-10 flex items-center gap-4">
                            {isSimulating ? <Loader2 size={22} className="animate-spin text-blue-200" /> : <CalendarClock size={22} className="text-blue-300" />}
                            <span className="text-xl oswald uppercase tracking-widest text-white ko-tight leading-none">
                                {isSimulating ? '이동 중...' : '내일로 이동'}
                            </span>
                        </div>
                    </button>
                )}
            </div>
        </div>
    </div>
  );
};