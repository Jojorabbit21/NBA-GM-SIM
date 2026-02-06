import React from 'react';
import { Team, PlayerBoxScore } from '../../types';
import { Crown, Shield, Lock, Unlock } from 'lucide-react';
import { getOvrBadgeStyle } from '../SharedComponents';
import { calculatePlayerOvr } from '../../utils/constants';

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
    mvpId?: string;
    leaders: GameStatLeaders;
}

export const BoxScoreTable: React.FC<BoxScoreTableProps> = ({ team, box, isFirst, mvpId, leaders }) => {
    
    // Sort players: Starters first (GS=1), then by MP
    const sortedBox = [...box].sort((a, b) => {
        if (a.gs !== b.gs) return b.gs - a.gs;
        return b.mp - a.mp;
    });

    const statCellClass = "py-2.5 px-2 text-right text-xs font-bold text-slate-300 font-mono tabular-nums";

    return (
        <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <img src={team.logo} className="w-8 h-8 object-contain" alt="" />
                    <span className="text-sm font-black text-white uppercase tracking-wider">{team.name}</span>
                </div>
            </div>
            
            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                        <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950/50">
                            <th className="py-3 px-4 sticky left-0 bg-slate-950 z-20 w-40 text-left shadow-[2px_0_5px_rgba(0,0,0,0.5)]">PLAYER</th>
                            <th className="py-3 px-2 text-center w-12">POS</th>
                            <th className="py-3 px-2 text-center w-10">OVR</th>
                            <th className="py-3 px-2 text-right w-12">MIN</th>
                            <th className="py-3 px-2 text-right w-12 text-white">PTS</th>
                            <th className="py-3 px-2 text-right w-12">REB</th>
                            <th className="py-3 px-2 text-right w-12">AST</th>
                            <th className="py-3 px-2 text-right w-12">STL</th>
                            <th className="py-3 px-2 text-right w-12">BLK</th>
                            <th className="py-3 px-2 text-right w-12">TOV</th>
                            <th className="py-3 px-2 text-right w-12">PF</th>
                            <th className="py-3 px-2 text-right w-16">FG</th>
                            <th className="py-3 px-2 text-right w-16">3P</th>
                            <th className="py-3 px-2 text-right w-16">FT</th>
                            <th className="py-3 px-4 text-right w-14">+/-</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {sortedBox.map(p => {
                            // Helper to find player details
                            const playerInfo = team.roster.find(rp => rp.id === p.playerId);
                            const ovr = playerInfo ? calculatePlayerOvr(playerInfo) : 70;
                            const isMvp = p.playerId === mvpId;
                            
                            const effect = p.matchupEffect || 0;
                            const isBuff = effect > 0;
                            const isDebuff = effect < 0;

                            return (
                                <tr key={p.playerId} className={`group hover:bg-white/5 transition-colors ${isMvp ? 'bg-amber-900/10' : ''}`}>
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
                                    <td className={`${statCellClass} text-center text-slate-500`}>{playerInfo?.position || '-'}</td>
                                    <td className={`${statCellClass} text-center`}>
                                        <div className="flex items-center justify-center gap-1">
                                            <div className={getOvrBadgeStyle(ovr) + " !w-7 !h-7 !text-xs !mx-0"}>{ovr}</div>
                                            {/* Condition Pill */}
                                            {p.mp > 0 && p.condition !== undefined && (
                                                <div 
                                                    className={`w-7 h-7 rounded flex items-center justify-center text-[10px] font-black border ${
                                                        p.condition < 60 ? 'bg-red-900/50 border-red-500 text-red-400' : 
                                                        p.condition < 80 ? 'bg-amber-900/50 border-amber-500 text-amber-400' : 
                                                        'bg-emerald-900/50 border-emerald-500 text-emerald-400'
                                                    }`}
                                                    title="경기 종료 시 체력 (Remaining Stamina)"
                                                >
                                                    {p.condition}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className={statCellClass}>{Math.round(p.mp)}</td>
                                    <td className={`${statCellClass} text-white`}>{p.pts}</td>
                                    <td className={statCellClass}>{p.reb}</td>
                                    <td className={statCellClass}>{p.ast}</td>
                                    <td className={statCellClass}>{p.stl}</td>
                                    <td className={statCellClass}>{p.blk}</td>
                                    <td className={statCellClass}>{p.tov}</td>
                                    <td className={statCellClass}>{p.pf}</td>
                                    <td className={statCellClass}>{p.fgm}/{p.fga}</td>
                                    <td className={statCellClass}>{p.p3m}/{p.p3a}</td>
                                    <td className={statCellClass}>{p.ftm}/{p.fta}</td>
                                    <td className={`py-2.5 px-4 text-right text-xs font-bold font-mono tabular-nums ${p.plusMinus > 0 ? 'text-emerald-400' : p.plusMinus < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                        {p.plusMinus > 0 ? '+' : ''}{p.plusMinus}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};