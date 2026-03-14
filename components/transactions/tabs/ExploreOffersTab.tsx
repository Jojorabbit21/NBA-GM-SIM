
import React, { useState, useMemo } from 'react';
import { Loader2, Check, Package, Search as SearchIcon } from 'lucide-react';
import { Player, Team, TradeOffer } from '../../../types';
import { DraftPickAsset } from '../../../types/draftAssets';
import { TradePickRef } from '../../../types/trade';
import { OvrBadge } from '../../common/OvrBadge';
import { PickSelector } from '../PickSelector';
import { OfferCard } from '../OfferCard';
import { calculatePlayerOvr } from '../../../utils/constants';
import { formatMoney } from '../../../utils/formatMoney';
import { generateOffers } from '../../../services/tradeEngine/offerGenerator';

interface ExploreOffersTabProps {
    team: Team;
    teams: Team[];
    userPicks: DraftPickAsset[];
    isTradeDeadlinePassed: boolean;
    handleViewPlayer: (p: Player) => void;
    onAcceptOffer: (offer: TradeOffer, selectedUserPlayers: Player[]) => void;
}

export const ExploreOffersTab: React.FC<ExploreOffersTabProps> = ({
    team,
    teams,
    userPicks,
    isTradeDeadlinePassed,
    handleViewPlayer,
    onAcceptOffer,
}) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showPickSelector, setShowPickSelector] = useState(false);
    const [selectedPicks, setSelectedPicks] = useState<TradePickRef[]>([]);
    const [offers, setOffers] = useState<TradeOffer[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [searchPerformed, setSearchPerformed] = useState(false);

    const sortedUserRoster = useMemo(() =>
        [...(team?.roster || [])].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)),
        [team?.roster]
    );

    const togglePlayer = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else if (next.size < 5) next.add(id);
            return next;
        });
        // 새 선택 시 결과 초기화
        setSearchPerformed(false);
        setOffers([]);
    };

    const handleSearch = () => {
        if (selectedIds.size === 0) return;
        setIsProcessing(true);
        // setTimeout for UI responsiveness
        setTimeout(() => {
            const tradingPlayers = team.roster.filter(p => selectedIds.has(p.id));
            const results = generateOffers(tradingPlayers, team, teams);
            setOffers(results);
            setIsProcessing(false);
            setSearchPerformed(true);
        }, 300);
    };

    return (
        <div className="flex flex-1 min-h-0 h-full">
            {/* Left: User Roster + Pick Selector */}
            <div className="w-[380px] lg:w-[420px] border-r border-slate-700 flex flex-col flex-shrink-0">
                <div className="px-6 py-3 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                    <span className="text-xs font-bold uppercase text-slate-500">내 로스터</span>
                    <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold uppercase ${selectedIds.size > 0 ? 'text-indigo-400' : 'text-slate-600'}`}>
                            {selectedIds.size}명 선택
                        </span>
                        {userPicks.length > 0 && (
                            <button
                                onClick={() => setShowPickSelector(!showPickSelector)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                                    showPickSelector
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-slate-700/50 text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                <Package size={10} className="inline mr-1" />픽
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900">
                    {/* Pick Selector */}
                    {showPickSelector && (
                        <div className="border-b border-slate-700">
                            <PickSelector
                                picks={userPicks}
                                selectedPicks={selectedPicks}
                                onTogglePick={(pickRef) => {
                                    setSelectedPicks(prev => {
                                        const exists = prev.some(p =>
                                            p.season === pickRef.season && p.round === pickRef.round && p.originalTeamId === pickRef.originalTeamId
                                        );
                                        if (exists) return prev.filter(p =>
                                            !(p.season === pickRef.season && p.round === pickRef.round && p.originalTeamId === pickRef.originalTeamId)
                                        );
                                        return [...prev, pickRef];
                                    });
                                }}
                                disabled={isTradeDeadlinePassed}
                                maxSelections={3}
                            />
                        </div>
                    )}

                    {/* Player Table */}
                    <table className="w-full text-left border-separate border-spacing-0">
                        <thead className="bg-slate-800 sticky top-0 z-10">
                            <tr className="text-slate-500 text-xs font-bold uppercase">
                                <th className="py-2.5 px-3 w-8 border-b border-slate-700"></th>
                                <th className="py-2.5 px-1 w-10 border-b border-slate-700 text-center">OVR</th>
                                <th className="py-2.5 px-3 border-b border-slate-700">선수</th>
                                <th className="py-2.5 px-2 w-10 border-b border-slate-700 text-center">POS</th>
                                <th className="py-2.5 px-2 w-10 border-b border-slate-700 text-center">AGE</th>
                                <th className="py-2.5 px-3 w-16 border-b border-slate-700 text-right">연봉</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedUserRoster.map(p => {
                                const isSelected = selectedIds.has(p.id);
                                const ovr = calculatePlayerOvr(p);
                                const disabled = isTradeDeadlinePassed;
                                return (
                                    <tr
                                        key={p.id}
                                        onClick={() => !disabled && togglePlayer(p.id)}
                                        className={`transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${isSelected ? 'bg-indigo-600/10' : 'hover:bg-white/5'}`}
                                    >
                                        <td className="py-2 px-3 border-b border-slate-800/50">
                                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-emerald-500 border-emerald-400' : 'border-slate-700 bg-slate-900'}`}>
                                                {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                                            </div>
                                        </td>
                                        <td className="py-2 px-1 border-b border-slate-800/50 text-center">
                                            <OvrBadge value={ovr} size="sm" />
                                        </td>
                                        <td className="py-2 px-3 border-b border-slate-800/50">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span
                                                    className="font-bold text-sm text-slate-200 truncate hover:text-indigo-400 hover:underline cursor-pointer"
                                                    onClick={(e) => { e.stopPropagation(); handleViewPlayer(p); }}
                                                >
                                                    {p.name}
                                                </span>
                                                {p.health !== 'Healthy' && (
                                                    <span className={`px-1 py-0.5 rounded text-[8px] font-black uppercase flex-shrink-0 ${p.health === 'Injured' ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500'}`}>
                                                        {p.health === 'Injured' ? 'OUT' : 'DTD'}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-2 px-2 border-b border-slate-800/50 text-center text-xs font-bold text-slate-400 uppercase">{p.position}</td>
                                        <td className="py-2 px-2 border-b border-slate-800/50 text-center text-xs font-mono text-slate-400">{p.age}</td>
                                        <td className="py-2 px-3 border-b border-slate-800/50 text-right text-xs font-mono font-bold text-slate-300">{formatMoney(p.salary)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Right: Search Button + Offer Results */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="px-6 py-3 border-b border-slate-700 flex items-center justify-between bg-slate-800 flex-shrink-0">
                    <span className="text-xs font-bold uppercase text-slate-500">오퍼 탐색 결과</span>
                    <button
                        onClick={handleSearch}
                        disabled={selectedIds.size === 0 || isProcessing || isTradeDeadlinePassed}
                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold uppercase text-[10px] tracking-widest transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isProcessing ? <Loader2 className="animate-spin" size={14} /> : <SearchIcon size={14} />}
                        오퍼 탐색
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900">
                    {isProcessing ? (
                        <div className="h-full flex flex-col items-center justify-center">
                            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-3" />
                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">리그 오퍼 탐색 중...</p>
                        </div>
                    ) : searchPerformed ? (
                        offers.length > 0 ? (
                            <div className="p-4 space-y-4">
                                {offers.map((offer, idx) => (
                                    <OfferCard
                                        key={idx}
                                        offer={offer}
                                        onAccept={() => onAcceptOffer(offer, team.roster.filter(p => selectedIds.has(p.id)))}
                                        onPlayerClick={handleViewPlayer}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-3">
                                <div className="p-6 bg-slate-800/50 rounded-full border border-slate-700/50">
                                    <SearchIcon size={32} className="text-slate-600" />
                                </div>
                                <p className="font-black text-sm text-slate-500 uppercase tracking-widest">오퍼 없음</p>
                                <p className="text-xs font-bold text-slate-600 text-center">
                                    선택한 선수에 관심을 보이는 팀이 없거나,<br/>
                                    샐러리 캡 매칭이 불가능합니다.
                                </p>
                            </div>
                        )
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-3">
                            <SearchIcon size={32} className="text-slate-700" />
                            <p className="font-black text-sm text-slate-500 uppercase tracking-widest">즉시 탐색</p>
                            <p className="text-xs font-bold text-slate-600 text-center">
                                좌측에서 내놓을 선수를 선택하고<br/>
                                &quot;오퍼 탐색&quot; 버튼을 눌러주세요.
                            </p>
                            <p className="text-[10px] font-bold text-indigo-400/60 text-center mt-2">
                                CPU 팀들이 즉시 오퍼를 제시합니다.<br/>
                                수락만 가능하며, 추가 협상은 불가합니다.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
