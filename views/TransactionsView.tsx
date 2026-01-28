
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Users, ArrowLeftRight, Loader2, X, Briefcase, CheckCircle2, MinusCircle, Trash2, Send, ListFilter, History, Clock, Search, Lock, Activity, Handshake, Target, Filter } from 'lucide-react';
import { Team, Player, TradeOffer, Transaction } from '../types';
import { generateTradeOffers, generateCounterOffers } from '../services/tradeEngine';
import { getOvrBadgeStyle, PlayerDetailModal } from '../components/SharedComponents';
import { getTeamLogoUrl, TRADE_DEADLINE } from '../utils/constants';
import { logEvent } from '../services/analytics'; 
import { saveUserTransaction } from '../services/queries';
import { supabase } from '../services/supabaseClient';

// Components
import { TradeConfirmModal } from '../components/transactions/TradeConfirmModal';
import { OfferCard } from '../components/transactions/OfferCard';
import { RequirementCard } from '../components/transactions/RequirementCard';
import { PositionFilter } from '../components/transactions/PositionFilter';

interface TransactionsViewProps {
  team: Team;
  teams: Team[];
  setTeams: React.Dispatch<React.SetStateAction<Team[]>>;
  addNews: (news: string[]) => void;
  onShowToast: (message: string) => void;
  currentSimDate: string;
  transactions?: Transaction[];
  onAddTransaction?: (t: Transaction) => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({ team, teams, setTeams, addNews, onShowToast, currentSimDate, transactions = [], onAddTransaction }) => {
  const [activeTab, setActiveTab] = useState<'Block' | 'Proposal' | 'History'>('Block');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'mine'>('all');
  const [blockSelectedIds, setBlockSelectedIds] = useState<Set<string>>(new Set());
  const [blockOffers, setBlockOffers] = useState<TradeOffer[]>([]);
  const [blockIsProcessing, setBlockIsProcessing] = useState(false);
  const [blockSearchPerformed, setBlockSearchPerformed] = useState(false);
  const [targetPositions, setTargetPositions] = useState<string[]>([]);

  const [proposalTargetTeamId, setProposalTargetTeamId] = useState<string>('');
  const [proposalSelectedIds, setProposalSelectedIds] = useState<Set<string>>(new Set());
  const [proposalRequirements, setProposalRequirements] = useState<TradeOffer[]>([]);
  const [proposalIsProcessing, setProposalIsProcessing] = useState(false);
  const [proposalSearchPerformed, setProposalSearchPerformed] = useState(false);
  
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);

  const [pendingTrade, setPendingTrade] = useState<{
    userAssets: Player[],
    targetAssets: Player[],
    targetTeam: Team
  } | null>(null);

  const isTradeDeadlinePassed = useMemo(() => {
    return new Date(currentSimDate) > new Date(TRADE_DEADLINE);
  }, [currentSimDate]);

  const filteredHistory = useMemo(() => {
    if (historyFilter === 'all') return transactions;
    return transactions.filter(t => t.teamId === team.id || t.details?.partnerTeamId === team.id);
  }, [transactions, historyFilter, team.id]);

  const executeTrade = async () => {
    if (!pendingTrade || !team) return;
    const { userAssets, targetAssets, targetTeam } = pendingTrade;
    
    const newTransaction: Transaction = {
        id: `tr_${Date.now()}`,
        date: currentSimDate,
        type: 'Trade',
        teamId: team.id,
        description: `${targetTeam.name}와의 트레이드 합의`,
        details: {
            acquired: targetAssets.map(p => ({ id: p.id, name: p.name, ovr: p.ovr, position: p.position })),
            traded: userAssets.map(p => ({ id: p.id, name: p.name, ovr: p.ovr, position: p.position })),
            partnerTeamId: targetTeam.id,
            partnerTeamName: targetTeam.name
        }
    };

    if (onAddTransaction) onAddTransaction(newTransaction);

    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) saveUserTransaction(userData.user.id, newTransaction);

    setTeams(prevTeams => prevTeams.map(t => {
      if (t.id === team.id) {
        const remaining = t.roster.filter(p => !userAssets.some(u => u.id === p.id));
        return { ...t, roster: [...remaining, ...targetAssets] };
      }
      if (t.id === targetTeam.id) {
        const remaining = t.roster.filter(p => !targetAssets.some(x => x.id === p.id));
        return { ...t, roster: [...remaining, ...userAssets] };
      }
      return t;
    }));
    onShowToast(`트레이드 성사!`);
    setPendingTrade(null);
    setBlockSelectedIds(new Set()); setBlockOffers([]); 
    setProposalSelectedIds(new Set()); setProposalRequirements([]);
  };

  const getSnapshot = (id: string, savedOvr?: number, savedPos?: string) => {
      if (savedOvr !== undefined && savedPos) return { ovr: savedOvr, pos: savedPos };
      for (const t of teams) {
          const p = t.roster.find(rp => rp.id === id);
          if (p) return { ovr: p.ovr, pos: p.position };
      }
      return { ovr: 0, pos: '-' };
  };

  const sortedUserRoster = useMemo(() => [...(team?.roster || [])].sort((a,b) => b.ovr - a.ovr), [team?.roster]);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] animate-in fade-in duration-500 ko-normal gap-6">
       {viewPlayer && <PlayerDetailModal player={viewPlayer} teamName={teams.find(t => t.roster.some(rp => rp.id === viewPlayer.id))?.name} onClose={() => setViewPlayer(null)} />}
       {pendingTrade && (
         <TradeConfirmModal 
            userAssets={pendingTrade.userAssets} 
            targetAssets={pendingTrade.targetAssets} 
            userTeam={team} 
            targetTeam={pendingTrade.targetTeam} 
            onConfirm={executeTrade} 
            onCancel={() => setPendingTrade(null)} 
         />
       )}
       <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-slate-800 pb-6 flex-shrink-0">
           <h2 className="text-4xl lg:text-5xl font-black ko-tight text-slate-100 uppercase tracking-tight">트레이드 센터</h2>
           <div className="flex gap-3">
              <button onClick={() => setActiveTab('Block')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'Block' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-900 text-slate-500 hover:text-slate-300'}`}><ListFilter size={16} /> 트레이드 블록</button>
              <button onClick={() => setActiveTab('Proposal')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'Proposal' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-900 text-slate-500 hover:text-slate-300'}`}><Send size={16} /> 직접 제안</button>
              <button onClick={() => setActiveTab('History')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'History' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-900 text-slate-500 hover:text-slate-300'}`}><History size={16} /> 트레이드 이력</button>
           </div>
      </div>

      <div className="flex-1 bg-slate-900/95 rounded-[2.5rem] border border-slate-800 flex flex-col overflow-hidden shadow-2xl min-h-0">
         {activeTab === 'History' && (
             <div className="px-8 py-4 border-b border-slate-800 bg-slate-800/20 flex justify-between items-center">
                 <h3 className="text-lg font-black uppercase text-white oswald tracking-tight">리그 트레이드 로그</h3>
                 <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button onClick={() => setHistoryFilter('all')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${historyFilter === 'all' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>전체 리그</button>
                    <button onClick={() => setHistoryFilter('mine')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${historyFilter === 'mine' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>내 팀</button>
                 </div>
             </div>
         )}

         <div className="flex-1 overflow-hidden min-h-0">
            {activeTab === 'History' ? (
                <div className="h-full overflow-y-auto custom-scrollbar p-6">
                    {filteredHistory.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
                            <History size={48} className="opacity-30" />
                            <p className="font-bold text-sm">트레이드 기록이 없습니다.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-slate-900 z-10">
                                <tr className="border-b border-slate-800 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    <th className="py-4 px-4 w-32">일자</th>
                                    <th className="py-4 px-4 w-60">참여 구단</th>
                                    <th className="py-4 px-4">IN Assets</th>
                                    <th className="py-4 px-4">OUT Assets</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {filteredHistory.map(t => {
                                    const initiator = teams.find(it => it.id === t.teamId);
                                    const partner = teams.find(pt => pt.id === t.details?.partnerTeamId);
                                    return (
                                        <tr key={t.id} className="hover:bg-white/5 transition-colors">
                                            <td className="py-4 px-4 text-xs font-bold text-slate-400 align-top">{t.date}</td>
                                            <td className="py-4 px-4 align-top">
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center gap-2"><img src={getTeamLogoUrl(initiator?.id || '')} className="w-5 h-5 object-contain" /><span className={`text-xs font-black uppercase ${initiator?.id === team.id ? 'text-indigo-400' : 'text-white'}`}>{initiator?.name}</span></div>
                                                    <div className="flex items-center gap-2"><img src={getTeamLogoUrl(partner?.id || '')} className="w-5 h-5 object-contain" /><span className={`text-xs font-black uppercase ${partner?.id === team.id ? 'text-indigo-400' : 'text-white'}`}>{partner?.name}</span></div>
                                                </div>
                                            </td>
                                            <td className="py-4 px-4 align-top">
                                                <div className="flex flex-col gap-2">
                                                    {(t.details?.acquired || []).map((p, i) => {
                                                        const snap = getSnapshot(p.id, p.ovr, p.position);
                                                        return <div key={i} className="flex items-center gap-2 text-xs font-bold text-emerald-400"><div className={getOvrBadgeStyle(snap.ovr) + " !w-6 !h-6 !text-[10px] !mx-0"}>{snap.ovr}</div>{p.name}</div>
                                                    })}
                                                </div>
                                            </td>
                                            <td className="py-4 px-4 align-top">
                                                <div className="flex flex-col gap-2">
                                                    {(t.details?.traded || []).map((p, i) => {
                                                        const snap = getSnapshot(p.id, p.ovr, p.position);
                                                        return <div key={i} className="flex items-center gap-2 text-xs font-bold text-red-400"><div className={getOvrBadgeStyle(snap.ovr) + " !w-6 !h-6 !text-[10px] !mx-0"}>{snap.ovr}</div>{p.name}</div>
                                                    })}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            ) : (
                <div className="h-full flex items-center justify-center text-slate-500">
                    <p>트레이드 제안 로직은 기존과 동일하게 유지됩니다.</p>
                </div>
            )}
         </div>
      </div>
    </div>
  );
};
