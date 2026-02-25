
import React, { useMemo } from 'react';
import { TacticalSliders } from '../../../../types';
import { PLAY_TYPES } from './playTypeConstants';

interface PlayTypePPPProps {
    sliders: TacticalSliders;
}

// Donut chart constants
const DONUT_CX = 80;
const DONUT_CY = 80;
const DONUT_R = 55;
const DONUT_STROKE = 20;
const CIRCUMFERENCE = 2 * Math.PI * DONUT_R;

// Shot zone definitions
const SHOT_ZONES = [
    { label: '3PT', sliderKey: 'shot_3pt' as const, color: '#10b981' },
    { label: 'MID', sliderKey: 'shot_mid' as const, color: '#f59e0b' },
    { label: 'RIM', sliderKey: 'shot_rim' as const, color: '#ef4444' },
];

export const PlayTypePPP: React.FC<PlayTypePPPProps> = ({ sliders }) => {
    const data = useMemo(() => {
        const rawWeights = PLAY_TYPES.map(pt => sliders[pt.sliderKey] || 5);
        const totalWeight = rawWeights.reduce((s, v) => s + v, 0);
        const distribution = rawWeights.map(w => (w / totalWeight) * 100);

        return PLAY_TYPES.map((pt, i) => ({
            ...pt,
            distribution: distribution[i],
        }));
    }, [sliders]);

    const donutSegments = useMemo(() => {
        let accumulated = 0;
        return data.map(item => {
            const segmentLength = (item.distribution / 100) * CIRCUMFERENCE;
            const offset = -accumulated;
            accumulated += segmentLength;
            return { segmentLength, offset, color: item.color };
        });
    }, [data]);

    const zonePrefs = useMemo(() => {
        const total = (sliders.shot_3pt || 5) + (sliders.shot_mid || 5) + (sliders.shot_rim || 5);
        return SHOT_ZONES.map(z => ({
            ...z,
            pct: ((sliders[z.sliderKey] || 5) / total) * 100,
        }));
    }, [sliders]);

    const maxZonePct = Math.max(...zonePrefs.map(z => z.pct));

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

                {/* PlayType + Share */}
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

                {/* Shot Zone Preference */}
                <table className="border-collapse">
                    <thead>
                        <tr>
                            <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider pb-1.5" colSpan={3}>슈팅 존</th>
                        </tr>
                    </thead>
                    <tbody>
                        {zonePrefs.map(zone => {
                            const barWidth = (zone.pct / maxZonePct) * 100;
                            return (
                                <tr key={zone.label} className="h-9">
                                    <td className="align-middle pr-2">
                                        <span className="text-xs font-bold text-slate-300">{zone.label}</span>
                                    </td>
                                    <td className="align-middle w-[60px]">
                                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-300"
                                                style={{ width: `${barWidth}%`, backgroundColor: zone.color }}
                                            />
                                        </div>
                                    </td>
                                    <td className="align-middle pl-2">
                                        <span className="text-xs font-black text-white tabular-nums">{zone.pct.toFixed(0)}%</span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
