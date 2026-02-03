
import React, { useState } from 'react';
import { Transaction, Team } from '../../types';
import { History, ChevronLeft, ChevronRight, ArrowRightLeft } from 'lucide-react';
import { getOvrBadgeStyle } from '../SharedComponents';
import { getTeamLogoUrl, calculatePlayerOvr } from '../../utils/constants';

interface TradeHistoryTableProps {
  transactions: Transaction[];
  historyFilter: 'all' | 'mine';
  teamId: string;
  teams: Team[];
  currentSimDate: string;
}

const ITEMS_PER_PAGE = 20;

export const TradeHistoryTable: React.FC<TradeHistoryTableProps> = ({ transactions, historyFilter, teamId, teams, currentSimDate }) => {
    const [currentPage, setCurrentPage] = useState(1);
    
    // Helper to get partial snapshot
    const getSnapshot = (id: string, savedOvr?: number, savedPos?: string) => {
      // Find current player state first
      for (const t of teams) {
          const p = t.roster.find(rp => rp.id === id);
          if (p) {
              // [Fix] Use real-time OVR if player exists
              return { ovr: calculatePlayerOvr(p), pos: p.position };
          }
      }
      // Fallback to historical data if player retired or removed
      if (savedOvr !== undefined && savedPos) return { ovr: savedOvr, pos: savedPos };
      
      return { ovr: 0, pos: '-' };
    };

    const filteredTransactions = transactions.filter(t => {
        if (historyFilter === 'mine') {
            return t.teamId === teamId || t.details?.partnerTeamId === teamId;
        }
        return true; // 'all'
    });

    if (filteredTransactions.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
                <div className="p-6 bg-slate-900 rounded-full border border-slate-800"><History size={48} className="opacity-30" /></div>
                <div className="text-center">
                    <p className="font-black text-lg text-slate-500 uppercase oswald tracking-widest">No Transactions</p>
                    <p className="text-xs font-bold text-slate-600">{historyFilter === 'mine' ? '내 팀의 트레이드 기록이 없습니다.' : '아직 진행된 트레이드가 없습니다.'}</p>
                </div>
            </div>
        );
    }

    // Pagination Logic
    const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
    const paginatedTransactions = filteredTransactions.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= totalPages) {
            setCurrentPage(newPage);
            const container = document.querySelector('.custom-scrollbar');
            if (container) container.scrollTop = 0;
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-800 text-[10px] font-black text-slate-500 uppercase tracking-widest sticky top-0 bg-slate-900 z-10">
                            <th className="py-4 px-4 w-32">일자</th>
                            <th className="py-4 px-4 w-60">참여 구단</th>
                            <th className="py-4 px-4">IN Assets (to Team 1)</th>
                            <th className="py-4 px-4">OUT Assets (to Team 2)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {paginatedTransactions.map(t => {
                            if (!t) return null;
                            
                            const team1 = teams.find(it => it.id === t.teamId);
                            const team2 = teams.find(pt => pt.id === t.details?.partnerTeamId);
                            
                            const team1Name = team1?.name || t.teamId;
                            const team2Name = team2?.name || t.details?.partnerTeamName || 'Unknown';
                            
                            const txId = (t.id && typeof t.id === 'string') ? t.id.slice(-6) : '??????';
                            
                            return (
                            <tr key={t.id || Math.random()} className="hover:bg-white/5 transition-colors">
                                <td className="py-4 px-4 align-top">
                                    <div className="text-xs font-bold text-slate-400">{t.date === 'TODAY' ? currentSimDate : t.date}</div>
                                    <div className="text-[10px] text-slate-600 font-mono mt-1">ID: {txId}</div>
                                </td>
                                <td className="py-4 px-4 align-top">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-2">
                                            <img src={getTeamLogoUrl(t.teamId)} className="w-6 h-6 object-contain" alt="" />
                                            <span className={`text-xs font-black uppercase ${t.teamId === teamId ? 'text-indigo-400' : 'text-white'}`}>{team1Name}</span>
                                        </div>
                                        <div className="pl-2">
                                             <ArrowRightLeft size={12} className="text-slate-600" />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <img src={getTeamLogoUrl(t.details?.partnerTeamId || '')} className="w-6 h-6 object-contain" alt="" />
                                            <span className={`text-xs font-black uppercase ${t.details?.partnerTeamId === teamId ? 'text-indigo-400' : 'text-white'}`}>{team2Name}</span>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-4 px-4 align-top">
                                    <div className="flex flex-col gap-2">
                                        {(t.details?.acquired || []).map((p, i) => {
                                            const snap = getSnapshot(p.id, p.ovr, p.position);
                                            return (
                                                <div key={i} className="flex items-center gap-3">
                                                    <div className={`${getOvrBadgeStyle(snap.ovr || 70)} !w-6 !h-6 !text-xs !mx-0`}>{snap.ovr || '-'}</div>
                                                    <span className="text-sm font-bold text-emerald-300">{p.name}</span>
                                                    <span className="text-[9px] font-black text-slate-500 bg-slate-950 px-1 py-0.5 rounded border border-slate-800">{snap.pos || '?'}</span>
                                                </div>
                                            );
                                        })}
                                        {(t.details?.acquired || []).length === 0 && <span className="text-xs text-slate-600 italic">No assets</span>}
                                    </div>
                                </td>
                                <td className="py-4 px-4 align-top">
                                    <div className="flex flex-col gap-2">
                                        {(t.details?.traded || []).map((p, i) => {
                                            const snap = getSnapshot(p.id, p.ovr, p.position);
                                            return (
                                                <div key={i} className="flex items-center gap-3">
                                                    <div className={`${getOvrBadgeStyle(snap.ovr || 70)} !w-6 !h-6 !text-xs !mx-0`}>{snap.ovr || '-'}</div>
                                                    <span className="text-sm font-bold text-red-300/80">{p.name}</span>
                                                    <span className="text-[9px] font-black text-slate-500 bg-slate-950 px-1 py-0.5 rounded border border-slate-800">{snap.pos || '?'}</span>
                                                </div>
                                            );
                                        })}
                                        {(t.details?.traded || []).length === 0 && <span className="text-xs text-slate-600 italic">No assets</span>}
                                    </div>
                                </td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 bg-slate-950/30">
                    <div className="text-xs font-bold text-slate-500">
                        Page {currentPage} of {totalPages}
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button 
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
