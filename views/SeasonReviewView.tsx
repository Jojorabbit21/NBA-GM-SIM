
import React, { useMemo } from 'react';
import { 
  Trophy, ArrowLeft, Activity, Users, Crown, Quote, BarChart3, TrendingUp, AlertTriangle, Hash, ArrowRightLeft, History
} from 'lucide-react';
import { Team, Player, Transaction } from '../types';
import { getOvrBadgeStyle } from '../components/SharedComponents';
import { getTeamLogoUrl } from '../utils/constants';

interface SeasonReviewViewProps {
  team: Team;
  teams: Team[];
  transactions?: Transaction[]; // Optional로 변경하여 안전성 확보
  onBack: () => void;
}

export const SeasonReviewView: React.FC<SeasonReviewViewProps> = ({ team, teams, transactions = [], onBack }) => {
  // 1. Calculate Ranks & Basic Info
  const confTeams = teams.filter(t => t.conference === team.conference).sort((a, b) => b.wins - a.wins);
  const confRank = confTeams.findIndex(t => t.id === team.id) + 1;
  const leagueRank = [...teams].sort((a, b) => b.wins - a.wins).findIndex(t => t.id === team.id) + 1;
  const totalGames = team.wins + team.losses || 82;
  const winPct = team.wins / totalGames;
  const winPctStr = winPct.toFixed(3).replace(/^0/, ''); // .000 format

  // 2. Identify Team MVP
  const sortedByPts = [...team.roster].sort((a, b) => {
      const pA = a.stats.g > 0 ? a.stats.pts / a.stats.g : 0;
      const pB = b.stats.g > 0 ? b.stats.pts / b.stats.g : 0;
      return pB - pA;
  });
  const mvp = sortedByPts[0];

  // 3. Filter Season Trades (Safe Filter)
  // transactions가 undefined일 경우 빈 배열로 처리, filter 내부에서도 null check
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

  // Stat Item Component
  const StatBox = ({ label, value, rank, isPercent = false, inverse = false }: { label: string, value: number, rank: number, isPercent?: boolean, inverse?: boolean }) => {
      let rankColor = 'text-slate-500';
      if (rank <= 5) rankColor = 'text-amber-400'; // Elite
      else if (rank <= 10) rankColor = 'text-emerald-400'; // Good
      else if (rank >= 25) rankColor = 'text-red-400'; // Bad

      return (
          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden group hover:border-orange-500/50 transition-colors">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 z-10">{label}</span>
              <div className="flex items-baseline gap-2 z-10">
                  <span className="text-2xl font-black oswald text-white">
                      {isPercent ? (value * 100).toFixed(1) + '%' : value.toFixed(1)}
                  </span>
              </div>
              <div className={`text-[10px] font-bold uppercase tracking-tight bg-slate-950/50 px-2 py-0.5 rounded mt-1 ${rankColor}`}>
                  #{rank} in League
              </div>
              {rank <= 5 && <div className="absolute top-0 right-0 w-8 h-8 bg-amber-500/10 blur-xl rounded-full"></div>}
          </div>
      );
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
                  <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 rounded-full blur-[100px] pointer-events-none group-hover:bg-orange-500/20 transition-colors duration-700"></div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-orange-500/20 relative z-10">
                      
                      {/* 1. Record */}
                      <div className="p-8 flex flex-col items-center justify-center">
                          <span className="text-[10px] font-black text-orange-400/80 uppercase tracking-[0.2em] mb-2">Regular Season</span>
                          <div className="text-7xl font-black text-white oswald tracking-tight">
                              {team.wins}-{team.losses}
                          </div>
                          <div className="mt-1 text-sm font-black text-orange-400 font-mono tracking-widest">
                              {winPctStr}
                          </div>
                      </div>

                      {/* 2. Ranking */}
                      <div className="p-8 flex flex-col items-center justify-center">
                          <span className="text-[10px] font-black text-orange-400/80 uppercase tracking-[0.2em] mb-2">{team.conference}ern Conf.</span>
                          <div className="text-7xl font-black text-white oswald tracking-tight">
                              #{confRank}
                          </div>
                          <div className="mt-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                              League Rank: #{leagueRank}
                          </div>
                      </div>

                      {/* 3. Status */}
                      <div className="p-8 flex flex-col items-center justify-center">
                          <span className="text-[10px] font-black text-orange-400/80 uppercase tracking-[0.2em] mb-2">Final Status</span>
                          <div className={`text-5xl font-black oswald uppercase tracking-tight ${confRank <= 6 ? 'text-emerald-400' : confRank <= 10 ? 'text-amber-400' : 'text-red-400'}`}>
                              {confRank <= 6 ? "Playoffs" : confRank <= 10 ? "Play-In" : "Eliminated"}
                          </div>
                          <div className={`mt-3 px-3 py-1 text-[10px] font-black uppercase rounded-lg tracking-widest ${confRank <= 6 ? 'bg-emerald-900/30 text-emerald-300' : confRank <= 10 ? 'bg-amber-900/30 text-amber-300' : 'bg-red-900/30 text-red-300'}`}>
                              {confRank <= 6 ? "Clinched Seed" : confRank <= 10 ? "Qualified" : "Lottery Pick"}
                          </div>
                      </div>

                  </div>
              </div>
          </div>

          {/* Section 2: Advanced Team Stats */}
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700 delay-100">
              <div className="flex items-center gap-3 border-b border-orange-500/20 pb-3">
                  <BarChart3 className="text-orange-500" size={24} />
                  <h2 className="text-2xl font-black uppercase text-white tracking-tight">Team Performance & League Rank</h2>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <StatBox label="Points" value={myTeamStats.pts} rank={getLeagueRank('pts')} />
                  <StatBox label="Rebounds" value={myTeamStats.reb} rank={getLeagueRank('reb')} />
                  <StatBox label="Assists" value={myTeamStats.ast} rank={getLeagueRank('ast')} />
                  <StatBox label="Steals" value={myTeamStats.stl} rank={getLeagueRank('stl')} />
                  <StatBox label="Blocks" value={myTeamStats.blk} rank={getLeagueRank('blk')} />
                  
                  <StatBox label="Turnovers" value={myTeamStats.tov} rank={getLeagueRank('tov', true)} inverse />
                  <StatBox label="FG%" value={myTeamStats.fgPct} rank={getLeagueRank('fgPct')} isPercent />
                  <StatBox label="3P%" value={myTeamStats.p3Pct} rank={getLeagueRank('p3Pct')} isPercent />
                  <StatBox label="FT%" value={myTeamStats.ftPct} rank={getLeagueRank('ftPct')} isPercent />
                  <StatBox label="True Shooting" value={myTeamStats.tsPct} rank={getLeagueRank('tsPct')} isPercent />
              </div>
          </div>

          {/* Section 3: Season Trade Log (Safe Table Render) */}
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700 delay-200">
              <div className="flex items-center gap-3 border-b border-orange-500/20 pb-3">
                  <ArrowRightLeft className="text-orange-500" size={24} />
                  <h2 className="text-2xl font-black uppercase text-white tracking-tight">Season Transactions</h2>
              </div>

              <div className="bg-slate-900 border border-orange-500/20 rounded-2xl overflow-hidden shadow-xl">
                  <div className="overflow-x-auto custom-scrollbar">
                      {seasonTrades.length === 0 ? (
                          <div className="p-12 flex flex-col items-center justify-center text-slate-500 gap-3">
                              <History size={32} className="opacity-50" />
                              <span className="font-bold text-sm">이번 시즌 진행된 트레이드가 없습니다.</span>
                          </div>
                      ) : (
                          <table className="w-full text-left border-collapse">
                              <thead>
                                  <tr className="border-b border-slate-800 text-[10px] font-black text-orange-400 uppercase tracking-widest bg-orange-950/20">
                                      <th className="py-4 px-6 w-32">Date</th>
                                      <th className="py-4 px-6 w-48">Partner Team</th>
                                      <th className="py-4 px-6">Acquired (IN)</th>
                                      <th className="py-4 px-6">Departed (OUT)</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/50">
                                  {seasonTrades.map(t => (
                                      <tr key={t.id} className="hover:bg-white/5 transition-colors">
                                          <td className="py-4 px-6 align-middle">
                                              <div className="text-xs font-bold text-slate-400">{t.date}</div>
                                          </td>
                                          <td className="py-4 px-6 align-middle">
                                              {t.details?.partnerTeamName ? (
                                                  <div className="flex items-center gap-3">
                                                      <img src={getTeamLogoUrl(t.details.partnerTeamId || '')} className="w-8 h-8 object-contain opacity-90" alt="" />
                                                      <span className="text-sm font-black text-white uppercase">{t.details.partnerTeamName}</span>
                                                  </div>
                                              ) : (
                                                  <span className="text-sm font-bold text-slate-500">-</span>
                                              )}
                                          </td>
                                          <td className="py-4 px-6 align-middle">
                                              <div className="flex flex-col gap-2">
                                                  {(t.details?.acquired || []).map((p, i) => {
                                                      const snap = getSnapshot(p.id, p.ovr, p.position);
                                                      return (
                                                          <div key={i} className="flex items-center gap-3">
                                                              <div className={`${getOvrBadgeStyle(snap.ovr || 70)} !w-6 !h-6 !text-xs !mx-0`}>{snap.ovr || '-'}</div>
                                                              <span className="text-sm font-bold text-emerald-300">{p.name}</span>
                                                              <span className="text-[10px] font-black text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">{snap.pos || '?'}</span>
                                                          </div>
                                                      );
                                                  })}
                                                  {(!t.details?.acquired || t.details.acquired.length === 0) && <span className="text-xs text-slate-600">- None -</span>}
                                              </div>
                                          </td>
                                          <td className="py-4 px-6 align-middle">
                                              <div className="flex flex-col gap-2">
                                                  {(t.details?.traded || []).map((p, i) => {
                                                      const snap = getSnapshot(p.id, p.ovr, p.position);
                                                      return (
                                                          <div key={i} className="flex items-center gap-3">
                                                              <div className={`${getOvrBadgeStyle(snap.ovr || 70)} !w-6 !h-6 !text-xs !mx-0`}>{snap.ovr || '-'}</div>
                                                              <span className="text-sm font-bold text-red-300/80">{p.name}</span>
                                                              <span className="text-[10px] font-black text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">{snap.pos || '?'}</span>
                                                          </div>
                                                      );
                                                  })}
                                                  {(!t.details?.traded || t.details.traded.length === 0) && <span className="text-xs text-slate-600">- None -</span>}
                                              </div>
                                          </td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      )}
                  </div>
              </div>
          </div>

          {/* Section 4: Roster Statistics Table */}
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700 delay-250">
              <div className="flex items-center justify-between border-b border-orange-500/20 pb-3">
                  <div className="flex items-center gap-3">
                      <Users className="text-orange-500" size={24} />
                      <h2 className="text-2xl font-black uppercase text-white tracking-tight">Player Statistics</h2>
                  </div>
              </div>

              <div className="bg-slate-900 border border-orange-500/20 rounded-2xl overflow-hidden shadow-xl">
                  <div className="overflow-x-auto custom-scrollbar">
                      <table className="w-full text-left border-collapse whitespace-nowrap">
                          <thead className="bg-slate-950/80 backdrop-blur-sm sticky top-0 z-20">
                              <tr className="text-[10px] font-black text-orange-400 uppercase tracking-widest border-b border-slate-800">
                                  <th className="py-4 px-6 text-left sticky left-0 bg-slate-950 z-20 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.5)]">Player</th>
                                  <th className="py-4 px-2 text-right min-w-[40px]">G</th>
                                  <th className="py-4 px-2 text-right min-w-[40px]">GS</th>
                                  <th className="py-4 px-2 text-right min-w-[40px]">MP</th>
                                  <th className="py-4 px-2 text-right min-w-[40px]">PTS</th>
                                  <th className="py-4 px-2 text-right min-w-[40px]">REB</th>
                                  <th className="py-4 px-2 text-right min-w-[40px]">AST</th>
                                  <th className="py-4 px-2 text-right min-w-[40px]">STL</th>
                                  <th className="py-4 px-2 text-right min-w-[40px]">BLK</th>
                                  <th className="py-4 px-2 text-right min-w-[40px]">TOV</th>
                                  <th className="py-4 px-2 text-right min-w-[40px]">3PM</th>
                                  <th className="py-4 px-2 text-right min-w-[40px]">3PA</th>
                                  <th className="py-4 px-2 text-right min-w-[50px]">3P%</th>
                                  <th className="py-4 px-2 text-right min-w-[40px]">FGM</th>
                                  <th className="py-4 px-2 text-right min-w-[40px]">FGA</th>
                                  <th className="py-4 px-2 text-right min-w-[50px]">FG%</th>
                                  <th className="py-4 px-2 text-right min-w-[40px]">FTM</th>
                                  <th className="py-4 px-2 text-right min-w-[40px]">FTA</th>
                                  <th className="py-4 px-2 text-right min-w-[50px]">FT%</th>
                                  <th className="py-4 px-6 text-right min-w-[60px]">TS%</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/50">
                              {sortedByPts.map(p => {
                                  const g = p.stats.g || 1;
                                  const isMvp = p.id === mvp?.id;
                                  const tsa = p.stats.fga + 0.44 * p.stats.fta;
                                  const tsPct = tsa > 0 ? (p.stats.pts / (2 * tsa)) * 100 : 0;
                                  const statClass = "py-3 px-2 text-right text-sm font-medium text-white tabular-nums";

                                  return (
                                      <tr key={p.id} className={`group hover:bg-white/5 transition-colors ${isMvp ? 'bg-amber-900/10' : ''}`}>
                                          <td className="py-3 px-6 sticky left-0 bg-slate-900 group-hover:bg-slate-800 transition-colors z-10 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.5)]">
                                              <div className="flex items-center gap-3">
                                                  <div className={getOvrBadgeStyle(p.ovr) + " !w-8 !h-8 !text-xs !mx-0 flex-shrink-0"}>{p.ovr}</div>
                                                  <div>
                                                      <div className="flex items-center gap-1.5">
                                                          <span className={`font-bold text-sm ${isMvp ? 'text-amber-100' : 'text-slate-200'} group-hover:text-white`}>{p.name}</span>
                                                          {isMvp && <Crown size={12} className="text-amber-400 fill-amber-400 flex-shrink-0" />}
                                                      </div>
                                                      <div className="text-[10px] font-black text-slate-500">{p.position}</div>
                                                  </div>
                                              </div>
                                          </td>
                                          <td className={statClass}>{p.stats.g}</td>
                                          <td className={statClass}>{p.stats.gs}</td>
                                          <td className={statClass}>{(p.stats.mp/g).toFixed(1)}</td>
                                          <td className={statClass}>{(p.stats.pts/g).toFixed(1)}</td>
                                          <td className={statClass}>{(p.stats.reb/g).toFixed(1)}</td>
                                          <td className={statClass}>{(p.stats.ast/g).toFixed(1)}</td>
                                          <td className={statClass}>{(p.stats.stl/g).toFixed(1)}</td>
                                          <td className={statClass}>{(p.stats.blk/g).toFixed(1)}</td>
                                          <td className={statClass}>{(p.stats.tov/g).toFixed(1)}</td>
                                          
                                          <td className={statClass}>{(p.stats.p3m/g).toFixed(1)}</td>
                                          <td className={statClass}>{(p.stats.p3a/g).toFixed(1)}</td>
                                          <td className={statClass}>{p.stats.p3a > 0 ? ((p.stats.p3m/p.stats.p3a)*100).toFixed(1) : '0.0'}%</td>
                                          
                                          <td className={statClass}>{(p.stats.fgm/g).toFixed(1)}</td>
                                          <td className={statClass}>{(p.stats.fga/g).toFixed(1)}</td>
                                          <td className={statClass}>{p.stats.fga > 0 ? ((p.stats.fgm/p.stats.fga)*100).toFixed(1) : '0.0'}%</td>
                                          
                                          <td className={statClass}>{(p.stats.ftm/g).toFixed(1)}</td>
                                          <td className={statClass}>{(p.stats.fta/g).toFixed(1)}</td>
                                          <td className={statClass}>{p.stats.fta > 0 ? ((p.stats.ftm/p.stats.fta)*100).toFixed(1) : '0.0'}%</td>
                                          
                                          <td className={`${statClass} pr-6`}>{tsPct.toFixed(1)}%</td>
                                      </tr>
                                  );
                              })}
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>

          {/* Section 5: Owner's Message */}
          <div className="animate-in slide-in-from-bottom-4 duration-700 delay-300 pb-8">
              <div className={`relative p-8 rounded-3xl border ${ownerMood.borderColor} ${ownerMood.bg} flex flex-col md:flex-row gap-8 items-start shadow-xl`}>
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-current to-transparent opacity-20" style={{ color: ownerMood.color.replace('text-', '') }}></div>
                  
                  <div className="flex-shrink-0">
                      <div className="w-16 h-16 bg-slate-900 rounded-2xl border border-slate-700 flex items-center justify-center shadow-lg">
                          <Quote size={32} className={ownerMood.color} />
                      </div>
                  </div>
                  
                  <div className="space-y-4 flex-1">
                      <div>
                          <h4 className={`text-xs font-black uppercase tracking-[0.2em] mb-1 ${ownerMood.color}`}>From the Desk of the Owner</h4>
                          <h3 className="text-2xl font-black text-white">{ownerMood.title}</h3>
                      </div>
                      <div className="relative">
                          <p className="text-slate-300 leading-relaxed font-medium text-lg relative z-10">"{ownerMood.msg}"</p>
                      </div>
                      <div className="pt-4 flex justify-end">
                          <div className="text-right">
                              <div className="h-px w-32 bg-slate-700 mb-2 ml-auto"></div>
                              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Authorized Signature</p>
                          </div>
                      </div>
                  </div>
              </div>
          </div>

      </div>
    </div>
  );
};
