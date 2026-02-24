
import React, { useMemo } from 'react';
import { ArrowLeft, ArrowRightLeft, AlertTriangle, TrendingUp, Hash, Crown } from 'lucide-react';
import { Team, Transaction, Player } from '../types';
import { OvrBadge } from '../components/common/OvrBadge';
import { ReviewStatBox, ReviewOwnerMessage } from '../components/review/ReviewComponents';
import { TeamLogo } from '../components/common/TeamLogo';
import { generateSeasonReport } from '../services/reportGenerator';
import { calculatePlayerOvr } from '../utils/constants';

interface SeasonReviewViewProps {
  team: Team;
  teams: Team[];
  transactions?: Transaction[];
  onBack: () => void;
}

export const SeasonReviewView: React.FC<SeasonReviewViewProps> = ({ team, teams, transactions = [], onBack }) => {
  // Use Service to generate all display data
  const report = useMemo(() => generateSeasonReport(team, teams, transactions), [team, teams, transactions]);

  const { 
      confRank, leagueRank, winPct, winPctStr, mvp, 
      seasonTrades, teamStats, leagueRanks, 
      ownerMood, ownerName 
  } = report;

  // Helper to get player snapshot (OVR/POS) from current roster
  // (Note: Using current stats for snapshot simplicity)
  const getSnapshot = (id: string) => {
      for (const t of teams) {
          const p = t.roster.find(rp => rp.id === id);
          if (p) return { ovr: calculatePlayerOvr(p), pos: p.position };
      }
      return { ovr: 0, pos: '-' };
  };

  return (
    <div className="fixed inset-0 bg-slate-950 z-[150] overflow-y-auto animate-in fade-in duration-500 ko-normal pretendard pb-20">
      
      {/* Header */}
      <div className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-orange-500/30 px-8 py-4 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-4">
              <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors group">
                  <ArrowLeft size={24} className="text-slate-400 group-hover:text-white" />
              </button>
              <div className="h-8 w-[1px] bg-slate-800"></div>
              <h1 className="text-xl font-black uppercase tracking-widest text-white oswald drop-shadow-md">2025-26 Season Report</h1>
          </div>
          <div className="flex items-center gap-3">
              <TeamLogo teamId={team.id} size="md" />
              <span className="font-bold text-slate-400 uppercase text-sm tracking-wider hidden md:block">{team.city} {team.name}</span>
          </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 md:p-10 space-y-12">
          
          {/* Section 1: Merged Summary (Record, Rank, Status) */}
          <div className="animate-in slide-in-from-bottom-4 duration-700">
              <div className="flex items-center gap-3 border-b border-orange-500/20 pb-3 mb-6">
                  <h2 className="text-2xl font-black uppercase text-white tracking-tight">Final Standings</h2>
              </div>

              <div className="bg-gradient-to-br from-orange-950/30 to-slate-950 border border-orange-500/30 rounded-[2rem] shadow-[0_0_40px_rgba(234,88,12,0.1)] relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-orange-500/20 transition-colors duration-700"></div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-orange-500/20 relative z-10">
                      
                      {/* 1. Record */}
                      <div className="p-8 flex flex-col items-center justify-center gap-2">
                          <span className="text-xs font-black text-orange-400 uppercase tracking-[0.2em]">Record</span>
                          <div className="text-6xl font-black text-white oswald tracking-tighter">
                              {team.wins}<span className="text-slate-600 text-4xl">/</span>{team.losses}
                          </div>
                          <span className="px-3 py-1 bg-orange-500/20 rounded-full text-[10px] font-black text-orange-300 uppercase tracking-wider">
                              Win Pct: {winPctStr}
                          </span>
                      </div>

                      {/* 2. League Rank */}
                      <div className="p-8 flex flex-col items-center justify-center gap-4">
                           <span className="text-xs font-black text-orange-400 uppercase tracking-[0.2em] flex items-center gap-2">
                               <Hash size={14} /> League Rank
                           </span>
                           <div className="flex items-baseline gap-2">
                               <span className="text-5xl font-black text-white oswald">#{leagueRank}</span>
                               <span className="text-sm font-bold text-slate-500 uppercase">/ 30 Teams</span>
                           </div>
                           <div className="text-xs font-medium text-slate-400">
                               {team.conference} Conf: <span className="text-white font-bold">#{confRank}</span>
                           </div>
                      </div>

                      {/* 3. Performance Trend */}
                      <div className="p-8 flex flex-col items-center justify-center gap-4">
                           <span className="text-xs font-black text-orange-400 uppercase tracking-[0.2em] flex items-center gap-2">
                               <TrendingUp size={14} /> Status
                           </span>
                           {winPct >= 0.5 ? (
                               <div className="text-center">
                                   <div className="text-3xl font-black text-emerald-400 uppercase tracking-tight oswald mb-1">Playoff Bound</div>
                                   <p className="text-[10px] font-medium text-emerald-500/70">플레이오프 진출 확정</p>
                               </div>
                           ) : (
                               <div className="text-center">
                                    <div className="text-3xl font-black text-slate-400 uppercase tracking-tight oswald mb-1">Lottery Bound</div>
                                    <p className="text-[10px] font-medium text-slate-600">드래프트 로터리 참가</p>
                               </div>
                           )}
                      </div>
                  </div>
              </div>
          </div>

          {/* Section 2: Owner's Message (Reused Component) */}
          <div className="animate-in slide-in-from-bottom-4 duration-700 delay-100">
              <ReviewOwnerMessage 
                  ownerName={ownerName}
                  title={ownerMood.title}
                  msg={ownerMood.msg}
                  mood={ownerMood}
              />
          </div>

          {/* Section 3: Season Stats Grid (Reused Component) */}
          <div className="animate-in slide-in-from-bottom-4 duration-700 delay-200">
              <div className="flex items-center gap-3 border-b border-orange-500/20 pb-3 mb-6">
                  <h2 className="text-2xl font-black uppercase text-white tracking-tight">Season Stats</h2>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  <ReviewStatBox label="Points" value={leagueRanks.pts.value} rank={leagueRanks.pts.rank} />
                  <ReviewStatBox label="Rebounds" value={leagueRanks.reb.value} rank={leagueRanks.reb.rank} />
                  <ReviewStatBox label="Assists" value={leagueRanks.ast.value} rank={leagueRanks.ast.rank} />
                  <ReviewStatBox label="Steals" value={leagueRanks.stl.value} rank={leagueRanks.stl.rank} />
                  <ReviewStatBox label="Blocks" value={leagueRanks.blk.value} rank={leagueRanks.blk.rank} />
                  <ReviewStatBox label="Turnovers" value={leagueRanks.tov.value} rank={leagueRanks.tov.rank} inverse />
                  
                  <ReviewStatBox label="FG%" value={leagueRanks.fgPct.value} rank={leagueRanks.fgPct.rank} isPercent />
                  <ReviewStatBox label="3P%" value={leagueRanks.p3Pct.value} rank={leagueRanks.p3Pct.rank} isPercent />
                  <ReviewStatBox label="FT%" value={leagueRanks.ftPct.value} rank={leagueRanks.ftPct.rank} isPercent />
                  <ReviewStatBox label="True Shooting" value={leagueRanks.tsPct.value} rank={leagueRanks.tsPct.rank} isPercent />
              </div>
          </div>

          {/* Section 4: Team MVP */}
          <div className="animate-in slide-in-from-bottom-4 duration-700 delay-300">
              <div className="flex items-center gap-3 border-b border-orange-500/20 pb-3 mb-6">
                  <h2 className="text-2xl font-black uppercase text-white tracking-tight">Team MVP</h2>
              </div>

              {mvp ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col md:flex-row items-center gap-8 relative overflow-hidden">
                      <div className="absolute -left-10 top-0 w-64 h-full bg-gradient-to-r from-orange-500/10 to-transparent transform -skew-x-12"></div>
                      
                      <div className="relative z-10 flex flex-col items-center">
                           <div className="w-24 h-24 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center shadow-2xl mb-3">
                               <OvrBadge value={calculatePlayerOvr(mvp)} size="lg" className="!w-12 !h-12 !text-2xl" />
                           </div>
                           <div className="px-3 py-1 bg-amber-500/20 border border-amber-500/50 rounded-full flex items-center gap-2">
                               <Crown size={12} className="text-amber-400 fill-amber-400" />
                               <span className="text-[10px] font-black text-amber-300 uppercase tracking-wider">Most Valuable</span>
                           </div>
                      </div>

                      <div className="flex-1 text-center md:text-left">
                          <h3 className="text-3xl font-black text-white uppercase tracking-tight">{mvp.name}</h3>
                          <p className="text-sm text-slate-400 font-bold uppercase tracking-widest mt-1">{mvp.position} | {mvp.age} years old</p>
                          
                          <div className="flex flex-wrap justify-center md:justify-start gap-4 mt-6">
                              <div className="text-center">
                                  <div className="text-2xl font-black text-white oswald">{(mvp.stats.pts / (mvp.stats.g || 1)).toFixed(1)}</div>
                                  <div className="text-[10px] font-bold text-slate-500 uppercase">PTS</div>
                              </div>
                              <div className="w-[1px] h-8 bg-slate-800 self-center"></div>
                              <div className="text-center">
                                  <div className="text-2xl font-black text-white oswald">{(mvp.stats.reb / (mvp.stats.g || 1)).toFixed(1)}</div>
                                  <div className="text-[10px] font-bold text-slate-500 uppercase">REB</div>
                              </div>
                              <div className="w-[1px] h-8 bg-slate-800 self-center"></div>
                              <div className="text-center">
                                  <div className="text-2xl font-black text-white oswald">{(mvp.stats.ast / (mvp.stats.g || 1)).toFixed(1)}</div>
                                  <div className="text-[10px] font-bold text-slate-500 uppercase">AST</div>
                              </div>
                          </div>
                      </div>
                  </div>
              ) : (
                  <div className="p-8 text-center text-slate-500 bg-slate-900 rounded-2xl border border-slate-800">
                      데이터가 부족하여 MVP를 선정할 수 없습니다.
                  </div>
              )}
          </div>

          {/* Section 5: Trade Log */}
          {seasonTrades.length > 0 && (
              <div className="animate-in slide-in-from-bottom-4 duration-700 delay-400">
                  <div className="flex items-center gap-3 border-b border-orange-500/20 pb-3 mb-6">
                      <ArrowRightLeft className="text-indigo-400" size={24} />
                      <h2 className="text-2xl font-black uppercase text-white tracking-tight">Trade History</h2>
                  </div>

                  <div className="space-y-4">
                      {seasonTrades.map(t => {
                          const partnerName = t.details?.partnerTeamName || "Unknown";
                          const partnerId = t.details?.partnerTeamId || "";
                          return (
                              <div key={t.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row gap-6 items-center">
                                  <div className="flex items-center gap-4 min-w-[200px]">
                                      <div className="text-xs font-bold text-slate-500">{t.date}</div>
                                      <div className="h-4 w-[1px] bg-slate-800"></div>
                                      <div className="flex items-center gap-2">
                                          <TeamLogo teamId={partnerId} size="custom" className="w-6 h-6 object-contain opacity-70" />
                                          <span className="text-sm font-black text-white uppercase">{partnerName}</span>
                                      </div>
                                  </div>
                                  
                                  <div className="flex-1 grid grid-cols-2 gap-4 w-full">
                                      <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800/50">
                                          <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2">Acquired</div>
                                          <div className="space-y-1">
                                              {t.details?.acquired.map((p, i) => (
                                                  <div key={i} className="flex items-center justify-between">
                                                      <span className="text-xs font-bold text-white">{p.name}</span>
                                                      <OvrBadge value={getSnapshot(p.id).ovr} size="sm" className="!w-5 !h-5 !text-[10px] !mx-0" />
                                                  </div>
                                              ))}
                                          </div>
                                      </div>
                                      <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800/50">
                                          <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-2">Departed</div>
                                          <div className="space-y-1">
                                              {t.details?.traded.map((p, i) => (
                                                  <div key={i} className="flex items-center justify-between">
                                                      <span className="text-xs font-bold text-slate-400">{p.name}</span>
                                                      <OvrBadge value={getSnapshot(p.id).ovr} size="sm" className="!w-5 !h-5 !text-[10px] !mx-0 grayscale opacity-50" />
                                                  </div>
                                              ))}
                                          </div>
                                      </div>
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              </div>
          )}

          {/* Section 6: Alerts/Notes (If any) */}
          {winPct < 0.4 && (
              <div className="p-4 bg-red-950/20 border border-red-900/30 rounded-xl flex items-start gap-3 animate-in fade-in">
                  <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
                  <div>
                      <h4 className="text-sm font-bold text-red-400 uppercase tracking-wide mb-1">Performance Alert</h4>
                      <p className="text-xs text-red-300/70 leading-relaxed">
                          팀 성적이 저조합니다. 오프시즌 동안 드래프트와 FA 영입을 통해 로스터를 재정비해야 합니다. 
                          현재 샐러리 캡 상황을 고려하여 고연봉 저효율 선수를 정리하는 것을 추천합니다.
                      </p>
                  </div>
              </div>
          )}

      </div>
    </div>
  );
};
