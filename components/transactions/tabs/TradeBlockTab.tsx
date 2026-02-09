
import React from 'react';
import { Search, Trash2, Loader2 } from 'lucide-react';
import { Player, Team, TradeOffer } from '../../../types';
import { TradeRosterList } from '../TradeRosterList';
import { OfferCard } from '../OfferCard';
import { PositionFilter } from '../PositionFilter';

interface TradeBlockTabProps {
    team: Team;
    teams: Team[];
    blockSelectedIds: Set<string>;
    blockOffers: TradeOffer[];
    blockIsProcessing: boolean;
    blockSearchPerformed: boolean;
    targetPositions: string[];
    isTradeDeadlinePassed: boolean;
    
    // Actions
    toggleBlockPlayer: (id: string) => void;
    handleViewPlayer: (p: Player) => void;
    toggleTargetPosition: (pos: string) => void;
    handleSearchBlockOffers: () => void;
    onAcceptOffer: (offer: TradeOffer) => void;
    
    sortedUserRoster: Player[];
}

export const TradeBlockTab: React.FC<TradeBlockTabProps> = ({
    team,
    teams, // OfferCard에서 팀 정보를 조회하기 위해 필요할 수 있음
    blockSelectedIds,
    blockOffers,
    blockIsProcessing,
    blockSearchPerformed,
    targetPositions,
    isTradeDeadlinePassed,
    toggleBlockPlayer,
    handleViewPlayer,
    toggleTargetPosition,
    handleSearchBlockOffers,
    onAcceptOffer,
    sortedUserRoster
}) => {
    return (
        <div className="flex flex-col h-full">
            {/* Toolbar Area */}
            <div className="px-8 py-4 bg-slate-900/50 border-b border-slate-800 flex justify-between items-center flex-shrink-0">
                <div className="flex items-center gap-4">
                    <span className="text-xs font-black uppercase text-slate-400 tracking-widest">
                        필요 포지션 설정:
                    </span>
                    <PositionFilter selected={targetPositions} onToggle={toggleTargetPosition} />
                </div>
                
                <button 
                    onClick={handleSearchBlockOffers}
                    disabled={blockSelectedIds.size === 0 || blockIsProcessing}
                    className="px-8 py-3 bg-white hover:bg-slate-200 text-slate-900 rounded-xl font-black uppercase text-xs tracking-widest transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] flex items-center gap-3 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {blockIsProcessing ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                    <span>오퍼 검색 (AI Engine)</span>
                </button>
            </div>

            <div className="flex flex-1 min-h-0">
                {/* Left: My Roster */}
                <div className="w-[380px] lg:w-[420px] border-r border-slate-800 bg-slate-950/30 flex flex-col flex-shrink-0">
                    <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">내 로스터 (Assets)</span>
                        <span className="text-[10px] font-bold text-slate-500">{blockSelectedIds.size} / 5 selected</span>
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

                {/* Right: Results */}
                <div className="flex-1 bg-slate-900/50 p-8 overflow-y-auto custom-scrollbar">
                    {!blockSearchPerformed ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
                            <div className="p-8 bg-slate-800/20 rounded-full border border-slate-800/50">
                                <Search size={48} className="opacity-20" />
                            </div>
                            <div className="text-center">
                                <p className="font-black text-lg text-slate-500 uppercase oswald tracking-widest">Ready to Search</p>
                                <p className="text-xs font-bold text-slate-600 mt-2">
                                    좌측에서 트레이드 카드로 활용할 선수를 선택하고<br/>
                                    상단 오퍼 검색 버튼을 눌러주세요.
                                </p>
                            </div>
                        </div>
                    ) : blockOffers.length > 0 ? (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-20">
                            {blockOffers.map((offer, idx) => (
                                <OfferCard 
                                    key={idx} 
                                    offer={offer} 
                                    onPlayerClick={handleViewPlayer}
                                    onAccept={() => onAcceptOffer(offer)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
                            <div className="p-6 bg-slate-800/20 rounded-full">
                                <Trash2 size={32} className="opacity-30" />
                            </div>
                            <p className="font-bold text-sm">조건에 맞는 제안이 없습니다.</p>
                            <p className="text-xs text-slate-500">다른 선수나 포지션을 선택해보세요.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
