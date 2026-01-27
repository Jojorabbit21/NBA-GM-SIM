
import React from 'react';
import { Trophy, Newspaper, ArrowRight, Crown, BarChart3, Zap, CalendarClock, Loader2 } from 'lucide-react';
import { Team, Game } from '../../types';
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
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({ 
  team, nextGame, opponent, isHome, myOvr, opponentOvrValue, isGameToday, isSimulating, onSimClick 
}) => {
  return (
    <div className="w-full max-w-[1900px] bg-slate-900/60 border border-white/10 rounded-3xl shadow-[0_50px_120px_rgba(0,0,0,0.8)] backdrop-blur-3xl overflow-hidden flex flex-col mb-6">
        <style>{`
            @keyframes fillProgress {
                from { width: 0%; }
                to { width: 100%; }
            }
            .animate-fill-progress {
                animation: fillProgress 2s linear forwards;
            }
        `}</style>
        <div className="px-8 py-8 border-b border-white/5 bg-white/5 flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-10">
                <div className="flex items-center gap-6">
                    <img src={team?.logo} className="w-16 h-16 object-contain drop-shadow-2xl" alt="" />
                    <div className="flex flex-col">
                        <span className="text-2xl font-black text-white oswald uppercase tracking-tighter leading-none">{team?.name}</span>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1.5">{team?.wins}W - {team?.losses}L</span>
                    </div>
                    <div className={getOvrBadgeStyle(myOvr) + " !w-11 !h-11 !text-2xl !mx-0 ring-2 ring-white/10"}>{myOvr}</div>
                </div>
                <div className="flex flex-col items-center px-8">
                    <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">{nextGame?.date || 'NEXT EVENT'}</div>
                    <div className="text-3xl font-black text-slate-400 oswald tracking-[0.1em] leading-none">{nextGame && !isHome ? '@' : 'VS'}</div>
                </div>
                {opponent ? (
                    <div className="flex items-center gap-6">
                        <div className={getOvrBadgeStyle(opponentOvrValue) + " !w-11 !h-11 !text-2xl !mx-0 ring-2 ring-white/10"}>{opponentOvrValue || '??'}</div>
                        <div className="flex flex-col items-end">
                            <span className="text-2xl font-black text-white oswald uppercase tracking-tighter leading-none">{opponent?.name || 'UNKNOWN'}</span>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1.5">{opponent?.wins || 0}W - {opponent?.losses || 0}L</span>
                        </div>
                        <img src={opponent?.logo} className="w-16 h-16 object-contain drop-shadow-2xl opacity-90" alt="" />
                    </div>
                ) : (
                    <div className="flex items-center gap-4 text-slate-500">
                        <div className="text-xl font-black uppercase oswald tracking-tight">상대 없음</div>
                    </div>
                )}
            </div>
            <div className="flex items-center pl-10 lg:border-l border-white/10">
                {isGameToday ? (
                    <button 
                        onClick={onSimClick} 
                        disabled={isSimulating} 
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 px-12 py-4 rounded-3xl font-black flex items-center justify-center gap-4 shadow-[0_15px_40px_rgba(79,70,229,0.4)] transition-all hover:scale-[1.05] active:scale-95 border border-indigo-400/40 group ring-4 ring-indigo-600/10 min-w-[280px]"
                    >
                        {isSimulating ? <Loader2 size={22} className="animate-spin" /> : <Zap size={22} className="group-hover:animate-pulse text-yellow-400 fill-yellow-400" />}
                        <span className="text-xl oswald uppercase tracking-widest text-white ko-tight">{isSimulating ? '진행 중...' : '경기 시작'}</span>
                    </button>
                ) : (
                    <button 
                        onClick={onSimClick} 
                        disabled={isSimulating} 
                        className="relative bg-slate-700 hover:bg-blue-600 disabled:bg-slate-800 px-12 py-4 rounded-3xl font-black flex items-center justify-center gap-4 shadow-[0_10px_30px_rgba(0,0,0,0.3)] transition-all hover:scale-[1.05] active:scale-95 border border-white/10 group ring-4 ring-white/5 overflow-hidden min-w-[280px]"
                    >
                        {/* Smooth Progress Bar Background */}
                        {isSimulating && (
                            <div className="absolute inset-y-0 left-0 bg-blue-500/40 animate-fill-progress z-0" />
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
}> = ({ onShowSeasonReview, onShowPlayoffReview, hasPlayoffHistory }) => {
    return (
      <div className="w-full max-w-[1900px] flex flex-col md:flex-row gap-6 animate-in slide-in-from-top-4 duration-500 mb-6">
          <div className="flex-1 bg-gradient-to-br from-orange-600 to-red-600 rounded-3xl p-1 shadow-[0_10px_40px_rgba(234,88,12,0.3)] border border-orange-400/50 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-[80px] pointer-events-none group-hover:bg-white/20 transition-colors"></div>
              <div className="bg-orange-950/20 backdrop-blur-sm rounded-[1.3rem] px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-6 relative z-10 h-full">
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
          {/* Always render layout to keep consistent, hide button if no history */}
          <div className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-3xl p-1 shadow-lg border border-indigo-400/50 relative overflow-hidden group animate-in slide-in-from-right-4 duration-500">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-[80px] pointer-events-none group-hover:bg-white/20 transition-colors"></div>
              <div className="bg-indigo-950/40 backdrop-blur-sm rounded-[1.3rem] px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-6 relative z-10 h-full">
                  <div className="flex items-center gap-5">
                      <div className="p-3 bg-white/20 rounded-2xl border border-white/20 shadow-inner animate-pulse-subtle">
                          <Trophy size={28} className="text-white fill-white" />
                      </div>
                      <div>
                          <h3 className="text-xl font-black text-white uppercase tracking-wider oswald">Playoff Results</h3>
                          <p className="text-xs font-bold text-indigo-100/80 mt-1">2026 포스트시즌 최종 결산</p>
                      </div>
                  </div>
                  {hasPlayoffHistory ? (
                      <button 
                          onClick={onShowPlayoffReview}
                          className="px-8 py-3 bg-white text-indigo-700 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-indigo-50 transition-all shadow-xl active:scale-95 flex items-center gap-3 w-full md:w-auto justify-center"
                      >
                          플레이오프 리뷰 <Crown size={14} className="fill-indigo-700" />
                      </button>
                  ) : (
                      <div className="px-8 py-3 opacity-50 text-indigo-200 font-bold text-xs uppercase tracking-widest bg-indigo-950/30 rounded-xl border border-indigo-400/20">
                          Coming Soon
                      </div>
                  )}
              </div>
          </div>
      </div>
    );
};
