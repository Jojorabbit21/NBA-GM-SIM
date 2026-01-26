
import React, { useState, useMemo } from 'react';
import { Users, Handshake, ArrowLeftRight, Loader2, X, Briefcase, CheckCircle2, Activity, MinusCircle, Trash2, Check, AlertCircle, Info, Search, Send, ListFilter, ChevronRight, Target, Lock, History, Clock } from 'lucide-react';
import { Team, Player, TradeOffer, Transaction } from '../types';
import { generateTradeOffers, generateCounterOffers } from '../services/tradeEngine';
import { getOvrBadgeStyle, PlayerDetailModal } from '../components/SharedComponents';
import { getTeamLogoUrl, TRADE_DEADLINE } from '../utils/constants';
import { logEvent } from '../services/analytics'; 

const TAX_LEVEL = 170;
const FIRST_APRON = 178;
const SECOND_APRON = 189;

const getCapStatus = (cap: number) => {
  if (cap >= SECOND_APRON) return { label: '2차 에이프런 초과', msg: '로스터 구성 및 트레이드에 강력한 제약이 발생합니다.', color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/50' };
  if (cap >= FIRST_APRON) return { label: '1차 에이프런 초과', msg: '샐러리 유동성이 감소하며 영입 제약이 적용됩니다.', color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/50' };
  if (cap >= TAX_LEVEL) return { label: '사치세 납부 대상', msg: '사치세 구간입니다. 구단 운영 비용이 증가할 수 있습니다.', color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/50' };
  return { label: '샐러리캡 여유', msg: '구단 샐러리가 건강하며 추가적인 전력 보강이 가능합니다.', color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/50' };
};

const getVisualPercentage = (cap: number) => {
  if (cap < TAX_LEVEL) return (cap / TAX_LEVEL) * 25;
  if (cap < FIRST_APRON) return 25 + ((cap - TAX_LEVEL) / (FIRST_APRON - TAX_LEVEL)) * 25;
  if (cap < SECOND_APRON) return 50 + ((cap - FIRST_APRON) / (SECOND_APRON - FIRST_APRON)) * 25;
  return 75 + Math.min(25, ((cap - SECOND_APRON) / 30) * 25);
};

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

const TradeConfirmModal: React.FC<{ 
  userAssets: Player[]; 
  targetAssets: Player[]; 
  userTeam: Team;
  targetTeam: Team;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ userAssets, targetAssets, userTeam, targetTeam, onConfirm, onCancel }) => {
  const userSalaryOut = userAssets.reduce((sum, p) => sum + p.salary, 0);
  const userSalaryIn = targetAssets.reduce((sum, p) => sum + p.salary, 0);
  const salaryDiff = userSalaryIn - userSalaryOut;
  const currentTotalCap = (userTeam?.roster || []).reduce((sum, p) => sum + p.salary, 0);
  const postTradeTotalCap = currentTotalCap - userSalaryOut + userSalaryIn;
  
  const status = getCapStatus(postTradeTotalCap);
  const visualWidth = getVisualPercentage(postTradeTotalCap);

  return (
    <div className="fixed inset-0 bg-slate-950/95 z-[200] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-5xl shadow-2xl flex flex-col overflow-hidden max-h-[95vh] ko-normal">
        <div className="px-8 py-6 border-b border-slate-800 bg-slate-800/40 flex justify-between items-center">
          <h3 className="text-2xl font-black uppercase text-white flex items-center gap-3 oswald tracking-tight">
            <Briefcase className="text-indigo-400" size={28} /> 최종 결정 전 확인
          </h3>
          <button onClick={onCancel} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 transition-colors"><X size={24} /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
            <div className="bg-slate-950/40 border border-slate-800 rounded-3xl overflow-hidden shadow-lg">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-900/50 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
                            <th className="py-4 px-6">유형</th>
                            <th className="py-4 px-2">구단</th>
                            <th className="py-4 px-2">선수</th>
                            <th className="py-4 px-2 text-center">OVR</th>
                            <th className="py-4 px-2 text-center">POS</th>
                            <th className="py-4 px-6 text-right">샐러리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {userAssets.map(p => (
                            <tr key={p.id} className="border-b border-slate-800/30 hover:bg-red-500/5 transition-colors group">
                                <td className="py-3 px-6"><span className="px-2 py-0.5 bg-red-500/10 text-red-500 text-[9px] font-black rounded uppercase">OUT</span></td>
                                <td className="py-3 px-2 text-xs font-bold text-slate-400">{userTeam.name}</td>
                                <td className="py-3 px-2 text-sm font-black text-slate-200">{p.name}</td>
                                <td className="py-3 px-2 text-center"><div className={getOvrBadgeStyle(p.ovr) + " !w-7 !h-7 !text-sm"}>{p.ovr}</div></td>
                                <td className="py-3 px-2 text-center text-[10px] font-bold text-slate-500">{p.position}</td>
                                <td className="py-3 px-6 text-right font-mono text-xs font-black text-red-400">-${p.salary.toFixed(1)}M</td>
                            </tr>
                        ))}
                        {targetAssets.map(p => (
                            <tr key={p.id} className="border-b border-slate-800/30 hover:bg-emerald-500/5 transition-colors group">
                                <td className="py-3 px-6"><span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[9px] font-black rounded uppercase">IN</span></td>
                                <td className="py-3 px-2 text-xs font-bold text-slate-400">{targetTeam.name}</td>
                                <td className="py-3 px-2 text-sm font-black text-slate-200">{p.name}</td>
                                <td className="py-3 px-2 text-center"><div className={getOvrBadgeStyle(p.ovr) + " !w-7 !h-7 !text-sm"}>{p.ovr}</div></td>
                                <td className="py-3 px-2 text-center text-[10px] font-bold text-slate-500">{p.position}</td>
                                <td className="py-3 px-6 text-right font-mono text-xs font-black text-emerald-400">+${p.salary.toFixed(1)}M</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="bg-slate-900/80 font-black">
                            <td colSpan={5} className="py-4 px-6 text-xs text-slate-400 uppercase tracking-widest">총 자산 변동 합계</td>
                            <td className={`py-4 px-6 text-right font-mono text-base ${salaryDiff >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                {salaryDiff > 0 ? '+' : ''}{salaryDiff.toFixed(1)}M
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <div className="space-y-6">
                <div className="flex items-center gap-2 text-slate-400 uppercase font-black text-[10px] tracking-widest">
                    <AlertCircle size={14} /> 샐러리 캡 예측 및 상태 분석
                </div>
                <div className="space-y-2">
                    <div className="relative h-4 w-full bg-slate-800/50 rounded-full overflow-hidden border border-slate-700/50">
                        <div className={`h-full transition-all duration-1000 ease-out shadow-[0_0_20px_rgba(0,0,0,0.5)] ${status.color.replace('text', 'bg')}`} style={{ width: `${visualWidth}%` }} />
                        <div className="absolute inset-0 flex pointer-events-none">
                            <div className="flex-1 border-r border-slate-700/50 relative"></div>
                            <div className="flex-1 border-r border-slate-700/50 relative"></div>
                            <div className="flex-1 border-r border-slate-700/50 relative"></div>
                            <div className="flex-1"></div>
                        </div>
                    </div>
                    <div className="flex text-[9px] font-black text-slate-500 uppercase tracking-widest">
                        <div className="flex-1 text-center">Healthy</div>
                        <div className="flex-1 text-center border-l border-slate-800">Luxury Tax</div>
                        <div className="flex-1 text-center border-l border-slate-800">1st Apron</div>
                        <div className="flex-1 text-center border-l border-slate-800">2nd Apron</div>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className={`md:col-span-3 p-5 rounded-3xl border ${status.bg} ${status.border} flex items-center gap-4`}>
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${status.color.replace('text', 'bg').replace('500', '500/20')}`}>
                           <Info className={status.color} size={24} />
                        </div>
                        <div>
                           <div className={`text-sm font-black uppercase tracking-tight mb-0.5 ${status.color}`}>{status.label}</div>
                           <p className="text-xs text-slate-400 font-bold">{status.msg}</p>
                        </div>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800 p-5 rounded-3xl flex flex-col justify-center items-center text-center">
                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">최종 샐러리 합계</div>
                        <div className="text-3xl font-black text-white oswald leading-none">${postTradeTotalCap.toFixed(1)}<span className="text-sm text-slate-500 ml-0.5">M</span></div>
                    </div>
                </div>
            </div>
        </div>

        <div className="p-8 flex justify-end gap-6 bg-slate-900 border-t border-slate-800">
          <button onClick={onCancel} className="px-10 py-4 rounded-2xl font-black text-slate-400 hover:bg-slate-800 uppercase text-xs tracking-widest transition-all">협상 취소</button>
          <button onClick={onConfirm} className="px-12 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-[0_10px_40px_rgba(79,70,229,0.4)] transition-all active:scale-95 flex items-center gap-4 text-lg">
             <CheckCircle2 size={24} /> 트레이드 실행
          </button>
        </div>
      </div>
    </div>
  );
};

const OfferCard: React.FC<{ offer: TradeOffer, teams: Team[], onAccept: () => void, onPlayerClick: (p: Player) => void }> = ({ offer, teams, onAccept, onPlayerClick }) => {
  const fullTeam = teams.find(t => t.id === offer.teamId);
  const fullTeamName = fullTeam ? `${fullTeam.city} ${fullTeam.name}` : offer.teamName;
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 hover:border-indigo-500/70 transition-all group relative overflow-hidden shadow-xl">
       <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 blur-[50px] rounded-full group-hover:bg-indigo-600/10 transition-colors" />
       <div className="flex flex-col gap-6 relative z-10">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-4">
                 <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 shadow-md flex-shrink-0"><img src={getTeamLogoUrl(offer.teamId)} className="w-12 h-12 object-contain" alt={fullTeamName} /></div>
                 <div className="min-w-0"><h4 className="text-lg font-black uppercase text-slate-100 oswald tracking-tight leading-none truncate">{fullTeamName}</h4><div className={`mt-1.5 text-[10px] font-black uppercase inline-block px-2 py-0.5 rounded ${offer.diffValue >= 0 ? 'text-emerald-400 bg-emerald-400/10' : 'text-slate-500 bg-slate-800'}`}>{offer.diffValue >= 0 ? 'Value Gain' : 'Value Balanced'}</div></div>
              </div>
              <button onClick={onAccept} className="py-3 px-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-[0_4px_20px_rgba(79,70,229,0.4)] transition-all active:scale-95 flex-shrink-0 flex items-center gap-2">수락하기 <ChevronRight size={14} /></button>
          </div>
          <div className="space-y-3">
             <div className="flex justify-between items-center mb-1 px-1"><div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">제안된 패키지 ({offer.players.length}인)</div><div className="text-[10px] font-mono font-black text-slate-500">합계: ${offer.players.reduce((s,p)=>s+p.salary,0).toFixed(1)}M</div></div>
             <div className="flex flex-col gap-2">
                {offer.players.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-slate-950/40 p-3 rounded-2xl border border-slate-800/50 hover:bg-slate-900/60 transition-colors">
                     <div className="flex items-center gap-4 flex-1 min-w-0">
                       <div className="flex-shrink-0"><div className={getOvrBadgeStyle(p.ovr) + " !mx-0 !w-10 !h-10 !text-xl"}>{p.ovr}</div></div>
                       <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onPlayerClick(p)}>
                         <div className="font-bold text-sm text-slate-100 truncate hover:text-indigo-400 hover:underline">{p.name}</div>
                         <div className="text-[10px] text-slate-500 uppercase font-black tracking-tight">{p.position}</div>
                       </div>
                     </div>
                     <div className="ml-4 text-sm font-mono font-black text-slate-300 flex-shrink-0">${p.salary.toFixed(1)}M</div>
                  </div>
                ))}
             </div>
          </div>
       </div>
    </div>
  );
};

const RequirementCard: React.FC<{ requirement: TradeOffer, targetPlayers: Player[], onAccept: () => void, onPlayerClick: (p: Player) => void }> = ({ requirement, targetPlayers, onAccept, onPlayerClick }) => {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 hover:border-emerald-500/70 transition-all group relative overflow-hidden shadow-xl">
       <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-600/5 blur-[50px] rounded-full group-hover:bg-emerald-600/10 transition-colors" />
       <div className="flex flex-col gap-6 relative z-10">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-4">
                 <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 shadow-md flex-shrink-0"><img src={getTeamLogoUrl(requirement.teamId)} className="w-12 h-12 object-contain" alt={requirement.teamName} /></div>
                 <div className="min-w-0"><h4 className="text-lg font-black uppercase text-slate-100 oswald tracking-tight leading-none truncate">{requirement.teamName}</h4><div className={`mt-1.5 text-[10px] font-black uppercase inline-block px-2 py-0.5 rounded ${requirement.diffValue >= 0 ? 'text-emerald-400 bg-emerald-400/10' : 'text-slate-500 bg-slate-800'}`}>{requirement.diffValue >= 0 ? 'Value Gain' : 'Value Balanced'}</div></div>
              </div>
              <button onClick={onAccept} className="py-3 px-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-[0_4px_20px_rgba(16,185,129,0.4)] transition-all active:scale-95 flex items-center gap-2">제안 수락 <ChevronRight size={14} /></button>
          </div>
          <div className="space-y-3">
             <div className="flex justify-between items-center mb-1 px-1">
                <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">내 팀 요구 자산 ({requirement.players.length}인)</div>
                <div className="text-[10px] font-mono font-black text-slate-500">합계: ${requirement.players.reduce((s,p)=>s+p.salary,0).toFixed(1)}M</div>
             </div>
             <div className="flex flex-col gap-2">
                {requirement.players.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-slate-950/40 p-3 rounded-2xl border border-slate-800/50 hover:bg-slate-900/60 transition-colors">
                     <div className="flex items-center gap-4 flex-1 min-w-0">
                       <div className="flex-shrink-0"><div className={getOvrBadgeStyle(p.ovr) + " !mx-0 !w-10 !h-10 !text-xl"}>{p.ovr}</div></div>
                       <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onPlayerClick(p)}>
                         <div className="font-bold text-sm text-slate-100 truncate hover:text-indigo-400 hover:underline">{p.name}</div>
                         <div className="text-[10px] text-slate-500 uppercase font-black tracking-tight">{p.position}</div>
                       </div>
                     </div>
                     <div className="ml-4 text-sm font-mono font-black text-slate-300 flex-shrink-0">${p.salary.toFixed(1)}M</div>
                  </div>
                ))}
             </div>
          </div>
       </div>
    </div>
  );
};

export const TransactionsView: React.FC<TransactionsViewProps> = ({ team, teams, setTeams, addNews, onShowToast, currentSimDate, transactions, onAddTransaction }) => {
  const [activeTab, setActiveTab] = useState<'Block' | 'Proposal' | 'History'>('Block');
  const [blockSelectedIds, setBlockSelectedIds] = useState<Set<string>>(new Set());
  const [blockOffers, setBlockOffers] = useState<TradeOffer[]>([]);
  const [blockIsProcessing, setBlockIsProcessing] = useState(false);
  const [blockSearchPerformed, setBlockSearchPerformed] = useState(false);
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

  const executeTrade = () => {
    if (!pendingTrade || !team) return;
    const { userAssets, targetAssets, targetTeam } = pendingTrade;
    
    // [Analytics] Log Trade Execution
    logEvent('Trade', 'Executed', `${team.name} <-> ${targetTeam.name} (${userAssets.length} for ${targetAssets.length})`);

    // Add Transaction History
    if (onAddTransaction) {
        const newTransaction: Transaction = {
            id: `tr_${Date.now()}`,
            date: currentSimDate,
            type: 'Trade',
            teamId: team.id,
            description: `${targetTeam.name}와의 트레이드: ${userAssets.length}명 <-> ${targetAssets.length}명 교환`,
            details: {
                acquired: targetAssets.map(p => ({ id: p.id, name: p.name, ovr: p.ovr, position: p.position })),
                traded: userAssets.map(p => ({ id: p.id, name: p.name, ovr: p.ovr, position: p.position })),
                partnerTeamId: targetTeam.id,
                partnerTeamName: targetTeam.name
            }
        };
        onAddTransaction(newTransaction);
    }

    setTeams(prevTeams => prevTeams.map(t => {
      if (t.id === team.id) {
        const remaining = t.roster.filter(p => !userAssets.some(u => u.id === p.id));
        return { ...t, roster: [...remaining, ...targetAssets] };
      }
      if (targetTeam && t.id === targetTeam.id) {
        const remaining = t.roster.filter(p => !targetAssets.some(x => x.id === p.id));
        return { ...t, roster: [...remaining, ...userAssets] };
      }
      return t;
    }));
    addNews([`Woj: ${team.name} ${userAssets.length}인 <-> ${targetTeam.name} ${targetAssets.length}인 대형 트레이드 합의!`]);
    onShowToast(`트레이드 성사! 총 ${targetAssets.length}명의 선수가 합류했습니다.`);
    setPendingTrade(null);
    setBlockSelectedIds(new Set()); setBlockOffers([]); setBlockSearchPerformed(false);
    setProposalSelectedIds(new Set()); setProposalRequirements([]); setProposalSearchPerformed(false);
  };

  const toggleBlockPlayer = (id: string) => {
    const next = new Set(blockSelectedIds);
    if (next.has(id)) next.delete(id);
    else if (next.size < 5) next.add(id);
    else onShowToast("최대 5명까지만 선택 가능합니다.");
    setBlockSelectedIds(next); setBlockOffers([]); setBlockSearchPerformed(false);
  };

  const handleSearchBlockOffers = () => {
    if (blockSelectedIds.size === 0 || isTradeDeadlinePassed) return;
    
    // [Analytics] Log Search Action
    logEvent('Trade', 'Search Offers', `Assets: ${blockSelectedIds.size}`); 

    setBlockIsProcessing(true); setBlockSearchPerformed(true);
    setTimeout(() => {
      const targetPlayers = (team?.roster || []).filter(p => blockSelectedIds.has(p.id));
      const generatedOffers = generateTradeOffers(targetPlayers, team, teams);
      setBlockOffers(generatedOffers); setBlockIsProcessing(false);
    }, 1200);
  };

  const toggleProposalPlayer = (id: string) => {
    const next = new Set(proposalSelectedIds);
    if (next.has(id)) next.delete(id);
    else if (next.size < 5) next.add(id);
    else onShowToast("최대 5명까지만 선택 가능합니다.");
    setProposalSelectedIds(next); setProposalRequirements([]); setProposalSearchPerformed(false);
  };

  const handleRequestRequirements = () => {
    if (proposalSelectedIds.size === 0 || !proposalTargetTeamId || isTradeDeadlinePassed) return;
    
    // [Analytics] Log Proposal Request
    logEvent('Trade', 'Request Proposal', `Target: ${proposalTargetTeamId}, Assets: ${proposalSelectedIds.size}`);

    setProposalIsProcessing(true); setProposalSearchPerformed(true);
    setTimeout(() => {
      const targetTeam = teams.find(t => t.id === proposalTargetTeamId);
      if (!targetTeam) {
        setProposalIsProcessing(false);
        return;
      }
      const requestedPlayers = targetTeam.roster.filter(p => proposalSelectedIds.has(p.id));
      const generatedRequirements = generateCounterOffers(requestedPlayers, targetTeam, team);
      setProposalRequirements(generatedRequirements); setProposalIsProcessing(false);
    }, 1200);
  };

  // Helper: Get Player Snapshot (Fallback to current if missing in history)
  const getSnapshot = (id: string, savedOvr?: number, savedPos?: string) => {
      if (savedOvr !== undefined && savedPos) return { ovr: savedOvr, pos: savedPos };
      for (const t of teams) {
          const p = t.roster.find(rp => rp.id === id);
          if (p) return { ovr: p.ovr, pos: p.position };
      }
      return { ovr: 0, pos: '-' };
  };

  const sortedUserRoster = useMemo(() => [...(team?.roster || [])].sort((a,b) => b.ovr - a.ovr), [team?.roster]);
  const targetTeamRoster = useMemo(() => {
    const targetTeam = teams.find(t => t.id === proposalTargetTeamId);
    return targetTeam ? [...targetTeam.roster].sort((a,b) => b.ovr - a.ovr) : [];
  }, [teams, proposalTargetTeamId]);

  const allOtherTeamsSorted = useMemo(() => {
    if (!team) return [];
    return teams.filter(t => t.id !== team.id).sort((a, b) => b.city.localeCompare(a.city));
  }, [teams, team?.id]);

  const getPlayerTeam = (p: Player) => teams.find(t => t.roster.some(rp => rp.id === p.id));
  const playerTeam = viewPlayer ? getPlayerTeam(viewPlayer) : null;

  if (!team) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] animate-in fade-in duration-500 ko-normal gap-6">
       {viewPlayer && <PlayerDetailModal player={viewPlayer} teamName={playerTeam?.name} teamId={playerTeam?.id} onClose={() => setViewPlayer(null)} />}
       {pendingTrade && (
         <TradeConfirmModal userAssets={pendingTrade.userAssets} targetAssets={pendingTrade.targetAssets} userTeam={team} targetTeam={pendingTrade.targetTeam} onConfirm={executeTrade} onCancel={() => setPendingTrade(null)} />
       )}
       <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-slate-800 pb-6 flex-shrink-0">
           <div>
               <div className="flex items-center gap-4">
                   <h2 className="text-4xl lg:text-5xl font-black ko-tight text-slate-100 uppercase tracking-tight">트레이드 센터</h2>
                   <div className="hidden md:flex px-4 py-1.5 rounded-full bg-slate-900 border border-slate-800 items-center gap-2 shadow-inner">
                       <Clock size={12} className="text-red-500" />
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">
                           Deadline: {TRADE_DEADLINE}
                       </span>
                   </div>
               </div>
               <p className="text-slate-500 font-bold mt-2 uppercase text-sm">
                   팀의 미래를 위한 과감한 결단
               </p>
           </div>
           <div className="flex gap-3">
              <button onClick={() => setActiveTab('Block')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'Block' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 ring-1 ring-indigo-400/50' : 'bg-slate-900 text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}><ListFilter size={16} /> 트레이드 블록</button>
              <button onClick={() => setActiveTab('Proposal')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'Proposal' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 ring-1 ring-indigo-400/50' : 'bg-slate-900 text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}><Send size={16} /> 직접 트레이드 제안</button>
              <button onClick={() => setActiveTab('History')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'History' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 ring-1 ring-indigo-400/50' : 'bg-slate-900 text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}><History size={16} /> 이력</button>
           </div>
      </div>
      <div className="flex-1 bg-slate-900/60 rounded-[2.5rem] border border-slate-800 flex flex-col overflow-hidden shadow-2xl min-h-0">
         <div className="px-8 py-6 border-b border-slate-800 bg-slate-800/20 flex flex-col gap-6">
            <div className="flex justify-between items-center w-full">
              <div className="flex items-center gap-3">
                {activeTab === 'Block' && <><Users size={20} className="text-indigo-400" /><h3 className="text-lg font-black uppercase text-white oswald tracking-tight">트레이드 블록 ({blockSelectedIds.size}/5)</h3></>}
                {activeTab === 'Proposal' && <><Send size={20} className="text-indigo-400" /><h3 className="text-lg font-black uppercase text-white oswald tracking-tight">협상 대상 팀 선택</h3></>}
                {activeTab === 'History' && <><History size={20} className="text-indigo-400" /><h3 className="text-lg font-black uppercase text-white oswald tracking-tight">트레이드 로그</h3></>}
              </div>
              <div className="flex items-center gap-4">
                 {isTradeDeadlinePassed && activeTab !== 'History' ? (
                    <div className="px-8 py-4 bg-red-950/50 border border-red-500/50 text-red-400 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center gap-3 min-w-[200px] justify-center shadow-[0_0_20px_rgba(220,38,38,0.2)]">
                        <Lock size={18} /> TRADE DEADLINE PASSED
                    </div>
                 ) : (
                    activeTab === 'Block' ? (
                    <>
                        <button onClick={() => { setBlockSelectedIds(new Set()); setBlockSearchPerformed(false); setBlockOffers([]); }} className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-2xl font-black uppercase text-xs tracking-widest transition-all active:scale-95 flex items-center gap-3 min-w-[160px] justify-center" disabled={blockSelectedIds.size === 0}><Trash2 size={18} /> 전체 해제</button>
                        <button onClick={handleSearchBlockOffers} disabled={blockSelectedIds.size === 0 || blockIsProcessing} className={`px-8 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all active:scale-95 flex items-center gap-3 min-w-[160px] justify-center ${!blockSearchPerformed && blockSelectedIds.size > 0 && !blockIsProcessing ? 'shadow-[0_4px_20px_rgba(79,70,229,0.3)]' : ''}`}><Activity size={18} className={blockIsProcessing ? 'animate-spin' : ''} />{blockIsProcessing ? '협상 중...' : `오퍼 탐색`}</button>
                    </>
                    ) : activeTab === 'Proposal' ? (
                    <>
                        <button onClick={() => { setProposalSelectedIds(new Set()); setProposalRequirements([]); setProposalSearchPerformed(false); }} className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-2xl font-black uppercase text-xs tracking-widest transition-all active:scale-95 flex items-center gap-3 min-w-[160px] justify-center" disabled={proposalSelectedIds.size === 0}><Trash2 size={18} /> 전체 해제</button>
                        <button onClick={handleRequestRequirements} disabled={proposalSelectedIds.size === 0 || proposalIsProcessing || !proposalTargetTeamId} className={`px-8 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all active:scale-95 flex items-center gap-3 min-w-[160px] justify-center ${!proposalSearchPerformed && proposalSelectedIds.size > 0 && !proposalIsProcessing && proposalTargetTeamId ? 'shadow-[0_4px_20px_rgba(79,70,229,0.3)]' : ''}`}><Activity size={18} className={proposalIsProcessing ? 'animate-spin' : ''} />{proposalIsProcessing ? '조건 분석 중...' : `제안 요청`}</button>
                    </>
                    ) : null
                 )}
              </div>
            </div>
            {activeTab === 'Proposal' && (
              <div className="px-6 pb-2 overflow-x-auto custom-scrollbar-hide">
                 <div className="flex flex-col gap-3 min-w-max md:min-w-0">
                    <span className="text-[9px] font-black uppercase text-indigo-500 tracking-widest border-b border-indigo-500/20 pb-1 mb-1 oswald">ALL NBA TEAMS (Z-A)</span>
                    <div className="flex flex-wrap gap-2.5">
                       {allOtherTeamsSorted.map(t => (
                         <button key={t.id} onClick={() => { setProposalTargetTeamId(t.id); setProposalSelectedIds(new Set()); setProposalRequirements([]); setProposalSearchPerformed(false); }} className={`flex items-center justify-center p-2 rounded-full border transition-all w-11 h-11 flex-shrink-0 ${proposalTargetTeamId === t.id ? 'bg-indigo-600 border-indigo-400 shadow-[0_0_15px_rgba(79,70,229,0.5)] scale-110 z-10' : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'}`} title={`${t.city} ${t.name}`}><img src={getTeamLogoUrl(t.id)} className="w-full h-full object-contain" alt={t.name} /></button>
                       ))}
                    </div>
                 </div>
              </div>
            )}
         </div>
         <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-0">
            {activeTab !== 'History' ? (
                <>
                    <div className="lg:col-span-5 border-r border-slate-800 flex flex-col overflow-hidden">
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-2 bg-slate-950/20">
                            {activeTab === 'Block' ? (
                                sortedUserRoster.map(p => {
                                const isSelected = blockSelectedIds.has(p.id);
                                return (
                                    <div key={p.id} className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 ${isTradeDeadlinePassed ? 'opacity-50 cursor-not-allowed border-slate-800 bg-slate-900' : isSelected ? 'bg-indigo-600/20 border-indigo-500 shadow-[inset_0_0_20px_rgba(79,70,229,0.1)] ring-1 ring-indigo-500/50' : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'}`}>
                                        <div className="flex items-center gap-4 flex-1 cursor-pointer" onClick={() => !isTradeDeadlinePassed && toggleBlockPlayer(p.id)}>
                                        <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'border-slate-700 bg-slate-900'}`}>{isSelected && <Check size={16} className="text-white" />}</div>
                                        <div className="flex-shrink-0"><div className={getOvrBadgeStyle(p.ovr) + " !mx-0 !w-10 !h-10 !text-xl"}>{p.ovr}</div></div>
                                        <div className="text-left flex-1 min-w-0">
                                            <div className="flex items-center gap-2"><div className="font-black text-white text-sm ko-tight truncate hover:text-indigo-400 hover:underline" onClick={(e) => { e.stopPropagation(); setViewPlayer(p); }}>{p.name}</div>{p.health !== 'Healthy' && (<span className={`px-1.5 py-0.5 rounded-[4px] text-[8px] font-black uppercase ${p.health === 'Injured' ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500'}`}>{p.health === 'Injured' ? 'OUT' : 'DTD'}</span>)}</div>
                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{p.position} | {p.age}세 | ${p.salary}M</div>
                                        </div>
                                        </div>
                                        {isSelected && <MinusCircle size={18} className="text-red-500 animate-in zoom-in duration-300 cursor-pointer" onClick={() => toggleBlockPlayer(p.id)} />}
                                    </div>
                                );
                                })
                            ) : (
                                !proposalTargetTeamId ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center px-12 space-y-4"><div className="p-8 bg-slate-800/20 rounded-full"><Users size={48} className="opacity-20" /></div><p className="text-sm font-bold uppercase tracking-widest oswald italic">Please select a team from the header to view roster</p></div>
                                ) : (
                                    targetTeamRoster.map(p => {
                                    const isSelected = proposalSelectedIds.has(p.id);
                                    return (
                                        <div key={p.id} className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 ${isTradeDeadlinePassed ? 'opacity-50 cursor-not-allowed border-slate-800 bg-slate-900' : isSelected ? 'bg-indigo-600/20 border-indigo-500 shadow-[inset_0_0_20px_rgba(79,70,229,0.1)] ring-1 ring-indigo-500/50' : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'}`}>
                                        <div className="flex items-center gap-4 flex-1 cursor-pointer" onClick={() => !isTradeDeadlinePassed && toggleProposalPlayer(p.id)}>
                                            <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'border-slate-700 bg-slate-900'}`}>{isSelected && <Check size={16} className="text-white" />}</div>
                                            <div className="flex-shrink-0"><div className={getOvrBadgeStyle(p.ovr) + " !mx-0 !w-10 !h-10 !text-xl"}>{p.ovr}</div></div>
                                            <div className="text-left flex-1 min-w-0">
                                                <div className="flex items-center gap-2"><div className="font-black text-white text-sm ko-tight truncate hover:text-indigo-400 hover:underline" onClick={(e) => { e.stopPropagation(); setViewPlayer(p); }}>{p.name}</div>{p.health !== 'Healthy' && (<span className={`px-1.5 py-0.5 rounded-[4px] text-[8px] font-black uppercase ${p.health === 'Injured' ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500'}`}>{p.health === 'Injured' ? 'OUT' : 'DTD'}</span>)}</div>
                                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{p.position} | {p.age}세 | ${p.salary}M</div>
                                            </div>
                                        </div>
                                        {isSelected && <CheckCircle2 size={18} className="text-emerald-500 animate-in zoom-in duration-300 cursor-pointer" onClick={() => toggleProposalPlayer(p.id)} />}
                                        </div>
                                    );
                                    })
                                )
                            )}
                        </div>
                    </div>
                    <div className="lg:col-span-7 flex flex-col overflow-hidden bg-slate-950/40 relative">
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 z-10 relative">
                            {isTradeDeadlinePassed ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-6">
                                    <div className="p-8 bg-red-950/20 rounded-full border border-red-900/50 shadow-inner">
                                        <Lock size={64} strokeWidth={1} className="text-red-800" />
                                    </div>
                                    <div className="text-center space-y-2">
                                        <p className="font-black text-xl text-red-500 uppercase oswald tracking-widest">Trade Market Closed</p>
                                        <p className="font-bold text-sm text-slate-600">2026년 2월 6일 트레이드 데드라인이 지났습니다.<br/>더 이상 트레이드를 진행할 수 없습니다.</p>
                                    </div>
                                </div>
                            ) : activeTab === 'Block' ? (
                                blockSelectedIds.size === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-6"><div className="p-8 bg-slate-800/20 rounded-full border border-slate-800 shadow-inner"><ArrowLeftRight size={64} strokeWidth={1} className="opacity-20" /></div><div className="text-center space-y-2"><p className="font-black text-lg text-slate-500 uppercase oswald tracking-widest">Market is Idle</p><p className="font-bold text-sm text-slate-600">좌측 로스터에서 협상 테이블에 올릴 선수를 선택하세요.</p></div></div>
                                ) : blockIsProcessing ? (
                                <div className="h-full flex flex-col items-center justify-center space-y-6"><Loader2 size={48} className="text-indigo-500 animate-spin" /><div className="text-center space-y-1"><p className="font-black text-indigo-400 animate-pulse text-sm uppercase tracking-[0.3em] oswald">Negotiating Packages</p><p className="text-xs text-slate-500 font-bold">리그 전체 구단과 트레이드 가능성을 타진 중입니다...</p></div></div>
                                ) : !blockSearchPerformed ? (
                                <div className="h-full flex flex-col items-center justify-center text-indigo-500 space-y-6 animate-in fade-in duration-500"><div className="p-10 bg-indigo-600/10 rounded-full border border-indigo-500/30 relative"><div className="absolute inset-0 bg-indigo-600/5 rounded-full animate-ping opacity-20" /><Search size={64} strokeWidth={1.5} className="relative z-10" /></div><div className="text-center space-y-2"><p className="font-black text-xl text-indigo-400 uppercase oswald tracking-widest">Negotiation Ready</p><p className="font-bold text-sm text-slate-400">협상 준비 완료! 상단의 <span className="text-indigo-400">'오퍼 탐색'</span> 버튼을 클릭하여<br/>리그 전체 구단의 제안을 확인하세요.</p></div></div>
                                ) : blockOffers.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4"><X size={48} className="text-red-900/50" /><p className="font-black text-lg text-slate-400 uppercase oswald">No Valid Offers</p><p className="text-xs font-bold text-slate-600">제시한 선수들의 가치나 샐러리가 맞는 오퍼가 없습니다.</p></div>
                                ) : (
                                <div className="grid grid-cols-1 gap-6 pb-8"><div className="flex items-center gap-3 mb-2 px-2"><Handshake size={20} className="text-emerald-400" /><h4 className="text-sm font-black uppercase text-slate-400 tracking-widest oswald">Best Offers from the League</h4></div>{blockOffers.map((offer, idx) => (<OfferCard key={idx} offer={offer} teams={teams} onAccept={() => setPendingTrade({ userAssets: (team?.roster || []).filter(p => blockSelectedIds.has(p.id)), targetAssets: offer.players, targetTeam: teams.find(t => t.id === offer.teamId)! })} onPlayerClick={setViewPlayer} />))}</div>
                                )
                            ) : (
                                proposalSelectedIds.size === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-6"><div className="p-8 bg-slate-800/20 rounded-full border border-slate-800 shadow-inner"><ArrowLeftRight size={64} strokeWidth={1} className="opacity-20" /></div><div className="text-center space-y-2"><p className="font-black text-lg text-slate-500 uppercase oswald tracking-widest">Awaiting Direct Proposal</p><p className="font-bold text-sm text-slate-600">좌측 상대 팀 로스터에서 영입하고 싶은 선수를 선택하세요.</p></div></div>
                                ) : proposalIsProcessing ? (
                                <div className="h-full flex flex-col items-center justify-center space-y-6"><Loader2 size={48} className="text-indigo-500 animate-spin" /><div className="text-center space-y-1"><p className="font-black text-indigo-400 animate-pulse text-sm uppercase tracking-[0.3em] oswald">Analyzing Proposal</p><p className="text-xs text-slate-500 font-bold">상대 구단이 수락할 만한 우리 팀의 대가 패키지를 구성 중입니다...</p></div></div>
                                ) : !proposalSearchPerformed ? (
                                <div className="h-full flex flex-col items-center justify-center text-indigo-500 space-y-6 animate-in fade-in duration-500"><div className="p-10 bg-indigo-600/10 rounded-full border border-indigo-500/30 relative"><div className="absolute inset-0 bg-indigo-600/5 rounded-full animate-ping opacity-20" /><Send size={64} strokeWidth={1.5} className="relative z-10" /></div><div className="text-center space-y-2"><p className="font-black text-xl text-indigo-400 uppercase oswald tracking-widest">Proposal Ready</p><p className="font-bold text-sm text-slate-400">조건 타진 준비 완료! 상단의 <span className="text-indigo-400">'제안 요청'</span> 버튼을 클릭하여<br/>상대 팀이 원하는 반대급부를 확인하세요.</p></div></div>
                                ) : proposalRequirements.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4"><X size={48} className="text-red-900/50" /><p className="font-black text-lg text-slate-400 uppercase oswald">No Matching Trade</p><p className="text-xs font-bold text-slate-600">상대 팀이 만족할 만한 가치나 샐러리 구조를 맞출 수 없습니다.</p></div>
                                ) : (
                                <div className="grid grid-cols-1 gap-6 pb-8"><div className="flex items-center gap-3 mb-2 px-2"><Target size={20} className="text-emerald-400" /><h4 className="text-sm font-black uppercase text-slate-400 tracking-widest oswald">AI Counter Proposals</h4></div>{proposalRequirements.map((offer, idx) => (<RequirementCard key={idx} requirement={offer} targetPlayers={teams.find(t => t.id === proposalTargetTeamId)?.roster.filter(p => proposalSelectedIds.has(p.id)) || []} onAccept={() => setPendingTrade({ userAssets: offer.players, targetAssets: teams.find(t => t.id === proposalTargetTeamId)?.roster.filter(p => proposalSelectedIds.has(p.id)) || [], targetTeam: teams.find(t => t.id === proposalTargetTeamId)! })} onPlayerClick={setViewPlayer} />))}</div>
                                )
                            )}
                        </div>
                    </div>
                </>
            ) : (
                <div className="col-span-12 flex flex-col h-full overflow-hidden p-8">
                    {/* Transaction History View */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-950/40 rounded-3xl border border-slate-800 p-6">
                        {!transactions || transactions.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
                                <div className="p-6 bg-slate-900 rounded-full border border-slate-800"><History size={48} className="opacity-30" /></div>
                                <div className="text-center">
                                    <p className="font-black text-lg text-slate-500 uppercase oswald tracking-widest">No Transactions</p>
                                    <p className="text-xs font-bold text-slate-600">아직 진행된 트레이드가 없습니다.</p>
                                </div>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-800 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                        <th className="py-4 px-4 w-32">일자</th>
                                        <th className="py-4 px-4 w-48">구단</th>
                                        <th className="py-4 px-4">IN</th>
                                        <th className="py-4 px-4">OUT</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                    {transactions.map(t => (
                                        <tr key={t.id} className="hover:bg-white/5 transition-colors">
                                            <td className="py-4 px-4 align-middle">
                                                <div className="text-xs font-bold text-slate-400">{t.date}</div>
                                                <div className="text-[10px] text-slate-600 font-mono mt-1">{t.id.slice(-6)}</div>
                                            </td>
                                            <td className="py-4 px-4 align-middle">
                                                {t.details?.partnerTeamName ? (
                                                    <div className="flex items-center gap-3">
                                                        <img src={getTeamLogoUrl(t.details.partnerTeamId || '')} className="w-8 h-8 object-contain opacity-80" alt="" />
                                                        <span className="text-sm font-black text-white uppercase">{t.details.partnerTeamName}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm font-bold text-slate-500">-</span>
                                                )}
                                            </td>
                                            <td className="py-4 px-4 align-middle">
                                                <div className="flex flex-col gap-2">
                                                    {t.details?.acquired.map((p, i) => {
                                                        const snap = getSnapshot(p.id, p.ovr, p.position);
                                                        return (
                                                            <div key={i} className="flex items-center gap-3">
                                                                <div className={`${getOvrBadgeStyle(snap.ovr || 70)} !w-6 !h-6 !text-xs !mx-0`}>{snap.ovr || '-'}</div>
                                                                <span className="text-sm font-bold text-emerald-300">{p.name}</span>
                                                                <span className="text-[10px] font-black text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">{snap.pos || '?'}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                            <td className="py-4 px-4 align-middle">
                                                <div className="flex flex-col gap-2">
                                                    {t.details?.traded.map((p, i) => {
                                                        const snap = getSnapshot(p.id, p.ovr, p.position);
                                                        return (
                                                            <div key={i} className="flex items-center gap-3">
                                                                <div className={`${getOvrBadgeStyle(snap.ovr || 70)} !w-6 !h-6 !text-xs !mx-0`}>{snap.ovr || '-'}</div>
                                                                <span className="text-sm font-bold text-red-300/80">{p.name}</span>
                                                                <span className="text-[10px] font-black text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">{snap.pos || '?'}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}
         </div>
      </div>
    </div>
  );
};
