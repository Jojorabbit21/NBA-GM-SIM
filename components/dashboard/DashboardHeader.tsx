
import React from 'react';
import { Trophy, ArrowRight, Crown, BarChart3, Zap, CalendarClock, Loader2 } from 'lucide-react';
import { Team, Game, PlayoffSeries } from '../../types';
import { getOvrBadgeStyle } from '../SharedComponents';

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
                            <div className={getOvrBadgeStyle(awayOvr) + " !w-11 !h-11 !text-2xl !mx-0 ring-2 ring-white/10"}>{awayOvr || '??'}</div>
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
                            <div className={getOvrBadgeStyle(homeOvr) + " !w-11 !h-11 !text-2xl !mx-0 ring-2 ring-white/10"}>{homeOvr || '??'}</div>
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
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 px-12 py-4 rounded-3xl font-black flex items-center justify-center gap-4 shadow-xl transition-all hover:scale-[1.05] active:scale-95 border border-indigo-400/40 group ring-4 ring-indigo-600/10 min-w-[280px]"
                    >
                        {isSimulating ? <Loader2 size={22} className="animate-spin" /> : <Zap size={22} className="group-hover:animate-pulse text-yellow-400 fill-yellow-400" />}
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

export const DashboardReviewBanners: React.FC<{
  onShowSeasonReview: () => void;
  onShowPlayoffReview: () => void;
  hasPlayoffHistory: boolean;
  showSeasonBanner: boolean;
  showPlayoffBanner: boolean;
}> = ({ onShowSeasonReview, onShowPlayoffReview, hasPlayoffHistory, showSeasonBanner, showPlayoffBanner }) => {
    if (!showSeasonBanner && !showPlayoffBanner) return null;

    return (
      <div className="w-full max-w-[1900px] flex flex-col md:flex-row gap-6 animate-in slide-in-from-top-4 duration-500 mb-6">
          {showSeasonBanner && (
              <div className="flex-1 bg-gradient-to-br from-orange-600 to-red-600 rounded-3xl p-1 shadow-lg border border-orange-400/50 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none group-hover:bg-white/20 transition-colors"></div>
                  <div className="bg-orange-950/40 backdrop-blur-md rounded-[1.3rem] px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-6 relative z-10 h-full">
                      <div className="flex items-center gap-5">
                          <div className="p-3 bg-white/20 rounded-2xl border border-white/20 shadow-inner">
                              <BarChart3 size={28} className="text-white" />
                          </div>
                          <div>
                              <h3 className="text-xl font-black text-white uppercase tracking-wider oswald">Regular Season</h3>
                              <p className="text-xs font-bold text-orange-100 mt-1">2025-26 정규리그 기록 및 분석</p>
                          </div>
                      </div>
                      <button 
                          onClick={onShowSeasonReview}
                          className="px-8 py-3 bg-white text-orange-600 hover:bg-orange-50 rounded-xl font-black uppercase text-xs tracking-widest transition-all shadow-lg active:scale-95 flex items-center gap-3 border border-white/50 group/btn w-full md:w-auto justify-center"
                      >
                          시즌 리뷰 <ArrowRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
                      </button>
                  </div>
              </div>
          )}
          
          {showPlayoffBanner && (
              <div className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-3xl p-1 shadow-lg border border-indigo-400/50 relative overflow-hidden group animate-in slide-in-from-right-4 duration-500">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none group-hover:bg-white/20 transition-colors"></div>
                  <div className="bg-indigo-950/40 backdrop-blur-md rounded-[1.3rem] px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-6 relative z-10 h-full">
                      <div className="flex items-center gap-5">
                          <div className="p-3 bg-white/20 rounded-2xl border border-white/20 shadow-inner animate-pulse-subtle">
                              <Trophy size={28} className="text-white fill-white" />
                          </div>
                          <div>
                              <h3 className="text-xl font-black text-white uppercase tracking-wider oswald">Playoff Results</h3>
                              <p className="text-xs font-bold text-indigo-100/80 mt-1">2026 포스트시즌 최종 결산</p>
                          </div>
                      </div>
                      <button 
                          onClick={onShowPlayoffReview}
                          className="px-8 py-3 bg-white text-indigo-700 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-indigo-50 transition-all shadow-xl active:scale-95 flex items-center gap-3 w-full md:w-auto justify-center"
                      >
                          플레이오프 리뷰 <Crown size={14} className="fill-indigo-700" />
                      </button>
                  </div>
              </div>
          )}
      </div>
    );
};
