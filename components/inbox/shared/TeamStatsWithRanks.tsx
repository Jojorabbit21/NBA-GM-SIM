import React, { useState } from 'react';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../common/Table';
import type { StatColDef } from './inboxTypes';
import { fmtStatVal } from './inboxUtils';

interface TeamStatsWithRanksProps {
    sectionTitle: string;
    tabs: string[];
    tabLabels: Record<string, string>;
    colsMap: Record<string, StatColDef[]>;
    teamStats: Record<string, number>;
    computeRank: (key: string, inv?: boolean) => number;
    /** 순위 색상 기준: goodThreshold 이하이면 emerald, badThreshold 이상이면 red */
    goodRankThreshold?: number;
    badRankThreshold?: number;
}

export const TeamStatsWithRanks: React.FC<TeamStatsWithRanksProps> = ({
    sectionTitle,
    tabs,
    tabLabels,
    colsMap,
    teamStats,
    computeRank,
    goodRankThreshold = 10,
    badRankThreshold = 21,
}) => {
    const [activeTab, setActiveTab] = useState(tabs[0]);
    const cols = colsMap[activeTab] || [];

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">{sectionTitle}</h3>
                <div className="flex p-1 bg-slate-900 rounded-xl border border-slate-800">
                    {tabs.map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                activeTab === tab ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            {tabLabels[tab]}
                        </button>
                    ))}
                </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <Table className="!rounded-none !border-0 !shadow-none" style={{ minWidth: '100%' }}>
                    <TableHead className="bg-slate-950">
                        {cols.map(c => (
                            <TableHeaderCell key={c.key} align="center" className="w-14">{c.label}</TableHeaderCell>
                        ))}
                    </TableHead>
                    <TableBody>
                        <TableRow>
                            {cols.map(c => (
                                <TableCell key={c.key} align="center" className={`text-xs font-mono tabular-nums ${
                                    c.fmt === 'diff'
                                        ? (teamStats[c.key] > 0 ? 'text-emerald-400' : teamStats[c.key] < 0 ? 'text-red-400' : 'text-slate-500')
                                        : 'text-white'
                                }`}>
                                    {fmtStatVal(teamStats[c.key], c.fmt)}
                                </TableCell>
                            ))}
                        </TableRow>
                        <tr>
                            {cols.map(c => {
                                const rank = computeRank(c.key, c.inv);
                                const rankColor = rank <= goodRankThreshold ? 'text-emerald-400' : rank >= badRankThreshold ? 'text-red-400' : 'text-slate-500';
                                return (
                                    <td key={c.key} className={`text-center text-[10px] font-bold py-1.5 bg-slate-950/50 border-t border-slate-800/50 ${rankColor}`}>
                                        {rank}위
                                    </td>
                                );
                            })}
                        </tr>
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};
