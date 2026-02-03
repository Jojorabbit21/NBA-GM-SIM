import React, { useState, useMemo } from 'react';
import { ArrowRight, Briefcase, RefreshCw, AlertTriangle, Activity, Search } from 'lucide-react';
import { Team, Player, Transaction, TradeOffer } from '../types';
import { useTradeSystem } from '../hooks/useTradeSystem';
import { PlayerDetailModal } from '../components/PlayerDetailModal';
import { TradeHistoryTable } from '../components/transactions/TradeHistoryTable';
import { TradeRosterList } from '../components/transactions/TradeRosterList';
import { OfferCard } from '../components/transactions/OfferCard';
import { RequirementCard } from '../components/transactions/RequirementCard';
import { PositionFilter } from '../components/transactions/PositionFilter';
import { TradeConfirmModal } from '../components/transactions/TradeConfirmModal';
import { calculatePlayerOvr } from '../utils/constants';

interface TransactionsViewProps {
  team: Team;
  teams: Team[];
  setTeams: React.Dispatch<React.SetStateAction<Team[]>>;
  addNews: (news: string) => void;
  onShowToast: (msg: string) => void;
  currentSimDate: string;
  transactions: Transaction[];
  onAddTransaction: (t: Transaction) => void;
  onForceSave: (overrides?: any) => Promise<void>;
  userId?: string;
  refreshUnreadCount?: () => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  team, teams, setTeams, addNews, onShowToast, currentSimDate, transactions, onAddTransaction, onForceSave, userId, refreshUnreadCount
}) => {
  const [activeTab, setActiveTab] = useState<'block' | 'proposal' | 'history'>('block');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'mine'>('all');
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const {
    blockSelectedIds, blockOffers, blockIsProcessing, blockSearchPerformed,
    targetPositions, toggleTargetPosition, handleSearchBlockOffers, toggleBlockPlayer,
    
    proposalTargetTeamId, setProposalTargetTeamId,
    proposalSelectedIds, setProposalSelectedIds,
    proposalRequirements, proposalIsProcessing, proposalSearchPerformed,
    toggleProposalPlayer, handleRequestRequirements,
    
    pendingTrade, setPendingTrade,
    isExecutingTrade, executeTrade,
    
    dailyTradeAttempts, isTradeLimitReached, isTradeDeadlinePassed, MAX_DAILY_TRADES
  } = useTradeSystem(team, teams, setTeams, currentSimDate, userId, onAddTransaction, onForceSave, onShowToast, refreshUnreadCount);

  // Helper for team dropdown
  const [isTeamDropdownOpen, setIsTeamDropdownOpen] = useState(false);
  const [teamSearchTerm, setTeamSearchTerm] = useState('');
  
  const filteredTeamsList = useMemo(() => {
      return teams
          .filter(t => t.id !== team.id)
          .filter(t => (t.city + t.name).toLowerCase().includes(teamSearchTerm.toLowerCase()))
          .sort((a, b) => a.city.localeCompare(b.city));
  }, [teams, team.id, teamSearchTerm]);

  const TradeLimitChip = () => (
      <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 mr-2 transition-colors ${isTradeLimitReached ? 'bg-red-950/30 border-red-500/50 text-red-400' : 'bg-slate-950/50 border-slate-700 text-slate-400'}`} title="일일 트레이드 업무 제한">
          <Activity size={14} className={isTradeLimitReached ? "animate-pulse" : ""} />
          <span className="text-[10px] font-black uppercase tracking-wider font-mono">
              Daily Ops: {dailyTradeAttempts}/{MAX_DAILY_TRADES}
          </span>
      </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] animate-in fade-in duration-500 ko-normal gap-4">
        {viewPlayer && (
            <PlayerDetailModal 
                player={{...viewPlayer, ovr: calculatePlayerOvr(viewPlayer)}} 
                teamName={teams.find(t => t.roster.some(r => r.id === viewPlayer.id))?.name} 
                teamId={teams.find(t => t.roster.some(r => r.id === viewPlayer.id))?.id}
                onClose={() => setViewPlayer(null)} 
            />
        )}

        {showConfirmModal && pendingTrade && (
            <TradeConfirmModal
                userAssets={pendingTrade.userAssets}
                targetAssets={pendingTrade.targetAssets}
                userTeam={team}
                targetTeam={pendingTrade.targetTeam}
                onConfirm={async () => {
                    await executeTrade();
                    setShowConfirmModal(false);
                }}
                onCancel={() => setShowConfirmModal(false)}
            />
        )}

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-slate-800 pb-4 flex-shrink-0">
            <div className="flex items-center gap-4">
                <h2 className="text-3xl font-black ko-tight text-slate-100 uppercase tracking-tight">트레이드 센터</h2>
                {isTradeDeadlinePassed && (
                    <span className="px-3 py-1 bg-red-600 text-white text-xs font-bold rounded-full animate-pulse shadow-lg shadow-red-900/50">
                        DEADLINE PASSED
                    </span>
                )}
            </div>
            
            <div className="flex items-center gap-2">
                <TradeLimitChip />
                <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                    {['block', 'proposal', 'history'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                                activeTab === tab ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            {tab === 'block' ? '트레이드 블록' : tab === 'proposal' ? '제안하기' : '기록'}
                        </button>
                    ))}
                </div>
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 overflow-hidden bg-slate-900/40 border border-slate-800 rounded-3xl shadow-2xl flex flex-col">
            
            {activeTab === 'block' && (
                <div className="flex h-full">
                    {/* Left: My Roster Selection */}
                    <div className="w-[320px] flex flex-col border-r border-slate-800 bg-slate-950/30">
                        <div className="p-4 border-b border-slate-800 bg-slate-950/50">
                            <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-1">Step 1</h3>
                            <p className="text-sm font-bold text-white">매물로 내놓을 선수 선택 (최대 5명)</p>
                        </div>
                        <TradeRosterList 
                            roster={team.roster} 
                            selectedIds={blockSelectedIds} 
                            onToggle={toggleBlockPlayer} 
                            onViewPlayer={setViewPlayer} 
                            isTradeDeadlinePassed={isTradeDeadlinePassed}
                            mode="Block"
                        />
                    </div>

                    {/* Middle: Controls */}
                    <div className="w-[240px] flex flex-col border-r border-slate-800 bg-slate-900/20 p-4 gap-4">
                        <div className="p-4 border-b border-slate-800 pb-4">
                            <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-2">Step 2</h3>
                            <p className="text-sm font-bold text-white mb-4">원하는 포지션 설정</p>
                            <PositionFilter selected={targetPositions} onToggle={toggleTargetPosition} />
                        </div>
                        
                        <div className="flex-1 flex flex-col justify-end">
                            <button
                                onClick={handleSearchBlockOffers}
                                disabled={blockSelectedIds.size === 0 || blockIsProcessing || isTradeDeadlinePassed || isTradeLimitReached}
                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg flex flex-col items-center gap-2 transition-all active:scale-95"
                            >
                                {blockIsProcessing ? <RefreshCw className="animate-spin" size={20} /> : <Search size={20} />}
                                <span>{blockIsProcessing ? 'AI 검색 중...' : '오퍼 검색'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Right: Offers */}
                    <div className="flex-1 bg-slate-900/60 p-6 overflow-y-auto custom-scrollbar">
                        <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-4">Step 3: Received Offers</h3>
                        
                        {blockOffers.length > 0 ? (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                {blockOffers.map((offer, idx) => (
                                    <OfferCard 
                                        key={idx} 
                                        offer={offer} 
                                        onAccept={() => {
                                            const myAssets = team.roster.filter(p => blockSelectedIds.has(p.id));
                                            setPendingTrade({
                                                userAssets: myAssets,
                                                targetAssets: offer.players,
                                                targetTeam: teams.find(t => t.id === offer.teamId)!
                                            });
                                            setShowConfirmModal(true);
                                        }}
                                        onPlayerClick={setViewPlayer}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4 opacity-60">
                                <div className="p-6 bg-slate-900 rounded-full border border-slate-800">
                                    <Briefcase size={40} />
                                </div>
                                <p className="font-bold text-sm">
                                    {blockSearchPerformed ? "조건에 맞는 오퍼가 없습니다." : "선수를 선택하고 오퍼를 검색하세요."}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'proposal' && (
                <div className="flex h-full">
                    {/* Left: Target Team Roster */}
                    <div className="w-[320px] flex flex-col border-r border-slate-800 bg-slate-950/30">
                        <div className="p-4 border-b border-slate-800 bg-slate-950/50">
                            <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-2">Step 1</h3>
                            <div className="relative">
                                <button 
                                    onClick={() => setIsTeamDropdownOpen(!isTeamDropdownOpen)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-left text-xs font-bold text-white flex justify-between items-center"
                                >
                                    <span>{proposalTargetTeamId ? teams.find(t => t.id === proposalTargetTeamId)?.name : '상대팀 선택...'}</span>
                                    <Search size={14} className="text-slate-500" />
                                </button>
                                {isTeamDropdownOpen && (
                                    <div className="absolute top-full left-0 w-full mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                                        <div className="p-2 border-b border-slate-800">
                                            <input 
                                                autoFocus
                                                type="text" 
                                                placeholder="팀 검색..." 
                                                className="w-full bg-slate-950 text-xs text-white p-2 outline-none"
                                                value={teamSearchTerm}
                                                onChange={e => setTeamSearchTerm(e.target.value)}
                                            />
                                        </div>
                                        <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                            {filteredTeamsList.map(t => (
                                                <button
                                                    key={t.id}
                                                    onClick={() => { setProposalTargetTeamId(t.id); setIsTeamDropdownOpen(false); setProposalSelectedIds(new Set()); setProposalRequirements([]); }}
                                                    className="w-full text-left px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white"
                                                >
                                                    {t.city} {t.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        {proposalTargetTeamId ? (
                            <TradeRosterList 
                                roster={teams.find(t => t.id === proposalTargetTeamId)?.roster || []} 
                                selectedIds={proposalSelectedIds} 
                                onToggle={toggleProposalPlayer} 
                                onViewPlayer={setViewPlayer} 
                                isTradeDeadlinePassed={isTradeDeadlinePassed}
                                mode="Proposal"
                            />
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-slate-600 text-xs font-bold">
                                팀을 먼저 선택하세요.
                            </div>
                        )}
                    </div>

                    {/* Middle: Action */}
                    <div className="w-[180px] flex flex-col items-center justify-center border-r border-slate-800 bg-slate-900/20 p-4 gap-4">
                        <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest text-center">Step 2</h3>
                        <p className="text-[10px] font-bold text-slate-400 text-center break-keep">상대가 요구할 자산(Requirements)을 AI가 분석합니다.</p>
                        <button
                            onClick={handleRequestRequirements}
                            disabled={proposalSelectedIds.size === 0 || proposalIsProcessing || isTradeDeadlinePassed || isTradeLimitReached}
                            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg flex flex-col items-center gap-2 transition-all active:scale-95"
                        >
                            {proposalIsProcessing ? <RefreshCw className="animate-spin" size={20} /> : <Briefcase size={20} />}
                            <span>{proposalIsProcessing ? '분석 중...' : '조건 분석'}</span>
                        </button>
                    </div>

                    {/* Right: Requirements */}
                    <div className="flex-1 bg-slate-900/60 p-6 overflow-y-auto custom-scrollbar">
                        <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-4">Step 3: Counter Proposals</h3>
                        
                        {proposalRequirements.length > 0 ? (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                {proposalRequirements.map((req, idx) => {
                                    const targetTeam = teams.find(t => t.id === proposalTargetTeamId);
                                    if (!targetTeam) return null;
                                    const targetAssets = targetTeam.roster.filter(p => proposalSelectedIds.has(p.id));

                                    return (
                                        <RequirementCard 
                                            key={idx} 
                                            requirement={req} 
                                            targetPlayers={targetAssets}
                                            onAccept={() => {
                                                const myAssets = req.players; // The players I give up (from requirement)
                                                setPendingTrade({
                                                    userAssets: myAssets,
                                                    targetAssets: targetAssets,
                                                    targetTeam: targetTeam
                                                });
                                                setShowConfirmModal(true);
                                            }}
                                            onPlayerClick={setViewPlayer}
                                        />
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4 opacity-60">
                                <div className="p-6 bg-slate-900 rounded-full border border-slate-800">
                                    <Briefcase size={40} />
                                </div>
                                <p className="font-bold text-sm">
                                    {proposalSearchPerformed ? "상대방이 만족할 만한 카드가 없습니다." : "영입하고 싶은 선수를 선택하고 분석을 실행하세요."}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'history' && (
                <div className="flex flex-col h-full p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest">Trade Log</h3>
                        <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
                            <button onClick={() => setHistoryFilter('all')} className={`px-4 py-1.5 rounded text-[10px] font-black uppercase transition-all ${historyFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>All Trades</button>
                            <button onClick={() => setHistoryFilter('mine')} className={`px-4 py-1.5 rounded text-[10px] font-black uppercase transition-all ${historyFilter === 'mine' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>My Trades</button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden bg-slate-950/30 rounded-2xl border border-slate-800">
                        <TradeHistoryTable 
                            transactions={transactions} 
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
  );
};