
import React from 'react';
import { Player } from '../types';

// 500 x 470 Canvas Coordinate System
// Layer 1: Shot Zones (Heatmap Areas)
const ZONE_PATHS = {
    // 1. Restricted Area
    RIM: "M 210 0 L 210 47.5 A 40 40 0 1 0 290 47.5 L 290 0 Z",
    
    // 2. Paint (Non-RA)
    PAINT: "M 170 0 L 170 190 L 330 190 L 330 0 L 290 0 L 290 47.5 A 40 40 0 1 1 210 47.5 L 210 0 Z",
    
    // 3. Mid-Range Left
    MID_L: "M 30 0 L 170 0 L 170 190 L 138 190 L 30 140 Z",
    
    // 4. Mid-Range Center
    MID_C: "M 138 190 L 170 190 L 330 190 L 362 190 L 320 280 A 100 100 0 0 1 180 280 Z",
    
    // 5. Mid-Range Right
    MID_R: "M 330 0 L 470 0 L 470 140 L 362 190 L 330 190 Z",
    
    // 6. 3PT Left Corner
    C3_L: "M 0 0 L 30 0 L 30 140 L 0 140 Z",
    
    // 7. 3PT Left Wing
    ATB3_L: "M 0 140 L 30 140 L 138 190 L 180 280 L 100 470 L 0 470 Z",
    
    // 8. 3PT Center
    ATB3_C: "M 180 280 A 100 100 0 0 0 320 280 L 400 470 L 100 470 Z",
    
    // 9. 3PT Right Wing
    ATB3_R: "M 470 140 L 500 140 L 500 470 L 400 470 L 320 280 L 362 190 Z",

    // 10. 3PT Right Corner
    C3_R: "M 470 0 L 500 0 L 500 140 L 470 140 Z",
};

// Layer 2: Court Lines (Static Overlay)
const COURT_LINES = {
    // Outer Boundary (Optional, mainly for stroke)
    BOUNDARY: "M 0 0 L 500 0 L 500 470 L 0 470 Z",
    // 3-Point Line (Corner + Arc)
    THREE_POINT: "M 30 0 L 30 140 A 237.5 237.5 0 0 0 470 140 L 470 0",
    // Paint Area (Key)
    KEY: "M 170 0 L 170 190 L 330 190 L 330 0",
    // Free Throw Circle (Top Semi-Circle)
    FT_CIRCLE_TOP: "M 330 190 A 80 80 0 0 0 170 190",
    // Free Throw Circle (Bottom Semi-Circle - Dashed usually, but solid for simplicity here)
    FT_CIRCLE_BOTTOM: "M 170 190 A 80 80 0 0 0 330 190",
    // Restricted Area Arc
    RESTRICTED: "M 210 0 L 210 47.5 A 40 40 0 1 0 290 47.5 L 290 0",
    // Backboard (Approx)
    BACKBOARD: "M 220 40 L 280 40",
    // Hoop
    HOOP: "M 250 47.5 A 7.5 7.5 0 1 0 250 47.6", // Small circle
};

const getZoneColor = (makes: number, attempts: number, leagueAvg: number) => {
    if (attempts === 0) return { fill: 'rgba(15, 23, 42, 0.4)', stroke: 'none', opacity: 1 }; // Slate-900 (Background-ish)
    
    const pct = makes / attempts;
    // Using slightly more opaque colors for better visibility under the white lines
    if (pct >= leagueAvg + 0.05) return { fill: '#ef4444', stroke: 'none', opacity: 0.8 }; // Hot (Red-500)
    if (pct <= leagueAvg - 0.05) return { fill: '#3b82f6', stroke: 'none', opacity: 0.8 }; // Cold (Blue-500)
    return { fill: '#eab308', stroke: 'none', opacity: 0.8 }; // Avg (Yellow-500)
};

const StatItem: React.FC<{ label: string, value: string | number }> = ({ label, value }) => (
    <div className="flex flex-col items-center justify-center">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">{label}</span>
        <span className="text-sm font-bold text-white tabular-nums">{value}</span>
    </div>
);

export const VisualShotChart: React.FC<{ player: Player }> = ({ player }) => {
    const s = player.stats;
    if (!s) return null;

    // Helper to safe get stats or 0 (Defensive against undefined)
    const getZ = (m: number | undefined, a: number | undefined) => ({ m: m || 0, a: a || 0 });

    const paintM = (s.zone_paint_l_m || 0) + (s.zone_paint_r_m || 0);
    const paintA = (s.zone_paint_l_a || 0) + (s.zone_paint_r_a || 0);

    const zData = {
        rim: getZ(s.zone_rim_m, s.zone_rim_a),
        paint: { m: paintM, a: paintA },
        midL: getZ(s.zone_mid_l_m, s.zone_mid_l_a),
        midC: getZ(s.zone_mid_c_m, s.zone_mid_c_a),
        midR: getZ(s.zone_mid_r_m, s.zone_mid_r_a),
        c3L: getZ(s.zone_c3_l_m, s.zone_c3_l_a),
        c3R: getZ(s.zone_c3_r_m, s.zone_c3_r_a),
        atb3L: getZ(s.zone_atb3_l_m, s.zone_atb3_l_a),
        atb3C: getZ(s.zone_atb3_c_m, s.zone_atb3_c_a),
        atb3R: getZ(s.zone_atb3_r_m, s.zone_atb3_r_a),
    };

    // League Averages
    const AVG = { rim: 0.62, paint: 0.42, mid: 0.40, c3: 0.38, atb3: 0.35 };

    const zones = [
        { path: ZONE_PATHS.RIM, data: zData.rim, avg: AVG.rim, label: "Restricted Area" },
        { path: ZONE_PATHS.PAINT, data: zData.paint, avg: AVG.paint, label: "Paint" },
        { path: ZONE_PATHS.MID_L, data: zData.midL, avg: AVG.mid, label: "Mid Left" },
        { path: ZONE_PATHS.MID_C, data: zData.midC, avg: AVG.mid, label: "Mid Center" },
        { path: ZONE_PATHS.MID_R, data: zData.midR, avg: AVG.mid, label: "Mid Right" },
        { path: ZONE_PATHS.C3_L, data: zData.c3L, avg: AVG.c3, label: "Corner 3 L" },
        { path: ZONE_PATHS.ATB3_L, data: zData.atb3L, avg: AVG.atb3, label: "Wing 3 L" },
        { path: ZONE_PATHS.ATB3_C, data: zData.atb3C, avg: AVG.atb3, label: "Top 3" },
        { path: ZONE_PATHS.ATB3_R, data: zData.atb3R, avg: AVG.atb3, label: "Wing 3 R" },
        { path: ZONE_PATHS.C3_R, data: zData.c3R, avg: AVG.c3, label: "Corner 3 R" },
    ];

    const row1 = [
        { l: 'GP', v: s.g }, { l: 'GS', v: s.gs }, { l: 'MIN', v: (s.g > 0 ? (s.mp / s.g).toFixed(1) : 0) },
        { l: 'PTS', v: (s.g > 0 ? (s.pts / s.g).toFixed(1) : 0) }, { l: 'REB', v: (s.g > 0 ? (s.reb / s.g).toFixed(1) : 0) },
        { l: 'AST', v: (s.g > 0 ? (s.ast / s.g).toFixed(1) : 0) }, { l: 'STL', v: (s.g > 0 ? (s.stl / s.g).toFixed(1) : 0) },
        { l: 'BLK', v: (s.g > 0 ? (s.blk / s.g).toFixed(1) : 0) }
    ];

    return (
        <div className="flex flex-col lg:flex-row items-center gap-8 w-full animate-in fade-in slide-in-from-bottom-2 duration-500 h-full">
            <div className="w-full lg:w-[60%] flex flex-col gap-4 h-full justify-center">
                <div className="flex flex-col gap-1">
                    <h5 className="text-base font-black text-white uppercase tracking-tight pl-1">Season Stats</h5>
                    <div className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-3 shadow-sm grid grid-cols-4 md:grid-cols-8 gap-2">
                        {row1.map((item, idx) => <StatItem key={idx} label={item.l} value={item.v} />)}
                    </div>
                </div>
                
                <div className="flex flex-col gap-1 mt-2">
                     <h5 className="text-base font-black text-white uppercase tracking-tight pl-1">10-Zone Efficiency</h5>
                     <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        {zones.map((z, i) => {
                             const pct = z.data.a > 0 ? (z.data.m / z.data.a * 100).toFixed(1) : '-';
                             const isHot = pct !== '-' && Number(pct) > z.avg*100 + 5;
                             const isCold = pct !== '-' && Number(pct) < z.avg*100 - 5;
                             
                             let colorClass = 'text-slate-300';
                             if (isHot) colorClass = 'text-red-400';
                             if (isCold) colorClass = 'text-blue-400';
                             if (pct !== '-' && !isHot && !isCold) colorClass = 'text-yellow-400';

                             return (
                                 <div key={i} className="flex flex-col justify-center items-center bg-slate-900/40 p-2 rounded border border-slate-800/50 text-center h-14">
                                     <span className="text-[9px] font-bold text-slate-500 truncate w-full">{z.label}</span>
                                     <span className={`text-sm font-black ${colorClass}`}>{pct}%</span>
                                     <span className="text-[9px] font-mono text-slate-600">{z.data.m}/{z.data.a}</span>
                                 </div>
                             )
                        })}
                     </div>
                </div>
            </div>

            <div className="w-full lg:w-[40%] flex flex-col items-center justify-center">
                <div className="flex flex-col gap-1 w-full max-w-[350px]">
                    <h5 className="text-base font-black text-white uppercase tracking-tight pl-1 flex justify-between">
                        <span>SHOT CHART</span>
                        <div className="flex gap-2 text-[9px]">
                            <span className="text-red-400 flex items-center gap-1"><div className="w-2 h-2 bg-red-500 rounded-sm"></div> HOT</span>
                            <span className="text-yellow-400 flex items-center gap-1"><div className="w-2 h-2 bg-yellow-500 rounded-sm"></div> AVG</span>
                            <span className="text-blue-400 flex items-center gap-1"><div className="w-2 h-2 bg-blue-500 rounded-sm"></div> COLD</span>
                        </div>
                    </h5>
                    <div className="relative w-full aspect-[500/470] bg-slate-950 rounded-xl overflow-hidden shadow-2xl border border-slate-800">
                        <svg viewBox="0 0 500 470" className="w-full h-full transform rotate-180 scale-x-[-1]">
                            {/* Layer 0: Background */}
                            <rect x="0" y="0" width="500" height="470" fill="#0f172a" />
                            
                            {/* Layer 1: Shot Zones (Heatmap) */}
                            <g className="zones">
                                {zones.map((z, i) => {
                                    const style = getZoneColor(z.data.m, z.data.a, z.avg);
                                    return (
                                        <path 
                                            key={i} 
                                            d={z.path} 
                                            fill={style.fill} 
                                            fillOpacity={style.opacity}
                                            stroke={style.stroke}
                                            className="transition-all duration-300 hover:fill-opacity-100 cursor-help"
                                        >
                                            <title>{z.label}: {z.data.m}/{z.data.a} ({z.data.a > 0 ? (z.data.m/z.data.a*100).toFixed(1):0}%)</title>
                                        </path>
                                    );
                                })}
                            </g>

                            {/* Layer 2: Court Lines Overlay (Static White Lines) */}
                            <g className="court-lines" fill="none" stroke="#e2e8f0" strokeWidth="2" strokeOpacity="0.8" pointerEvents="none">
                                <path d={COURT_LINES.THREE_POINT} />
                                <path d={COURT_LINES.KEY} />
                                <path d={COURT_LINES.FT_CIRCLE_TOP} />
                                <path d={COURT_LINES.RESTRICTED} />
                                <path d={COURT_LINES.BACKBOARD} strokeWidth="3" />
                                <path d={COURT_LINES.HOOP} strokeWidth="2" stroke="#f97316" />
                            </g>
                        </svg>
                    </div>
                </div>
            </div>
        </div>
    );
};
