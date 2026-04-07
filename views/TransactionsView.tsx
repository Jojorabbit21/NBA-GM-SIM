
import React, { useState, useMemo } from 'react';
import { useTabParam } from '../hooks/useTabParam';
import { Loader2 } from 'lucide-react';
import { Team, Player, Transaction, GameTactics } from '../types';
import { LeaguePickAssets } from '../types/draftAssets';
import { LeagueTradeBlocks, LeagueTradeOffers } from '../types/trade';
import { LeagueGMProfiles } from '../types/gm';
import { SeasonConfig } from '../utils/seasonConfig';
import { calculatePlayerOvr } from '../utils/constants';

// Components & Hooks
import { TradeConfirmModal } from '../components/transactions/TradeConfirmModal';
import { useTradeSystem } from '../hooks/useTradeSystem';

import { ExploreOffersTab } from '../components/transactions/tabs/ExploreOffersTab';
import { LeagueBlockTab } from '../components/transactions/tabs/LeagueBlockTab';
import { ScoutProposalTab } from '../components/transactions/tabs/ScoutProposalTab';
import { TradeHistoryTab } from '../components/transactions/tabs/TradeHistoryTab';

type TradeTabId = 'Explore' | 'Block' | 'Scout' | 'History';

const TAB_IDS: TradeTabId[] = ['Explore', 'Block', 'Scout', 'History'];

const TAB_LABELS: Record<TradeTabId, string> = {
    Explore: '즉시 탐색',
    Block: '트레이드 블록',
    Scout: '트레이드 물색',
    History: '이력',
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
  onForceSave?: (overrides?: any) => Promise<void>;
  userId?: string;
  refreshUnreadCount?: () => void;
  tendencySeed?: string;
  onViewPlayer: (player: Player, teamId?: string, teamName?: string) => void;
  userTactics?: GameTactics;
  setUserTactics?: React.Dispatch<React.SetStateAction<GameTactics | null>>;
  // 영속 트레이드 시스템 props
  leagueTradeBlocks?: LeagueTradeBlocks;
  setLeagueTradeBlocks?: React.Dispatch<React.SetStateAction<LeagueTradeBlocks>>;
  leagueTradeOffers?: LeagueTradeOffers;
  setLeagueTradeOffers?: React.Dispatch<React.SetStateAction<LeagueTradeOffers>>;
  leaguePickAssets?: LeaguePickAssets;
  setLeaguePickAssets?: React.Dispatch<React.SetStateAction<LeaguePickAssets>>;
  leagueGMProfiles?: LeagueGMProfiles;
  seasonConfig?: SeasonConfig;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
    team, teams, setTeams, addNews, onShowToast, currentSimDate, transactions,
    onAddTransaction, onForceSave, userId, refreshUnreadCount, tendencySeed, onViewPlayer,
    userTactics, setUserTactics,
    leagueTradeBlocks, setLeagueTradeBlocks,
    leagueTradeOffers, setLeagueTradeOffers,
    leaguePickAssets, setLeaguePickAssets,
    leagueGMProfiles,
    seasonConfig
}) => {
  const [activeTab, setActiveTab] = useTabParam<TradeTabId>('Explore');

  const tradeSystem = useTradeSystem(
      team, teams, setTeams, currentSimDate,
      userId,
      onAddTransaction, onForceSave, onShowToast,
      refreshUnreadCount,
      userTactics, setUserTactics,
      leagueTradeBlocks, setLeagueTradeBlocks,
      leagueTradeOffers, setLeagueTradeOffers,
      leaguePickAssets, setLeaguePickAssets as any,
      seasonConfig
  );

  const {
      proposalTargetTeamId, setProposalTargetTeamId, proposalSelectedIds, setProposalSelectedIds, proposalRequirements, setProposalRequirements,
      proposalIsProcessing, proposalSearchPerformed, setProposalSearchPerformed, handleRequestRequirements,
      pendingTrade, setPendingTrade, isExecutingTrade, executeTrade,
      dailyTradeAttempts, isTradeLimitReached, isTradeDeadlinePassed, MAX_DAILY_TRADES,
      userBlockEntries, togglePersistentBlockPlayer,
      incomingOffers, outgoingOffers, acceptIncomingOffer, rejectIncomingOffer,
      sendPersistentProposal,
  } = tradeSystem;

  // 수신 오퍼 카운트 (탭 뱃지용)
  const pendingIncomingCount = incomingOffers.length;

  const handleViewPlayerClick = (partialPlayer: Player) => {
      let fullPlayer: Player | undefined;
      let foundTeam: Team | undefined;
      for (const t of teams) {
          const found = t.roster.find(p => p.id === partialPlayer.id);
          if (found) { fullPlayer = found; foundTeam = t; break; }
      }
      onViewPlayer(fullPlayer || partialPlayer, foundTeam?.id, foundTeam?.name);
  };

  // Memoize
  const sortedUserRoster = useMemo(() => [...(team?.roster || [])].sort((a,b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)), [team?.roster]);

  const targetTeamRoster = useMemo(() => {
    const targetTeam = teams.find(t => t.id === proposalTargetTeamId);
    return targetTeam ? [...targetTeam.roster].sort((a,b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)) : [];
  }, [teams, proposalTargetTeamId]);

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

       {/* ── 탭 네비게이션 ── */}
       <div className="flex-shrink-0 px-8 bg-slate-950 border-b border-slate-800 flex items-center gap-8 h-14">
           {TAB_IDS.map(tabId => (
               <button
                   key={tabId}
                   onClick={() => setActiveTab(tabId)}
                   className={`relative flex items-center transition-all h-full border-b-2 font-black tracking-tight uppercase text-sm ko-normal ${
                       activeTab === tabId
                           ? 'text-indigo-400 border-indigo-400'
                           : 'text-slate-500 hover:text-slate-300 border-transparent'
                   }`}
               >
                   {TAB_LABELS[tabId]}
                   {/* 수신 오퍼 뱃지 — Block 탭에 표시 */}
                   {tabId === 'Block' && pendingIncomingCount > 0 && activeTab !== 'Block' && (
                       <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center">
                           {pendingIncomingCount}
                       </span>
                   )}
               </button>
           ))}
           <div className="flex-1" />
           {isTradeDeadlinePassed ? (
               <span className="text-[10px] font-black uppercase text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-lg">
                   데드라인 마감
               </span>
           ) : seasonConfig?.tradeDeadline ? (
               <span className="text-[10px] font-black uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                   트레이드 데드라인 {seasonConfig.tradeDeadline}
               </span>
           ) : null}
       </div>

      <div className="flex-1 overflow-hidden relative min-h-0">
            <div className={`absolute inset-0 flex flex-col ${activeTab === 'Explore' ? '' : 'hidden'}`}>
                <ExploreOffersTab
                    team={team}
                    teams={teams}
                    userPicks={userPicks}
                    isTradeDeadlinePassed={isTradeDeadlinePassed}
                    handleViewPlayer={handleViewPlayerClick}
                    dailyTradeAttempts={dailyTradeAttempts}
                    maxDailyTrades={MAX_DAILY_TRADES}
                    isTradeLimitReached={isTradeLimitReached}
                    onAcceptOffer={(offer, selectedUserPlayers) => {
                        const targetTeam = teams.find(t => t.id === offer.teamId);
                        if (targetTeam) {
                            setPendingTrade({
                                userAssets: selectedUserPlayers,
                                targetAssets: offer.players,
                                targetTeam,
                            });
                        }
                    }}
                />
            </div>

            <div className={`absolute inset-0 flex flex-col ${activeTab === 'Block' ? '' : 'hidden'}`}>
                <LeagueBlockTab
                    team={team}
                    teams={teams}
                    isTradeDeadlinePassed={isTradeDeadlinePassed}
                    currentSimDate={currentSimDate}
                    handleViewPlayer={handleViewPlayerClick}
                    sortedUserRoster={sortedUserRoster}
                    userBlockEntries={userBlockEntries}
                    togglePersistentBlockPlayer={togglePersistentBlockPlayer}
                    userPicks={userPicks}
                    leaguePickAssets={leaguePickAssets}
                    leagueGMProfiles={leagueGMProfiles}
                    leagueTradeBlocks={leagueTradeBlocks}
                    incomingOffers={incomingOffers}
                    onAcceptOffer={acceptIncomingOffer}
                    onRejectOffer={rejectIncomingOffer}
                    sendPersistentProposal={sendPersistentProposal}
                />
            </div>

            <div className={`absolute inset-0 flex flex-col ${activeTab === 'Scout' ? '' : 'hidden'}`}>
                <ScoutProposalTab
                    teams={teams}
                    userTeam={team}
                    userPicks={userPicks}
                    leaguePickAssets={leaguePickAssets}
                    leagueGMProfiles={leagueGMProfiles}
                    isTradeDeadlinePassed={isTradeDeadlinePassed}
                    currentSimDate={currentSimDate}
                    handleViewPlayer={handleViewPlayerClick}
                    sendPersistentProposal={sendPersistentProposal}
                    proposalTargetTeamId={proposalTargetTeamId}
                    proposalSelectedIds={proposalSelectedIds}
                    proposalRequirements={proposalRequirements}
                    proposalIsProcessing={proposalIsProcessing}
                    proposalSearchPerformed={proposalSearchPerformed}
                    setProposalTargetTeamId={setProposalTargetTeamId}
                    setProposalSelectedIds={setProposalSelectedIds}
                    setProposalSearchPerformed={setProposalSearchPerformed}
                    handleRequestRequirements={handleRequestRequirements}
                    onAcceptRequirement={(req, targetTeam) => setPendingTrade({
                        userAssets: req.players,
                        targetAssets: targetTeamRoster.filter(p => proposalSelectedIds.has(p.id)),
                        targetTeam: targetTeam,
                    })}
                    outgoingOffers={outgoingOffers}
                />
            </div>

            <div className={`absolute inset-0 flex flex-col ${activeTab === 'History' ? '' : 'hidden'}`}>
                <TradeHistoryTab
                    transactions={transactions || []}
                    teamId={team.id}
                    teams={teams}
                    currentSimDate={currentSimDate}
                />
            </div>
      </div>
    </div>
  );
};
