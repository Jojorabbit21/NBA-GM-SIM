
import React, { useState, useMemo, useEffect } from 'react';
import { Users, Loader2, X, Clock, Search, Lock, Activity, Handshake, Target, Trash2, ListFilter, Send, History, ChevronDown, CheckCircle2, ArrowLeftRight } from 'lucide-react';
import { Team, Player, Transaction } from '../types';
import { PlayerDetailModal } from '../components/PlayerDetailModal';
import { TRADE_DEADLINE, calculatePlayerOvr } from '../utils/constants';

// New Components & Hooks
import { TradeConfirmModal } from '../components/transactions/TradeConfirmModal';
import { OfferCard } from '../components/transactions/OfferCard';
import { RequirementCard } from '../components/transactions/RequirementCard';
import { PositionFilter } from '../components/transactions/PositionFilter';
import { TradeRosterList } from '../components/transactions/TradeRosterList';
import { TradeHistoryTable } from '../components/transactions/TradeHistoryTable';
import { useTradeSystem } from '../hooks/useTradeSystem';
import { TeamLogo } from '../components/common/TeamLogo';
import { PageHeader } from '../components/common/PageHeader';
import { Dropdown, DropdownButton } from '../components/common/Dropdown';

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
  const [historyFilter, setHistoryFilter] = useState<'all' | 'mine'>('all');
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);
  
  // Dropdown state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

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

  const filteredHistory = useMemo(() => {
    if (!transactions) return [];
    const tradeTransactions = transactions.filter(t => t.type === 'Trade');

    if (historyFilter === 'all') return tradeTransactions;
    return tradeTransactions.filter(t => t.teamId === team.id || t.details?.partnerTeamId === team.id);
  }, [transactions, historyFilter, team.id]);

  const handleViewPlayer = (partialPlayer: Player) => {
      let fullPlayer: Player | undefined;
      for (const t of teams) {
          fullPlayer = t.roster.find(p => p.id === partialPlayer.id);
          if (fullPlayer) break;
      }
      setViewPlayer(fullPlayer || partialPlayer);
  };

  const sortedUserRoster = useMemo(() => [...(team?.roster || [])].sort((a,b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)), [team?.roster]);
  
  const targetTeamRoster = useMemo(() => {
    const targetTeam = teams.find(t => t.id === proposalTargetTeamId);
    return targetTeam ? [...targetTeam.roster].sort((a,b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)) : [];
  }, [teams, proposalTargetTeamId]);

  const allOtherTeamsSorted = useMemo(() => {
    if (!team) return [];
    return teams
        .filter(t => t.id !== team.id)
        .filter(t => (t.city + t.name).toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => a.city.localeCompare(b.city));
  }, [teams, team?.id, searchTerm]);

  const getPlayerTeam = (p: Player) => teams.find(t => t.roster.some(rp => rp.id === p.id));
  const playerTeam = viewPlayer ? getPlayerTeam(viewPlayer) : null;
  
  const selectedTargetTeam = teams.find(t => t.id === proposalTargetTeamId);

  if (!team) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] animate-in fade-in duration-500 ko-normal gap-6">
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
             <div className="flex gap-3">
               <button onClick={() => setActiveTab('Block')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'Block' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 ring-1 ring-indigo-400/50' : 'bg-slate-900 text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}><ListFilter size={16} /> 트레이드 블록</button>
               <button onClick={() => setActiveTab('Proposal')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'Proposal' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 ring-1 ring-indigo-400/50' : 'bg-slate-900 text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}><Send size={16} /> 직접 트레이드 제안</button>
               <button onClick={() => setActiveTab('History')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'History' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 ring-1 ring-indigo-400/50' : 'bg-slate-900 text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}><History size={16} /> 이력</button>
            </div>
         }
       />

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
                    <div className="px-8 py-4 bg-red-950/50 border border-red-500/50 text-red-400 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center gap-3 min-w-[200px] justify-center shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                        <Lock size={16} /> Deadline Passed
                    </div>
                 ) : (
                     <>
                        <TradeLimitChip />
                        {activeTab === 'Block' && (
                             <>
                                <PositionFilter selected={targetPositions} onToggle={toggleTargetPosition} />
                                <button 
                                    onClick={handleSearchBlockOffers}
                                    disabled={blockSelectedIds.size === 0 || blockIsProcessing}
                                    className="px-8 py-4 bg-white hover:bg-slate-200 text-slate-900 rounded-2xl font-black uppercase text-xs tracking-widest transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)] flex items-center gap-3 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {blockIsProcessing ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                                    <span>오퍼 검색</span>
                                </button>
                             </>
                        )}
                        {activeTab === 'Proposal' && (
                             <div className="flex items-center gap-3">
                                <Dropdown
                                    isOpen={isDropdownOpen}
                                    onOpenChange={setIsDropdownOpen}
                                    width="w-80"
                                    trigger={
                                        <DropdownButton 
                                            isOpen={isDropdownOpen}
                                            label={selectedTargetTeam ? `${selectedTargetTeam.city} ${selectedTargetTeam.name}` : '상대 팀 선택...'}
                                            icon={selectedTargetTeam ? <TeamLogo teamId={selectedTargetTeam.id} size="sm" /> : undefined}
                                            className="w-64 h-12"
                                        />
                                    }
                                >
                                    <div className="p-3 border-b border-slate-800 bg-slate-950/50">
                                        <div className="relative">
                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                            <input 
                                                autoFocus
                                                type="text" 
                                                placeholder="팀 검색..." 
                                                className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-9 pr-3 text-xs font-bold text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                                                value={searchTerm}
                                                onChange={e => setSearchTerm(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className="max-h-64 overflow-y-auto custom-scrollbar p-2 space-y-1">
                                        {allOtherTeamsSorted.map(t => (
                                            <button
                                                key={t.id}
                                                onClick={() => { setProposalTargetTeamId(t.id); setIsDropdownOpen(false); setSearchTerm(''); setProposalSelectedIds(new Set()); setProposalRequirements([]); setProposalSearchPerformed(false); }}
                                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-all group ${proposalTargetTeamId === t.id ? 'bg-indigo-900/20' : ''}`}
                                            >
                                                <TeamLogo teamId={t.id} size="xs" className="opacity-70 group-hover:opacity-100" />
                                                <span className={`text-xs font-bold uppercase truncate ${proposalTargetTeamId === t.id ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'}`}>{t.city} {t.name}</span>
                                                {proposalTargetTeamId === t.id && <CheckCircle2 size={14} className="ml-auto text-indigo-500 flex-shrink-0" />}
                                            </button>
                                        ))}
                                    </div>
                                </Dropdown>

                                <button 
                                    onClick={handleRequestRequirements}
                                    disabled={!proposalTargetTeamId || proposalSelectedIds.size === 0 || proposalIsProcessing}
                                    className="px-8 py-4 bg-white hover:bg-slate-200 text-slate-900 rounded-2xl font-black uppercase text-xs tracking-widest transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)] flex items-center gap-3 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {proposalIsProcessing ? <Loader2 className="animate-spin" size={16} /> : <Handshake size={16} />}
                                    <span>협상 시도</span>
                                </button>
                             </div>
                        )}
                     </>
                 )}
              </div>
            </div>
         </div>

         {/* Content Area */}
         <div className="flex-1 overflow-hidden relative">
            {activeTab === 'Block' && (
                <div className="flex h-full">
                    <div className="w-[400px] border-r border-slate-800 bg-slate-950/30 flex flex-col">
                        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">내 로스터</span>
                            <span className="text-[10px] font-bold text-slate-500">{blockSelectedIds.size} selected</span>
                        </div>
                        <TradeRosterList 
                            roster={sortedUserRoster} 
                            selectedIds={blockSelectedIds} 
                            onToggle={toggleBlockPlayer} 
                            onViewPlayer={handleViewPlayer} 
                            isTradeDeadlinePassed={isTradeDeadlinePassed}
                            mode="Block"
                        />
                    </div>
                    <div className="flex-1 bg-slate-900/50 p-8 overflow-y-auto custom-scrollbar">
                        {!blockSearchPerformed ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
                                <Search size={48} className="opacity-20" />
                                <div className="text-center">
                                    <p className="font-black text-lg text-slate-500 uppercase oswald tracking-widest">Ready to Search</p>
                                    <p className="text-xs font-bold text-slate-600 mt-2">좌측에서 트레이드 카드로 활용할 선수를 선택하고<br/>오퍼 검색 버튼을 눌러주세요.</p>
                                </div>
                            </div>
                        ) : blockOffers.length > 0 ? (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-20">
                                {blockOffers.map((offer, idx) => (
                                    <OfferCard 
                                        key={idx} 
                                        offer={offer} 
                                        onPlayerClick={handleViewPlayer}
                                        onAccept={() => setPendingTrade({
                                            userAssets: (team?.roster || []).filter(p => blockSelectedIds.has(p.id)),
                                            targetAssets: offer.players,
                                            targetTeam: teams.find(t => t.id === offer.teamId)!
                                        })}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
                                <div className="p-6 bg-slate-800/20 rounded-full">
                                    <Trash2 size={32} className="opacity-30" />
                                </div>
                                <p className="font-bold text-sm">조건에 맞는 제안이 없습니다.</p>
                                <p className="text-xs">다른 선수나 포지션을 선택해보세요.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'Proposal' && (
                 <div className="flex h-full">
                    {/* Left: Target Team Roster */}
                    <div className="flex-1 flex flex-col border-r border-slate-800 bg-slate-950/30">
                        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                                {selectedTargetTeam ? `${selectedTargetTeam.name} Roster` : 'Target Roster'}
                            </span>
                            <span className="text-[10px] font-bold text-slate-500">{proposalSelectedIds.size} wanted</span>
                        </div>
                        {selectedTargetTeam ? (
                            <TradeRosterList 
                                roster={targetTeamRoster} 
                                selectedIds={proposalSelectedIds} 
                                onToggle={toggleProposalPlayer} 
                                onViewPlayer={handleViewPlayer} 
                                isTradeDeadlinePassed={isTradeDeadlinePassed}
                                mode="Proposal"
                            />
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                                <Target size={40} className="opacity-20 mb-4" />
                                <p className="text-xs font-bold uppercase tracking-widest">상대 팀을 먼저 선택해주세요</p>
                            </div>
                        )}
                    </div>
                    
                    {/* Right: Counter Offers */}
                    <div className="w-[500px] bg-slate-900/50 p-6 overflow-y-auto custom-scrollbar border-l border-slate-800">
                        <div className="mb-6 flex items-center gap-3 text-slate-400">
                             <Handshake size={20} />
                             <h4 className="font-black uppercase text-sm tracking-widest">상대방의 요구 조건</h4>
                        </div>

                        {!proposalSearchPerformed ? (
                            <div className="h-64 flex flex-col items-center justify-center text-slate-600 text-center">
                                <p className="text-xs font-bold mb-2">영입하고 싶은 선수를 선택 후<br/>협상을 시도하세요.</p>
                            </div>
                        ) : proposalRequirements.length > 0 ? (
                            <div className="space-y-4">
                                {proposalRequirements.map((req, idx) => (
                                    <RequirementCard 
                                        key={idx} 
                                        requirement={req}
                                        targetPlayers={targetTeamRoster.filter(p => proposalSelectedIds.has(p.id))}
                                        onPlayerClick={handleViewPlayer}
                                        onAccept={() => setPendingTrade({
                                            userAssets: req.players, // Players MY team gives up
                                            targetAssets: targetTeamRoster.filter(p => proposalSelectedIds.has(p.id)),
                                            targetTeam: teams.find(t => t.id === proposalTargetTeamId)!
                                        })}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="h-64 flex flex-col items-center justify-center text-slate-600 text-center space-y-4">
                                <div className="p-6 bg-red-500/10 rounded-full border border-red-500/20">
                                    <X size={32} className="text-red-500/50" />
                                </div>
                                <div>
                                    <p className="font-bold text-sm text-slate-500">협상 결렬</p>
                                    <p className="text-xs mt-1">상대방이 트레이드에 관심이 없거나,<br/>샐러리 캡 조건을 맞출 수 없습니다.</p>
                                </div>
                            </div>
                        )}
                    </div>
                 </div>
            )}

            {activeTab === 'History' && (
                <div className="h-full bg-slate-950/30">
                    <TradeHistoryTable 
                        transactions={filteredHistory} 
                        historyFilter={historyFilter} 
                        teamId={team.id} 
                        teams={teams}
                        currentSimDate={currentSimDate}
                    />
                </div>
            )}
         </div>
      </div>
    </div>
  );
};
