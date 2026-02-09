
import React, { useMemo } from 'react';
import { ArrowLeft, Users, Crown, TrendingUp, AlertTriangle, Hash, ArrowRightLeft } from 'lucide-react';
import { Team, Transaction, Player } from '../types';
import { OvrBadge } from '../components/common/OvrBadge';
import { getTeamLogoUrl } from '../utils/constants';
import { TEAM_DATA } from '../data/teamData';
import { ReviewStatBox, ReviewOwnerMessage } from '../components/review/ReviewComponents';

interface SeasonReviewViewProps {
  team: Team;
  teams: Team[];
  transactions?: Transaction[];
  onBack: () => void;
}

export const SeasonReviewView: React.FC<SeasonReviewViewProps> = ({ team, teams, transactions = [], onBack }) => {
  // 1. Calculate Ranks & Basic Info
  const confTeams = teams.filter(t => t.conference === team.conference).sort((a, b) => b.wins - a.wins);
  const confRank = confTeams.findIndex(t => t.id === team.id) + 1;
  const leagueRank = [...teams].sort((a, b) => b.wins - a.wins).findIndex(t => t.id === team.id) + 1;
  const totalGames = team.wins + team.losses || 82;
  const winPct = team.wins / totalGames;
  const winPctStr = winPct.toFixed(3).replace(/^0/, ''); 

  // 2. Identify Team MVP
  const sortedByPts = [...team.roster].sort((a, b) => {
      const pA = a.stats.g > 0 ? a.stats.pts / a.stats.g : 0;
      const pB = b.stats.g > 0 ? b.stats.pts / b.stats.g : 0;
      return pB - pA;
  });
  const mvp = sortedByPts[0];

  // 3. Filter Season Trades (Safe Filter)
  const seasonTrades = useMemo(() => {
      if (!transactions || !Array.isArray(transactions)) return [];
      return transactions
        .filter(t => t && t.teamId === team.id && t.type === 'Trade')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, team.id]);

  // Helper to get player snapshot (OVR/POS) from transaction history or current roster
  const getSnapshot = (id: string, savedOvr?: number, savedPos?: string) => {
      if (savedOvr !== undefined && savedPos) return { ovr: savedOvr, pos: savedPos };
      for (const t of teams) {
          const p = t.roster.find(rp => rp.id === id);
          if (p) return { ovr: p.ovr, pos: p.position };
      }
      return { ovr: 0, pos: '-' };
  };

  // 4. Advanced Team Stats & League Ranking Logic
  const getTeamAggregates = (t: Team) => {
      const g = t.wins + t.losses || 1;
      const totals = t.roster.reduce((acc, p) => ({
          pts: acc.pts + p.stats.pts,
          reb: acc.reb + p.stats.reb,
          ast: acc.ast + p.stats.ast,
          stl: acc.stl + p.stats.stl,
          blk: acc.blk + p.stats.blk,
          tov: acc.tov + p.stats.tov,
          fgm: acc.fgm + p.stats.fgm,
          fga: acc.fga + p.stats.fga,
          p3m: acc.p3m + p.stats.p3m,
          p3a: acc.p3a + p.stats.p3a,
          ftm: acc.ftm + p.stats.ftm,
          fta: acc.fta + p.stats.fta,
      }), { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0 });

      const tsa = totals.fga + 0.44 * totals.fta;
      
      return {
          id: t.id,
          pts: totals.pts / g,
          reb: totals.reb / g,
          ast: totals.ast / g,
          stl: totals.stl / g,
          blk: totals.blk / g,
          tov: totals.tov / g,
          fgPct: totals.fga > 0 ? totals.fgm / totals.fga : 0,
          p3Pct: totals.p3a > 0 ? totals.p3m / totals.p3a : 0,
          ftPct: totals.fta > 0 ? totals.ftm / totals.fta : 0,
          tsPct: tsa > 0 ? totals.pts / (2 * tsa) : 0,
      };
  };

  const allTeamStats = useMemo(() => teams.map(getTeamAggregates), [teams]);
  const myTeamStats = allTeamStats.find(s => s.id === team.id)!;

  const getLeagueRank = (key: keyof typeof myTeamStats, asc: boolean = false) => {
      const sorted = [...allTeamStats].sort((a, b) => {
          const valA = a[key] as number;
          const valB = b[key] as number;
          return asc ? valA - valB : valB - valA;
      });
      return sorted.findIndex(s => s.id === team.id) + 1;
  };

  // 5. Determine Owner's Message
  let ownerMood = { 
      title: "만족스러운 시즌", 
      msg: "수고 많았습니다, 단장. 우리 팀의 성과는 기대 이상이었습니다. 다음 시즌엔 우승을 노려봅시다.", 
      color: "text-emerald-400", 
      borderColor: "border-emerald-500/50",
      bg: "bg-emerald-500/5" 
  };
  
  if (winPct >= 0.65) {
      ownerMood = { 
          title: "압도적인 성과", 
          msg: "환상적입니다! 리그 최고의 팀을 만들었군요. 팬들과 보드진 모두 당신을 찬양하고 있습니다. 내년에도 이 기세를 이어가야 합니다.", 
          color: "text-amber-400", 
          borderColor: "border-amber-500/50",
          bg: "bg-amber-500/5"
      };
  } else if (winPct >= 0.5) {
      ownerMood = { 
          title: "준수한 시즌", 
          msg: "플레이오프 경쟁력을 입증했습니다. 하지만 진정한 컨텐더가 되기 위해선 한 단계 더 도약해야 합니다. 오프시즌 보강에 힘써주세요.", 
          color: "text-blue-400", 
          borderColor: "border-blue-500/50",
          bg: "bg-blue-500/5"
      };
  } else if (winPct >= 0.35) {
      ownerMood = { 
          title: "실망스러운 결과", 
          msg: "솔직히 말해 기대 이하입니다. 리빌딩 과정이라 믿고 싶지만, 팬들의 인내심이 바닥나고 있습니다. 변화가 필요합니다.", 
          color: "text-orange-400", 
          borderColor: "border-orange-500/50",
          bg: "bg-orange-500/5"
      };
  } else {
      ownerMood = { 
          title: "최악의 시즌", 
          msg: "이런 성적을 위해 당신을 고용한 게 아닙니다. 당장 획기적인 변화가 없다면, 내년엔 이 자리에 없을 겁니다. 각오하십시오.", 
          color: "text-red-500", 
          borderColor: "border-red-500/50",
          bg: "bg-red-500/5"
      };
  }

  const ownerName = TEAM_DATA[team.id]?.owner || "The Ownership Group";

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
              <img src={team.logo} className="w-8 h-8 object-contain" alt="" />
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
                  <ReviewStatBox label="Points" value={myTeamStats.pts} rank={getLeagueRank('pts')} />
                  <ReviewStatBox label="Rebounds" value={myTeamStats.reb} rank={getLeagueRank('reb')} />
                  <ReviewStatBox label="Assists" value={myTeamStats.ast} rank={getLeagueRank('ast')} />
                  <ReviewStatBox label="Steals" value={myTeamStats.stl} rank={getLeagueRank('stl')} />
                  <ReviewStatBox label="Blocks" value={myTeamStats.blk} rank={getLeagueRank('blk')} />
                  <ReviewStatBox label="Turnovers" value={myTeamStats.tov} rank={getLeagueRank('tov', true)} inverse />
                  
                  <ReviewStatBox label="FG%" value={myTeamStats.fgPct} rank={getLeagueRank('fgPct')} isPercent />
                  <ReviewStatBox label="3P%" value={myTeamStats.p3Pct} rank={getLeagueRank('p3Pct')} isPercent />
                  <ReviewStatBox label="FT%" value={myTeamStats.ftPct} rank={getLeagueRank('ftPct')} isPercent />
                  <ReviewStatBox label="True Shooting" value={myTeamStats.tsPct} rank={getLeagueRank('tsPct')} isPercent />
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
                               <OvrBadge value={mvp.ovr} size="lg" className="!w-12 !h-12 !text-2xl" />
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
                                          <img src={getTeamLogoUrl(partnerId)} className="w-6 h-6 object-contain opacity-70" alt="" />
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
                                                      <OvrBadge value={getSnapshot(p.id, p.ovr, p.position).ovr} size="sm" className="!w-5 !h-5 !text-[10px] !mx-0" />
                                                  </div>
                                              ))}
                                          </div>
                                      </div>
                                      <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800/50">
                                          <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-2">Departed</div>
                                          <div className="space-y-1">
                                              {t.details?.traded.map((p, i) => (
                                                  <div key={i} className="flex items-center justify-between">
                                                      <span className="text-xs font-bold text-slate-400">{p.name}</span>
                                                      <OvrBadge value={getSnapshot(p.id, p.ovr, p.position).ovr} size="sm" className="!w-5 !h-5 !text-[10px] !mx-0 grayscale opacity-50" />
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
