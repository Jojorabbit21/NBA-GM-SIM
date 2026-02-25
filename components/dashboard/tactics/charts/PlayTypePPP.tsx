
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

    // Stacked bar chart constants
    const BAR_W = 40;
    const BAR_GAP = 20;
    const BAR_H = 160;
    const BAR_TOP = 16;
    const BAR_X1 = 30;
    const BAR_X2 = BAR_X1 + BAR_W + BAR_GAP;

    const sliderSegments = useMemo(() => {
        // Stack order top→bottom: 3PT, MID, RIM (코트 거리 직관)
        const ordered = [zoneComparison[0], zoneComparison[1], zoneComparison[2]];
        let y = BAR_TOP;
        return ordered.map(z => {
            const h = (z.slider / 100) * BAR_H;
            const seg = { ...z, pct: z.slider, y, h };
            y += h;
            return seg;
        });
    }, [zoneComparison]);

    const rosterSegments = useMemo(() => {
        const ordered = [zoneComparison[0], zoneComparison[1], zoneComparison[2]];
        let y = BAR_TOP;
        return ordered.map(z => {
            const h = (z.roster / 100) * BAR_H;
            const seg = { ...z, pct: z.roster, y, h };
            y += h;
            return seg;
        });
    }, [zoneComparison]);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center">
                <h5 className="flex-1 text-sm font-black text-slate-300 uppercase tracking-widest">플레이타입 분석</h5>
                <h5 className="text-sm font-black text-slate-300 uppercase tracking-widest">슈팅 존 선호도</h5>
            </div>

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
                                <td className="align-middle pl-3">
                                    <div className="flex items-center justify-end h-full">
                                        <span className="text-xs font-black text-white tabular-nums">{item.distribution.toFixed(0)}%</span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Stacked Bar Chart — Shot Zone Comparison */}
                <div className="shrink-0 flex items-center ml-auto">
                    <svg viewBox="0 0 160 200" className="w-[200px] h-[200px]">
                        <defs>
                            <clipPath id="bar-clip-1">
                                <rect x={BAR_X1} y={BAR_TOP} width={BAR_W} height={BAR_H} rx={6} />
                            </clipPath>
                            <clipPath id="bar-clip-2">
                                <rect x={BAR_X2} y={BAR_TOP} width={BAR_W} height={BAR_H} rx={6} />
                            </clipPath>
                        </defs>

                        {/* Column labels */}
                        <text x={BAR_X1 + BAR_W / 2} y={10} textAnchor="middle" fill="#64748b" fontSize="11" fontWeight="700">전술</text>
                        <text x={BAR_X2 + BAR_W / 2} y={10} textAnchor="middle" fill="#64748b" fontSize="11" fontWeight="700">로스터</text>

                        {/* Slider bar (clipped) */}
                        <g clipPath="url(#bar-clip-1)">
                            {sliderSegments.map((seg, i) => (
                                <rect
                                    key={`s-${i}`}
                                    x={BAR_X1} y={seg.y} width={BAR_W} height={seg.h}
                                    fill={seg.color}
                                    className="transition-all duration-300"
                                />
                            ))}
                        </g>
                        {/* Slider bar labels */}
                        {sliderSegments.map((seg, i) => (
                            seg.h > 22 ? (
                                <text
                                    key={`sl-${i}`}
                                    x={BAR_X1 + BAR_W / 2} y={seg.y + seg.h / 2 + 4}
                                    textAnchor="middle" fill="#fff" fontSize="11" fontWeight="800"
                                >
                                    {seg.pct}%
                                </text>
                            ) : null
                        ))}

                        {/* Roster bar (clipped) */}
                        <g clipPath="url(#bar-clip-2)">
                            {rosterSegments.map((seg, i) => (
                                <rect
                                    key={`r-${i}`}
                                    x={BAR_X2} y={seg.y} width={BAR_W} height={seg.h}
                                    fill={seg.color}
                                    className="transition-all duration-300"
                                />
                            ))}
                        </g>
                        {/* Roster bar labels */}
                        {rosterSegments.map((seg, i) => (
                            seg.h > 22 ? (
                                <text
                                    key={`rl-${i}`}
                                    x={BAR_X2 + BAR_W / 2} y={seg.y + seg.h / 2 + 4}
                                    textAnchor="middle" fill="#fff" fontSize="11" fontWeight="800"
                                >
                                    {seg.pct}%
                                </text>
                            ) : null
                        ))}

                        {/* Legend */}
                        {ZONES.map((z, i) => (
                            <g key={z.label} transform={`translate(${10 + i * 50}, 190)`}>
                                <circle cx={5} cy={0} r={4} fill={z.color} />
                                <text x={13} y={4} fill="#94a3b8" fontSize="10" fontWeight="700">{z.label}</text>
                            </g>
                        ))}
                    </svg>
                </div>
            </div>
        </div>
    );
};
