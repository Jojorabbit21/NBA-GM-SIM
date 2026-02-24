
import React, { useMemo } from 'react';
import { TacticalSliders, Player } from '../../../../types';
import { PLAY_TYPES, PLAY_ATTR_MAP } from './playTypeConstants';

interface PlayTypePPPProps {
    sliders: TacticalSliders;
    roster: Player[];
}

export const PlayTypePPP: React.FC<PlayTypePPPProps> = ({ sliders, roster }) => {
    const data = useMemo(() => {
        // Calculate slider distribution (% of total)
        const rawWeights = PLAY_TYPES.map(pt => sliders[pt.sliderKey] || 5);
        const totalWeight = rawWeights.reduce((s, v) => s + v, 0);
        const distribution = rawWeights.map(w => (w / totalWeight) * 100);

        // Calculate predicted efficiency based on roster attributes
        const predictions = PLAY_TYPES.map((pt, i) => {
            const attrMap = PLAY_ATTR_MAP[pt.key];
            let teamAttrScore = 0;

            if (roster.length > 0) {
                // Use top 8 players (rotation players) for attribute averaging
                const sorted = [...roster].sort((a, b) => (b as any).ovr - (a as any).ovr);
                const rotationPlayers = sorted.slice(0, Math.min(8, sorted.length));

                const avgScore = rotationPlayers.reduce((sum, p) => {
                    const playerScore = attrMap.attrs.reduce((s, attr, j) => {
                        return s + ((p as any)[attr] || 50) * attrMap.weights[j];
                    }, 0);
                    return sum + playerScore;
                }, 0) / rotationPlayers.length;

                teamAttrScore = avgScore / 100; // Normalize to 0-1
            }

            // Predicted PPP = base efficiency × roster quality modifier
            const predictedPPP = pt.baseEff * (0.7 + teamAttrScore * 0.6);

            // Actual PPP from season stats (Phase 2 - placeholder)
            const actualPPP: number | null = null;

            return {
                ...pt,
                distribution: distribution[i],
                predictedPPP: Math.round(predictedPPP * 100) / 100,
                actualPPP,
            };
        });

        return predictions;
    }, [sliders, roster]);

    const maxPPP = Math.max(...data.map(d => d.predictedPPP), 1.2);

    return (
        <div className="flex flex-col gap-3">
            <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">플레이 타입 효율</h5>
            <div className="space-y-3">
                {data.map(item => {
                    const barWidth = (item.predictedPPP / maxPPP) * 100;
                    return (
                        <div key={item.key} className="space-y-1">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-bold text-slate-300">{item.label}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-bold text-slate-500">{item.distribution.toFixed(0)}%</span>
                                    <span className="text-xs font-black text-white tabular-nums">{item.predictedPPP.toFixed(2)}</span>
                                    <span className="text-[9px] text-slate-600">PPP</span>
                                </div>
                            </div>
                            <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-300"
                                    style={{ width: `${barWidth}%`, backgroundColor: item.color, opacity: 0.8 }}
                                />
                            </div>
                            {item.actualPPP !== null && (
                                <div className="flex justify-end">
                                    <span className="text-[9px] text-slate-500">실적 {item.actualPPP.toFixed(2)} PPP</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="text-[9px] text-slate-600 text-right">* 로스터 능력치 기반 예측값</div>
        </div>
    );
};
