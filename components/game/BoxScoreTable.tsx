
import React, { useMemo } from 'react';
import { Crown, Shield, Lock, Unlock } from 'lucide-react';
import { Team, PlayerBoxScore } from '../../types';
import { getOvrBadgeStyle } from '../SharedComponents';

export interface GameStatLeaders {
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    tov: number;
}

interface BoxScoreTableProps {
    team: Team;
    box: PlayerBoxScore[];
    isFirst?: boolean;
    mvpId: string;
    leaders: GameStatLeaders;
}

export const BoxScoreTable: React.FC<BoxScoreTableProps> = ({ team, box, isFirst, mvpId, leaders }) => {
  const sortedBox = useMemo(() => [...box].sort((a, b) => b.gs - a.gs || b.mp - a.mp), [box]);
  const teamTotals = useMemo(() => {
    return box.reduce((acc, p) => ({
      mp: acc.mp + p.mp, pts: acc.pts + p.pts, reb: acc.reb + p.reb, offReb: acc.offReb + (p.offReb || 0), defReb: acc.defReb + (p.defReb || 0), ast: acc.ast + p.ast,
      stl: acc.stl + p.stl, blk: acc.blk + p.blk, tov: acc.tov + p.tov, pf: acc.pf! + (p.pf || 0),
      fgm: acc.fgm + p.fgm, fga: acc.fga + p.fga,
      p3m: acc.p3m + p.p3m, p3a: acc.p3a + p.p3a, ftm: acc.ftm + p.ftm, fta: acc.fta + p.fta,
      plusMinus: acc.plusMinus + p.plusMinus // Not technically summed for team, but for completeness
    }), { mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, plusMinus: 0 });
  }, [box]);

  const highlightClass = "text-yellow-400 font-medium pretendard drop-shadow-[0_0_5px_rgba(250,204,21,0.5)]";
  const statCellClass = "py-2.5 px-2 text-xs font-medium pretendard";

  const getPct = (m: number, a: number) => a > 0 ? (m / a * 100).toFixed(1) : '0.0';

  return (
    <div className={`flex flex-col ${!isFirst ? 'mt-10' : ''}`}>
       <div className="flex items-center gap-3 mb-4 px-2">
           <img src={team.logo} className="w-8 h-8 object-contain" alt="" />
           <h3 className="text-lg font-black uppercase text-white tracking-widest">{team.city} {team.name}</h3>
       </div>
       <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto custom-scrollbar">
             <table className="w-full text-left whitespace-nowrap">
                <thead>
                   <tr className="bg-slate-950/50 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
                      <th className="py-3 px-4 sticky left-0 bg-slate-950 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)] w-[140px]">Player</th>
                      <th className="py-3 px-2 text-center w-14">POS</th>
                      <th className="py-3 px-2 text-center w-14">OVR</th>
                      <th className="py-3 px-2 text-right w-14">MIN</th>
                      <th className="py-3 px-2 text-right w-14">PTS</th>
                      <th className="py-3 px-2 text-right w-14">REB</th>
                      <th className="py-3 px-2 text-right w-14">AST</th>
                      <th className="py-3 px-2 text-right w-14">STL</th>
                      <th className="py-3 px-2 text-right w-14">BLK</th>
                      <th className="py-3 px-2 text-right w-14">TOV</th>
                      <th className="py-3 px-2 text-right w-14">PF</th>
                      <th className="py-3 px-2 text-right w-14">FG</th>
                      <th className="py-3 px-2 text-right w-14">FG%</th>
                      <th className="py-3 px-2 text-right w-14">3P</th>
                      <th className="py-3 px-2 text-right w-14">3P%</th>
                      <th className="py-3 px-2 text-right w-14">FT</th>
                      <th className="py-3 px-2 text-right w-14">FT%</th>
                      <th className="py-3 px-2 text-right w-14">+/-</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                   {sortedBox.map(p => {
                       const playerInfo = team.roster.find(r => r.id === p.playerId);
                       const isMvp = p.playerId === mvpId;
                       const ovr = playerInfo?.ovr || 0;
                       
                       // Matchup Effect Logic
                       const effect = Math.round(p.matchupEffect || 0);
                       const isDebuff = effect < 0;
                       const isBuff = effect > 0;
                       
                       return (
                           <tr key={p.playerId} className={`hover:bg-white/5 transition-colors group ${isMvp ? 'bg-amber-900/10' : ''}`}>
                               <td className="py-2.5 px-4 sticky left-0 bg-slate-900 group-hover:bg-slate-800 transition-colors z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">
                                   <div className="flex items-center gap-2">
                                       <span className={`text-sm font-bold truncate max-w-[100px] ${isMvp ? 'text-amber-200' : 'text-slate-200'}`}>{p.playerName}</span>
                                       <div className="flex items-center gap-1 flex-shrink-0">
                                            {isMvp && <Crown size={12} className="text-amber-400 fill-amber-400 animate-pulse" />}
                                            {p.isStopper && (
                                                <div className="flex items-center justify-center" title="Ace Stopper">
                                                    <Shield size={12} className="text-cyan-400 fill-cyan-900" />
                                                </div>
                                            )}
                                            {/* Ace Target Chip: Shows regardless of +/- value if targeted */}
                                            {p.isAceTarget && (
                                                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${isDebuff ? 'bg-red-950/50 border-red-500/30' : isBuff ? 'bg-emerald-950/50 border-emerald-500/30' : 'bg-slate-800 border-slate-600/30'}`}>
                                                    {isDebuff ? (
                                                        <Lock size={10} className="text-red-400" />
                                                    ) : (
                                                        <Unlock size={10} className={isBuff ? "text-emerald-400" : "text-slate-400"} />
                                                    )}
                                                    <span className={`text-[9px] font-black leading-none ${isDebuff ? 'text-red-400' : isBuff ? 'text-emerald-400' : 'text-slate-400'}`}>
                                                        {effect > 0 ? '+' : ''}{effect}%
                                                    </span>
                                                </div>
                                            )}
                                       </div>
                                   </div>
                               </td>
                               <td className={`${statCellClass} text-center text-slate-500`}>{playerInfo?.position}</td>
                               <td className={`${statCellClass} text-center`}>
                                   <div className={getOvrBadgeStyle(ovr) + " !w-7 !h-7 !text-xs !mx-auto"}>{ovr}</div>
                               </td>
                               <td className={`${statCellClass} text-right text-slate-400`}>{Math.round(p.mp)}</td>
                               <td className={`${statCellClass} text-right ${p.pts === leaders.pts && p.pts > 0 ? highlightClass : 'text-white'}`}>{p.pts}</td>
                               <td className={`${statCellClass} text-right ${p.reb === leaders.reb && p.reb > 0 ? highlightClass : 'text-slate-300'}`}>{p.reb}</td>
                               <td className={`${statCellClass} text-right ${p.ast === leaders.ast && p.ast > 0 ? highlightClass : 'text-slate-300'}`}>{p.ast}</td>
                               <td className={`${statCellClass} text-right ${p.stl === leaders.stl && p.stl > 0 ? highlightClass : 'text-slate-400'}`}>{p.stl}</td>
                               <td className={`${statCellClass} text-right ${p.blk === leaders.blk && p.blk > 0 ? highlightClass : 'text-slate-400'}`}>{p.blk}</td>
                               <td className={`${statCellClass} text-right text-slate-400`}>{p.tov}</td>
                               <td className={`${statCellClass} text-right text-slate-400`}>{p.pf || 0}</td>
                               <td className={`${statCellClass} text-right text-slate-400`}>{p.fgm}/{p.fga}</td>
                               <td className={`${statCellClass} text-right text-slate-500`}>{getPct(p.fgm, p.fga)}</td>
                               <td className={`${statCellClass} text-right text-slate-400`}>{p.p3m}/{p.p3a}</td>
                               <td className={`${statCellClass} text-right text-slate-500`}>{getPct(p.p3m, p.p3a)}</td>
                               <td className={`${statCellClass} text-right text-slate-400`}>{p.ftm}/{p.fta}</td>
                               <td className={`${statCellClass} text-right text-slate-500`}>{getPct(p.ftm, p.fta)}</td>
                               <td className={`${statCellClass} text-right font-black ${p.plusMinus > 0 ? 'text-emerald-400' : p.plusMinus < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                    {p.plusMinus > 0 ? '+' : ''}{p.plusMinus}
                               </td>
                           </tr>
                       );
                   })}
                </tbody>
                <tfoot className="bg-slate-950/30 font-black text-xs border-t border-slate-800">
                    <tr>
                        <td className="py-3 px-4 sticky left-0 bg-slate-950 z-10 text-indigo-400 uppercase tracking-widest shadow-[2px_0_5px_rgba(0,0,0,0.5)]">Total</td>
                        <td colSpan={2}></td>
                        <td className={`${statCellClass} text-right text-slate-400`}>{Math.round(teamTotals.mp)}</td>
                        <td className={`${statCellClass} text-right text-white`}>{teamTotals.pts}</td>
                        <td className={`${statCellClass} text-right text-slate-300`}>{teamTotals.reb}</td>
                        <td className={`${statCellClass} text-right text-slate-300`}>{teamTotals.ast}</td>
                        <td className={`${statCellClass} text-right text-slate-400`}>{teamTotals.stl}</td>
                        <td className={`${statCellClass} text-right text-slate-400`}>{teamTotals.blk}</td>
                        <td className={`${statCellClass} text-right text-slate-400`}>{teamTotals.tov}</td>
                        <td className={`${statCellClass} text-right text-slate-400`}>{teamTotals.pf}</td>
                        <td className={`${statCellClass} text-right text-slate-400`}>{teamTotals.fgm}/{teamTotals.fga}</td>
                        <td className={`${statCellClass} text-right text-slate-500`}>{getPct(teamTotals.fgm, teamTotals.fga)}</td>
                        <td className={`${statCellClass} text-right text-slate-400`}>{teamTotals.p3m}/{teamTotals.p3a}</td>
                        <td className={`${statCellClass} text-right text-slate-500`}>{getPct(teamTotals.p3m, teamTotals.p3a)}</td>
                        <td className={`${statCellClass} text-right text-slate-400`}>{teamTotals.ftm}/{teamTotals.fta}</td>
                        <td className={`${statCellClass} text-right text-slate-500`}>{getPct(teamTotals.ftm, teamTotals.fta)}</td>
                        <td className={`${statCellClass} text-right text-slate-500`}>-</td>
                    </tr>
                </tfoot>
             </table>
          </div>
       </div>
    </div>
  );
};
