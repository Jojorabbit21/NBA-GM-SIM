
import React, { useMemo } from 'react';
import { TacticalSliders, Player } from '../../../../types';
import { calculatePlayerOvr } from '../../../../utils/constants';
import { PLAY_TYPES, PLAY_ATTR_MAP } from './playTypeConstants';

interface PlayTypePPPProps {
    sliders: TacticalSliders;
    roster: Player[];
}

// Donut chart constants
const DONUT_CX = 80;
const DONUT_CY = 80;
const DONUT_R = 55;
const DONUT_STROKE = 20;
const CIRCUMFERENCE = 2 * Math.PI * DONUT_R;

export const PlayTypePPP: React.FC<PlayTypePPPProps> = ({ sliders, roster }) => {
    const data = useMemo(() => {
        const rawWeights = PLAY_TYPES.map(pt => sliders[pt.sliderKey] || 5);
        const totalWeight = rawWeights.reduce((s, v) => s + v, 0);
        const distribution = rawWeights.map(w => (w / totalWeight) * 100);

        const sorted = [...roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
        const rotationPlayers = sorted.slice(0, Math.min(8, sorted.length));

        return PLAY_TYPES.map((pt, i) => {
            const attrMap = PLAY_ATTR_MAP[pt.key];
            let teamAttrScore = 0;

            if (rotationPlayers.length > 0) {
                const avgScore = rotationPlayers.reduce((sum, p) => {
                    const playerScore = attrMap.attrs.reduce((s, attr, j) => {
                        return s + ((p as any)[attr] || 50) * attrMap.weights[j];
                    }, 0);
                    return sum + playerScore;
                }, 0) / rotationPlayers.length;
                teamAttrScore = avgScore / 100;
            }

            const predictedPPP = pt.baseEff * (0.7 + teamAttrScore * 0.6);

            return {
                ...pt,
                distribution: distribution[i],
                predictedPPP: Math.round(predictedPPP * 100) / 100,
            };
        });
    }, [sliders, roster]);

    const donutSegments = useMemo(() => {
        let accumulated = 0;
        return data.map(item => {
            const segmentLength = (item.distribution / 100) * CIRCUMFERENCE;
            const offset = -accumulated;
            accumulated += segmentLength;
            return { segmentLength, offset, color: item.color };
        });
    }, [data]);

    return (
        <div className="flex flex-col gap-3">
            <h5 className="text-sm font-black text-slate-300 uppercase tracking-widest">플레이타입 분석</h5>

            <div className="flex items-stretch gap-4">
                {/* Donut Chart */}
                <div className="shrink-0 flex items-center">
                    <svg viewBox="0 0 160 160" className="w-[200px] h-[200px]">
                        <circle
                            cx={DONUT_CX} cy={DONUT_CY} r={DONUT_R}
                            fill="none" stroke="#1e293b" strokeWidth={DONUT_STROKE}
                        />
                        {donutSegments.map((seg, i) => (
                            <circle
                                key={i}
                                cx={DONUT_CX} cy={DONUT_CY} r={DONUT_R}
                                fill="none"
                                stroke={seg.color}
                                strokeWidth={DONUT_STROKE}
                                strokeDasharray={`${seg.segmentLength} ${CIRCUMFERENCE}`}
                                strokeDashoffset={seg.offset}
                                strokeLinecap="butt"
                                transform={`rotate(-90 ${DONUT_CX} ${DONUT_CY})`}
                                className="transition-all duration-300"
                            />
                        ))}
                    </svg>
                </div>

                {/* Two visual groups side by side */}
                <div className="flex gap-6">
                    {/* Group 1: PlayType + Share */}
                    <table className="border-collapse">
                        <thead>
                            <tr>
                                <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider pb-1.5">플레이타입</th>
                                <th className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider pb-1.5 pl-3">비중</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map(item => (
                                <tr key={item.key} className="h-9">
                                    <td className="align-middle">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                                            <span className="text-xs font-bold text-slate-300 whitespace-nowrap">{item.label}</span>
                                        </div>
                                    </td>
                                    <td className="align-middle pl-3 text-right">
                                        <span className="text-xs font-black text-white tabular-nums">{item.distribution.toFixed(0)}%</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Group 2: PPP */}
                    <table className="border-collapse">
                        <thead>
                            <tr>
                                <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider pb-1.5">PPP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map(item => (
                                <tr key={item.key} className="h-9">
                                    <td className="align-middle">
                                        <span className="text-xs font-black text-white tabular-nums">{item.predictedPPP.toFixed(2)}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="text-xs text-slate-400 text-right">* 로스터 능력치 기반 예측값</div>
        </div>
    );
};
