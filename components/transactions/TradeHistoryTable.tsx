
import React from 'react';
import { Transaction, Team } from '../../types';
import { History } from 'lucide-react';
import { getOvrBadgeStyle } from '../SharedComponents';
import { getTeamLogoUrl } from '../../utils/constants';

interface TradeHistoryTableProps {
  transactions: Transaction[];
  historyFilter: 'all' | 'mine';
  teamId: string;
  teams: Team[];
  currentSimDate: string;
}

export const TradeHistoryTable: React.FC<TradeHistoryTableProps> = ({ transactions, historyFilter, teamId, teams, currentSimDate }) => {
    
    // Helper to get partial snapshot
    const getSnapshot = (id: string, savedOvr?: number, savedPos?: string) => {
      if (savedOvr !== undefined && savedPos) return { ovr: savedOvr, pos: savedPos };
      for (const t of teams) {
          const p = t.roster.find(rp => rp.id === id);
          if (p) return { ovr: p.ovr, pos: p.position };
      }
      return { ovr: 0, pos: '-' };
    };

    if (transactions.length === 0) {
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

    return (
        <table className="w-full text-left border-collapse">
            <thead>
                <tr className="border-b border-slate-800 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <th className="py-4 px-4 w-32">일자</th>
                    <th className="py-4 px-4 w-60">참여 구단</th>
                    <th className="py-4 px-4">IN Assets</th>
                    <th className="py-4 px-4">OUT Assets</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
                {transactions.map(t => {
                    const initiator = teams.find(it => it.id === t.teamId);
                    const partner = teams.find(pt => pt.id === t.details?.partnerTeamId);
                    
                    return (
                    <tr key={t.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-4 px-4 align-middle">
                            <div className="text-xs font-bold text-slate-400">{t.date === 'TODAY' ? currentSimDate : t.date}</div>
                            <div className="text-[10px] text-slate-600 font-mono mt-1">{t.id.slice(-6)}</div>
                        </td>
                        <td className="py-4 px-4 align-middle">
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <img src={getTeamLogoUrl(initiator?.id || '')} className="w-6 h-6 object-contain" alt="" />
                                    <span className={`text-xs font-black uppercase ${initiator?.id === teamId ? 'text-indigo-400' : 'text-white'}`}>{initiator?.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <img src={getTeamLogoUrl(partner?.id || '')} className="w-6 h-6 object-contain" alt="" />
                                    <span className={`text-xs font-black uppercase ${partner?.id === teamId ? 'text-indigo-400' : 'text-white'}`}>{partner?.name}</span>
                                </div>
                            </div>
                        </td>
                        <td className="py-4 px-4 align-middle">
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
                            </div>
                        </td>
                        <td className="py-4 px-4 align-middle">
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
                            </div>
                        </td>
                    </tr>
                    );
                })}
            </tbody>
        </table>
    );
};
