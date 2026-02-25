
import React, { useMemo } from 'react';
import { TacticalSliders, Player } from '../../../../types';
import { calculatePlayerOvr } from '../../../../utils/constants';

interface ShotZoneComparisonProps {
    sliders: TacticalSliders;
    roster: Player[];
}

const ZONES = [
    { label: '3PT', color: '#10b981' },
    { label: 'MID', color: '#f59e0b' },
    { label: 'RIM', color: '#ef4444' },
];

export const ShotZoneComparison: React.FC<ShotZoneComparisonProps> = ({ sliders, roster }) => {
    const comparison = useMemo(() => {
        // 1. Slider-based zone preference
        const s3 = sliders.shot_3pt || 5;
        const sm = sliders.shot_mid || 5;
        const sr = sliders.shot_rim || 5;
        const sTotal = s3 + sm + sr;
        const sliderPcts = [
            (s3 / sTotal) * 100,
            (sm / sTotal) * 100,
            (sr / sTotal) * 100,
        ];

        // 2. Roster tendencies (top 8 rotation players)
        const sorted = [...roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
        const rot = sorted.slice(0, Math.min(8, sorted.length));

        let rosterPcts = [33.3, 33.3, 33.3]; // fallback

        if (rot.length > 0) {
            let total3 = 0, totalMid = 0, totalRim = 0;
            let count = 0;

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
                const avg3 = total3 / count;
                const avgMid = totalMid / count;
                const avgRim = totalRim / count;
                const total = avg3 + avgMid + avgRim;

                if (total > 0) {
                    rosterPcts = [
                        (avg3 / total) * 100,
                        (avgMid / total) * 100,
                        (avgRim / total) * 100,
                    ];
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
        <div className="flex flex-col gap-3">
            <h5 className="text-sm font-black text-slate-300 uppercase tracking-widest">슈팅 존 선호도</h5>

            <table className="border-collapse w-full">
                <thead>
                    <tr>
                        <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider pb-1.5">존</th>
                        <th className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider pb-1.5">전술</th>
                        <th className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider pb-1.5">로스터</th>
                        <th className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider pb-1.5">차이</th>
                        <th className="pb-1.5" />
                    </tr>
                </thead>
                <tbody>
                    {comparison.map(zone => (
                        <tr key={zone.label} className="h-9">
                            <td className="align-middle">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: zone.color }} />
                                    <span className="text-xs font-bold text-slate-300">{zone.label}</span>
                                </div>
                            </td>
                            <td className="align-middle text-right pl-3">
                                <span className="text-xs font-black text-white tabular-nums">{zone.slider}%</span>
                            </td>
                            <td className="align-middle text-right pl-3">
                                <span className="text-xs font-black text-slate-400 tabular-nums">{zone.roster}%</span>
                            </td>
                            <td className="align-middle text-right pl-3">
                                <span className={`text-xs font-bold tabular-nums ${zone.diff > 0 ? 'text-emerald-400' : zone.diff < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                    {zone.diff > 0 ? '+' : ''}{zone.diff}
                                </span>
                            </td>
                            <td className="align-middle pl-3 w-[120px]">
                                <div className="flex items-center gap-0.5 h-3">
                                    {/* Slider bar */}
                                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden relative">
                                        <div
                                            className="absolute top-0 left-0 h-full rounded-full opacity-30 transition-all duration-300"
                                            style={{ width: `${zone.roster}%`, backgroundColor: zone.color }}
                                        />
                                        <div
                                            className="absolute top-0 left-0 h-full rounded-full transition-all duration-300"
                                            style={{ width: `${zone.slider}%`, backgroundColor: zone.color }}
                                        />
                                    </div>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
