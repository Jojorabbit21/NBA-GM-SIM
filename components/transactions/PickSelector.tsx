
import React from 'react';
import { Check } from 'lucide-react';
import { DraftPickAsset } from '../../types/draftAssets';
import { TradePickRef } from '../../types/trade';
import { TEAM_DATA } from '../../data/teamData';

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

    const sorted = [...picks].sort((a, b) => a.season - b.season || a.round - b.round);

    return (
        <div className="divide-y divide-slate-800/30">
            {sorted.map(pick => {
                const selected = isPickSelected(pick, selectedPicks);
                const pickRef: TradePickRef = {
                    season: pick.season,
                    round: pick.round,
                    originalTeamId: pick.originalTeamId,
                };
                const teamAbbr = pick.originalTeamId.toUpperCase();

                // 조건 설명 조합
                const conditions: string[] = [];
                if (pick.protection) {
                    if (pick.protection.type === 'top' && pick.protection.threshold) {
                        conditions.push(`상위 ${pick.protection.threshold}순위 보호`);
                    } else if (pick.protection.type === 'lottery') {
                        conditions.push('로터리 보호');
                    } else {
                        conditions.push('보호 조건 있음');
                    }
                }
                if (pick.swapRight) {
                    const swapBeneficiary = TEAM_DATA[pick.swapRight.beneficiaryTeamId];
                    const swapName = swapBeneficiary ? `${swapBeneficiary.city} ${swapBeneficiary.name}` : pick.swapRight.beneficiaryTeamId;
                    conditions.push(`${swapName} 스왑 권리`);
                }

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

                        <div className="flex-1 min-w-0">
                            <span className={`text-xs font-bold ${pick.round === 1 ? 'text-amber-400' : 'text-slate-200'}`}>
                                {pick.season} {teamAbbr} {pick.round}R
                            </span>
                            {conditions.length > 0 && (
                                <span className="ml-1.5 text-xs text-white">
                                    ({conditions.join(' · ')})
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
