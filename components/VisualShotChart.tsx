
import React, { useMemo } from 'react';
import { Player } from '../types';
import { getProjectedZoneDensity } from '../services/game/engine/shotDistribution';

// 435 x 403 Canvas Coordinate System (Derived from provided SVG)
const ZONE_PATHS = {
    ATB3_C: "M.8,64.3V.6h433v63.7l-114.1,114.1-.3-.2c-30.9-17.8-66.2-27.2-102-27.2s-71.2,9.4-102,27.2l-.3.2L.8,64.3Z",
    MID_C: "M81.9,202.6l.4-.4c37.2-32.8,85.1-50.8,135-50.8s97.8,18,135,50.8l.4.4-66.8,66.8v-32h-137.2v32l-66.8-66.8Z",
    ATB3_R: "M407.1,278.7l-.2-.3c-15.3-37.3-40.9-68.9-74.1-91.7-4.3-3-8.8-5.8-13.4-8.4l-.6-.3,115-115v215.8h-26.7Z",
    MID_R: "M285.9,401.6v-133.6l66.1-66.1.4.3c23.4,20.6,42.1,47,54.1,76.1h0v123.2h-120.5Z",
    ATB3_L: "M.8,278.7V62.9l115,115-.6.3c-4.6,2.6-9.1,5.5-13.4,8.4-33.3,22.8-58.9,54.4-74.1,91.6v.2c-.1,0-.3.2-.3.2H.8Z",
    MID_L: "M28.2,401.6v-123.1h0c11.9-29.2,30.6-55.6,54.1-76.2l.4-.3,66.1,66.1v133.6H28.2Z",
    C3_R: "M406.9,277.7h26.9v123.9h-26.9Z",
    PAINT: "M149.1,237.9h136.4v163.7h-136.4Z",
    RIM: "M149.1,318.5h136.4v83.1h-136.4Z",
    C3_L: "M.8,277.7h26.9v123.9h-26.9Z",
};

const COURT_LINES = [
  // Removed Outer Border M1.3,1.5h432v399.6...
  "M149.6,238.4h135.4v162.7h-135.4v-162.7M148.2,236.9v165.6h138.2v-165.6h-138.2Z", // Key
  "M269.2,237.7h-1.4c0-27.8-22.6-50.4-50.4-50.4s-50.4,22.6-50.4,50.4h-1.4c0-28.6,23.3-51.8,51.8-51.8s51.8,23.3,51.8,51.8Z", // Free Throw Circle
  // Dashed lines / markings
  "M269.1,237.7c0,2.6-.2,5.3-.6,7.9l-1.4-.2c.6-3.6.7-7.3.5-11h1.4c0,1,.1,2.2.1,3.3ZM267.1,223.2l-1.4.4c-1-3.5-2.4-6.9-4.2-10.1l1.3-.7c1.8,3.3,3.3,6.8,4.3,10.4ZM265.6,256.5c-1.4,3.5-3.1,6.9-5.2,10l-1.2-.8c2-3,3.7-6.3,5.1-9.7l1.3.5ZM256.3,203.5l-1.1.9c-2.4-2.7-5.1-5.2-8.1-7.4l.9-1.2c3,2.2,5.8,4.8,8.3,7.6ZM253.1,275.1c-2.7,2.6-5.7,4.9-9,6.9l-.7-1.2c3.1-1.9,6.1-4.1,8.7-6.7l1,1ZM238.2,190.2l-.6,1.3c-3.4-1.5-6.9-2.6-10.5-3.3l.3-1.4c3.7.7,7.3,1.9,10.8,3.4ZM233.9,286.8c-1.4.5-2.8.9-4.3,1.2-2.2.5-4.5,1-6.8,1.2l-.2-1.4c2.2-.2,4.4-.6,6.6-1.2,1.4-.3,2.8-.7,4.1-1.2l.5,1.4ZM216.2,187.3c-3.6,0-7.3.6-10.9,1.5-2.8.7-5.5,1.6-8.2,2.7l-.6-1.3c2.7-1.2,5.5-2.1,8.4-2.8,3.7-.9,7.4-1.4,11.2-1.5v1.4ZM211.8,287.8l-.2,1.4c-3.7-.4-7.5-1.2-11-2.5l.5-1.4c3.5,1.2,7.1,2,10.7,2.4ZM191.1,280.7l-.7,1.2c-3.2-2-6.2-4.3-9-6.9l1-1c2.6,2.5,5.6,4.8,8.7,6.7ZM187.6,196.9c-3,2.2-5.7,4.6-8.1,7.4l-1.1-1c2.5-2.8,5.3-5.4,8.3-7.6l.8,1.2ZM175.4,265.6l-1.2.8c-2.1-3.1-3.8-6.5-5.2-10l1.3-.5c1.3,3.4,3,6.7,5,9.8ZM173.2,213.3c-1.8,3.2-3.2,6.6-4.2,10.1l-1.4-.4c1.1-3.6,2.5-7.1,4.4-10.4l1.3.7ZM167.5,245.2l-1.4.2c-.6-3.7-.7-7.5-.5-11.3h1.4c-.2,3.7,0,7.4.5,11.1Z",
  "M252.9,355.9v10.7h-1.4v-10.7c0-18.9-15.3-34.2-34.2-34.2s-34.2,15.3-34.2,34.2v10.7h-1.4v-10.7c0-19.6,16-35.6,35.6-35.6s35.6,16,35.6,35.6Z", // Restricted Area Arc
  "M407.4,278.3v122.8h-1.4v-122.5c-31.5-76.9-105.5-126.6-188.6-126.6S60.2,201.7,28.7,278.6v122.5h-1.4v-122.9h0c15.2-37.4,40.9-69.1,74.3-91.9,34.2-23.4,74.2-35.7,115.7-35.7s81.6,12.4,115.7,35.7c33.4,22.8,59,54.6,74.3,91.9h0Z" // 3PT Arc
];

const StatItem: React.FC<{ label: string, value: string | number }> = ({ label, value }) => (
    <div className="flex flex-col items-center justify-center p-2">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">{label}</span>
        <span className="text-sm font-bold text-white tabular-nums">{value}</span>
    </div>
);

// [Optimization] Wrap in React.memo to prevent re-renders when parent modal updates but player stats haven't changed
export const VisualShotChart: React.FC<{ player: Player }> = React.memo(({ player }) => {
    const s = player.stats;
    if (!s) return null;

    // Use total FGA to determine mode: Scouting (Low sample) vs Data (High sample)
    const totalFGA = s.fga;
    const isScoutingMode = totalFGA < 20; // Show projections if less than 20 shots

    const getZ = (m: number | undefined, a: number | undefined) => ({ m: m || 0, a: a || 0 });

    const zData = useMemo(() => ({
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
    }), [s]);

    const AVG = { rim: 0.62, paint: 0.42, mid: 0.40, c3: 0.38, atb3: 0.35 };

    // Get projected densities for Scouting Mode
    const projected = useMemo(() => isScoutingMode ? getProjectedZoneDensity(player) : null, [player, isScoutingMode]);

    // Helper to determine style
    // Opacity decreased to ~30%
    const getZoneStyle = (key: string, makes: number, attempts: number, avg: number) => {
        if (isScoutingMode && projected) {
            // Scouting Mode: Show predicted hot zones in grayscale/slate
            const density = projected[key as keyof typeof projected];
            return { fill: '#94a3b8', opacity: 0.1 + (density * 0.4), isHot: false, isCold: false }; 
        }

        // Data Mode: Show actual efficiency
        // No stroke, just fill with opacity
        if (attempts === 0) return { fill: '#1e293b', opacity: 0.2, isHot: false, isCold: false }; // Slate-800
        
        const pct = makes / attempts;
        if (pct >= avg + 0.05) return { fill: '#10b981', opacity: 0.35, isHot: true, isCold: false }; // Hot (Green/Emerald)
        if (pct <= avg - 0.05) return { fill: '#ef4444', opacity: 0.35, isHot: false, isCold: true }; // Cold (Red)
        return { fill: '#f97316', opacity: 0.35, isHot: false, isCold: false }; // Avg (Orange)
    };

    // Updated Zone Config with Tuned Centroids for Text Labels
    const zones = useMemo(() => [
        { path: ZONE_PATHS.PAINT, data: zData.paint, avg: AVG.paint, label: "Paint", key: 'paint', cx: 217, cy: 290 }, 
        { path: ZONE_PATHS.RIM, data: zData.rim, avg: AVG.rim, label: "Restricted Area", key: 'rim', cx: 217, cy: 375 },
        { path: ZONE_PATHS.MID_L, data: zData.midL, avg: AVG.mid, label: "Mid Left", key: 'midL', cx: 80, cy: 300 }, 
        { path: ZONE_PATHS.MID_C, data: zData.midC, avg: AVG.mid, label: "Mid Center", key: 'midC', cx: 217, cy: 200 },
        { path: ZONE_PATHS.MID_R, data: zData.midR, avg: AVG.mid, label: "Mid Right", key: 'midR', cx: 355, cy: 300 }, 
        { path: ZONE_PATHS.C3_L, data: zData.c3L, avg: AVG.c3, label: "Corner 3 L", key: 'c3L', cx: 15, cy: 350 },
        { path: ZONE_PATHS.ATB3_L, data: zData.atb3L, avg: AVG.atb3, label: "Wing 3 L", key: 'atb3L', cx: 40, cy: 140 }, 
        { path: ZONE_PATHS.ATB3_C, data: zData.atb3C, avg: AVG.atb3, label: "Top 3", key: 'atb3C', cx: 217, cy: 80 },
        { path: ZONE_PATHS.ATB3_R, data: zData.atb3R, avg: AVG.atb3, label: "Wing 3 R", key: 'atb3R', cx: 395, cy: 140 }, 
        { path: ZONE_PATHS.C3_R, data: zData.c3R, avg: AVG.c3, label: "Corner 3 R", key: 'c3R', cx: 420, cy: 350 },
    ], [zData, AVG]);

    // Stats Grid Calculation
    const fgPct = s.fga > 0 ? (s.fgm / s.fga * 100).toFixed(1) + '%' : '0%';
    const p3Pct = s.p3a > 0 ? (s.p3m / s.p3a * 100).toFixed(1) + '%' : '0%';
    const ftPct = s.fta > 0 ? (s.ftm / s.fta * 100).toFixed(1) + '%' : '0%';
    // True Shooting %: PTS / (2 * (FGA + 0.44 * FTA))
    const tsPct = (s.fga + 0.44 * s.fta) > 0 
        ? (s.pts / (2 * (s.fga + 0.44 * s.fta)) * 100).toFixed(1) + '%' 
        : '0%';

    const row1 = [
        { l: 'GP', v: s.g }, 
        { l: 'MIN', v: (s.g > 0 ? (s.mp / s.g).toFixed(1) : 0) },
        { l: 'PTS', v: (s.g > 0 ? (s.pts / s.g).toFixed(1) : 0) }, 
        { l: 'OREB', v: (s.g > 0 ? (s.offReb / s.g).toFixed(1) : 0) },
        { l: 'DREB', v: (s.g > 0 ? (s.defReb / s.g).toFixed(1) : 0) },
        { l: 'AST', v: (s.g > 0 ? (s.ast / s.g).toFixed(1) : 0) }, 
        { l: 'STL', v: (s.g > 0 ? (s.stl / s.g).toFixed(1) : 0) },
        { l: 'BLK', v: (s.g > 0 ? (s.blk / s.g).toFixed(1) : 0) }
    ];

    const row2 = [
        { l: 'TOV', v: (s.g > 0 ? (s.tov / s.g).toFixed(1) : 0) },
        { l: 'PF', v: (s.g > 0 ? ((s.pf || 0) / s.g).toFixed(1) : 0) },
        { l: 'FGM', v: (s.g > 0 ? (s.fgm / s.g).toFixed(1) : 0) },
        { l: 'FGA', v: (s.g > 0 ? (s.fga / s.g).toFixed(1) : 0) },
        { l: 'FG%', v: fgPct },
        { l: '3PM', v: (s.g > 0 ? (s.p3m / s.g).toFixed(1) : 0) },
        { l: '3PA', v: (s.g > 0 ? (s.p3a / s.g).toFixed(1) : 0) },
        { l: '3P%', v: p3Pct },
    ];

    const row3 = [
        { l: 'FTM', v: (s.g > 0 ? (s.ftm / s.g).toFixed(1) : 0) },
        { l: 'FTA', v: (s.g > 0 ? (s.fta / s.g).toFixed(1) : 0) },
        { l: 'FT%', v: ftPct },
        { l: 'TS%', v: tsPct },
    ];

    return (
        <div className="flex flex-col lg:flex-row items-start gap-8 w-full animate-in fade-in slide-in-from-bottom-2 duration-500 h-full">
            
            {/* Left Column: Stats & Zone List */}
            <div className="w-full lg:w-[55%] flex flex-col gap-6 h-full">
                {/* 1. Season Stats (3 Rows) */}
                <div className="flex flex-col gap-2">
                    <h5 className="text-base font-black text-white uppercase tracking-tight pl-1">시즌 스탯</h5>
                    <div className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-3 shadow-sm flex flex-col gap-3">
                        <div className="grid grid-cols-8 gap-y-2">
                             {row1.map((item, idx) => <StatItem key={idx} label={item.l} value={item.v} />)}
                        </div>
                        <div className="w-full h-px bg-slate-800/50"></div>
                        <div className="grid grid-cols-8 gap-y-2">
                             {row2.map((item, idx) => <StatItem key={idx} label={item.l} value={item.v} />)}
                        </div>
                        <div className="w-full h-px bg-slate-800/50"></div>
                        <div className="grid grid-cols-8 gap-y-2">
                             {row3.map((item, idx) => <StatItem key={idx} label={item.l} value={item.v} />)}
                        </div>
                    </div>
                </div>
                
                {/* 2. Zone Efficiency List */}
                <div className="flex flex-col gap-2 mt-2">
                     <h5 className="text-base font-black text-white uppercase tracking-tight pl-1 flex justify-between">
                         <span>구역별 야투 효율</span>
                         {isScoutingMode && <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">SCOUTING REPORT MODE</span>}
                     </h5>
                     <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        {zones.map((z, i) => {
                             const style = getZoneStyle(z.key, z.data.m, z.data.a, z.avg);
                             const pct = z.data.a > 0 ? (z.data.m / z.data.a * 100).toFixed(0) : '0';
                             
                             let colorClass = 'text-slate-500';
                             if (!isScoutingMode) {
                                 if (style.isHot) colorClass = 'text-emerald-400';
                                 else if (style.isCold) colorClass = 'text-red-400';
                                 else if (z.data.a > 0) colorClass = 'text-orange-400';
                             }

                             return (
                                 <div key={i} className="flex flex-col justify-center items-center bg-slate-900/40 p-2 rounded border border-slate-800/50 text-center h-16 min-w-0">
                                     {/* Removed truncate to ensure visibility, ensure parent has enough height */}
                                     <span className="text-[10px] font-bold text-slate-400 w-full px-1 mb-1 leading-tight" title={z.label}>{z.label}</span>
                                     <span className={`text-base font-black ${colorClass}`}>{pct}%</span>
                                     <span className="text-[11px] font-mono text-slate-500">{z.data.m}/{z.data.a}</span>
                                 </div>
                             )
                        })}
                     </div>
                </div>
            </div>

            {/* Right Column: Shot Chart */}
            <div className="w-full lg:w-[45%] flex flex-col items-center justify-start pt-2">
                <div className="flex flex-col gap-2 w-full max-w-[400px]">
                    <h5 className="text-base font-black text-white uppercase tracking-tight pl-1 flex justify-between items-center">
                        <span>SHOT CHART</span>
                        {!isScoutingMode ? (
                            <div className="flex gap-3 text-[10px]">
                                <span className="text-emerald-400 flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-emerald-500 rounded-sm"></div> HOT</span>
                                <span className="text-orange-400 flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-orange-500 rounded-sm"></div> AVG</span>
                                <span className="text-red-400 flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-red-500 rounded-sm"></div> COLD</span>
                            </div>
                        ) : (
                            <span className="text-[10px] text-slate-400 flex items-center gap-1">PROJECTED ZONES</span>
                        )}
                    </h5>
                    
                    <div className="relative w-full aspect-[435/403] bg-slate-950 rounded-xl overflow-hidden shadow-2xl border border-slate-800">
                        <svg viewBox="0 0 435 403" className="w-full h-full">
                            {/* Layer 0: Background */}
                            <rect x="0" y="0" width="435" height="403" fill="#0f172a" />
                            
                            {/* Layer 1: Shot Zones (Heatmap) */}
                            <g className="zones">
                                {zones.map((z, i) => {
                                    const style = getZoneStyle(z.key, z.data.m, z.data.a, z.avg);
                                    return (
                                        <path 
                                            key={i} 
                                            d={z.path} 
                                            fill={style.fill} 
                                            fillOpacity={style.opacity}
                                            stroke="none" // Removed Stroke
                                            className="transition-all duration-300 cursor-help"
                                        >
                                            <title>{z.label}: {z.data.m}/{z.data.a} ({z.data.a > 0 ? (z.data.m/z.data.a*100).toFixed(1):0}%)</title>
                                        </path>
                                    );
                                })}
                            </g>

                            {/* Layer 2: Court Lines Overlay (Static Dark Slate Lines for Dark Theme) */}
                            <g className="court-lines" fill="none" stroke="#475569" strokeWidth="1.5" strokeOpacity="0.8" pointerEvents="none">
                                {COURT_LINES.map((d, i) => (
                                    <path key={i} d={d} />
                                ))}
                            </g>

                             {/* Layer 3: Data Labels Overlay (Only in Data Mode) */}
                             {!isScoutingMode && (
                                 <g className="data-labels" pointerEvents="none">
                                     {zones.map((z, i) => {
                                        const pct = z.data.a > 0 ? (z.data.m / z.data.a * 100).toFixed(0) : '0';
                                        const label = `${z.data.m}/${z.data.a}`;
                                        
                                        // Skip drawing text for rim/paint if it gets too crowded, or adjust font size
                                        const isSmallZone = ['c3L', 'c3R'].includes(z.key); 
                                        const fontSizePct = isSmallZone ? "10px" : "12px";
                                        const fontSizeLabel = "8px";

                                        return (
                                            <g key={i} transform={`translate(${z.cx}, ${z.cy})`}>
                                                <text 
                                                    textAnchor="middle" 
                                                    y="-2" 
                                                    fill="white" 
                                                    fontSize={fontSizePct} 
                                                    fontWeight="900" 
                                                    style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.8)' }}
                                                >
                                                    {pct}%
                                                </text>
                                                <text 
                                                    textAnchor="middle" 
                                                    y="10" 
                                                    fill="#cbd5e1" 
                                                    fontSize={fontSizeLabel} 
                                                    fontWeight="700"
                                                    style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.8)' }}
                                                >
                                                    {label}
                                                </text>
                                            </g>
                                        );
                                     })}
                                 </g>
                             )}
                        </svg>
                    </div>
                </div>
            </div>
        </div>
    );
});
