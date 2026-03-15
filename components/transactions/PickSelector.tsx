
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

function buildNote(pick: DraftPickAsset): string {
    const parts: string[] = [];

    if (pick.originalTeamId !== pick.currentTeamId) {
        parts.push('타팀 픽');
    }

    if (pick.protection) {
        if (pick.protection.type === 'top' && pick.protection.threshold) {
            parts.push(`상위 ${pick.protection.threshold}순위 보호`);
        } else if (pick.protection.type === 'lottery') {
            parts.push('로터리 보호');
        } else {
            parts.push('보호');
        }
    } else if (pick.originalTeamId !== pick.currentTeamId) {
        parts.push('비보호');
    }

    if (pick.swapRight) {
        const swapTeam = TEAM_DATA[pick.swapRight.beneficiaryTeamId];
        const name = swapTeam ? swapTeam.name : pick.swapRight.beneficiaryTeamId.toUpperCase();
        parts.push(`${name} 스왑`);
    }

    return parts.join(' · ');
}

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
        <table className="w-full text-left border-separate border-spacing-0">
            <thead className="bg-slate-800 sticky top-0 z-10">
                <tr className="text-slate-500 text-xs font-bold uppercase">
                    <th className="py-2.5 px-3 w-8 border-b border-slate-700"></th>
                    <th className="py-2.5 px-3 w-16 border-b border-slate-700">년도</th>
                    <th className="py-2.5 px-3 w-14 border-b border-slate-700">팀</th>
                    <th className="py-2.5 px-3 w-14 border-b border-slate-700">라운드</th>
                    <th className="py-2.5 px-3 border-b border-slate-700">비고</th>
                </tr>
            </thead>
            <tbody>
                {sorted.map(pick => {
                    const selected = isPickSelected(pick, selectedPicks);
                    const pickRef: TradePickRef = {
                        season: pick.season,
                        round: pick.round,
                        originalTeamId: pick.originalTeamId,
                    };
                    const teamAbbr = pick.originalTeamId.toUpperCase();
                    const note = buildNote(pick);

                    return (
                        <tr
                            key={`${pick.season}-${pick.round}-${pick.originalTeamId}`}
                            onClick={() => !disabled && onTogglePick(pickRef)}
                            className={`transition-colors ${
                                disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                            } ${selected ? 'bg-indigo-600/10' : 'hover:bg-white/5'}`}
                        >
                            <td className="py-2 px-3 border-b border-slate-800/50">
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                    selected ? 'bg-emerald-500 border-emerald-400' : 'border-slate-700 bg-slate-900'
                                }`}>
                                    {selected && <Check size={12} className="text-white" strokeWidth={3} />}
                                </div>
                            </td>
                            <td className="py-2 px-3 border-b border-slate-800/50 text-xs font-bold text-slate-200">
                                {pick.season}
                            </td>
                            <td className="py-2 px-3 border-b border-slate-800/50 text-xs font-bold text-slate-200">
                                {teamAbbr}
                            </td>
                            <td className="py-2 px-3 border-b border-slate-800/50 text-xs font-bold text-slate-200">
                                {pick.round}R
                            </td>
                            <td className="py-2 px-3 border-b border-slate-800/50 text-xs text-white">
                                {note || <span className="text-slate-600">—</span>}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};
