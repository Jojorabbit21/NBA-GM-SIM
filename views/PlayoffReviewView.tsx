
import React, { useMemo } from 'react';
import { Trophy, ArrowLeft, CalendarDays, BarChart3, Users, Crown, Medal, Star, Activity } from 'lucide-react';
import { Team, PlayoffSeries, Game } from '../types';
import { getOvrBadgeStyle } from '../components/SharedComponents';
import { ReviewStatBox, ReviewOwnerMessage } from '../components/review/ReviewComponents';

interface PlayoffReviewViewProps {
  team: Team;
  teams: Team[];
  playoffSeries: PlayoffSeries[];
  schedule: Game[]; // Added schedule to show game logs
  onBack: () => void;
}

export const PlayoffReviewView: React.FC<PlayoffReviewViewProps> = ({ team, teams, playoffSeries, schedule, onBack }) => {
  // 1. Determine Playoff Result
  const mySeries = useMemo(() => {
      // Filter series involving my team and sort by round (highest round first)
      return playoffSeries
          .filter(s => s.higherSeedId === team.id || s.lowerSeedId === team.id)
          .sort((a, b) => b.round - a.round);
  }, [playoffSeries, team.id]);

  const lastSeries = mySeries.length > 0 ? mySeries[0] : null;
  
  let playoffStatus = {
      title: "Playoff Qualification",
      desc: "팀이 플레이오프에 진출했습니다.",
      color: "text-blue-400",
      bg: "bg-gradient-to-r from-blue-900/40 to-slate-900",
      border: "border-blue-500/30",
      icon: <Trophy size={32} className="text-blue-400" />
  };

  if (lastSeries) {
      const isWinner = lastSeries.winnerId === team.id;
      const isFinished = lastSeries.finished;
      
      if (lastSeries.round === 4) { // NBA Finals
          if (isWinner && isFinished) {
              playoffStatus = { 
                  title: "NBA CHAMPIONS", 
                  desc: "세계 최고의 자리에 올랐습니다! 역사에 남을 우승입니다.", 
                  color: "text-yellow-400", 
                  bg: "bg-gradient-to-r from-yellow-900/40 to-slate-900",
                  border: "border-yellow-500/50",
                  icon: <Crown size={40} className="text-yellow-400 fill-yellow-400 animate-pulse" />
              };
          } else if (isFinished) {
              playoffStatus = { 
                  title: "NBA Finalist", 
                  desc: "아쉬운 준우승이지만, 위대한 여정이었습니다.", 
                  color: "text-slate-200", 
                  bg: "bg-gradient-to-r from-slate-800 to-slate-900",
                  border: "border-slate-400/50",
                  icon: <Medal size={40} className="text-slate-300" />
              };
          }
      } else if (lastSeries.round === 3) { // Conf Finals
          if (!isWinner && isFinished) {
              playoffStatus = { 
                  title: "Conference Finalist", 
                  desc: "컨퍼런스 결승 진출. 우승 문턱에서 멈췄습니다.", 
                  color: "text-indigo-400", 
                  bg: "bg-gradient-to-r from-indigo-900/40 to-slate-900",
                  border: "border-indigo-500/30",
                  icon: <Trophy size={40} className="text-indigo-400" />
              };
          }
      } else if (lastSeries.round === 2) { // Semis
          if (!isWinner && isFinished) {
              playoffStatus = { 
                  title: "Semi-Finalist", 
                  desc: "컨퍼런스 4강 진출. 다음 시즌이 기대됩니다.", 
                  color: "text-emerald-400", 
                  bg: "bg-gradient-to-r from-emerald-900/40 to-slate-900",
                  border: "border-emerald-500/30",
                  icon: <Star size={40} className="text-emerald-400" />
              };
          }
      } else if (lastSeries.round === 1) { // Round 1
          if (!isWinner && isFinished) {
              playoffStatus = { 
                  title: "Playoff Participant", 
                  desc: "플레이오프 1라운드 진출. 소중한 경험을 쌓았습니다.", 
                  color: "text-slate-400", 
                  bg: "bg-gradient-to-r from-slate-900 to-slate-950",
                  border: "border-slate-600/30",
                  icon: <Activity size={40} className="text-slate-400" />
              };
          }
      }
  }

  // 2. Playoff Stats Calculation
  const getPlayoffAggregates = () => {
      let totalGames = 0;
      const totals = team.roster.reduce((acc, p) => {
          const s = p.playoffStats || { g: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fga: 0, fgm: 0, fta: 0, ftm: 0, p3a: 0, p3m: 0 };
          if (s.g > totalGames) totalGames = s.g; 
          return {
              pts: acc.pts + s.pts,
              reb: acc.reb + s.reb,
              ast: acc.ast + s.ast,
              stl: acc.stl + s.stl,
              blk: acc.blk + s.blk,
              tov: acc.tov + s.tov,
              fgm: acc.fgm + s.fgm,
              fga: acc.fga + s.fga,
              p3m: acc.p3m + s.p3m,
              p3a: acc.p3a + s.p3a,
              ftm: acc.ftm + s.ftm,
              fta: acc.fta + s.fta,
          };
      }, { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0 });

      if (totalGames === 0) totalGames = 1;

      const tsa = totals.fga + 0.44 * totals.fta;
      
      return {
          pts: totals.pts / totalGames,
          reb: totals.reb / totalGames,
          ast: totals.ast / totalGames,
          stl: totals.stl / totalGames,
          blk: totals.blk / totalGames,
          tov: totals.tov / totalGames,
          fgPct: totals.fga > 0 ? totals.fgm / totals.fga : 0,
          p3Pct: totals.p3a > 0 ? totals.p3m / totals.p3a : 0,
          ftPct: totals.fta > 0 ? totals.ftm / totals.fta : 0,
          tsPct: tsa > 0 ? totals.pts / (2 * tsa) : 0,
          games: totalGames
      };
  };

  const teamStats = getPlayoffAggregates();

  // 3. Playoff MVP Logic
  const sortedByPlayoffPts = [...team.roster].sort((a, b) => {
      const sA = a.playoffStats || { g: 0, pts: 0 };
      const sB = b.playoffStats || { g: 0, pts: 0 };
      const pA = sA.g > 0 ? sA.pts / sA.g : 0;
      const pB = sB.g > 0 ? sB.pts / sB.g : 0;
      return pB - pA;
  });
  const mvp = sortedByPlayoffPts[0];

  // Calculate Win/Loss from Series
  let totalWins = 0;
  let totalLosses = 0;
  mySeries.forEach(s => {
      if (s.higherSeedId === team.id) {
          totalWins += s.higherSeedWins;
          totalLosses += s.lowerSeedWins;
      } else {
          totalWins += s.lowerSeedWins;
          totalLosses += s.higherSeedWins;
      }
  });
  const winPct = (totalWins + totalLosses) > 0 ? totalWins / (totalWins + totalLosses) : 0;
  const winPctStr = winPct.toFixed(3).replace(/^0/, '');

  // 4. Series Game Logs Logic
  const seriesLogs = useMemo(() => {
      const sortedSeries = [...mySeries].sort((a, b) => a.round - b.round);
      
      return sortedSeries.map(s => {
          const opponentId = s.higherSeedId === team.id ? s.lowerSeedId : s.higherSeedId;
          const opponent = teams.find(t => t.id === opponentId);
          const roundName = s.round === 0 ? "Play-In" : s.round === 4 ? "NBA Finals" : s.round === 3 ? "Conf. Finals" : s.round === 2 ? "Semis" : "Round 1";
          
          const games = schedule
              .filter(g => g.seriesId === s.id && g.played)
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

          const result = s.finished 
              ? (s.winnerId === team.id ? "WON" : "LOST") 
              : "IN PROGRESS";
          
          const score = s.higherSeedId === team.id 
              ? `${s.higherSeedWins}-${s.lowerSeedWins}`
              : `${s.lowerSeedWins}-${s.higherSeedWins}`;

          return { series: s, opponent, roundName, games, result, score };
      });
  }, [mySeries, teams, schedule, team.id]);

  return (
    <div className="fixed inset-0 bg-slate-950 z-[150] overflow-y-auto animate-in fade-in duration-500 ko-normal pretendard pb-20">
      
      {/* Header */}
      <div className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 px-8 py-4 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-4">
              <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors group">
                  <ArrowLeft size={24} className="text-slate-400 group-hover:text-white" />
              </button>
              <div className="h-8 w-[1px] bg-slate-800"></div>
              <h1 className="text-xl font-black uppercase tracking-widest text-white oswald">2026 Playoff Report</h1>
          </div>
          <div className="flex items-center gap-3">
              <img src={team.logo} className="w-8 h-8 object-contain" alt="" />
              <span className="font-bold text-slate-400 uppercase text-sm tracking-wider hidden md:block">{team.city} {team.name}</span>
          </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 md:p-10 space-y-12">
          
          {/* Section 1: Compact Playoff Summary */}
          <div className="animate-in slide-in-from-bottom-4 duration-700">
              <div className={`relative px-8 py-6 rounded-3xl border ${playoffStatus.border} ${playoffStatus.bg} shadow-2xl overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6`}>
                  
                  {/* Left: Icon & Title */}
                  <div className="flex items-center gap-6 z-10">
                      <div className="p-4 bg-slate-950/40 rounded-2xl border border-white/10 shadow-inner backdrop-blur-sm">
                          {playoffStatus.icon}
                      </div>
                      <div className="text-left">
                          <h2 className={`text-3xl font-black uppercase tracking-tight oswald ${playoffStatus.color} leading-none mb-1.5`}>
                              {playoffStatus.title}
                          </h2>
                          <p className="text-sm font-bold text-slate-300 max-w-md leading-snug">
                              {playoffStatus.desc}
                          </p>
                      </div>
                  </div>

                  {/* Right: Key Stats */}
                  <div className="flex items-center gap-8 z-10 bg-slate-950/30 px-8 py-3 rounded-2xl border border-white/5">
                      <div className="flex flex-col items-center">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Record</span>
                          <span className="text-2xl font-black text-white oswald">{totalWins}-{totalLosses}</span>
                      </div>
                      <div className="w-[1px] h-8 bg-white/10"></div>
                      <div className="flex flex-col items-center">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Win %</span>
                          <span className="text-2xl font-black text-white oswald font-mono">{winPctStr}</span>
                      </div>
                      <div className="w-[1px] h-8 bg-white/10"></div>
                      <div className="flex flex-col items-center">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Games</span>
                          <span className="text-2xl font-black text-white oswald">{teamStats.games}</span>
                      </div>
                  </div>
              </div>
          </div>

          {/* Section 2: Series Game Log */}
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700 delay-100">
              <div className="flex items-center gap-3 border-b border-indigo-500/20 pb-3">
                  <CalendarDays className="text-indigo-500" size={24} />
                  <h2 className="text-2xl font-black uppercase text-white tracking-tight">Series Results</h2>
              </div>
              <div className="flex flex-col gap-6">
                  {seriesLogs.length === 0 ? (
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 font-bold text-sm">
                          진행된 시리즈가 없습니다.
                      </div>
                  ) : (
                      seriesLogs.map((log, idx) => (
                          <div key={idx} className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-lg">
                              <div className="px-6 py-4 bg-slate-950/50 border-b border-slate-800 flex justify-between items-center">
                                  <div className="flex items-center gap-4">
                                      <span className="text-xs font-black text-slate-400 uppercase tracking-wider bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">{log.roundName}</span>
                                      <span className="text-lg font-black text-slate-200">vs {log.opponent?.name || 'Unknown'}</span>
                                  </div>
                                  <div className="flex items-center gap-4">
                                      <span className={`text-sm font-black uppercase tracking-widest ${log.result === 'WON' ? 'text-emerald-400' : log.result === 'LOST' ? 'text-red-400' : 'text-amber-400'}`}>
                                          {log.result}
                                      </span>
                                      <span className="text-2xl font-black text-white oswald">{log.score}</span>
                                  </div>
                              </div>
                              <div className="divide-y divide-slate-800/50">
                                  {log.games.map((g, gIdx) => {
                                      const isHome = g.homeTeamId === team.id;
                                      const myScore = isHome ? g.homeScore : g.awayScore;
                                      const oppScore = isHome ? g.awayScore : g.homeScore;
                                      const isWin = (myScore || 0) > (oppScore || 0);
                                      
                                      return (
                                          <div key={g.id} className="flex justify-between items-center px-6 py-4 hover:bg-white/5 transition-colors">
                                              <div className="flex items-center gap-4">
                                                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest w-16">Game {gIdx + 1}</span>
                                                  <span className={`text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-tight ${isHome ? 'bg-slate-800 text-slate-300' : 'bg-slate-800 text-slate-400'}`}>
                                                      {isHome ? 'HOME' : 'AWAY'}
                                                  </span>
                                              </div>
                                              <div className="flex items-center gap-6">
                                                  <span className={`text-sm font-black uppercase ${isWin ? 'text-emerald-500' : 'text-red-500'}`}>{isWin ? 'WIN' : 'LOSS'}</span>
                                                  <span className={`text-xl font-mono font-black ${isWin ? 'text-white' : 'text-slate-400'}`}>
                                                      {myScore} - {oppScore}
                                                  </span>
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      ))
                  )}
              </div>
          </div>

          {/* Section 3: Team Stats Grid - Using Shared Component */}
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700 delay-200">
              <div className="flex items-center gap-3 border-b border-indigo-500/20 pb-3">
                  <BarChart3 className="text-indigo-500" size={24} />
                  <h2 className="text-2xl font-black uppercase text-white tracking-tight">Team Performance</h2>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <ReviewStatBox label="Points" value={teamStats.pts} />
                  <ReviewStatBox label="Rebounds" value={teamStats.reb} />
                  <ReviewStatBox label="Assists" value={teamStats.ast} />
                  <ReviewStatBox label="Steals" value={teamStats.stl} />
                  <ReviewStatBox label="Blocks" value={teamStats.blk} />
                  
                  <ReviewStatBox label="Turnovers" value={teamStats.tov} inverse />
                  <ReviewStatBox label="FG%" value={teamStats.fgPct} isPercent />
                  <ReviewStatBox label="3P%" value={teamStats.p3Pct} isPercent />
                  <ReviewStatBox label="FT%" value={teamStats.ftPct} isPercent />
                  <ReviewStatBox label="True Shooting" value={teamStats.tsPct} isPercent />
              </div>
          </div>

          {/* Section 4: Player Stats Table */}
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700 delay-300">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-3">
                      <Users className="text-blue-500" size={24} />
                      <h2 className="text-2xl font-black uppercase text-white tracking-tight">Playoff Roster Stats</h2>
                  </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden shadow-xl">
                  <div className="overflow-x-auto custom-scrollbar">
                      <table className="w-full text-left border-collapse whitespace-nowrap">
                          <thead className="bg-slate-950/80 backdrop-blur-sm sticky top-0 z-20">
                              <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
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
                              {sortedByPlayoffPts.map(p => {
                                  const s = p.playoffStats || { g: 0, gs: 0, mp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fga: 0, fgm: 0, p3a: 0, p3m: 0, fta: 0, ftm: 0 };
                                  const g = s.g || 1;
                                  if (s.g === 0) return null; 

                                  const isMvp = p.id === mvp?.id;
                                  const tsa = s.fga + 0.44 * s.fta;
                                  const tsPct = tsa > 0 ? (s.pts / (2 * tsa)) * 100 : 0;
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
                                          <td className={statClass}>{s.g}</td>
                                          <td className={statClass}>{s.gs}</td>
                                          <td className={statClass}>{(s.mp/g).toFixed(1)}</td>
                                          <td className={statClass}>{(s.pts/g).toFixed(1)}</td>
                                          <td className={statClass}>{(s.reb/g).toFixed(1)}</td>
                                          <td className={statClass}>{(s.ast/g).toFixed(1)}</td>
                                          <td className={statClass}>{(s.stl/g).toFixed(1)}</td>
                                          <td className={statClass}>{(s.blk/g).toFixed(1)}</td>
                                          <td className={statClass}>{(s.tov/g).toFixed(1)}</td>
                                          <td className={statClass}>{(s.p3m/g).toFixed(1)}</td>
                                          <td className={statClass}>{(s.p3a/g).toFixed(1)}</td>
                                          <td className={statClass}>{s.p3a > 0 ? ((s.p3m/s.p3a)*100).toFixed(1) : '0.0'}%</td>
                                          <td className={statClass}>{(s.fgm/g).toFixed(1)}</td>
                                          <td className={statClass}>{(s.fga/g).toFixed(1)}</td>
                                          <td className={statClass}>{s.fga > 0 ? ((s.fgm/s.fga)*100).toFixed(1) : '0.0'}%</td>
                                          <td className={statClass}>{(s.ftm/g).toFixed(1)}</td>
                                          <td className={statClass}>{(s.fta/g).toFixed(1)}</td>
                                          <td className={statClass}>{s.fta > 0 ? ((s.ftm/s.fta)*100).toFixed(1) : '0.0'}%</td>
                                          <td className={`${statClass} pr-6`}>{tsPct.toFixed(1)}%</td>
                                      </tr>
                                  );
                              })}
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>

          {/* Section 5: Owner's Message - Using Shared Component */}
          <div className="animate-in slide-in-from-bottom-4 duration-700 delay-300 pb-8">
              <ReviewOwnerMessage 
                  ownerName={"The Ownership Group"}
                  title="Season Debrief"
                  msg="수고 많았습니다. 이번 플레이오프는 우리 팀에게 많은 것을 시사했습니다. 결과를 겸허히 받아들이고, 내년에는 더 높은 곳을 향해 나아갑시다."
                  mood={{ color: "text-slate-400", borderColor: "border-slate-700", bg: "bg-slate-900" }}
              />
          </div>

      </div>
    </div>
  );
};
