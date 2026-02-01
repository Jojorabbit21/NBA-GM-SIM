import React, { useState, useMemo } from 'react';
import { Users, Loader2, X, Clock, Search, Lock, Activity, Handshake, Target, Trash2, ListFilter, Send, History, ArrowLeftRight } from 'lucide-react';
import { Team, Player, Transaction } from '../types';
import { PlayerDetailModal } from '../components/SharedComponents';
import { getTeamLogoUrl, TRADE_DEADLINE } from '../utils/constants';

// New Components & Hooks
import { TradeConfirmModal } from '../components/transactions/TradeConfirmModal';
import { OfferCard } from '../components/transactions/OfferCard';
import { RequirementCard } from '../components/transactions/RequirementCard';
import { PositionFilter } from '../components/transactions/PositionFilter';
import { TradeRosterList } from '../components/transactions/TradeRosterList';
import { TradeHistoryTable } from '../components/transactions/TradeHistoryTable';
import { useTradeSystem } from '../hooks/useTradeSystem';

interface TransactionsViewProps {
  team: Team;
  teams: Team[];
  setTeams: React.Dispatch<React.SetStateAction<Team[]>>;
  addNews: (news: string[]) => void;
  onShowToast: (message: string) => void;
  currentSimDate: string;
  transactions?: Transaction[];
  onAddTransaction?: (t: Transaction) => void;
  onForceSave?: (overrides?: any) => Promise<void>;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({ team, teams, setTeams, addNews, onShowToast, currentSimDate, transactions, onAddTransaction, onForceSave }) => {
  const [activeTab, setActiveTab] = useState<'Block' | 'Proposal' | 'History'>('Block');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'mine'>('all');
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);

  // Use Custom Hook for Business Logic
  const tradeSystem = useTradeSystem(team, teams, setTeams, currentSimDate, onAddTransaction, onForceSave, onShowToast);

  const {
      blockSelectedIds, setBlockSelectedIds, blockOffers, blockIsProcessing, blockSearchPerformed,
      targetPositions, toggleTargetPosition, handleSearchBlockOffers, toggleBlockPlayer,
      proposalTargetTeamId, setProposalTargetTeamId, proposalSelectedIds, setProposalSelectedIds, proposalRequirements, setProposalRequirements,
      proposalIsProcessing, proposalSearchPerformed, setProposalSearchPerformed, toggleProposalPlayer, handleRequestRequirements,
      pendingTrade, setPendingTrade, isExecutingTrade, executeTrade,
      dailyTradeAttempts, isTradeLimitReached, isTradeDeadlinePassed, MAX_DAILY_TRADES
  } = tradeSystem;

  const TradeLimitChip = () => (
      <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 mr-2 transition-colors ${isTradeLimitReached ? 'bg-red-950/30 border-red-500/50 text-red-400' : 'bg-slate-950/50 border-slate-700 text-slate-400'}`} title="일일 트레이드 업무 제한">
          <Activity size={14} className={isTradeLimitReached ? "animate-pulse" : ""} />
          <span className="text-[10px] font-black uppercase tracking-wider font-mono">
              Daily Ops: {dailyTradeAttempts}/{MAX_DAILY_TRADES}
          </span>
      </div>
  );

  const filteredHistory = useMemo(() => {
    if (!transactions) return [];
    if (historyFilter === 'all') return transactions;
    return transactions.filter(t => t.teamId === team.id || t.details?.partnerTeamId === team.id);
  }, [transactions, historyFilter, team.id]);

  const handleViewPlayer = (partialPlayer: Player) => {
      let fullPlayer: Player | undefined;
      for (const t of teams) {
          fullPlayer = t.roster.find(p => p.id === partialPlayer.id);
          if (fullPlayer) break;
      }
      setViewPlayer(fullPlayer || partialPlayer);
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
         <div className="relative z-[200]">
             {isExecutingTrade && (
                 <div className="fixed inset-0 z-[210] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
                     <Loader2 className="w-16 h-16 text-indigo-500 animate-spin mb-4" />
                     <p className="text-xl font-black text-white uppercase tracking-widest animate-pulse">트레이드 처리 중...</p>
                     <p className="text-xs text-slate-400 font-bold mt-2">리그 사무국 승인 및 데이터 저장 중입니다.</p>
                 </div>
             )}
             <TradeConfirmModal 
                userAssets={pendingTrade.userAssets} 
                targetAssets={pendingTrade.targetAssets} 
                userTeam={team} 
                targetTeam={pendingTrade.targetTeam} 
                onConfirm={executeTrade} 
                onCancel={() => setPendingTrade(null)} 
             />
         </div>
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
           </div>
           <div className="flex gap-3">
              <button onClick={() => setActiveTab('Block')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'Block' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 ring-1 ring-indigo-400/50' : 'bg-slate-900 text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}><ListFilter size={16} /> 트레이드 블록</button>
              <button onClick={() => setActiveTab('Proposal')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'Proposal' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 ring-1 ring-indigo-400/50' : 'bg-slate-900 text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}><Send size={16} /> 직접 트레이드 제안</button>
              <button onClick={() => setActiveTab('History')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'History' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 ring-1 ring-indigo-400/50' : 'bg-slate-900 text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}><History size={16} /> 이력</button>
           </div>
      </div>

      <div className="flex-1 bg-slate-900/95 rounded-[2.5rem] border border-slate-800 flex flex-col overflow-hidden shadow-2xl min-h-0">
         <div className="px-8 py-6 border-b border-slate-800 bg-slate-800/20 flex flex-col gap-6">
            <div className="flex justify-between items-center w-full">
              <div className="flex items-center gap-3">
                {activeTab === 'Block' && <><Users size={20} className="text-indigo-400" /><h3 className="text-lg font-black uppercase text-white oswald tracking-tight">트레이드 블록 ({blockSelectedIds.size}/5)</h3></>}
                {activeTab === 'Proposal' && <><Send size={20} className="text-indigo-400" /><h3 className="text-lg font-black uppercase text-white oswald tracking-tight">협상 대상 팀 선택</h3></>}
                {activeTab === 'History' && <><History size={20} className="text-indigo-400" /><h3 className="text-lg font-black uppercase text-white oswald tracking-tight">트레이드 로그</h3></>}
              </div>
              <div className="flex items-center gap-4">
                 {activeTab === 'History' ? (
                     <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                        <button onClick={() => setHistoryFilter('all')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${historyFilter === 'all' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>전체 리그</button>
                        <button onClick={() => setHistoryFilter('mine')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${historyFilter === 'mine' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>내 팀</button>
                     </div>
                 ) : isTradeDeadlinePassed ? (
                    <div className="px-8 py-4 bg-red-950/50 border border-red-500/50 text-red-400 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center gap-3 min-w-[200px] justify-center shadow-[0_0_20px_rgba(220,38,38,0.2)]">
                        <Lock size={18} /> TRADE DEADLINE PASSED
                    </div>
                 ) : activeTab === 'Block' ? (
                    <>
                        <TradeLimitChip />
                        <PositionFilter selected={targetPositions} onToggle={toggleTargetPosition} />
                        <button onClick={handleSearchBlockOffers} disabled={blockSelectedIds.size === 0 || blockIsProcessing} className={`px-8 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all active:scale-95 flex items-center gap-3 min-w-[160px] justify-center ${!blockSearchPerformed && blockSelectedIds.size > 0 && !blockIsProcessing ? 'shadow-[0_4px_20px_rgba(79,70,229,0.3)]' : ''}`}><Activity size={18} className={blockIsProcessing ? 'animate-spin' : ''} />{blockIsProcessing ? '협상 중...' : `오퍼 탐색`}</button>
                    </>
                 ) : activeTab === 'Proposal' ? (
                    <>
                        <TradeLimitChip />
                        <button onClick={() => { setProposalSelectedIds(new Set()); setProposalRequirements([]); setProposalSearchPerformed(false); }} className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-2xl font-black uppercase text-xs tracking-widest transition-all active:scale-95 flex items-center gap-3 min-w-[160px] justify-center" disabled={proposalSelectedIds.size === 0}><Trash2 size={18} /> 전체 해제</button>
                        <button onClick={handleRequestRequirements} disabled={proposalSelectedIds.size === 0 || proposalIsProcessing || !proposalTargetTeamId} className={`px-8 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all active:scale-95 flex items-center gap-3 min-w-[160px] justify-center ${!proposalSearchPerformed && proposalSelectedIds.size > 0 && !proposalIsProcessing && proposalTargetTeamId ? 'shadow-[0_4px_20px_rgba(79,70,229,0.3)]' : ''}`}><Activity size={18} className={proposalIsProcessing ? 'animate-spin' : ''} />{proposalIsProcessing ? '조건 분석 중...' : `제안 요청`}</button>
                    </>
                 ) : null}
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
                        {activeTab === 'Block' ? (
                            <TradeRosterList 
                                roster={sortedUserRoster} 
                                selectedIds={blockSelectedIds} 
                                onToggle={toggleBlockPlayer} 
                                onViewPlayer={handleViewPlayer} 
                                isTradeDeadlinePassed={isTradeDeadlinePassed}
                                mode="Block"
                                emptyMessage={{ title: "Market is Idle", desc: "트레이드할 선수가 없습니다.", icon: <ArrowLeftRight size={64} strokeWidth={1} className="opacity-20" /> }}
                            />
                        ) : (
                            !proposalTargetTeamId ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center px-12 space-y-4"><div className="p-8 bg-slate-800/20 rounded-full"><Users size={48} className="opacity-20" /></div><p className="text-sm font-bold uppercase tracking-widest oswald italic">Please select a team from the header to view roster</p></div>
                            ) : (
                                <TradeRosterList 
                                    roster={targetTeamRoster} 
                                    selectedIds={proposalSelectedIds} 
                                    onToggle={toggleProposalPlayer} 
                                    onViewPlayer={handleViewPlayer} 
                                    isTradeDeadlinePassed={isTradeDeadlinePassed}
                                    mode="Proposal"
                                />
                            )
                        )}
                    </div>
                    <div className="lg:col-span-7 flex flex-col overflow-hidden bg-slate-950/40 relative">
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 z-10 relative">
                            {isTradeDeadlinePassed ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-6">
                                    <div className="p-8 bg-red-950/20 rounded-full border border-red-900/50 shadow-inner">
                                        <Clock size={64} strokeWidth={1} className="text-red-800" />
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
                                <div className="grid grid-cols-1 gap-6 pb-8"><div className="flex items-center gap-3 mb-2 px-2">
                                <Handshake size={20} className="text-emerald-400" /><h4 className="text-sm font-black uppercase text-slate-400 tracking-widest oswald">Best Offers from the League</h4></div>{blockOffers.map((offer, idx) => (<OfferCard key={idx} offer={offer} teams={teams} onAccept={() => setPendingTrade({ userAssets: (team?.roster || []).filter(p => blockSelectedIds.has(p.id)), targetAssets: offer.players, targetTeam: teams.find(t => t.id === offer.teamId)! })} onPlayerClick={handleViewPlayer} />))}</div>
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
                                <div className="grid grid-cols-1 gap-6 pb-8"><div className="flex items-center gap-3 mb-2 px-2">
                                <Target size={20} className="text-emerald-400" /><h4 className="text-sm font-black uppercase text-slate-400 tracking-widest oswald">AI Counter Proposals</h4></div>{proposalRequirements.map((offer, idx) => (<RequirementCard key={idx} requirement={offer} targetPlayers={teams.find(t => t.id === proposalTargetTeamId)?.roster.filter(p => proposalSelectedIds.has(p.id)) || []} onAccept={() => setPendingTrade({ userAssets: offer.players, targetAssets: teams.find(t => t.id === proposalTargetTeamId)?.roster.filter(p => proposalSelectedIds.has(p.id)) || [], targetTeam: teams.find(t => t.id === proposalTargetTeamId)! })} onPlayerClick={handleViewPlayer} />))}</div>
                                )
                            )}
                        </div>
                    </div>
                </>
            ) : (
                <div className="col-span-12 flex flex-col h-full overflow-hidden p-8">
                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-950/40 rounded-3xl border border-slate-800 p-6">
                        <TradeHistoryTable 
                            transactions={filteredHistory} 
                            historyFilter={historyFilter} 
                            teamId={team.id} 
                            teams={teams}
                            currentSimDate={currentSimDate}
                        />
                    </div>
                </div>
            )}
         </div>
      </div>
    </div>
  );
};