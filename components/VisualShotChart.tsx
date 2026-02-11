
import React, { useMemo } from 'react';
import { Player } from '../types';
import { getProjectedZoneDensity } from '../services/game/engine/shotDistribution';

interface VisualShotChartProps {
    player: Player;
    allPlayers?: Player[];
}

// SVG Paths (Approximate 500x470 half court)
const SHOT_ZONES_PATHS = {
    c3L: "M 0,0 L 45,0 L 45,140 L 0,140 Z",
    c3R: "M 455,0 L 500,0 L 500,140 L 455,140 Z",
    atb3L: "M 45,0 L 160,0 L 160,140 L 45,140 Z", 
    atb3C: "M 160,0 L 340,0 L 340,140 L 160,140 Z",
    atb3R: "M 340,0 L 455,0 L 455,140 L 340,140 Z",
    midL: "M 0,140 L 160,140 L 160,320 L 0,320 Z",
    midC: "M 160,140 L 340,140 L 340,320 L 160,320 Z",
    midR: "M 340,140 L 500,140 L 500,320 L 340,320 Z",
    paint: "M 170,320 L 330,320 L 330,470 L 170,470 Z",
    rim: "M 210,400 L 290,400 L 290,450 L 210,450 Z"
};

export const VisualShotChart: React.FC<VisualShotChartProps> = ({ player }) => {
    const s = player.stats;
    
    // Use total FGA to determine mode: Scouting (No sample) vs Data (Has sample)
    const totalFGA = s ? s.fga : 0;
    const isScoutingMode = totalFGA === 0;

    // Helper to calculate percentage
    const getZ = (m: number | undefined, a: number | undefined) => ({ 
        m: m || 0, 
        a: a || 0, 
        pct: (a && a > 0) ? ((m || 0) / a) * 100 : 0 
    });

    const zData = useMemo(() => {
        if (!s) return null;
        
        if (isScoutingMode) {
             const density = getProjectedZoneDensity(player);
             return {
                rim: { ...getZ(0,0), density: density.rim },
                paint: { ...getZ(0,0), density: density.paint },
                midL: { ...getZ(0,0), density: density.midL },
                midC: { ...getZ(0,0), density: density.midC },
                midR: { ...getZ(0,0), density: density.midR },
                c3L: { ...getZ(0,0), density: density.c3L },
                c3R: { ...getZ(0,0), density: density.c3R },
                atb3L: { ...getZ(0,0), density: density.atb3L },
                atb3C: { ...getZ(0,0), density: density.atb3C },
                atb3R: { ...getZ(0,0), density: density.atb3R },
             };
        }

        return {
            rim: getZ(s.zone_rim_m, s.zone_rim_a),
            paint: getZ(s.zone_paint_m, s.zone_paint_a),
            midL: getZ(s.zone_mid_l_m, s.zone_mid_l_a),
            midC: getZ(s.zone_mid_c_m, s.zone_mid_c_a),
            midR: getZ(s.zone_mid_r_m, s.zone_mid_r_a),
            c3L: getZ(s.zone_c3_l_m, s.zone_c3_l_a),
            c3R: getZ(s.zone_c3_r_m, s.zone_c3_r_a),
            atb3L: getZ(s.zone_atb3_l_m, s.zone_atb3_l_a),
            atb3C: getZ(s.zone_atb3_c_m, s.zone_atb3_c_a),
            atb3R: getZ(s.zone_atb3_r_m, s.zone_atb3_r_a),
        };
    }, [player, s, isScoutingMode]);

    if (!zData) return null;

    // --- Visualization Logic ---
    const getColor = (zoneKey: keyof typeof zData) => {
        const d = (zData as any)[zoneKey];
        
        if (isScoutingMode) {
            const alpha = Math.min(0.9, Math.max(0.1, d.density * 2)); 
            return `rgba(239, 68, 68, ${alpha})`;
        } else {
            if (d.a === 0) return 'rgba(100, 116, 139, 0.2)'; // Gray for no data
            let avg = 40;
            if (zoneKey === 'rim' || zoneKey === 'paint') avg = 60;
            else if (zoneKey.includes('3')) avg = 36;
            
            if (d.pct >= avg + 10) return '#ef4444'; // Red (Hot)
            if (d.pct >= avg) return '#f59e0b'; // Amber (Avg)
            if (d.pct >= avg - 10) return '#3b82f6'; // Blue (Avg-)
            return '#1e3a8a'; // Cold
        }
    };

    const getTooltip = (zoneKey: keyof typeof zData, label: string) => {
        const d = (zData as any)[zoneKey];
        if (isScoutingMode) return `${label}: Projected Volume ${(d.density * 100).toFixed(1)}%`;
        return `${label}: ${d.m}/${d.a} (${d.pct.toFixed(1)}%)`;
    };

    const ZonePath = ({ d, zoneKey }: { d: string, zoneKey: keyof typeof zData }) => (
        <path 
            d={d} 
            fill={getColor(zoneKey)} 
            stroke="#0f172a" 
            strokeWidth="2"
            className="transition-all hover:opacity-80"
        >
            <title>{getTooltip(zoneKey, zoneKey.toUpperCase())}</title>
        </path>
    );

    // --- Data Aggregation for Table ---
    const aggStats = [
        { label: 'Rim / Restricted', keys: ['rim'], avg: 60 },
        { label: 'Paint (Non-RA)', keys: ['paint'], avg: 45 },
        { label: 'Mid-Range', keys: ['midL', 'midC', 'midR'], avg: 40 },
        { label: 'Corner 3', keys: ['c3L', 'c3R'], avg: 38 },
        { label: 'Above The Break 3', keys: ['atb3L', 'atb3C', 'atb3R'], avg: 35 },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
            {/* Left: Chart */}
            <div className="flex flex-col items-center justify-center bg-slate-950/30 rounded-3xl p-6 border border-slate-800/50">
                <div className="relative w-full max-w-[360px] aspect-[500/470]">
                    <svg viewBox="0 0 500 470" className="w-full h-full drop-shadow-xl">
                        {Object.entries(SHOT_ZONES_PATHS).map(([key, d]) => (
                            <ZonePath key={key} zoneKey={key as any} d={d} />
                        ))}
                        {/* Hoop Marker */}
                        <circle cx="250" cy="425" r="6" fill="none" stroke="orange" strokeWidth="2" />
                        <line x1="220" y1="432" x2="280" y2="432" stroke="white" strokeWidth="2" />
                    </svg>
                    
                    <div className="absolute top-2 left-2 text-[10px] text-white/50 font-bold bg-black/40 px-2 py-1 rounded pointer-events-none uppercase tracking-widest">
                        {isScoutingMode ? 'Volume Projection' : 'Efficiency Heatmap'}
                    </div>
                </div>

                {/* Legend */}
                <div className="mt-6 flex gap-4 text-[10px] font-bold text-slate-400 bg-slate-900/80 px-4 py-2 rounded-xl border border-slate-800">
                    {isScoutingMode ? (
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 bg-red-500 rounded-sm opacity-20"></div><span>Low</span></div>
                            <div className="w-8 h-1 bg-gradient-to-r from-red-500/20 to-red-500 rounded-full"></div>
                            <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 bg-red-500 rounded-sm opacity-100"></div><span>High Vol</span></div>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-red-500 rounded-sm"></div><span>Hot (+10%)</span></div>
                            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-amber-500 rounded-sm"></div><span>Avg</span></div>
                            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-blue-500 rounded-sm"></div><span>Cold (-10%)</span></div>
                        </>
                    )}
                </div>
            </div>

            {/* Right: Data Table */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                    <span className="text-xs font-black text-slate-200 uppercase tracking-widest">Zone Efficiency Breakdown</span>
                </div>
                
                <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-950 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                            <tr>
                                <th className="py-3 px-4 border-b border-slate-800">Zone</th>
                                <th className="py-3 px-4 border-b border-slate-800 text-right">FGM / FGA</th>
                                <th className="py-3 px-4 border-b border-slate-800 text-right">FG%</th>
                                <th className="py-3 px-4 border-b border-slate-800 text-right">League Avg</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs font-bold text-slate-300">
                            {aggStats.map((row, idx) => {
                                let m = 0, a = 0;
                                if (!isScoutingMode) {
                                    row.keys.forEach(k => {
                                        const d = (zData as any)[k];
                                        m += d.m;
                                        a += d.a;
                                    });
                                }
                                const pct = a > 0 ? (m / a) * 100 : 0;
                                const diff = pct - row.avg;
                                let colorClass = 'text-slate-400';
                                if (a > 0) {
                                    if (diff >= 5) colorClass = 'text-red-400';
                                    else if (diff >= 0) colorClass = 'text-amber-400';
                                    else if (diff > -5) colorClass = 'text-blue-400';
                                    else colorClass = 'text-indigo-400';
                                }

                                return (
                                    <tr key={idx} className="border-b border-slate-800/50 last:border-0 hover:bg-white/5 transition-colors">
                                        <td className="py-3 px-4">{row.label}</td>
                                        <td className="py-3 px-4 text-right font-mono text-slate-400">
                                            {isScoutingMode ? '-' : `${m} / ${a}`}
                                        </td>
                                        <td className={`py-3 px-4 text-right font-mono ${colorClass}`}>
                                            {isScoutingMode ? '-' : `${pct.toFixed(1)}%`}
                                        </td>
                                        <td className="py-3 px-4 text-right font-mono text-slate-500">
                                            {row.avg}%
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot className="bg-slate-950/50">
                            <tr className="text-xs font-black text-white">
                                <td className="py-3 px-4 border-t border-slate-800">TOTAL</td>
                                <td className="py-3 px-4 border-t border-slate-800 text-right font-mono">
                                    {s ? `${s.fgm} / ${s.fga}` : '-'}
                                </td>
                                <td className="py-3 px-4 border-t border-slate-800 text-right font-mono text-emerald-400">
                                    {s && s.fga > 0 ? `${((s.fgm / s.fga) * 100).toFixed(1)}%` : '-'}
                                </td>
                                <td className="py-3 px-4 border-t border-slate-800"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800/50 text-[10px] text-slate-500 leading-relaxed">
                    * Shot chart data is based on the 2025-26 season simulation. 
                    {isScoutingMode && " Since no games have been played, this chart shows projected tendencies based on player attributes."}
                </div>
            </div>
        </div>
    );
};
