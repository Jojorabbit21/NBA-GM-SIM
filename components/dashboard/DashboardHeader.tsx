
import React, { useMemo } from 'react';
import { Trophy, CalendarClock, AlertTriangle, ArrowRight } from 'lucide-react';
import { Team, Game, PlayoffSeries } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
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
  onShowSeasonReview: () => void;
  onShowPlayoffReview: () => void;
  hasPlayoffHistory: boolean;
  currentSeries?: PlayoffSeries;
  currentSimDate?: string;
}

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
  currentSeries, currentSimDate
}) => {
  const homeTeam = isHome ? team : opponent;
  const awayTeam = isHome ? opponent : team;
  const homeOvr = isHome ? myOvr : opponentOvrValue;
  const awayOvr = isHome ? opponentOvrValue : myOvr;

  const isRotationValid = true; // Placeholder logic

  const dDayDisplay = useMemo(() => {
      if (!nextGame || !currentSimDate) return null;
      if (nextGame.played) return null;
      
      const target = new Date(nextGame.date);
      const current = new Date(currentSimDate);
      target.setHours(0,0,0,0);
      current.setHours(0,0,0,0);
      
      const diffTime = target.getTime() - current.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return null;
      if (diffDays > 0) return `D-${diffDays}`;
      return null;
  }, [nextGame, currentSimDate]);

  return (
    <Card variant="glass" padding="none" className="w-full max-w-[1900px] mb-6">
        <div className="px-8 py-8 border-b border-white/5 bg-white/5 flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-12 flex-1 justify-center lg:justify-start">
                {/* Team Logos Section */}
                <div className="flex items-center gap-6">
                    {awayTeam && (
                        <>
                            <TeamLogo teamId={awayTeam.id} size="xl" />
                            <div className="flex flex-col">
                                <span className="text-2xl font-black text-white oswald uppercase leading-none">{awayTeam.name}</span>
                                <span className="text-xs font-bold text-slate-500 mt-1">{awayTeam.wins}W - {awayTeam.losses}L</span>
                            </div>
                            <OvrBadge value={awayOvr} size="lg" className="!text-2xl" />
                        </>
                    )}
                </div>
                
                {/* VS Center Display */}
                <div className="flex flex-col items-center justify-center min-w-[100px]">
                    {nextGame && (
                        <div className="flex flex-col items-center mb-1.5 gap-1">
                            <span className="text-[10px] font-bold text-slate-500 tracking-wider">{nextGame.date}</span>
                            {dDayDisplay && <Badge variant="brand" size="sm">{dDayDisplay}</Badge>}
                        </div>
                    )}
                    <div className="text-3xl font-black text-slate-600 oswald leading-none">VS</div>
                </div>

                <div className="flex items-center gap-6">
                    {homeTeam && (
                        <>
                            <OvrBadge value={homeOvr} size="lg" className="!text-2xl" />
                            <div className="flex flex-col items-end">
                                <span className="text-2xl font-black text-white oswald uppercase leading-none">{homeTeam.name}</span>
                                <span className="text-xs font-bold text-slate-500 mt-1">{homeTeam.wins}W - {homeTeam.losses}L</span>
                            </div>
                            <TeamLogo teamId={homeTeam.id} size="xl" />
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
                <Button 
                    onClick={onSimClick} 
                    disabled={isSimulating || (isGameToday && !isRotationValid)} 
                    variant={isGameToday ? (isRotationValid ? 'brand' : 'secondary') : 'secondary'}
                    size="lg"
                    isLoading={isSimulating}
                    loadingText="이동 중..."
                    icon={!isSimulating && <CalendarClock size={20} />}
                    className="min-w-[280px]"
                >
                    {isGameToday ? '경기 시작' : '내일로 이동'}
                </Button>
            </div>
        </div>
        
        {/* Playoff Info */}
        {currentSeries && (
             <div className="px-8 py-3 bg-indigo-950/40 flex items-center justify-center gap-4 border-t border-indigo-500/10">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] oswald">Playoff Series Status</span>
                <div className="h-4 w-px bg-indigo-500/20"></div>
                <span className="text-sm font-black text-white">
                    {currentSeries.round === 0 ? "Play-In Tournament" : 
                     currentSeries.round === 4 ? "NBA Finals" : 
                     `Round ${currentSeries.round}`}
                </span>
                <Badge variant="brand">{currentSeries.higherSeedWins} - {currentSeries.lowerSeedWins}</Badge>
             </div>
        )}
    </Card>
  );
};
