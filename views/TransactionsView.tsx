
import React, { useState, useMemo } from 'react';
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

// Widget 컨테이너 — 공통 카드 스타일
const WidgetCard: React.FC<{
    title: string;
    badge?: number;
    maxHeight?: string;
    children: React.ReactNode;
}> = ({ title, badge, maxHeight = 'max-h-[560px]', children }) => (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
            <h3 className="text-sm font-black uppercase tracking-wider text-white">{title}</h3>
            {badge !== undefined && badge > 0 && (
                <span className="flex items-center justify-center w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full">
                    {badge}
                </span>
            )}
        </div>
        <div className={`overflow-y-auto custom-scrollbar ${maxHeight}`}>
            {children}
        </div>
    </div>
);

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
      proposalTargetTeamId, setProposalTargetTeamId, proposalSelectedIds, setProposalSelectedIds, proposalRequirements,
      proposalIsProcessing, proposalSearchPerformed, setProposalSearchPerformed, handleRequestRequirements,
      pendingTrade, setPendingTrade, isExecutingTrade, executeTrade,
      dailyTradeAttempts, isTradeLimitReached, isTradeDeadlinePassed, MAX_DAILY_TRADES,
      userBlockEntries, togglePersistentBlockPlayer,
      incomingOffers, outgoingOffers, acceptIncomingOffer, rejectIncomingOffer,
      sendPersistentProposal,
  } = tradeSystem;

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

  const sortedUserRoster = useMemo(
      () => [...(team?.roster || [])].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)),
      [team?.roster]
  );

  const targetTeamRoster = useMemo(() => {
      const targetTeam = teams.find(t => t.id === proposalTargetTeamId);
      return targetTeam ? [...targetTeam.roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)) : [];
  }, [teams, proposalTargetTeamId]);

  const userPicks = useMemo(() => {
      if (!leaguePickAssets || !team) return [];
      return leaguePickAssets[team.id] || [];
  }, [leaguePickAssets, team]);

  if (!team) return null;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar animate-in fade-in duration-500 ko-normal">
        {/* 트레이드 확인 모달 */}
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

        {/* 상단 헤더 바 */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 bg-slate-950 border-b border-slate-800">
            <h1 className="text-base font-black uppercase tracking-wider text-white">트레이드 센터</h1>
            <div className="flex items-center gap-3">
                {pendingIncomingCount > 0 && (
                    <span className="text-xs font-black text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-lg">
                        수신 오퍼 {pendingIncomingCount}건
                    </span>
                )}
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
        </div>

        {/* 2-column 위젯 레이아웃 */}
        <div className="flex gap-4 p-4 items-start">

            {/* 좌 컬럼 (~60%) */}
            <div className="flex-[3] min-w-0 flex flex-col gap-4">

                {/* 즉시 탐색 위젯 */}
                <WidgetCard title="즉시 탐색" maxHeight="max-h-[600px]">
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
                </WidgetCard>

                {/* 트레이드 물색 위젯 */}
                <WidgetCard title="트레이드 물색" maxHeight="max-h-[700px]">
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
                </WidgetCard>

            </div>

            {/* 우 컬럼 (~40%) */}
            <div className="flex-[2] min-w-0 flex flex-col gap-4">

                {/* 트레이드 블록 위젯 */}
                <WidgetCard title="트레이드 블록" badge={pendingIncomingCount} maxHeight="max-h-[640px]">
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
                </WidgetCard>

                {/* 이력 위젯 */}
                <WidgetCard title="트레이드 이력" maxHeight="max-h-[400px]">
                    <TradeHistoryTab
                        transactions={transactions || []}
                        teamId={team.id}
                        teams={teams}
                        currentSimDate={currentSimDate}
                    />
                </WidgetCard>

            </div>

        </div>
    </div>
  );
};
