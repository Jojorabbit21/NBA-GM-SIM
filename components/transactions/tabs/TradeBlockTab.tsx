
import React, { useState } from 'react';
import { Loader2, Check, Package } from 'lucide-react';
import { Player, Team, TradeOffer } from '../../../types';
import { DraftPickAsset } from '../../../types/draftAssets';
import { TradeBlockEntry, TradePickRef } from '../../../types/trade';
import { PositionFilter } from '../PositionFilter';
import { OvrBadge } from '../../common/OvrBadge';
import { TeamLogo } from '../../common/TeamLogo';
import { PickSelector } from '../PickSelector';
import { calculatePlayerOvr } from '../../../utils/constants';
import { formatMoney } from '../../../utils/formatMoney';

interface TradeBlockTabProps {
    team: Team;
    teams: Team[];
    blockSelectedIds: Set<string>;
    blockOffers: TradeOffer[];
    blockIsProcessing: boolean;
    blockSearchPerformed: boolean;
    targetPositions: string[];
    isTradeDeadlinePassed: boolean;

    // Legacy Actions
    toggleBlockPlayer: (id: string) => void;
    handleViewPlayer: (p: Player) => void;
    toggleTargetPosition: (pos: string) => void;
    handleSearchBlockOffers: () => void;
    onAcceptOffer: (offer: TradeOffer) => void;

    sortedUserRoster: Player[];

    // 영속 블록 시스템
    userBlockEntries: TradeBlockEntry[];
    togglePersistentBlockPlayer: (playerId: string) => void;
    togglePersistentBlockPick: (pickRef: TradePickRef) => void;
    userPicks: DraftPickAsset[];
}

export const TradeBlockTab: React.FC<TradeBlockTabProps> = ({
    team,
    teams,
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
    sortedUserRoster,
    userBlockEntries,
    togglePersistentBlockPlayer,
    togglePersistentBlockPick,
    userPicks,
}) => {
    const [showPickSelector, setShowPickSelector] = useState(false);

    // 영속 블록에 등록된 선수/픽 ID 세트
    const persistentPlayerIds = new Set(
        userBlockEntries.filter(e => e.type === 'player').map(e => e.playerId!)
    );
    const persistentPickRefs = userBlockEntries.filter(e => e.type === 'pick').map(e => e.pick!);
    const persistentBlockCount = userBlockEntries.length;

    // 영속 블록에 등록된 픽을 TradePickRef[]로 변환
    const selectedPickRefs: TradePickRef[] = persistentPickRefs;

    return (
        <div className="flex flex-1 min-h-0 h-full">
            {/* Left: My Roster + Picks */}
            <div className="w-[380px] lg:w-[420px] border-r border-slate-700 flex flex-col flex-shrink-0">
                <div className="px-6 py-3 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                    <span className="text-xs font-bold uppercase text-slate-500">내 트레이드 블록</span>
                    <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold uppercase ${persistentBlockCount > 0 ? 'text-indigo-400' : 'text-slate-600'}`}>
                            {persistentBlockCount} / 8 등록
                        </span>
                        <button
                            onClick={() => setShowPickSelector(!showPickSelector)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                                showPickSelector
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-700/50 text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            <Package size={10} className="inline mr-1" />
                            픽 {persistentPickRefs.length > 0 ? `(${persistentPickRefs.length})` : ''}
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900">
                    {/* 영속 블록에 등록된 항목 요약 */}
                    {persistentBlockCount > 0 && (
                        <div className="px-4 py-2 bg-indigo-600/5 border-b border-indigo-500/20">
                            <div className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-1">
                                블록 등록 자산 (시뮬 진행 시 CPU 오퍼 대상)
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {userBlockEntries.map((entry, i) => {
                                    if (entry.type === 'player') {
                                        const p = team.roster.find(r => r.id === entry.playerId);
                                        return (
                                            <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-bold text-slate-300 border border-slate-700/50">
                                                {p?.name ?? entry.playerId}
                                            </span>
                                        );
                                    } else {
                                        const pick = entry.pick!;
                                        return (
                                            <span key={i} className="px-2 py-0.5 rounded bg-amber-500/10 text-[10px] font-bold text-amber-400 border border-amber-500/30">
                                                {pick.season} R{pick.round}
                                            </span>
                                        );
                                    }
                                })}
                            </div>
                        </div>
                    )}

                    {/* Pick Selector (토글) */}
                    {showPickSelector && (
                        <div className="border-b border-slate-700">
                            <PickSelector
                                picks={userPicks}
                                selectedPicks={selectedPickRefs}
                                onTogglePick={togglePersistentBlockPick}
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
                                const isPersistent = persistentPlayerIds.has(p.id);
                                const isSelected = blockSelectedIds.has(p.id) || isPersistent;
                                const ovr = calculatePlayerOvr(p);
                                const disabled = isTradeDeadlinePassed;
                                return (
                                    <tr
                                        key={p.id}
                                        onClick={() => {
                                            if (disabled) return;
                                            togglePersistentBlockPlayer(p.id);
                                            toggleBlockPlayer(p.id);
                                        }}
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

            {/* Right: Offers */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Right Panel Header */}
                <div className="px-6 py-3 border-b border-slate-700 flex justify-between items-center bg-slate-800 flex-shrink-0">
                    <span className="text-xs font-bold uppercase text-slate-500">
                        오퍼 결과 {blockSearchPerformed && blockOffers.length > 0 && `(${blockOffers.length}건)`}
                    </span>
                    <div className="flex items-center gap-3">
                        <PositionFilter selected={targetPositions} onToggle={toggleTargetPosition} />
                        <button
                            onClick={handleSearchBlockOffers}
                            disabled={blockSelectedIds.size === 0 || blockIsProcessing}
                            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold uppercase text-xs transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {blockIsProcessing && <Loader2 className="animate-spin" size={14} />}
                            오퍼 탐색
                        </button>
                    </div>
                </div>

                {/* Right Panel Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900">
                    {!blockSearchPerformed ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-3">
                            <p className="font-black text-sm text-slate-500 uppercase tracking-widest">오퍼 대기</p>
                            <p className="text-xs font-bold text-slate-600 text-center">
                                좌측에서 트레이드 블록에 올릴 선수를 선택하고<br/>
                                오퍼 탐색 버튼을 눌러주세요.
                            </p>
                            <p className="text-[10px] font-bold text-indigo-400/60 text-center mt-2">
                                블록에 등록한 선수/픽은 시뮬 진행 시<br/>
                                CPU 팀이 자동으로 오퍼를 보내옵니다.
                            </p>
                        </div>
                    ) : blockOffers.length > 0 ? (
                        <div className="p-4 space-y-4">
                            {blockOffers.map((offer, idx) => {
                                return (
                                    <div key={idx} className="rounded-xl border border-slate-700/50 bg-slate-900 overflow-hidden">
                                        {/* Card Header */}
                                        <div className="px-5 py-3 bg-slate-950/60 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <TeamLogo teamId={offer.teamId} size="sm" />
                                                <span className="text-sm font-black uppercase tracking-tight text-white">
                                                    {offer.teamName}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => onAcceptOffer(offer)}
                                                className="px-4 py-2 rounded-xl font-bold text-xs uppercase text-white bg-indigo-600 hover:bg-indigo-500 transition-all active:scale-95"
                                            >
                                                수락하기
                                            </button>
                                        </div>
                                        {/* Card Body — Players */}
                                        <div className="divide-y divide-slate-800/50">
                                            {offer.players.map(p => {
                                                const ovr = calculatePlayerOvr(p);
                                                return (
                                                    <div key={p.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-white/5 transition-colors">
                                                        <OvrBadge value={ovr} size="sm" />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span
                                                                    className="font-bold text-sm text-slate-200 truncate hover:text-indigo-400 hover:underline cursor-pointer"
                                                                    onClick={() => handleViewPlayer(p)}
                                                                >
                                                                    {p.name}
                                                                </span>
                                                                {p.health !== 'Healthy' && (
                                                                    <span className={`px-1 py-0.5 rounded text-[8px] font-black uppercase flex-shrink-0 ${p.health === 'Injured' ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500'}`}>
                                                                        {p.health === 'Injured' ? 'OUT' : 'DTD'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <span className="text-xs font-bold text-slate-500 uppercase w-8 text-center">{p.position}</span>
                                                        <span className="text-xs font-mono text-slate-500 w-6 text-center">{p.age}</span>
                                                        <span className="text-xs font-mono font-bold text-slate-300 w-16 text-right">{formatMoney(p.salary)}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-3">
                            <p className="font-bold text-sm">조건에 맞는 제안이 없습니다.</p>
                            <p className="text-xs text-slate-500">다른 선수나 포지션을 선택해보세요.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
