
import React, { useMemo } from 'react';
import { Trophy, CalendarClock, Loader2, AlertTriangle, ArrowRight } from 'lucide-react';
import { Team, Game, GameTactics, PlayoffSeries } from '../../types';
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
  // Added missing props required by DashboardView
  onShowSeasonReview: () => void;
  onShowPlayoffReview: () => void;
  hasPlayoffHistory: boolean;
  currentSeries?: PlayoffSeries;
  currentSimDate?: string;
}

// Export DashboardReviewBanners as it's used in DashboardView
export const DashboardReviewBanners: React.FC<{
    onShowSeasonReview: () => void;
    onShowPlayoffReview: () => void;
    hasPlayoffHistory: boolean;
    showSeasonBanner: boolean;
    showPlayoffBanner: boolean;
}> = ({ onShowSeasonReview, onShowPlayoffReview, hasPlayoffHistory, showSeasonBanner, showPlayoffBanner }) => {
    return (
        <div className="w-full max-w-[1900px] flex flex-col gap-4">
            {showSeasonBanner && (
                <button 
                    onClick={onShowSeasonReview}
                    className="w-full bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 p-4 rounded-2xl flex items-center justify-between shadow-lg group transition-all"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-white/20 rounded-lg"><Trophy size={20} className="text-white" /></div>
                        <div className="text-left">
                            <h4 className="text-white font-black uppercase tracking-tight leading-none">2025-26 정규시즌 종료</h4>
                            <p className="text-white/80 text-xs font-bold mt-1">시즌 최종 성적 및 단장님을 위한 리포트가 도착했습니다.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-white font-black uppercase text-xs">
                        리포트 확인 <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </div>
                </button>
            )}
            {showPlayoffBanner && hasPlayoffHistory && (
                <button 
                    onClick={onShowPlayoffReview}
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 p-4 rounded-2xl flex items-center justify-between shadow-lg group transition-all"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-white/20 rounded-lg"><Trophy size={20} className="text-white" /></div>
                        <div className="text-left">
                            <h4 className="text-white font-black uppercase tracking-tight leading-none">포스트시즌 여정 종료</h4>
                            <p className="text-white/80 text-xs font-bold mt-1">플레이오프 결과를 복기하고 다음 시즌을 준비하세요.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-white font-black uppercase text-xs">
                        결과 확인 <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </div>
                </button>
            )}
        </div>
    );
};

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({ 
  team, nextGame, opponent, isHome, myOvr, opponentOvrValue, isGameToday, isSimulating, onSimClick, 
  onShowSeasonReview, onShowPlayoffReview, hasPlayoffHistory, currentSeries, currentSimDate
}) => {
  const homeTeam = isHome ? team : opponent;
  const awayTeam = isHome ? opponent : team;
  const homeOvr = isHome ? myOvr : opponentOvrValue;
  const awayOvr = isHome ? opponentOvrValue : myOvr;

  // Placeholder for rotation validation logic (usually passed or calculated from tactics)
  const isRotationValid = true; 

  const dDayDisplay = useMemo(() => {
      if (!nextGame || !currentSimDate) return null;
      if (nextGame.played) return null;
      
      const target = new Date(nextGame.date);
      const current = new Date(currentSimDate);
      
      // Reset hours for accurate day calc
      target.setHours(0,0,0,0);
      current.setHours(0,0,0,0);
      
      const diffTime = target.getTime() - current.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return null; // Game Day
      if (diffDays > 0) return `D-${diffDays}`;
      return null;
  }, [nextGame, currentSimDate]);

  return (
    <div className="w-full max-w-[1900px] bg-slate-900/80 border border-white/10 rounded-3xl shadow-2xl backdrop-blur-md overflow-hidden flex flex-col mb-6">
        <div className="px-8 py-8 border-b border-white/5 bg-white/5 flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-12 flex-1 justify-center lg:justify-start">
                {/* Team Logos Section */}
                <div className="flex items-center gap-6">
                    {awayTeam && (
                        <>
                            <img src={awayTeam.logo} className="w-16 h-16 object-contain" alt="" />
                            <div className="flex flex-col">
                                <span className="text-2xl font-black text-white oswald uppercase leading-none">{awayTeam.name}</span>
                                <span className="text-xs font-bold text-slate-500 mt-1">{awayTeam.wins}W - {awayTeam.losses}L</span>
                            </div>
                            <div className={getOvrBadgeStyle(awayOvr) + " !w-11 !h-11 !text-2xl"}>{awayOvr}</div>
                        </>
                    )}
                </div>
                
                {/* VS Center Display with Date */}
                <div className="flex flex-col items-center justify-center min-w-[100px]">
                    {nextGame && (
                        <div className="flex flex-col items-center mb-1.5 gap-1">
                            <span className="text-[10px] font-bold text-slate-500 tracking-wider">{nextGame.date}</span>
                            {dDayDisplay && <span className="text-[9px] font-black text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded uppercase tracking-tight">{dDayDisplay}</span>}
                        </div>
                    )}
                    <div className="text-3xl font-black text-slate-600 oswald leading-none">VS</div>
                </div>

                <div className="flex items-center gap-6">
                    {homeTeam && (
                        <>
                            <div className={getOvrBadgeStyle(homeOvr) + " !w-11 !h-11 !text-2xl"}>{homeOvr}</div>
                            <div className="flex flex-col items-end">
                                <span className="text-2xl font-black text-white oswald uppercase leading-none">{homeTeam.name}</span>
                                <span className="text-xs font-bold text-slate-500 mt-1">{homeTeam.wins}W - {homeTeam.losses}L</span>
                            </div>
                            <img src={homeTeam.logo} className="w-16 h-16 object-contain" alt="" />
                        </>
                    )}
                </div>
            </div>

            <div className="flex flex-col items-center gap-2">
                {!isRotationValid && isGameToday && (
                    <div className="flex items-center gap-2 text-red-500 animate-pulse mb-1">
                        <AlertTriangle size={14} />
                        <span className="text-[10px] font-black uppercase">로테이션 설정 오류 (인원수/시간)</span>
                    </div>
                )}
                <button 
                    onClick={onSimClick} 
                    disabled={isSimulating || (isGameToday && !isRotationValid)} 
                    className={`px-12 py-4 rounded-3xl font-black flex items-center justify-center gap-4 transition-all active:scale-95 min-w-[280px]
                        ${isGameToday 
                            ? (isRotationValid ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/40' : 'bg-slate-800 text-slate-500 cursor-not-allowed')
                            : 'bg-slate-700 hover:bg-blue-600'
                        }`}
                >
                    {isSimulating ? <Loader2 size={22} className="animate-spin" /> : <CalendarClock size={22} />}
                    <span className="text-xl oswald uppercase tracking-widest text-white">
                        {isSimulating ? '이동 중...' : (isGameToday ? '경기 시작' : '내일로 이동')}
                    </span>
                </button>
            </div>
        </div>
        
        {/* Playoff Series Info Sub-header if active */}
        {currentSeries && (
             <div className="px-8 py-3 bg-indigo-950/40 flex items-center justify-center gap-4 border-t border-indigo-500/10">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] oswald">Playoff Series Status</span>
                <div className="h-4 w-px bg-indigo-500/20"></div>
                <span className="text-sm font-black text-white">
                    {currentSeries.round === 0 ? "Play-In Tournament" : 
                     currentSeries.round === 4 ? "NBA Finals" : 
                     `Round ${currentSeries.round}`}
                </span>
                <div className="px-3 py-0.5 bg-indigo-600 rounded-full text-[11px] font-black text-white">
                    {currentSeries.higherSeedWins} - {currentSeries.lowerSeedWins}
                </div>
             </div>
        )}
    </div>
  );
};
