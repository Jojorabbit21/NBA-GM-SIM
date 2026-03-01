
import React, { useMemo } from 'react';
import { TacticalSliders, Player } from '../../../../types';
import { calculatePlayerOvr } from '../../../../utils/constants';
import { PLAY_TYPES } from './playTypeConstants';

interface PlayTypePPPProps {
    sliders: TacticalSliders;
    roster: Player[];
}

const ZONES = [
    { label: '3PT', color: '#10b981' },
    { label: 'MID', color: '#f59e0b' },
    { label: 'RIM', color: '#ef4444' },
];

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

    const zoneComparison = useMemo(() => {
        const s3 = sliders.shot_3pt || 5;
        const sm = sliders.shot_mid || 5;
        const sr = sliders.shot_rim || 5;
        const sTotal = s3 + sm + sr;
        const sliderPcts = [(s3 / sTotal) * 100, (sm / sTotal) * 100, (sr / sTotal) * 100];

        const sorted = [...roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
        const rot = sorted.slice(0, Math.min(8, sorted.length));
        let rosterPcts = [33.3, 33.3, 33.3];

        if (rot.length > 0) {
            let total3 = 0, totalMid = 0, totalRim = 0, count = 0;
            for (const p of rot) {
                if (p.tendencies?.zones) {
                    const z = p.tendencies.zones;
                    total3 += (z.cnr || 0) + (z.p45 || 0) + (z.atb || 0);
                    totalMid += z.mid || 0;
                    totalRim += (z.ra || 0) + (z.itp || 0);
                    count++;
                }
            }
            if (count > 0) {
                const avg3 = total3 / count, avgMid = totalMid / count, avgRim = totalRim / count;
                const total = avg3 + avgMid + avgRim;
                if (total > 0) {
                    rosterPcts = [(avg3 / total) * 100, (avgMid / total) * 100, (avgRim / total) * 100];
                }
            }
        }

        return ZONES.map((zone, i) => ({
            ...zone,
            slider: Math.round(sliderPcts[i]),
            roster: Math.round(rosterPcts[i]),
            diff: Math.round(sliderPcts[i] - rosterPcts[i]),
        }));
    }, [sliders, roster]);

    return (
        <div className="flex items-stretch gap-4">
            {/* Left: 플레이타입 분석 (헤더 + 바디 묶음) */}
            <div className="flex flex-col gap-3">
                <h5 className="text-sm font-black text-slate-300 uppercase tracking-widest">플레이타입 분석</h5>
                <div className="flex items-stretch gap-4 flex-1">
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
                                    <td className="align-middle pl-3">
                                        <div className="flex items-center justify-end h-full">
                                            <span className="text-xs font-black text-white tabular-nums">{item.distribution.toFixed(0)}%</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Divider */}
            <div className="w-px bg-slate-800 shrink-0" />

            {/* Right: 슈팅 존 선호도 (헤더 + 바디 묶음) */}
            <div className="flex-1 flex flex-col gap-3">
                <h5 className="text-sm font-black text-slate-300 uppercase tracking-widest">슈팅 존 선호도</h5>
                <div className="flex-1 flex flex-col justify-center gap-4">
                    {zoneComparison.map(zone => (
                        <div key={zone.label} className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: zone.color }} />
                                <span className="text-xs font-bold text-slate-300">{zone.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-slate-500 w-10 shrink-0">전술</span>
                                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${zone.slider}%`, backgroundColor: zone.color }} />
                                </div>
                                <span className="text-xs font-black text-white tabular-nums w-8 text-right">{zone.slider}%</span>
                                <span className="w-8" />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-slate-500 w-10 shrink-0">로스터</span>
                                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full opacity-60 transition-all duration-300" style={{ width: `${zone.roster}%`, backgroundColor: zone.color }} />
                                </div>
                                <span className="text-xs font-black text-slate-400 tabular-nums w-8 text-right">{zone.roster}%</span>
                                <span className={`text-xs font-bold tabular-nums w-8 text-left ${zone.diff > 0 ? 'text-emerald-400' : zone.diff < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                    {zone.diff > 0 ? '+' : ''}{zone.diff}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
