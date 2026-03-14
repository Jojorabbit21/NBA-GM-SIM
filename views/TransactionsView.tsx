
import React, { useState, useMemo } from 'react';
import { ArrowLeftRight, Loader2 } from 'lucide-react';
import { Team, Player, Transaction, GameTactics } from '../types';
import { LeaguePickAssets } from '../types/draftAssets';
import { LeagueTradeBlocks, LeagueTradeOffers } from '../types/trade';
import { calculatePlayerOvr } from '../utils/constants';

// Components & Hooks
import { TradeConfirmModal } from '../components/transactions/TradeConfirmModal';
import { useTradeSystem } from '../hooks/useTradeSystem';

import { TradeBlockTab } from '../components/transactions/tabs/TradeBlockTab';
import { TradeProposalTab } from '../components/transactions/tabs/TradeProposalTab';
import { TradeHistoryTab } from '../components/transactions/tabs/TradeHistoryTab';
import { IncomingOffersTab } from '../components/transactions/tabs/IncomingOffersTab';

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
  tendencySeed?: string;
  onViewPlayer: (player: Player, teamId?: string, teamName?: string) => void;
  userTactics?: GameTactics;
  setUserTactics?: React.Dispatch<React.SetStateAction<GameTactics | null>>;
  // 새 영속 트레이드 시스템 props
  leagueTradeBlocks?: LeagueTradeBlocks;
  setLeagueTradeBlocks?: React.Dispatch<React.SetStateAction<LeagueTradeBlocks>>;
  leagueTradeOffers?: LeagueTradeOffers;
  setLeagueTradeOffers?: React.Dispatch<React.SetStateAction<LeagueTradeOffers>>;
  leaguePickAssets?: LeaguePickAssets;
  setLeaguePickAssets?: React.Dispatch<React.SetStateAction<LeaguePickAssets>>;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
    team, teams, setTeams, addNews, onShowToast, currentSimDate, transactions,
    onAddTransaction, onForceSave, userId, refreshUnreadCount, tendencySeed, onViewPlayer,
    userTactics, setUserTactics,
    leagueTradeBlocks, setLeagueTradeBlocks,
    leagueTradeOffers, setLeagueTradeOffers,
    leaguePickAssets, setLeaguePickAssets
}) => {
  const [activeTab, setActiveTab] = useState<'Block' | 'Offers' | 'Proposal' | 'History'>('Block');

  // Use Custom Hook for Business Logic
  const tradeSystem = useTradeSystem(
      team, teams, setTeams, currentSimDate,
      userId,
      onAddTransaction, onForceSave, onShowToast,
      refreshUnreadCount,
      userTactics, setUserTactics,
      // 새 영속 트레이드 파라미터
      leagueTradeBlocks, setLeagueTradeBlocks,
      leagueTradeOffers, setLeagueTradeOffers,
      leaguePickAssets, setLeaguePickAssets as any
  );

  const {
      blockSelectedIds, setBlockSelectedIds, blockOffers, blockIsProcessing, blockSearchPerformed,
      targetPositions, toggleTargetPosition, handleSearchBlockOffers, toggleBlockPlayer,
      proposalTargetTeamId, setProposalTargetTeamId, proposalSelectedIds, setProposalSelectedIds, proposalRequirements, setProposalRequirements,
      proposalIsProcessing, proposalSearchPerformed, setProposalSearchPerformed, toggleProposalPlayer, handleRequestRequirements,
      pendingTrade, setPendingTrade, isExecutingTrade, executeTrade,
      dailyTradeAttempts, isTradeLimitReached, isTradeDeadlinePassed, MAX_DAILY_TRADES,
      // 새 시스템
      userBlockEntries, togglePersistentBlockPlayer, togglePersistentBlockPick,
      incomingOffers, outgoingOffers, acceptIncomingOffer, rejectIncomingOffer,
      sendPersistentProposal,
  } = tradeSystem;

  // 수신 오퍼 카운트 (탭 뱃지용)
  const pendingIncomingCount = incomingOffers.length;

  const TradeLimitText = () => (
      <span className={`text-xs font-bold ${isTradeLimitReached ? 'text-red-400' : 'text-slate-500'}`}>
          일일 제안 한도: {dailyTradeAttempts}/{MAX_DAILY_TRADES}
      </span>
  );

  const handleViewPlayerClick = (partialPlayer: Player) => {
      let fullPlayer: Player | undefined;
      let foundTeam: Team | undefined;
      for (const t of teams) {
          const found = t.roster.find(p => p.id === partialPlayer.id);
          if (found) { fullPlayer = found; foundTeam = t; break; }
      }
      onViewPlayer(fullPlayer || partialPlayer, foundTeam?.id, foundTeam?.name);
  };

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

  // 유저 보유 픽 (PickSelector용)
  const userPicks = useMemo(() => {
    if (!leaguePickAssets || !team) return [];
    return leaguePickAssets[team.id] || [];
  }, [leaguePickAssets, team]);

  if (!team) return null;

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 ko-normal">
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
                userPicks={pendingTrade.userPicks}
                targetPicks={pendingTrade.targetPicks}
                onConfirm={executeTrade}
                onCancel={() => setPendingTrade(null)}
             />
         </div>
       )}

       <div className="flex-shrink-0 px-6 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
           <div className="flex items-center gap-3">
               <ArrowLeftRight size={16} className="text-slate-500" />
               <span className="text-xs font-black text-slate-300 uppercase tracking-widest">트레이드 센터</span>
           </div>
           <div className="flex items-center gap-4">
               <TradeLimitText />
               <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 shadow-sm">
                   <button onClick={() => setActiveTab('Block')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'Block' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>트레이드 블록</button>
                   <button onClick={() => setActiveTab('Offers')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all relative ${activeTab === 'Offers' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>
                       수신 오퍼
                       {pendingIncomingCount > 0 && activeTab !== 'Offers' && (
                           <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center">
                               {pendingIncomingCount}
                           </span>
                       )}
                   </button>
                   <button onClick={() => setActiveTab('Proposal')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'Proposal' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>직접 제안</button>
                   <button onClick={() => setActiveTab('History')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'History' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>이력</button>
               </div>
           </div>
       </div>

      <div className="flex-1 flex flex-col overflow-hidden min-h-0">

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
                    handleViewPlayer={handleViewPlayerClick}
                    toggleTargetPosition={toggleTargetPosition}
                    handleSearchBlockOffers={handleSearchBlockOffers}
                    onAcceptOffer={(offer) => setPendingTrade({
                        userAssets: (team?.roster || []).filter(p => blockSelectedIds.has(p.id)),
                        targetAssets: offer.players,
                        targetTeam: teams.find(t => t.id === offer.teamId)!
                    })}
                    sortedUserRoster={sortedUserRoster}
                    userBlockEntries={userBlockEntries}
                    togglePersistentBlockPlayer={togglePersistentBlockPlayer}
                    togglePersistentBlockPick={togglePersistentBlockPick}
                    userPicks={userPicks}
                />
            )}

            {activeTab === 'Offers' && (
                <IncomingOffersTab
                    team={team}
                    teams={teams}
                    incomingOffers={incomingOffers}
                    outgoingOffers={outgoingOffers}
                    onAcceptOffer={acceptIncomingOffer}
                    onRejectOffer={rejectIncomingOffer}
                    handleViewPlayer={handleViewPlayerClick}
                    currentSimDate={currentSimDate}
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
                    handleViewPlayer={handleViewPlayerClick}
                    handleRequestRequirements={handleRequestRequirements}
                    onAcceptRequirement={(req, targetTeam) => setPendingTrade({
                        userAssets: req.players,
                        targetAssets: targetTeamRoster.filter(p => proposalSelectedIds.has(p.id)),
                        targetTeam: targetTeam
                    })}
                    targetTeamRoster={targetTeamRoster}
                    allOtherTeamsSorted={allOtherTeamsSorted}
                    sendPersistentProposal={sendPersistentProposal}
                    userTeam={team}
                    userPicks={userPicks}
                    leaguePickAssets={leaguePickAssets}
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
