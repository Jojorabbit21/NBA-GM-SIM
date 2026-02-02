
import React from 'react';
import { Player } from '../types';

// Simplified Paths for Robust Rendering (Approximation of 11 Zones)
// 500 x 470 Canvas
const ZONE_PATHS = {
    // 1. Rim
    RIM: "M 250 47.5 m -40 0 a 40 40 0 1 0 80 0 a 40 40 0 1 0 -80 0", 
    // 2. Paint Left
    PAINT_L: "M 170 0 L 250 0 L 250 190 L 170 190 Z",
    // 3. Paint Right
    PAINT_R: "M 250 0 L 330 0 L 330 190 L 250 190 Z",
    // 4. Mid Left
    MID_L: "M 30 0 L 170 0 L 170 140 L 30 140 Z",
    // 5. Mid Center (Top Key)
    MID_C: "M 170 140 L 330 140 L 330 190 L 170 190 Z",
    // 6. Mid Right
    MID_R: "M 330 0 L 470 0 L 470 140 L 330 140 Z",
    // 7. Corner 3 Left
    C3_L: "M 0 0 L 30 0 L 30 140 L 0 140 Z",
    // 8. Corner 3 Right
    C3_R: "M 470 0 L 500 0 L 500 140 L 470 140 Z",
    // 9. ATB 3 Left
    ATB3_L: "M 0 140 L 170 140 L 170 470 L 0 470 Z",
    // 10. ATB 3 Center
    ATB3_C: "M 170 190 L 330 190 L 330 470 L 170 470 Z",
    // 11. ATB 3 Right
    ATB3_R: "M 330 140 L 500 140 L 500 470 L 330 470 Z"
};

const getZoneColor = (makes: number, attempts: number, leagueAvg: number) => {
    if (attempts === 0) return { fill: 'rgba(30, 41, 59, 0.3)', stroke: '#334155', opacity: 0.3 };
    
    const pct = makes / attempts;
    if (pct >= leagueAvg + 0.05) return { fill: 'rgba(239, 68, 68, 0.6)', stroke: '#f87171', opacity: 0.8 }; // Hot (Red)
    if (pct <= leagueAvg - 0.05) return { fill: 'rgba(59, 130, 246, 0.6)', stroke: '#60a5fa', opacity: 0.8 }; // Cold (Blue)
    return { fill: 'rgba(234, 179, 8, 0.5)', stroke: '#facc15', opacity: 0.8 }; // Avg (Yellow)
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

    const zData = {
        rim: getZ(s.zone_rim_m, s.zone_rim_a),
        paintL: getZ(s.zone_paint_l_m, s.zone_paint_l_a),
        paintR: getZ(s.zone_paint_r_m, s.zone_paint_r_a),
        midL: getZ(s.zone_mid_l_m, s.zone_mid_l_a),
        midC: getZ(s.zone_mid_c_m, s.zone_mid_c_a),
        midR: getZ(s.zone_mid_r_m, s.zone_mid_r_a),
        c3L: getZ(s.zone_c3_l_m, s.zone_c3_l_a),
        c3R: getZ(s.zone_c3_r_m, s.zone_c3_r_a),
        atb3L: getZ(s.zone_atb3_l_m, s.zone_atb3_l_a),
        atb3C: getZ(s.zone_atb3_c_m, s.zone_atb3_c_a),
        atb3R: getZ(s.zone_atb3_r_m, s.zone_atb3_r_a),
    };

    // League Averages (Approx)
    const AVG = { rim: 0.62, paint: 0.42, mid: 0.40, c3: 0.38, atb3: 0.35 };

    const zones = [
        { path: ZONE_PATHS.RIM, data: zData.rim, avg: AVG.rim, label: "RIM" },
        { path: ZONE_PATHS.PAINT_L, data: zData.paintL, avg: AVG.paint, label: "PAINT L" },
        { path: ZONE_PATHS.PAINT_R, data: zData.paintR, avg: AVG.paint, label: "PAINT R" },
        { path: ZONE_PATHS.MID_L, data: zData.midL, avg: AVG.mid, label: "MID L" },
        { path: ZONE_PATHS.MID_C, data: zData.midC, avg: AVG.mid, label: "MID C" },
        { path: ZONE_PATHS.MID_R, data: zData.midR, avg: AVG.mid, label: "MID R" },
        { path: ZONE_PATHS.C3_L, data: zData.c3L, avg: AVG.c3, label: "C3 L" },
        { path: ZONE_PATHS.C3_R, data: zData.c3R, avg: AVG.c3, label: "C3 R" },
        { path: ZONE_PATHS.ATB3_L, data: zData.atb3L, avg: AVG.atb3, label: "3PT L" },
        { path: ZONE_PATHS.ATB3_C, data: zData.atb3C, avg: AVG.atb3, label: "3PT TOP" },
        { path: ZONE_PATHS.ATB3_R, data: zData.atb3R, avg: AVG.atb3, label: "3PT R" },
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
                     <h5 className="text-base font-black text-white uppercase tracking-tight pl-1">11-Zone Efficiency</h5>
                     <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {zones.map((z, i) => {
                             const pct = z.data.a > 0 ? (z.data.m / z.data.a * 100).toFixed(1) : '-';
                             return (
                                 <div key={i} className="flex justify-between items-center bg-slate-900/40 p-2 rounded border border-slate-800/50">
                                     <span className="text-[10px] font-bold text-slate-500">{z.label}</span>
                                     <div className="flex gap-2">
                                         <span className="text-xs font-mono text-slate-300">{z.data.m}/{z.data.a}</span>
                                         <span className={`text-xs font-black w-10 text-right ${pct !== '-' && Number(pct) > z.avg*100 ? 'text-red-400' : 'text-slate-500'}`}>{pct}%</span>
                                     </div>
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
                            <span className="text-red-400 flex items-center gap-1"><div className="w-2 h-2 bg-red-500/50 rounded-sm"></div> HOT</span>
                            <span className="text-yellow-400 flex items-center gap-1"><div className="w-2 h-2 bg-yellow-500/50 rounded-sm"></div> AVG</span>
                            <span className="text-blue-400 flex items-center gap-1"><div className="w-2 h-2 bg-blue-500/50 rounded-sm"></div> COLD</span>
                        </div>
                    </h5>
                    <div className="relative w-full aspect-[500/470] bg-slate-950 rounded-xl overflow-hidden shadow-2xl border border-slate-800">
                        <svg viewBox="0 0 500 470" className="w-full h-full transform rotate-180 scale-x-[-1]"> {/* Rotate to match Basketball court orientation (Hoop at top or bottom depending on preference, usually hoop at bottom for charts) -> actually standard charts have hoop at top (0,0) or bottom. My coords assume 0,0 top-left. Let's flip it so 0,0 is baseline. */}
                            {/* Background Court Lines */}
                            <rect x="0" y="0" width="500" height="470" fill="#0f172a" />
                            
                            {/* Zones */}
                            {zones.map((z, i) => {
                                const style = getZoneColor(z.data.m, z.data.a, z.avg);
                                return (
                                    <path 
                                        key={i} 
                                        d={z.path} 
                                        fill={style.fill} 
                                        stroke={style.stroke} 
                                        strokeWidth="1"
                                        strokeOpacity="0.5"
                                        className="transition-all duration-300 hover:opacity-100"
                                    >
                                        <title>{z.label}: {z.data.m}/{z.data.a} ({z.data.a > 0 ? (z.data.m/z.data.a*100).toFixed(1):0}%)</title>
                                    </path>
                                );
                            })}
                            
                            {/* Court Markings Overlay (Hoop, 3pt line visual guide) */}
                            <g fill="none" stroke="#e2e8f0" strokeWidth="2" strokeOpacity="0.1" pointerEvents="none">
                                {/* Hoop */}
                                <circle cx="250" cy="52.5" r="7.5" stroke="orange" strokeOpacity="0.5" /> 
                                {/* Backboard */}
                                <line x1="220" y1="40" x2="280" y2="40" stroke="white" strokeOpacity="0.3" />
                                {/* Key */}
                                <rect x="170" y="0" width="160" height="190" />
                                <circle cx="250" cy="190" r="60" />
                                {/* 3PT Line (Approx) */}
                                <path d="M 30 0 L 30 140 A 237.5 237.5 0 0 0 470 140 L 470 0" />
                            </g>
                        </svg>
                        
                        {/* Overlay Text (optional, maybe too cluttered) */}
                        <div className="absolute top-2 left-2 text-[9px] text-slate-600 font-mono pointer-events-none">
                            11-Zone System
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
