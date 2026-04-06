
import React, { useState, useMemo } from 'react';
import { InvestmentCategory, TeamInvestmentState } from '../../types/finance';
import { computeInvestmentEffects } from '../../services/financeEngine/investmentEngine';
import { SliderControl } from '../common/SliderControl';

interface InvestmentPanelProps {
    teamId: string;
    ownerName: string;
    investmentState: TeamInvestmentState;
    onConfirm: (allocations: Record<InvestmentCategory, number>) => void;
    onSkip: () => void;  // 기본 배분으로 건너뛰기
}

const CATEGORIES: { key: InvestmentCategory; label: string; desc: string; icon: string }[] = [
    { key: 'facility',  label: '경기장 시설',  desc: '관중 점유율 최대 +15%',  icon: '🏟️' },
    { key: 'training',  label: '훈련 프로그램', desc: '선수 성장 배율 최대 ×1.5', icon: '🏋️' },
    { key: 'scouting',  label: '스카우팅',      desc: '드래프트 정확도 최대 100%', icon: '🔍' },
    { key: 'marketing', label: '마케팅',        desc: '스폰서십/MD 수익 최대 +20%', icon: '📣' },
];

function fmtM(v: number): string {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(0)}M`;
    return `$${v.toLocaleString()}`;
}

function fmtPct(v: number): string {
    return `+${(v * 100).toFixed(1)}%`;
}

export const InvestmentPanel: React.FC<InvestmentPanelProps> = ({
    teamId,
    ownerName,
    investmentState,
    onConfirm,
    onSkip,
}) => {
    const { discretionaryBudget } = investmentState;
    const step = 1_000_000;
    const max = discretionaryBudget;

    const [allocations, setAllocations] = useState<Record<InvestmentCategory, number>>(
        investmentState.allocations,
    );

    const totalAllocated = useMemo(
        () => Object.values(allocations).reduce((s, v) => s + v, 0),
        [allocations],
    );
    const remaining = discretionaryBudget - totalAllocated;

    const previewEffects = useMemo(() => computeInvestmentEffects(allocations), [allocations]);

    const handleSlider = (cat: InvestmentCategory, raw: number) => {
        const value = Math.round(raw / step) * step;
        // 잔여 예산 초과 방지
        const others = totalAllocated - allocations[cat];
        const clamped = Math.min(value, discretionaryBudget - others);
        setAllocations(prev => ({ ...prev, [cat]: Math.max(0, clamped) }));
    };

    const effectLabel = (cat: InvestmentCategory): string => {
        switch (cat) {
            case 'facility':  return `관중 점유율 ${fmtPct(previewEffects.facilityBonus)}`;
            case 'training':  return `성장 배율 ×${previewEffects.trainingMultiplier.toFixed(2)}`;
            case 'scouting':  return `스카우팅 정확도 ${(previewEffects.scoutingAccuracy * 100).toFixed(0)}%`;
            case 'marketing': return `수익 보정 ${fmtPct(previewEffects.marketingBonus)}`;
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 text-white p-6 max-w-2xl mx-auto">
            {/* 헤더 */}
            <div className="mb-8">
                <div className="text-indigo-400 text-sm font-semibold uppercase tracking-widest mb-1">
                    구단주 투자 배분
                </div>
                <h1 className="text-3xl font-bold text-white mb-1">
                    {ownerName}
                </h1>
                <p className="text-gray-400 text-sm">
                    이번 시즌 구단 운영 외 가용 예산을 배분하세요.
                </p>
            </div>

            {/* 예산 요약 */}
            <div className="bg-gray-900 rounded-xl p-4 mb-6 flex items-center justify-between">
                <div>
                    <div className="text-gray-500 text-xs">가용 예산</div>
                    <div className="text-2xl font-bold text-indigo-300">{fmtM(discretionaryBudget)}</div>
                </div>
                <div>
                    <div className="text-gray-500 text-xs">배분 완료</div>
                    <div className="text-2xl font-bold text-white">{fmtM(totalAllocated)}</div>
                </div>
                <div>
                    <div className="text-gray-500 text-xs">잔여</div>
                    <div className={`text-2xl font-bold ${remaining < 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {fmtM(remaining)}
                    </div>
                </div>
            </div>

            {/* 카테고리 슬라이더 */}
            <div className="space-y-5 mb-8">
                {CATEGORIES.map(({ key, label, desc, icon }) => (
                    <div key={key} className="bg-gray-900 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <span className="text-xl">{icon}</span>
                                <div>
                                    <div className="font-semibold text-white">{label}</div>
                                    <div className="text-gray-500 text-xs">{desc}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-indigo-300 font-bold">{fmtM(allocations[key])}</div>
                                <div className="text-green-400 text-xs">{effectLabel(key)}</div>
                            </div>
                        </div>
                        <SliderControl
                            label=""
                            value={allocations[key]}
                            min={0}
                            max={max}
                            onChange={val => handleSlider(key, val)}
                            subLabel={fmtM(allocations[key])}
                            leftLabel="$0"
                            rightLabel={fmtM(max)}
                        />
                    </div>
                ))}
            </div>

            {/* 효과 미리보기 요약 */}
            <div className="bg-indigo-950 border border-indigo-800 rounded-xl p-4 mb-6">
                <div className="text-indigo-400 text-xs font-semibold uppercase tracking-widest mb-3">
                    시즌 효과 미리보기
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="text-sm">
                        <span className="text-gray-400">🏟️ 관중 점유율</span>
                        <span className="ml-2 text-white font-semibold">
                            {fmtPct(previewEffects.facilityBonus)}
                        </span>
                    </div>
                    <div className="text-sm">
                        <span className="text-gray-400">🏋️ 성장 배율</span>
                        <span className="ml-2 text-white font-semibold">
                            ×{previewEffects.trainingMultiplier.toFixed(2)}
                        </span>
                    </div>
                    <div className="text-sm">
                        <span className="text-gray-400">🔍 드래프트 정확도</span>
                        <span className="ml-2 text-white font-semibold">
                            {(previewEffects.scoutingAccuracy * 100).toFixed(0)}%
                        </span>
                    </div>
                    <div className="text-sm">
                        <span className="text-gray-400">📣 수익 보정</span>
                        <span className="ml-2 text-white font-semibold">
                            {fmtPct(previewEffects.marketingBonus)}
                        </span>
                    </div>
                </div>
            </div>

            {/* 버튼 */}
            <div className="flex gap-3">
                <button
                    onClick={() => onConfirm(allocations)}
                    disabled={remaining < 0}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed
                               text-white font-bold py-3 rounded-xl transition-colors"
                >
                    배분 확정
                </button>
                <button
                    onClick={onSkip}
                    className="px-6 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-3 rounded-xl transition-colors"
                >
                    기본 배분
                </button>
            </div>
        </div>
    );
};
