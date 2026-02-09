
import React, { useMemo } from 'react';
import { ArrowLeft, CalendarDays, BarChart3, Users, Crown } from 'lucide-react';
import { Team, PlayoffSeries, Game } from '../types';
import { OvrBadge } from '../components/common/OvrBadge';
import { ReviewStatBox, ReviewOwnerMessage } from '../components/review/ReviewComponents';
import { TeamLogo } from '../components/common/TeamLogo';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/common/Table';
import { generatePlayoffReport } from '../services/reportGenerator';

interface PlayoffReviewViewProps {
  team: Team;
  teams: Team[];
  playoffSeries: PlayoffSeries[];
  schedule: Game[];
  onBack: () => void;
}

export const PlayoffReviewView: React.FC<PlayoffReviewViewProps> = ({ team, teams, playoffSeries, schedule, onBack }) => {
  // Use Service to generate all display data
  const report = useMemo(() => generatePlayoffReport(team, teams, playoffSeries, schedule), [team, teams, playoffSeries, schedule]);

  const {
      status,
      totalWins,
      totalLosses,
      winPctStr,
      teamStats,
      mvp,
      seriesLogs,
      ownerName
  } = report;

  // Sorting for display in table
  const sortedRoster = useMemo(() => {
      return [...team.roster].sort((a, b) => {
          const sA = a.playoffStats || { g: 0, pts: 0 };
          const sB = b.playoffStats || { g: 0, pts: 0 };
          const pA = sA.g > 0 ? sA.pts / sA.g : 0;
          const pB = sB.g > 0 ? sB.pts / sB.g : 0;
          return pB - pA;
      });
  }, [team.roster]);

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
              <TeamLogo teamId={team.id} size="md" />
              <span className="font-bold text-slate-400 uppercase text-sm tracking-wider hidden md:block">{team.city} {team.name}</span>
          </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 md:p-10 space-y-12">
          
          {/* Section 1: Compact Playoff Summary */}
          <div className="animate-in slide-in-from-bottom-4 duration-700">
              <div className={`relative px-8 py-6 rounded-3xl border ${status.border} ${status.bg} shadow-2xl overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6`}>
                  
                  {/* Left: Icon & Title */}
                  <div className="flex items-center gap-6 z-10">
                      <div className="p-4 bg-slate-950/40 rounded-2xl border border-white/10 shadow-inner backdrop-blur-sm">
                          {status.icon}
                      </div>
                      <div className="text-left">
                          <h2 className={`text-3xl font-black uppercase tracking-tight oswald ${status.color} leading-none mb-1.5`}>
                              {status.title}
                          </h2>
                          <p className="text-sm font-bold text-slate-300 max-w-md leading-snug">
                              {status.desc}
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
                      <Table>
                          <TableHead>
                              <TableHeaderCell align="left" className="px-6 text-left sticky left-0 bg-slate-950 z-20 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.5)]">Player</TableHeaderCell>
                              <TableHeaderCell align="right" className="px-2 min-w-[40px]">G</TableHeaderCell>
                              <TableHeaderCell align="right" className="px-2 min-w-[40px]">GS</TableHeaderCell>
                              <TableHeaderCell align="right" className="px-2 min-w-[40px]">MP</TableHeaderCell>
                              <TableHeaderCell align="right" className="px-2 min-w-[40px]">PTS</TableHeaderCell>
                              <TableHeaderCell align="right" className="px-2 min-w-[40px]">REB</TableHeaderCell>
                              <TableHeaderCell align="right" className="px-2 min-w-[40px]">AST</TableHeaderCell>
                              <TableHeaderCell align="right" className="px-2 min-w-[40px]">STL</TableHeaderCell>
                              <TableHeaderCell align="right" className="px-2 min-w-[40px]">BLK</TableHeaderCell>
                              <TableHeaderCell align="right" className="px-2 min-w-[40px]">TOV</TableHeaderCell>
                              <TableHeaderCell align="right" className="px-2 min-w-[40px]">3PM</TableHeaderCell>
                              <TableHeaderCell align="right" className="px-2 min-w-[40px]">3PA</TableHeaderCell>
                              <TableHeaderCell align="right" className="px-2 min-w-[50px]">3P%</TableHeaderCell>
                              <TableHeaderCell align="right" className="px-2 min-w-[40px]">FGM</TableHeaderCell>
                              <TableHeaderCell align="right" className="px-2 min-w-[40px]">FGA</TableHeaderCell>
                              <TableHeaderCell align="right" className="px-2 min-w-[50px]">FG%</TableHeaderCell>
                              <TableHeaderCell align="right" className="px-2 min-w-[40px]">FTM</TableHeaderCell>
                              <TableHeaderCell align="right" className="px-2 min-w-[40px]">FTA</TableHeaderCell>
                              <TableHeaderCell align="right" className="px-2 min-w-[50px]">FT%</TableHeaderCell>
                              <TableHeaderCell align="right" className="px-6 min-w-[60px]">TS%</TableHeaderCell>
                          </TableHead>
                          <TableBody>
                              {sortedRoster.map(p => {
                                  const s = p.playoffStats || { g: 0, gs: 0, mp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fga: 0, fgm: 0, p3a: 0, p3m: 0, fta: 0, ftm: 0 };
                                  const g = s.g || 1;
                                  if (s.g === 0) return null; 

                                  const isMvp = p.id === mvp?.id;
                                  const tsa = s.fga + 0.44 * s.fta;
                                  const tsPct = tsa > 0 ? (s.pts / (2 * tsa)) * 100 : 0;
                                  
                                  return (
                                      <TableRow key={p.id} className={isMvp ? 'bg-amber-900/10' : ''}>
                                          <TableCell className="px-6 sticky left-0 bg-slate-900 group-hover:bg-slate-800 transition-colors z-10 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.5)]">
                                              <div className="flex items-center gap-3">
                                                  <OvrBadge value={p.ovr} size="md" className="!w-8 !h-8 !text-xs !mx-0 flex-shrink-0" />
                                                  <div>
                                                      <div className="flex items-center gap-1.5">
                                                          <span className={`font-bold text-sm ${isMvp ? 'text-amber-100' : 'text-slate-200'} group-hover:text-white`}>{p.name}</span>
                                                          {isMvp && <Crown size={12} className="text-amber-400 fill-amber-400 flex-shrink-0" />}
                                                      </div>
                                                      <div className="text-[10px] font-black text-slate-500">{p.position}</div>
                                                  </div>
                                              </div>
                                          </TableCell>
                                          <TableCell variant="stat" value={s.g} className="text-white" />
                                          <TableCell variant="stat" value={s.gs} className="text-white" />
                                          <TableCell variant="stat" value={(s.mp/g).toFixed(1)} className="text-white" />
                                          <TableCell variant="stat" value={(s.pts/g).toFixed(1)} className="text-white" />
                                          <TableCell variant="stat" value={(s.reb/g).toFixed(1)} className="text-white" />
                                          <TableCell variant="stat" value={(s.ast/g).toFixed(1)} className="text-white" />
                                          <TableCell variant="stat" value={(s.stl/g).toFixed(1)} className="text-white" />
                                          <TableCell variant="stat" value={(s.blk/g).toFixed(1)} className="text-white" />
                                          <TableCell variant="stat" value={(s.tov/g).toFixed(1)} className="text-white" />
                                          <TableCell variant="stat" value={(s.p3m/g).toFixed(1)} className="text-white" />
                                          <TableCell variant="stat" value={(s.p3a/g).toFixed(1)} className="text-white" />
                                          <TableCell variant="stat" value={s.p3a > 0 ? ((s.p3m/s.p3a)*100).toFixed(1) : '0.0' + '%'} className="text-white" />
                                          <TableCell variant="stat" value={(s.fgm/g).toFixed(1)} className="text-white" />
                                          <TableCell variant="stat" value={(s.fga/g).toFixed(1)} className="text-white" />
                                          <TableCell variant="stat" value={s.fga > 0 ? ((s.fgm/s.fga)*100).toFixed(1) : '0.0' + '%'} className="text-white" />
                                          <TableCell variant="stat" value={(s.ftm/g).toFixed(1)} className="text-white" />
                                          <TableCell variant="stat" value={(s.fta/g).toFixed(1)} className="text-white" />
                                          <TableCell variant="stat" value={s.fta > 0 ? ((s.ftm/s.fta)*100).toFixed(1) : '0.0' + '%'} className="text-white" />
                                          <TableCell variant="stat" className="pr-6 text-white" value={tsPct.toFixed(1) + '%'} />
                                      </TableRow>
                                  );
                              })}
                          </TableBody>
                      </Table>
                  </div>
              </div>
          </div>

          {/* Section 5: Owner's Message - Using Shared Component */}
          <div className="animate-in slide-in-from-bottom-4 duration-700 delay-300 pb-8">
              <ReviewOwnerMessage 
                  ownerName={ownerName}
                  title="Season Debrief"
                  msg="수고 많았습니다. 이번 플레이오프는 우리 팀에게 많은 것을 시사했습니다. 결과를 겸허히 받아들이고, 내년에는 더 높은 곳을 향해 나아갑시다."
                  mood={{ color: "text-slate-400", borderColor: "border-slate-700", bg: "bg-slate-900" }}
              />
          </div>

      </div>
    </div>
  );
};
