
import React, { useState, useEffect, useMemo } from 'react';
import { X, Trophy, List, ArrowRight, Activity, Lock, Target, Shield, ShieldAlert, CheckCircle2, RefreshCw, Zap, Calendar } from 'lucide-react';
import { Team, PlayerBoxScore, OffenseTactic, DefenseTactic, Game } from '../types';
import { getOvrBadgeStyle } from '../components/SharedComponents';
import { GameTactics } from '../services/gameEngine';

export const GameSimulatingView: React.FC<{ homeTeam: Team, awayTeam: Team, userTeamId?: string | null }> = ({ homeTeam, awayTeam, userTeamId }) => {
  const [progress, setProgress] = useState(0);
  const [shots, setShots] = useState<{id: number, x: number, y: number, isMake: boolean}[]>([]);
  
  useEffect(() => {
    const timer = setInterval(() => setProgress(p => (p >= 100 ? 100 : p + 1)), 30);
    
    const shotTimer = setInterval(() => {
        setShots(prev => {
            const isHome = Math.random() > 0.5;
            const isMake = Math.random() > 0.5;
            const hoopX = isHome ? 88.75 : 5.25;
            const direction = isHome ? -1 : 1;
            const dist = Math.random() * 28;
            const angle = (Math.random() * Math.PI) - (Math.PI / 2);
            const x = Math.max(2, Math.min(92, hoopX + Math.cos(angle) * dist * direction));
            const y = Math.max(2, Math.min(48, 25 + Math.sin(angle) * dist));
            return [...prev.slice(-30), { id: Date.now(), x, y, isMake }];
        });
    }, 150);
    return () => { clearInterval(timer); clearInterval(shotTimer); };
  }, []);

  if (!homeTeam || !awayTeam) return null;
  const isUserAway = userTeamId === awayTeam.id;

  return (
    <div className="fixed inset-0 bg-slate-950 z-[110] flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-4xl space-y-8 flex flex-col items-center">
        <div className="flex justify-between w-full px-8 items-center">
           <div className="flex items-center gap-6">
             <img src={awayTeam.logo} className="w-24 h-24 object-contain" alt="" />
             <span className="text-4xl font-black oswald text-white">{awayTeam.name}</span>
           </div>
           <span className="text-4xl font-black text-slate-700 oswald">{isUserAway ? '@' : 'VS'}</span>
           <div className="flex items-center gap-6">
             <span className="text-4xl font-black oswald text-white">{homeTeam.name}</span>
             <img src={homeTeam.logo} className="w-24 h-24 object-contain" alt="" />
           </div>
        </div>
        <div className="relative w-full aspect-[94/50] rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl">
            <svg viewBox="0 0 94 50" className="absolute inset-0 w-full h-full">
                <rect width="94" height="50" fill="#0f172a" />
                <g fill="none" stroke="#334155" strokeWidth="0.3">
                    <rect x="0" y="0" width="94" height="50" />
                    <line x1="47" y1="0" x2="47" y2="50" />
                    <circle cx="47" cy="25" r="6" />
                    <circle cx="47" cy="25" r="2" fill="#334155" />
                    <rect x="0" y="17" width="19" height="16" />
                    <circle cx="19" cy="25" r="6" strokeDasharray="1,1" />
                    <path d="M 0 3 L 14 3 A 23.75 23.75 0 0 1 14 47 L 0 47" />
                    <circle cx="5.25" cy="25" r="1.5" />
                    <rect x="75" y="17" width="19" height="16" />
                    <circle cx="75" cy="25" r="6" strokeDasharray="1,1" />
                    <path d="M 94 3 L 80 3 A 23.75 23.75 0 0 0 80 47 L 94 47" />
                    <circle cx="88.75" cy="25" r="1.5" />
                </g>
            </svg>
            {shots.map(s => (
                <div key={s.id} className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-opacity duration-1000" style={{ left: `${(s.x / 94) * 100}%`, top: `${(s.y / 50) * 100}%` }}>
                    {s.isMake ? <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)] border border-emerald-300"></div> : <X size={12} className="text-red-500/60 drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]" strokeWidth={3} />}
                </div>
            ))}
        </div>
        <div className="w-full max-w-md space-y-4">
          <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800 shadow-inner">
             <div className="bg-indigo-500 h-full transition-all duration-300 shadow-[0_0_15px_rgba(99,102,241,0.6)]" style={{ width: `${progress}%` }}></div>
          </div>
          <p className="text-indigo-400 font-black uppercase tracking-[0.3em] text-center animate-pulse oswald text-sm">Engine simulating plays...</p>
        </div>
      </div>
    </div>
  );
};

const ResultBoxScore: React.FC<{ team: Team, box: PlayerBoxScore[], isFirst?: boolean }> = ({ team, box, isFirst }) => {
  const sortedBox = useMemo(() => [...box].sort((a, b) => b.gs - a.gs || b.mp - a.mp), [box]);
  const teamTotals = useMemo(() => {
    return box.reduce((acc, p) => ({
      mp: acc.mp + p.mp, pts: acc.pts + p.pts, reb: acc.reb + p.reb, offReb: acc.offReb + (p.offReb || 0), defReb: acc.defReb + (p.defReb || 0), ast: acc.ast + p.ast,
      stl: acc.stl + p.stl, blk: acc.blk + p.blk, tov: acc.tov + p.tov,
      fgm: acc.fgm + p.fgm, fga: acc.fga + p.fga,
      p3m: acc.p3m + p.p3m, p3a: acc.p3a + p.p3a, ftm: acc.ftm + p.ftm, fta: acc.fta + p.fta,
    }), { mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0 });
  }, [box]);

  const maxStats = useMemo(() => {
    const stats = {
        pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
        fgm: 0, fga: 0, fgp: 0, p3m: 0, p3a: 0, p3p: 0, ftm: 0, fta: 0, ftp: 0
    };
    box.forEach(p => {
        stats.pts = Math.max(stats.pts, p.pts);
        stats.reb = Math.max(stats.reb, p.reb);
        stats.offReb = Math.max(stats.offReb, p.offReb || 0);
        stats.defReb = Math.max(stats.defReb, p.defReb || 0);
        stats.ast = Math.max(stats.ast, p.ast);
        stats.stl = Math.max(stats.stl, p.stl);
        stats.blk = Math.max(stats.blk, p.blk);
        stats.tov = Math.max(stats.tov, p.tov);
        stats.fgm = Math.max(stats.fgm, p.fgm);
        stats.fga = Math.max(stats.fga, p.fga);
        stats.fgp = Math.max(stats.fgp, p.fga > 0 ? p.fgm / p.fga : 0);
        stats.p3m = Math.max(stats.p3m, p.p3m);
        stats.p3a = Math.max(stats.p3a, p.p3a);
        stats.p3p = Math.max(stats.p3p, p.p3a > 0 ? p.p3m / p.p3a : 0);
        stats.ftm = Math.max(stats.ftm, p.ftm);
        stats.fta = Math.max(stats.fta, p.fta);
        stats.ftp = Math.max(stats.ftp, p.fta > 0 ? p.ftm / p.fta : 0);
    });
    return stats;
  }, [box]);

  const formatPct = (m: number, a: number) => a > 0 ? (m / a * 100).toFixed(1) : '0.0';
  const getRawPct = (m: number, a: number) => a > 0 ? m / a : 0;

  return (
    <div className={`flex flex-col ${!isFirst ? 'border-t border-slate-800 pt-10 mt-6' : ''}`}>
      <div className="flex items-center gap-4 mb-8 pb-2">
        <img src={team.logo} className="w-10 h-10 object-contain" alt="" />
        <h3 className="text-xl font-black ko-tight uppercase text-white tracking-wider">{team.name} 박스스코어</h3>
      </div>
      <div className="overflow-x-auto custom-scrollbar pb-4">
        <table className="w-full text-left table-auto min-w-[1400px]">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 text-[11px] font-black uppercase tracking-widest bg-slate-950/40">
              <th className="py-4 px-4 sticky left-0 bg-slate-900 z-30 min-w-[200px] border-r border-slate-700 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.5)]">PLAYER</th>
              <th className="py-4 px-3 text-center w-16">POS</th>
              <th className="py-4 px-3 text-center w-16">OVR</th>
              <th className="py-4 px-3 text-center">MIN</th>
              <th className="py-4 px-3 text-center">PTS</th>
              <th className="py-4 px-3 text-center">REB</th>
              <th className="py-4 px-3 text-center">OREB</th>
              <th className="py-4 px-3 text-center">DREB</th>
              <th className="py-4 px-3 text-center">AST</th>
              <th className="py-4 px-3 text-center">STL</th>
              <th className="py-4 px-3 text-center">BLK</th>
              <th className="py-4 px-3 text-center">TOV</th>
              <th className="py-4 px-3 text-center">FGM</th>
              <th className="py-4 px-3 text-center">FGA</th>
              <th className="py-4 px-3 text-center">FG%</th>
              <th className="py-4 px-3 text-center">3PM</th>
              <th className="py-4 px-3 text-center">3PA</th>
              <th className="py-4 px-3 text-center">3P%</th>
              <th className="py-4 px-3 text-center">FTM</th>
              <th className="py-4 px-3 text-center">FTA</th>
              <th className="py-4 px-3 text-center">FT%</th>
            </tr>
          </thead>
          <tbody>
            {sortedBox.map((p) => {
              const playerDetail = team.roster.find(r => r.id === p.playerId);
              const effect = p.matchupEffect;
              const hasChips = p.isStopper || p.isAceTarget;

              return (
                <tr key={p.playerId} className="border-b border-slate-800/40 hover:bg-slate-800/40 transition-colors group">
                  <td className="py-3 px-4 sticky left-0 bg-slate-900 group-hover:bg-slate-800 z-20 border-r border-slate-700 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.5)] align-middle">
                      <div className="flex flex-col justify-center h-full min-w-0">
                          <div className={`flex items-center gap-2 ${hasChips ? 'mb-1.5' : ''}`}>
                              <span className="text-sm font-black text-white truncate leading-none">{p.playerName}</span>
                          </div>
                          {hasChips && (
                            <div className="flex flex-wrap items-center gap-1.5">
                                {p.isStopper && (
                                    <div className="flex items-center gap-1 bg-fuchsia-600/20 text-fuchsia-400 px-1.5 py-0.5 rounded-[4px] text-[9px] font-black border border-fuchsia-500/20 leading-none">
                                    <Lock size={8} className="fill-fuchsia-400/20" /> STOPPER
                                    </div>
                                )}
                                {p.isAceTarget && (
                                    <div className="flex items-center gap-1 bg-red-600/20 text-red-400 px-1.5 py-0.5 rounded-[4px] text-[9px] font-black border border-red-500/20 leading-none whitespace-nowrap">
                                    <Target size={8} /> ACE TARGET {effect !== undefined && effect !== 0 ? `(${effect}%)` : ''}
                                    </div>
                                )}
                            </div>
                          )}
                      </div>
                  </td>
                  <td className="py-3 px-3 text-center text-base font-medium text-slate-400">{playerDetail?.position || '-'}</td>
                  <td className="py-3 px-3 text-center">
                    <div className={`${getOvrBadgeStyle(playerDetail?.ovr || 0)} !w-7 !h-7 !text-xs !mx-auto`}>{playerDetail?.ovr || '-'}</div>
                  </td>
                  <td className="py-3 px-3 text-center text-base font-medium text-slate-300">{Math.round(p.mp)}</td>
                  <td className={`py-3 px-3 text-center text-base font-black ${p.pts === maxStats.pts ? 'text-emerald-400' : 'text-white'}`}>{Math.round(p.pts)}</td>
                  <td className={`py-3 px-3 text-center text-base font-bold ${p.reb === maxStats.reb ? 'text-emerald-400' : 'text-slate-200'}`}>{Math.round(p.reb)}</td>
                  <td className={`py-3 px-3 text-center text-base font-bold ${p.offReb === maxStats.offReb ? 'text-emerald-400' : 'text-slate-400'}`}>{Math.round(p.offReb || 0)}</td>
                  <td className={`py-3 px-3 text-center text-base font-bold ${p.defReb === maxStats.defReb ? 'text-emerald-400' : 'text-slate-400'}`}>{Math.round(p.defReb || 0)}</td>
                  <td className={`py-3 px-3 text-center text-base font-bold ${p.ast === maxStats.ast ? 'text-emerald-400' : 'text-slate-200'}`}>{Math.round(p.ast)}</td>
                  <td className={`py-3 px-3 text-center text-base font-medium ${p.stl === maxStats.stl ? 'text-emerald-400' : 'text-slate-400'}`}>{Math.round(p.stl)}</td>
                  <td className={`py-3 px-3 text-center text-base font-medium ${p.blk === maxStats.blk ? 'text-emerald-400' : 'text-slate-400'}`}>{Math.round(p.blk)}</td>
                  <td className={`py-3 px-3 text-center text-base font-medium ${p.tov === maxStats.tov ? 'text-emerald-400' : 'text-slate-500'}`}>{Math.round(p.tov)}</td>
                  <td className="py-3 px-3 text-center text-base font-medium text-slate-400">{Math.round(p.fgm)}</td>
                  <td className="py-3 px-3 text-center text-base font-medium text-slate-500">{Math.round(p.fga)}</td>
                  <td className={`py-3 px-3 text-center text-base font-black ${getRawPct(p.fgm, p.fga) === maxStats.fgp && maxStats.fgp > 0 ? 'text-emerald-400' : 'text-white'}`}>{formatPct(p.fgm, p.fga)}</td>
                  <td className="py-3 px-3 text-center text-base font-medium text-slate-400">{Math.round(p.p3m)}</td>
                  <td className="py-3 px-3 text-center text-base font-medium text-slate-500">{Math.round(p.p3a)}</td>
                  <td className={`py-3 px-3 text-center text-base font-bold ${getRawPct(p.p3m, p.p3a) === maxStats.p3p && maxStats.p3p > 0 ? 'text-emerald-400' : 'text-white'}`}>{formatPct(p.p3m, p.p3a)}</td>
                  <td className="py-3 px-3 text-center text-base font-medium text-slate-400">{Math.round(p.ftm)}</td>
                  <td className="py-3 px-3 text-center text-base font-medium text-slate-500">{Math.round(p.fta)}</td>
                  <td className={`py-3 px-3 text-center text-base font-bold ${getRawPct(p.ftm, p.fta) === maxStats.ftp && maxStats.ftp > 0 ? 'text-emerald-400' : 'text-white'}`}>{formatPct(p.ftm, p.fta)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-800/20">
            <tr className="text-white font-black text-sm uppercase border-t-2 border-slate-700">
              <td className="py-3 px-4 sticky left-0 bg-slate-800/60 backdrop-blur-md z-20" colSpan={3}>TEAM TOTAL</td>
              <td className="py-3 px-3 text-center">{Math.round(teamTotals.mp)}</td>
              <td className="py-3 px-3 text-center text-indigo-400">{Math.round(teamTotals.pts)}</td>
              <td className="py-3 px-3 text-center">{Math.round(teamTotals.reb)}</td>
              <td className="py-3 px-3 text-center text-slate-400">{Math.round(teamTotals.offReb)}</td>
              <td className="py-3 px-3 text-center text-slate-400">{Math.round(teamTotals.defReb)}</td>
              <td className="py-3 px-3 text-center">{Math.round(teamTotals.ast)}</td>
              <td className="py-3 px-3 text-center">{Math.round(teamTotals.stl)}</td>
              <td className="py-3 px-3 text-center">{Math.round(teamTotals.blk)}</td>
              <td className="py-3 px-3 text-center">{Math.round(teamTotals.tov)}</td>
              <td className="py-3 px-3 text-center">{Math.round(teamTotals.fgm)}</td>
              <td className="py-3 px-3 text-center">{Math.round(teamTotals.fga)}</td>
              <td className="py-3 px-3 text-center">{formatPct(teamTotals.fgm, teamTotals.fga)}%</td>
              <td className="py-3 px-3 text-center">{Math.round(teamTotals.p3m)}</td>
              <td className="py-3 px-3 text-center">{Math.round(teamTotals.p3a)}</td>
              <td className="py-3 px-3 text-center">{formatPct(teamTotals.p3m, teamTotals.p3a)}%</td>
              <td className="py-3 px-3 text-center">{Math.round(teamTotals.ftm)}</td>
              <td className="py-3 px-3 text-center">{Math.round(teamTotals.fta)}</td>
              <td className="py-3 px-3 text-center">{formatPct(teamTotals.ftm, teamTotals.fta)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export const GameResultView: React.FC<{ 
  result: { 
    home: Team; 
    away: Team; 
    homeScore: number; 
    awayScore: number; 
    homeBox: PlayerBoxScore[]; 
    awayBox: PlayerBoxScore[]; 
    userTactics: GameTactics; 
    myTeamId: string; 
    recap?: string[];
    otherGames?: Game[];
  }; 
  myTeamId: string;
  teams: Team[]; 
  onFinish: () => void; 
}> = ({ result, myTeamId, teams, onFinish }) => {
  const isHome = result.myTeamId === result.home.id;
  const won = (isHome && result.homeScore > result.awayScore) || (!isHome && result.awayScore > result.homeScore);

  const homeWin = result.homeScore > result.awayScore;
  const homeRecord = `${result.home.wins + (homeWin ? 1 : 0)}W - ${result.home.losses + (!homeWin ? 1 : 0)}L`;
  const awayRecord = `${result.away.wins + (!homeWin ? 1 : 0)}W - ${result.away.losses + (homeWin ? 1 : 0)}L`;

  const getTeamInfo = (id: string) => teams.find(t => t.id === id);

  return (
    <div className="fixed inset-0 bg-slate-950 z-[120] overflow-y-auto animate-in fade-in duration-500 ko-normal pretendard">
      <div className="max-w-[1600px] mx-auto p-8 lg:p-12 space-y-12 relative">
         <div className={`absolute top-0 left-0 right-0 h-[500px] z-0 pointer-events-none opacity-40 transition-colors duration-1000 ${won 
            ? 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900 via-slate-950 to-slate-950' 
            : 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900 via-slate-950 to-slate-950'
         }`} />

         <div className="flex flex-col items-center gap-8 relative z-10">
             <div className="text-center space-y-2">
                <h2 className="text-4xl font-black oswald uppercase text-white tracking-widest drop-shadow-lg">Game Final</h2>
                <div className={`text-lg font-black uppercase tracking-widest ${won ? 'text-emerald-400' : 'text-red-500'}`}>
                    {won ? 'VICTORY' : 'DEFEAT'}
                </div>
             </div>

             <div className="flex items-center justify-center gap-16 w-full max-w-4xl">
                 <div className="flex flex-col items-center gap-4">
                     <img src={result.away.logo} className="w-24 h-24 object-contain drop-shadow-2xl" alt="" />
                     <div className="flex flex-col items-center">
                        <span className="text-2xl font-black oswald uppercase text-white">{result.away.name}</span>
                        <span className="text-sm font-bold text-slate-400 tracking-widest mt-1">{awayRecord}</span>
                     </div>
                 </div>
                 <div className="flex items-center gap-8">
                     <span className={`text-7xl font-black oswald drop-shadow-2xl ${result.awayScore > result.homeScore ? 'text-white' : 'text-slate-500'}`}>{Math.round(result.awayScore)}</span>
                     <span className="text-3xl font-black text-slate-700">-</span>
                     <span className={`text-7xl font-black oswald drop-shadow-2xl ${result.homeScore > result.awayScore ? 'text-white' : 'text-slate-500'}`}>{Math.round(result.homeScore)}</span>
                 </div>
                 <div className="flex flex-col items-center gap-4">
                     <img src={result.home.logo} className="w-24 h-24 object-contain drop-shadow-2xl" alt="" />
                     <div className="flex flex-col items-center">
                        <span className="text-2xl font-black oswald uppercase text-white">{result.home.name}</span>
                        <span className="text-sm font-bold text-slate-400 tracking-widest mt-1">{homeRecord}</span>
                     </div>
                 </div>
             </div>
         </div>

         <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-8 shadow-xl relative z-10">
             <div className="flex items-center gap-3 mb-6">
                 <div className="p-2 bg-indigo-500/10 rounded-lg"><Zap size={20} className="text-indigo-400" /></div>
                 <h3 className="text-xl font-black uppercase text-white tracking-tight">AI Game Analysis</h3>
             </div>
             <div className="space-y-4">
                 {result.recap && result.recap.length > 0 ? result.recap.map((line: string, i: number) => (
                     <div key={i} className="flex gap-4 p-4 bg-slate-950/40 rounded-xl border border-slate-800/50">
                         <span className="text-indigo-500 font-black text-lg oswald">{i+1}</span>
                         <p className="text-slate-300 font-medium leading-relaxed">{line}</p>
                     </div>
                 )) : (
                     <div className="text-slate-500">No analysis available.</div>
                 )}
             </div>
         </div>

         <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-10 shadow-2xl backdrop-blur-sm relative z-10">
             <ResultBoxScore team={result.away} box={result.awayBox} isFirst />
             <ResultBoxScore team={result.home} box={result.homeBox} />
         </div>

         {/* Around the League Section */}
         {result.otherGames && result.otherGames.length > 0 && (
             <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-8 shadow-xl relative z-10">
                 <div className="flex items-center gap-3 mb-6">
                     <div className="p-2 bg-emerald-500/10 rounded-lg"><Calendar size={20} className="text-emerald-400" /></div>
                     <h3 className="text-xl font-black uppercase text-white tracking-tight">타 구단 경기 결과</h3>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                     {result.otherGames.map(g => {
                         const home = getTeamInfo(g.homeTeamId);
                         const away = getTeamInfo(g.awayTeamId);
                         if (!home || !away) return null;
                         const homeWin = (g.homeScore || 0) > (g.awayScore || 0);
                         return (
                             <div key={g.id} className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 flex flex-col gap-2">
                                 <div className="flex justify-between items-center">
                                     <div className="flex items-center gap-3">
                                         <img src={away.logo} className="w-6 h-6 object-contain" alt={away.name} />
                                         <span className={`text-sm font-bold uppercase ${!homeWin ? 'text-white' : 'text-slate-500'}`}>{away.name}</span>
                                     </div>
                                     <span className={`text-lg font-black oswald ${!homeWin ? 'text-emerald-400' : 'text-slate-600'}`}>{g.awayScore}</span>
                                 </div>
                                 <div className="flex justify-between items-center">
                                     <div className="flex items-center gap-3">
                                         <img src={home.logo} className="w-6 h-6 object-contain" alt={home.name} />
                                         <span className={`text-sm font-bold uppercase ${homeWin ? 'text-white' : 'text-slate-500'}`}>{home.name}</span>
                                     </div>
                                     <span className={`text-lg font-black oswald ${homeWin ? 'text-emerald-400' : 'text-slate-600'}`}>{g.homeScore}</span>
                                 </div>
                             </div>
                         );
                     })}
                 </div>
             </div>
         )}

         <div className="flex justify-center pb-16 relative z-10">
             <button onClick={onFinish} className="px-16 py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2rem] font-black text-xl uppercase tracking-widest shadow-[0_15px_50px_rgba(79,70,229,0.5)] transition-all active:scale-95 flex items-center gap-4">
                 <RefreshCw size={28} /> 라커룸으로 복귀
             </button>
         </div>
      </div>
    </div>
  );
};
