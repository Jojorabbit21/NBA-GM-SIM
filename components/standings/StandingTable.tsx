
import React, { useCallback } from 'react';
import { Team } from '../../types';
import { TeamLogo } from '../common/TeamLogo';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';

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

    // Data column text styles (Updated: text-xs, text-slate-400)
    const dataTextClass = "font-mono text-xs text-slate-400";

    return (
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden shadow-xl flex flex-col">
            {/* Table Title Bar */}
            <div className="bg-slate-800/40 px-6 py-4 border-b border-slate-800">
                <h3 className={`text-lg font-black oswald uppercase tracking-wider text-${highlightColor}-400`}>{title}</h3>
            </div>
            
            {/* [Fix] Added !bg-transparent to remove the underlying default background that causes edge artifacts */}
            <Table className="rounded-none border-0 shadow-none !bg-transparent" fullHeight={false}>
                <TableHead className="bg-slate-950 border-none">
                    <TableHeaderCell align="left" className="pl-6 pr-2 w-12 !rounded-none border-none bg-slate-950">#</TableHeaderCell>
                    <TableHeaderCell align="left" className="px-2 border-none bg-slate-950 !rounded-none">TEAM</TableHeaderCell>
                    <TableHeaderCell align="center" className="px-2 w-10 border-none bg-slate-950 !rounded-none">W</TableHeaderCell>
                    <TableHeaderCell align="center" className="px-2 w-10 border-none bg-slate-950 !rounded-none">L</TableHeaderCell>
                    <TableHeaderCell align="center" className="px-2 w-16 border-none bg-slate-950 !rounded-none">PCT</TableHeaderCell>
                    <TableHeaderCell align="center" className="pl-2 pr-6 w-14 !rounded-none border-none bg-slate-950">GB</TableHeaderCell>
                </TableHead>
                <TableBody>
                    {sorted.length > 0 ? sorted.map((t, i) => {
                        let statusEmoji = null;
                        if (mode === 'Division' && confRankMap) {
                            const rank = confRankMap[t.id];
                            if (i === 0) statusEmoji = '🏆'; 
                            else if (rank <= 6) statusEmoji = '🔒'; 
                            else if (rank <= 10) statusEmoji = '🎟️'; 
                            else statusEmoji = '❌'; 
                        }

                        const rankVal = i + 1;
                        const winsVal = t.wins ?? 0;
                        const lossesVal = t.losses ?? 0;
                        const pctVal = (t.wins + t.losses === 0 ? 0 : t.wins / (t.wins + t.losses)).toFixed(3).replace(/^0/, '');
                        const gbVal = leader ? calculateGB(t, leader) : '-';

                        const rowClass = `
                            ${isConference && i >= 0 && i <= 5 ? 'bg-indigo-900/10' : ''}
                            ${isConference && i >= 6 && i <= 9 ? 'bg-fuchsia-900/10' : ''}
                        `;

                        return (
                            <React.Fragment key={t.id}>
                                <TableRow className={rowClass}>
                                    <TableCell className={`pl-6 pr-2 ${dataTextClass} group-hover:text-slate-100`}>{rankVal}</TableCell>
                                    <TableCell 
                                        className="px-2 cursor-pointer" 
                                        onClick={() => onTeamClick(t.id)}
                                    >
                                        <div className="flex items-center gap-2 max-w-[180px] group-hover:translate-x-1 transition-transform">
                                            <TeamLogo teamId={t.id} size="sm" />
                                            <span className="font-bold text-slate-100 text-sm truncate group-hover:text-indigo-400 transition-colors">{t.name}</span>
                                            {statusEmoji && <span className="text-xs ml-1 filter drop-shadow-md select-none">{statusEmoji}</span>}
                                        </div>
                                    </TableCell>
                                    <TableCell align="center" className={`px-2 ${dataTextClass}`}>{winsVal}</TableCell>
                                    <TableCell align="center" className={`px-2 ${dataTextClass}`}>{lossesVal}</TableCell>
                                    <TableCell align="center" className={`px-2 ${dataTextClass}`}>{pctVal}</TableCell>
                                    <TableCell align="center" className={`pl-2 pr-6 ${dataTextClass}`}>{gbVal}</TableCell>
                                </TableRow>

                                {/* Playoff Guarantee Separator */}
                                {isConference && i === 5 && (
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell colSpan={6} className="p-0 border-b border-slate-800/50">
                                            <div className="flex items-center justify-center relative h-8 bg-slate-900/50">
                                                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-slate-800"></div>
                                                <span className="relative z-10 px-4 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-slate-950 border border-emerald-500/30 rounded-full shadow-sm">
                                                    플레이오프
                                                </span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}

                                {/* Play-In Cutoff Separator */}
                                {isConference && i === 9 && (
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell colSpan={6} className="p-0 border-b border-slate-800/50">
                                            <div className="flex items-center justify-center relative h-8 bg-slate-900/50">
                                                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-slate-800"></div>
                                                <span className="relative z-10 px-4 py-1 text-[10px] font-black uppercase tracking-widest text-amber-400 bg-slate-950 border border-amber-500/30 rounded-full shadow-sm">
                                                    플레이-인 토너먼트
                                                </span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </React.Fragment>
                        );
                    }) : (
                        <TableRow>
                            <TableCell colSpan={6} className="py-12 text-center text-slate-600 text-xs font-black uppercase tracking-widest">
                                No data available
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
};
