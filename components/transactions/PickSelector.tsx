
import React from 'react';
import { Check } from 'lucide-react';
import { DraftPickAsset } from '../../types/draftAssets';
import { TradePickRef } from '../../types/trade';

interface PickSelectorProps {
    picks: DraftPickAsset[];
    selectedPicks: TradePickRef[];
    onTogglePick: (pickRef: TradePickRef) => void;
    disabled?: boolean;
    maxSelections?: number;
}

const isPickSelected = (pick: DraftPickAsset, selected: TradePickRef[]): boolean => {
    return selected.some(s =>
        s.season === pick.season && s.round === pick.round && s.originalTeamId === pick.originalTeamId
    );
};

export const PickSelector: React.FC<PickSelectorProps> = ({
    picks,
    selectedPicks,
    onTogglePick,
    disabled = false,
    maxSelections = 3,
}) => {
    if (picks.length === 0) {
        return (
            <div className="px-4 py-3 text-center text-xs font-bold text-slate-600">
                보유 드래프트 픽이 없습니다
            </div>
        );
    }

    // 시즌별 그룹핑
    const grouped = picks.reduce<Record<number, DraftPickAsset[]>>((acc, p) => {
        if (!acc[p.season]) acc[p.season] = [];
        acc[p.season].push(p);
        return acc;
    }, {});

    const seasons = Object.keys(grouped).map(Number).sort();

    return (
        <div className="space-y-2">
            {seasons.map(season => (
                <div key={season}>
                    <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-800/50">
                        {season} Draft
                    </div>
                    <div className="divide-y divide-slate-800/30">
                        {grouped[season]
                            .sort((a, b) => a.round - b.round)
                            .map(pick => {
                                const selected = isPickSelected(pick, selectedPicks);
                                const pickRef: TradePickRef = {
                                    season: pick.season,
                                    round: pick.round,
                                    originalTeamId: pick.originalTeamId,
                                };
                                const isOwn = pick.originalTeamId === pick.currentTeamId;

                                return (
                                    <div
                                        key={`${pick.season}-${pick.round}-${pick.originalTeamId}`}
                                        onClick={() => !disabled && onTogglePick(pickRef)}
                                        className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                                            disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                                        } ${selected ? 'bg-indigo-600/10' : 'hover:bg-white/5'}`}
                                    >
                                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                            selected ? 'bg-emerald-500 border-emerald-400' : 'border-slate-700 bg-slate-900'
                                        }`}>
                                            {selected && <Check size={12} className="text-white" strokeWidth={3} />}
                                        </div>

                                        <div className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                            pick.round === 1
                                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                                : 'bg-slate-700/50 text-slate-400 border border-slate-600/50'
                                        }`}>
                                            R{pick.round}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <span className="text-xs font-bold text-slate-200">
                                                {pick.season} {pick.round === 1 ? '1라운드' : '2라운드'}
                                            </span>
                                            {!isOwn && (
                                                <span className="ml-1.5 text-[10px] text-slate-500">
                                                    (via {pick.originalTeamId.slice(0, 3).toUpperCase()})
                                                </span>
                                            )}
                                        </div>

                                        {pick.protection && (
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20">
                                                {pick.protection.type === 'top' && pick.protection.threshold
                                                    ? `Top ${pick.protection.threshold} 보호`
                                                    : pick.protection.type === 'lottery'
                                                    ? '로터리 보호'
                                                    : '보호'}
                                            </span>
                                        )}

                                        {pick.swapRight && (
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                SWAP
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                    </div>
                </div>
            ))}
        </div>
    );
};
