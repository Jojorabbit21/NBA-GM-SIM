
import React, { useState, useMemo } from 'react';
import { Users, Loader2, Clock, Activity, ArrowLeftRight, ListFilter, Send, History } from 'lucide-react';
import { Team, Player, Transaction } from '../types';
import { PlayerDetailModal } from '../components/PlayerDetailModal';
import { TRADE_DEADLINE, calculatePlayerOvr } from '../utils/constants';

// Components & Hooks
import { TradeConfirmModal } from '../components/transactions/TradeConfirmModal';
import { useTradeSystem } from '../hooks/useTradeSystem';
import { PageHeader } from '../components/common/PageHeader';
import { TradeBlockTab } from '../components/transactions/tabs/TradeBlockTab';
import { TradeProposalTab } from '../components/transactions/tabs/TradeProposalTab';
import { TradeHistoryTab } from '../components/transactions/tabs/TradeHistoryTab';

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
  userId?: string; 
  refreshUnreadCount?: () => void; 
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({ 
    team, teams, setTeams, addNews, onShowToast, currentSimDate, transactions, 
    onAddTransaction, onForceSave, userId, refreshUnreadCount 
}) => {
  const [activeTab, setActiveTab] = useState<'Block' | 'Proposal' | 'History'>('Block');
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);

  // Use Custom Hook for Business Logic
  const tradeSystem = useTradeSystem(
      team, teams, setTeams, currentSimDate, 
      userId, 
      onAddTransaction, onForceSave, onShowToast, 
      refreshUnreadCount
  );

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

  const handleViewPlayer = (partialPlayer: Player) => {
      let fullPlayer: Player | undefined;
      for (const t of teams) {
          fullPlayer = t.roster.find(p => p.id === partialPlayer.id);
          if (fullPlayer) break;
      }
      setViewPlayer(fullPlayer || partialPlayer);
  };

  const getPlayerTeam = (p: Player) => teams.find(t => t.roster.some(rp => rp.id === p.id));
  const playerTeam = viewPlayer ? getPlayerTeam(viewPlayer) : null;
  
  // Memoize Rosters
  const sortedUserRoster = useMemo(() => [...(team?.roster || [])].sort((a,b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)), [team?.roster]);
  const targetTeamRoster = useMemo(() => {
    const targetTeam = teams.find(t => t.id === proposalTargetTeamId);
    return targetTeam ? [...targetTeam.roster].sort((a,b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)) : [];
  }, [teams, proposalTargetTeamId]);

  // Memoize Team List for Dropdown
  const allOtherTeamsSorted = useMemo(() => {
    if (!team) return [];
    return teams.filter(t => t.id !== team.id); 
  }, [teams, team?.id]);

  if (!team) return null;

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 ko-normal gap-6">
       {viewPlayer && <PlayerDetailModal player={{...viewPlayer, ovr: calculatePlayerOvr(viewPlayer)}} teamName={playerTeam?.name} teamId={playerTeam?.id} onClose={() => setViewPlayer(null)} allTeams={teams} />}
       
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
       
       <PageHeader 
         title={
             <div className="flex items-center gap-4">
                 <span>트레이드 센터</span>
                 <div className="hidden md:flex px-4 py-1.5 rounded-full bg-slate-900 border border-slate-800 items-center gap-2 shadow-inner text-base tracking-normal">
                    <Clock size={12} className="text-red-500" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">
                        Deadline: {TRADE_DEADLINE}
                    </span>
                 </div>
             </div>
         }
         icon={<ArrowLeftRight size={24} />}
         actions={
             <div className="flex items-center gap-4">
               <TradeLimitChip />
               <div className="flex gap-2 bg-slate-900 p-1 rounded-2xl border border-slate-800 shadow-sm">
                   <button onClick={() => setActiveTab('Block')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'Block' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}><ListFilter size={14} /> 트레이드 블록</button>
                   <button onClick={() => setActiveTab('Proposal')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'Proposal' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}><Send size={14} /> 직접 제안</button>
                   <button onClick={() => setActiveTab('History')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'History' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}><History size={14} /> 이력</button>
               </div>
            </div>
         }
       />

      <div className="flex-1 bg-slate-900/95 rounded-[2.5rem] border border-slate-800 flex flex-col overflow-hidden shadow-2xl min-h-0">
         
         <div className="flex-1 overflow-hidden relative">
            {activeTab === 'Block' && (
                <TradeBlockTab 
                    team={team}
                    teams={teams}
                    blockSelectedIds={blockSelectedIds}
                    blockOffers={blockOffers}
                    blockIsProcessing={blockIsProcessing}
                    blockSearchPerformed={blockSearchPerformed}
                    targetPositions={targetPositions}
                    isTradeDeadlinePassed={isTradeDeadlinePassed}
                    toggleBlockPlayer={toggleBlockPlayer}
                    handleViewPlayer={handleViewPlayer}
                    toggleTargetPosition={toggleTargetPosition}
                    handleSearchBlockOffers={handleSearchBlockOffers}
                    onAcceptOffer={(offer) => setPendingTrade({
                        userAssets: (team?.roster || []).filter(p => blockSelectedIds.has(p.id)),
                        targetAssets: offer.players,
                        targetTeam: teams.find(t => t.id === offer.teamId)!
                    })}
                    sortedUserRoster={sortedUserRoster}
                />
            )}

            {activeTab === 'Proposal' && (
                 <TradeProposalTab 
                    teams={teams}
                    proposalTargetTeamId={proposalTargetTeamId}
                    proposalSelectedIds={proposalSelectedIds}
                    proposalRequirements={proposalRequirements}
                    proposalIsProcessing={proposalIsProcessing}
                    proposalSearchPerformed={proposalSearchPerformed}
                    isTradeDeadlinePassed={isTradeDeadlinePassed}
                    setProposalTargetTeamId={setProposalTargetTeamId}
                    setProposalSelectedIds={setProposalSelectedIds}
                    setProposalRequirements={setProposalRequirements}
                    setProposalSearchPerformed={setProposalSearchPerformed}
                    toggleProposalPlayer={toggleProposalPlayer}
                    handleViewPlayer={handleViewPlayer}
                    handleRequestRequirements={handleRequestRequirements}
                    onAcceptRequirement={(req, targetTeam) => setPendingTrade({
                        userAssets: req.players,
                        targetAssets: targetTeamRoster.filter(p => proposalSelectedIds.has(p.id)),
                        targetTeam: targetTeam
                    })}
                    targetTeamRoster={targetTeamRoster}
                    allOtherTeamsSorted={allOtherTeamsSorted}
                 />
            )}

            {activeTab === 'History' && (
                <TradeHistoryTab 
                    transactions={transactions || []}
                    teamId={team.id}
                    teams={teams}
                    currentSimDate={currentSimDate}
                />
            )}
         </div>
      </div>
    </div>
  );
};
