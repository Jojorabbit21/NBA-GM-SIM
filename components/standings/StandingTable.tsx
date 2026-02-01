
import React, { useCallback } from 'react';
import { Team } from '../../types';

interface StandingTableProps {
    teamList: Team[];
    title: string;
    isConference?: boolean;
    highlightColor?: string;
    onTeamClick: (id: string) => void;
    mode?: 'Conference' | 'Division';
    confRankMap?: Record<string, number>;
}

export const StandingTable: React.FC<StandingTableProps> = ({ 
    teamList, title, isConference = false, highlightColor = 'indigo', onTeamClick, mode, confRankMap 
}) => {
    
    const getFilteredAndSortedTeams = useCallback((list: Team[]) => {
        if (!list || list.length === 0) return [];
        return [...list].sort((a, b) => {
            const aPct = (a.wins + a.losses === 0) ? 0 : a.wins / (a.wins + a.losses);
            const bPct = (b.wins + b.losses === 0) ? 0 : b.wins / (b.wins + b.losses);
            return bPct - aPct || b.wins - a.wins;
        });
    }, []);

    const calculateGB = (team: Team, leader: Team) => {
        if (!leader || !team || team.id === leader.id) return '-';
        return (((leader.wins - leader.losses) - (team.wins - team.losses)) / 2).toFixed(1);
    };

    const sorted = getFilteredAndSortedTeams(teamList);
    const leader = sorted.length > 0 ? sorted[0] : null;

    return (
        <div className="bg-slate-900/90 rounded-[1.5rem] border border-slate-800 overflow-hidden shadow-xl flex flex-col">
            <div className="bg-slate-800/40 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className={`text-lg font-black oswald uppercase tracking-wider text-${highlightColor}-400`}>{title}</h3>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{teamList.length} TEAMS</span>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-800/50">
                            <th className="pl-6 pr-2 py-3 w-12">#</th>
                            <th className="px-2 py-3">Team</th>
                            <th className="px-2 py-3 text-center w-10">W</th>
                            <th className="px-2 py-3 text-center w-10">L</th>
                            <th className="px-2 py-3 text-center w-16">PCT</th>
                            <th className="pl-2 pr-6 py-3 text-center w-14">GB</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.length > 0 ? sorted.map((t, i) => {
                            let statusEmoji = null;
                            if (mode === 'Division' && confRankMap) {
                                const rank = confRankMap[t.id];
                                if (i === 0) statusEmoji = '🏆'; 
                                else if (rank <= 6) statusEmoji = '🔒'; 
                                else if (rank <= 10) statusEmoji = '🎟️'; 
                                else statusEmoji = '❌'; 
                            }

                            return (
                                <React.Fragment key={t.id}>
                                    <tr className={`
                                        hover:bg-slate-800/20 transition-all border-b border-slate-800/30 group
                                        ${isConference && i >= 0 && i <= 5 ? 'bg-indigo-900/10' : ''}
                                        ${isConference && i >= 6 && i <= 9 ? 'bg-fuchsia-900/10' : ''}
                                    `}>
                                        <td className="pl-6 pr-2 py-3 font-semibold text-slate-400 text-base group-hover:text-slate-100">{i + 1}</td>
                                        <td className="px-2 py-3 cursor-pointer" onClick={() => onTeamClick(t.id)}>
                                            <div className="flex items-center gap-2 max-w-[180px] group-hover:translate-x-1 transition-transform">
                                                <img src={t.logo} className="w-6 h-6 object-contain" alt="" />
                                                <span className="font-bold text-slate-100 text-sm truncate group-hover:text-indigo-400 transition-colors">{t.name}</span>
                                                {statusEmoji && <span className="text-xs ml-1 filter drop-shadow-md select-none">{statusEmoji}</span>}
                                            </div>
                                        </td>
                                        <td className="px-2 py-3 text-center font-semibold text-sm text-white">{t.wins}</td>
                                        <td className="px-2 py-3 text-center font-semibold text-sm text-slate-500">{t.losses}</td>
                                        <td className="px-2 py-3 text-center font-semibold text-slate-400 text-[11px]">{(t.wins + t.losses === 0 ? 0 : t.wins / (t.wins + t.losses)).toFixed(3).replace(/^0/, '')}</td>
                                        <td className={`pl-2 pr-6 py-3 text-center font-semibold text-sm ${i === 0 ? 'text-slate-500' : `text-${highlightColor}-400/80`}`}>{leader ? calculateGB(t, leader) : '-'}</td>
                                    </tr>

                                    {/* Playoff Guarantee Separator */}
                                    {isConference && i === 5 && (
                                        <tr className="border-b border-slate-800/50">
                                            <td colSpan={6} className="p-0">
                                                <div className="flex items-center justify-center relative h-8 bg-slate-900/50">
                                                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-slate-800"></div>
                                                    <span className="relative z-10 px-4 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-slate-950 border border-emerald-500/30 rounded-full shadow-sm">
                                                        Playoffs Guaranteed
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    )}

                                    {/* Play-In Cutoff Separator */}
                                    {isConference && i === 9 && (
                                        <tr className="border-b border-slate-800/50">
                                            <td colSpan={6} className="p-0">
                                                <div className="flex items-center justify-center relative h-8 bg-slate-900/50">
                                                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-slate-800"></div>
                                                    <span className="relative z-10 px-4 py-1 text-[10px] font-black uppercase tracking-widest text-amber-400 bg-slate-950 border border-amber-500/30 rounded-full shadow-sm">
                                                        Play-In Cutoff
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        }) : (
                            <tr>
                                <td colSpan={6} className="py-12 text-center text-slate-600 text-xs font-black uppercase tracking-widest">
                                    No data available
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
