
import React, { useMemo } from 'react';
import { Player } from '../types';
import { getProjectedZoneDensity } from '../services/game/engine/shotDistribution';

interface VisualShotChartProps {
    player: Player;
    allPlayers?: Player[]; // Optional context for relative comparison if needed
}

// SVG Paths (Approximate 500x470 half court) - Defined outside to prevent re-creation
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
    const isScoutingMode = totalFGA === 0; // Show projections only if 0 shots taken

    // Helper to calculate percentage or default (Safer type handling)
    const getZ = (m: number | undefined, a: number | undefined) => ({ 
        m: m || 0, 
        a: a || 0, 
        pct: (a && a > 0) ? ((m || 0) / a) * 100 : 0 
    });

    const zData = useMemo(() => {
        if (!s) return null;
        
        if (isScoutingMode) {
             const density = getProjectedZoneDensity(player);
             // Return dummy m/a but valid density for visualization
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
            // Volume Heatmap (Red opacity)
            const alpha = Math.min(0.9, Math.max(0.1, d.density * 2)); 
            return `rgba(239, 68, 68, ${alpha})`;
        } else {
            // Efficiency Heatmap
            // League Avg Approx: Rim 60%, Mid 40%, 3PT 36%
            if (d.a === 0) return 'rgba(100, 116, 139, 0.2)'; // Gray for no data

            let avg = 40;
            if (zoneKey === 'rim' || zoneKey === 'paint') avg = 60;
            else if (zoneKey.includes('3')) avg = 36;
            
            if (d.pct >= avg + 10) return '#ef4444'; // Red (Hot)
            if (d.pct >= avg) return '#f59e0b'; // Amber (Avg+)
            if (d.pct >= avg - 10) return '#3b82f6'; // Blue (Avg-)
            return '#1e3a8a'; // Dark Blue (Cold)
        }
    };

    const getTooltip = (zoneKey: keyof typeof zData, label: string) => {
        const d = (zData as any)[zoneKey];
        if (isScoutingMode) {
            return `${label}: Projected Volume ${(d.density * 100).toFixed(1)}%`;
        }
        return `${label}: ${d.m}/${d.a} (${d.pct.toFixed(1)}%)`;
    };

    const ZonePath = ({ d, zoneKey }: { d: string, zoneKey: keyof typeof zData }) => {
        return (
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
    };

    return (
        <div className="flex flex-col items-center">
            <div className="relative w-full max-w-[400px] aspect-[500/470] bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                <svg viewBox="0 0 500 470" className="w-full h-full">
                    {/* Zones */}
                    <ZonePath zoneKey="c3L" d={SHOT_ZONES_PATHS.c3L} />
                    <ZonePath zoneKey="c3R" d={SHOT_ZONES_PATHS.c3R} />
                    <ZonePath zoneKey="atb3L" d={SHOT_ZONES_PATHS.atb3L} />
                    <ZonePath zoneKey="atb3C" d={SHOT_ZONES_PATHS.atb3C} />
                    <ZonePath zoneKey="atb3R" d={SHOT_ZONES_PATHS.atb3R} />
                    <ZonePath zoneKey="midL" d={SHOT_ZONES_PATHS.midL} />
                    <ZonePath zoneKey="midC" d={SHOT_ZONES_PATHS.midC} />
                    <ZonePath zoneKey="midR" d={SHOT_ZONES_PATHS.midR} />
                    <ZonePath zoneKey="paint" d={SHOT_ZONES_PATHS.paint} />
                    <ZonePath zoneKey="rim" d={SHOT_ZONES_PATHS.rim} />

                    {/* Hoop Marker */}
                    <circle cx="250" cy="425" r="5" fill="none" stroke="orange" strokeWidth="2" />
                    <line x1="220" y1="432" x2="280" y2="432" stroke="white" strokeWidth="2" />
                </svg>
                
                {/* Labels */}
                <div className="absolute top-2 left-2 text-[10px] text-white/50 font-bold bg-black/40 px-2 rounded pointer-events-none">
                    {isScoutingMode ? 'VOLUME PROJECTION' : 'EFFICIENCY CHART'}
                </div>
            </div>
            
            {/* Legend */}
            <div className="mt-4 flex gap-4 text-[10px] font-bold text-slate-400">
                {isScoutingMode ? (
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-500 rounded-sm opacity-20"></div>
                        <span>Low Vol</span>
                        <div className="w-3 h-3 bg-red-500 rounded-sm opacity-100"></div>
                        <span>High Vol</span>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 rounded-sm"></div><span>Hot (+10%)</span></div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-amber-500 rounded-sm"></div><span>Avg</span></div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-500 rounded-sm"></div><span>Cold (-10%)</span></div>
                    </>
                )}
            </div>
        </div>
    );
};
