
import React, { useState, useMemo } from 'react';
import { Search, Loader2, ChevronRight, Check } from 'lucide-react';
import { Team, Player, TradeOffer } from '../../../types';
import { DraftPickAsset } from '../../../types/draftAssets';
import { OvrBadge } from '../../common/OvrBadge';
import { TeamLogo } from '../../common/TeamLogo';
import { calculatePlayerOvr } from '../../../utils/constants';
import { formatMoney } from '../../../utils/formatMoney';
import { generateOffers } from '../../../services/tradeEngine/offerGenerator';

interface ExploreWidgetProps {
    team: Team;
    teams: Team[];
    userPicks: DraftPickAsset[];
    isTradeDeadlinePassed: boolean;
    dailyTradeAttempts: number;
    maxDailyTrades: number;
    isTradeLimitReached: boolean;
    onAcceptOffer: (offer: TradeOffer, selectedUserPlayers: Player[]) => void;
    onViewPlayer: (p: Player) => void;
    /** 위젯에서 전체 탭 뷰로 이동 */
    onOpenFullView?: () => void;
}

export const ExploreWidget: React.FC<ExploreWidgetProps> = ({
    team,
    teams,
    isTradeDeadlinePassed,
    dailyTradeAttempts,
    maxDailyTrades,
    isTradeLimitReached,
    onAcceptOffer,
    onViewPlayer,
    onOpenFullView,
}) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [offers, setOffers] = useState<TradeOffer[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [searchPerformed, setSearchPerformed] = useState(false);

    const sortedRoster = useMemo(
        () => [...(team?.roster || [])].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)),
        [team?.roster]
    );

    const togglePlayer = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else if (next.size < 3) next.add(id);
            return next;
        });
        setSearchPerformed(false);
        setOffers([]);
    };

    const handleSearch = () => {
        if (selectedIds.size === 0 || isProcessing) return;
        setIsProcessing(true);
        setTimeout(() => {
            const tradingPlayers = team.roster.filter(p => selectedIds.has(p.id));
            const results = generateOffers(tradingPlayers, team, teams);
            setOffers(results);
            setIsProcessing(false);
            setSearchPerformed(true);
        }, 300);
    };

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden flex flex-col">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-2 shrink-0 bg-indigo-900/60 border-b border-indigo-800/40">
                <div className="flex items-center gap-2">
                    <Search size={13} className="text-indigo-400" />
                    <span className="text-sm font-bold text-white">즉시 탐색</span>
                    <span className={`text-[10px] font-bold ${isTradeLimitReached ? 'text-red-400' : 'text-indigo-300/60'}`}>
                        {dailyTradeAttempts}/{maxDailyTrades}
                    </span>
                </div>
                {onOpenFullView && (
                    <button
                        onClick={onOpenFullView}
                        className="flex items-center gap-0.5 text-xs text-indigo-300/60 hover:text-indigo-300 transition-colors"
                    >
                        전체 보기 <ChevronRight size={12} />
                    </button>
                )}
            </div>

            {/* 선수 선택 영역 */}
            <div className="px-3 py-2 border-b border-slate-800/60 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black text-slate-500 uppercase">내놓을 선수</span>
                <div className="flex gap-1.5 flex-wrap flex-1">
                    {sortedRoster.slice(0, 12).map(p => {
                        const isSelected = selectedIds.has(p.id);
                        const ovr = calculatePlayerOvr(p);
                        return (
                            <button
                                key={p.id}
                                onClick={() => !isTradeDeadlinePassed && togglePlayer(p.id)}
                                disabled={isTradeDeadlinePassed}
                                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                                    isSelected
                                        ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300'
                                        : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-slate-200'
                                } disabled:opacity-40 disabled:cursor-not-allowed`}
                            >
                                {isSelected && <Check size={9} className="text-emerald-400" strokeWidth={3} />}
                                <span className="font-mono text-slate-500">{ovr}</span>
                                <span className="truncate max-w-[72px]">{p.name.split(' ').pop()}</span>
                            </button>
                        );
                    })}
                </div>
                <button
                    onClick={handleSearch}
                    disabled={selectedIds.size === 0 || isProcessing || isTradeDeadlinePassed}
                    className="ml-auto flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                    {isProcessing ? <Loader2 size={10} className="animate-spin" /> : <Search size={10} />}
                    탐색
                </button>
            </div>

            {/* 오퍼 결과 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar max-h-64">
                {isProcessing ? (
                    <div className="py-8 flex flex-col items-center justify-center gap-2">
                        <Loader2 size={20} className="text-indigo-500 animate-spin" />
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">탐색 중...</p>
                    </div>
                ) : searchPerformed ? (
                    offers.length > 0 ? (
                        <div className="divide-y divide-slate-800/50">
                            {offers.slice(0, 5).map((offer, idx) => (
                                <div key={idx} className="px-3 py-2.5 hover:bg-white/5 transition-colors">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-1.5">
                                            <TeamLogo teamId={offer.teamId} size="xs" />
                                            <span className="text-xs font-black uppercase text-slate-200">{offer.teamName}</span>
                                            <span className="text-[10px] text-slate-500">{offer.players.length}명</span>
                                        </div>
                                        <button
                                            onClick={() => onAcceptOffer(offer, team.roster.filter(p => selectedIds.has(p.id)))}
                                            className="flex items-center gap-0.5 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-black uppercase transition-all active:scale-95"
                                        >
                                            수락 <ChevronRight size={10} />
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {offer.players.map(p => {
                                            const ovr = calculatePlayerOvr(p);
                                            return (
                                                <button
                                                    key={p.id}
                                                    onClick={() => onViewPlayer(p)}
                                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800/60 border border-slate-700/30 text-[10px] text-slate-300 hover:text-indigo-400 transition-colors"
                                                >
                                                    <OvrBadge value={ovr} size="sm" />
                                                    {p.name.split(' ').pop()}
                                                    <span className="text-slate-500">{formatMoney(p.salary)}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                            {offers.length > 5 && onOpenFullView && (
                                <button
                                    onClick={onOpenFullView}
                                    className="w-full py-2 text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest transition-colors text-center"
                                >
                                    + {offers.length - 5}개 더 보기
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="py-8 flex flex-col items-center justify-center gap-1.5">
                            <Search size={24} className="text-slate-700" />
                            <p className="text-[10px] font-black text-slate-500 uppercase">오퍼 없음</p>
                            <p className="text-[10px] text-slate-600 text-center">관심 팀 없음 또는 샐러리 매칭 불가</p>
                        </div>
                    )
                ) : (
                    <div className="py-8 flex flex-col items-center justify-center gap-1.5">
                        <Search size={24} className="text-slate-700" />
                        <p className="text-[10px] font-black text-slate-500 uppercase">선수를 선택 후 탐색</p>
                        <p className="text-[10px] text-slate-600 text-center">
                            {isTradeDeadlinePassed ? '트레이드 데드라인 마감' : 'CPU 팀의 즉시 오퍼를 확인합니다'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
