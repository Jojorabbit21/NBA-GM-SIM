
import React, { useMemo } from 'react';
import { Player } from '../types';
import { ZONE_PATHS, COURT_LINES, ZONE_AVG, getZoneStyle, getZonePillColors } from '../utils/courtZones';

// Helper for Ordinal Suffix
const getOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const StatItem: React.FC<{ label: string, value: string | number, rank?: number }> = ({ label, value, rank }) => {
    // Rank Color Coding
    let rankColor = 'text-slate-500';
    if (rank !== undefined) {
        if (rank <= 5) rankColor = 'text-fuchsia-400';
        else if (rank <= 10) rankColor = 'text-emerald-400';
        else if (rank <= 30) rankColor = 'text-blue-400';
    }

    return (
        <div className="flex flex-col items-center justify-center p-2">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">{label}</span>
            <span className="text-sm font-bold text-white tabular-nums">{value}</span>
            {rank !== undefined && rank > 0 ? (
                <span className={`text-[9px] font-black ${rankColor} tabular-nums mt-0.5`}>
                    {getOrdinal(rank)}
                </span>
            ) : (
                <span className="text-[9px] font-bold text-slate-700 mt-0.5">-</span>
            )}
        </div>
    );
};

// [Optimization] Wrap in React.memo to prevent re-renders when parent modal updates but player stats haven't changed
export const VisualShotChart: React.FC<{ player: Player, allPlayers?: Player[] }> = React.memo(({ player, allPlayers }) => {
    const s = player.stats;
    if (!s) return null;

    // Use total FGA to determine mode: Scouting (Low sample) vs Data (High sample)
    const totalFGA = s.fga;
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

    // Calculate Rank Helper
    // [Fix] Removed isScoutingMode check so ranks always show if data exists
    const getRank = (key: keyof typeof s, isTotal: boolean = false) => {
        if (!allPlayers) return undefined;
        
        // Filter out players with minimal games to avoid skewing average stats
        // For totals (like FGM), no game filter needed, but for averages, filter < 1 game
        const pool = isTotal ? allPlayers : allPlayers.filter(p => p.stats.g >= 1);
        
        // Sort (Create copy with [...pool] to avoid mutating props)
        const sorted = [...pool].sort((a, b) => {
            const valA = isTotal ? (a.stats[key] as number) : ((a.stats[key] as number) / (a.stats.g || 1));
            const valB = isTotal ? (b.stats[key] as number) : ((b.stats[key] as number) / (b.stats.g || 1));
            return valB - valA; // Descending
        });

        const rank = sorted.findIndex(p => p.id === player.id) + 1;
        return rank > 0 ? rank : undefined;
    };
    
    // Helper for Percentage Rank (Requires minimum attempts)
    const getPctRank = (pctKey: string, attKey: keyof typeof s, minAttPerGame: number) => {
        if (!allPlayers) return undefined;
        
        const pool = allPlayers.filter(p => {
             if (p.stats.g < 1) return false;
             const att = p.stats[attKey] as number;
             return (att / p.stats.g) >= minAttPerGame;
        });

        // Calculate PCT for each and sort
        // .map creates a new array so .sort here is safe
        const sorted = pool.map(p => {
            let n=0, d=0;
            if (pctKey === 'fg') { n=p.stats.fgm; d=p.stats.fga; }
            if (pctKey === '3p') { n=p.stats.p3m; d=p.stats.p3a; }
            if (pctKey === 'ft') { n=p.stats.ftm; d=p.stats.fta; }
            if (pctKey === 'ts') { n=p.stats.pts; d=2*(p.stats.fga + 0.44*p.stats.fta); }
            return { id: p.id, pct: d > 0 ? n/d : 0 };
        }).sort((a, b) => b.pct - a.pct);

        const rank = sorted.findIndex(item => item.id === player.id) + 1;
        return rank > 0 ? rank : undefined;
    };

    // Updated Zone Config
    const AVG = ZONE_AVG;
    const zones = useMemo(() => [
        { path: ZONE_PATHS.PAINT, data: zData.paint, avg: AVG.paint, label: "페인트존", key: 'paint', cx: 217, cy: 290 },
        { path: ZONE_PATHS.RIM, data: zData.rim, avg: AVG.rim, label: "골밑", key: 'rim', cx: 217, cy: 375 },
        { path: ZONE_PATHS.MID_L, data: zData.midL, avg: AVG.mid, label: "좌측 미드레인지", key: 'midL', cx: 80, cy: 300 },
        { path: ZONE_PATHS.MID_C, data: zData.midC, avg: AVG.mid, label: "중앙 미드레인지", key: 'midC', cx: 217, cy: 200 },
        { path: ZONE_PATHS.MID_R, data: zData.midR, avg: AVG.mid, label: "우측 미드레인지", key: 'midR', cx: 355, cy: 300 },
        { path: ZONE_PATHS.C3_L, data: zData.c3L, avg: AVG.c3, label: "좌측 코너", key: 'c3L', cx: 35, cy: 350 },
        { path: ZONE_PATHS.ATB3_L, data: zData.atb3L, avg: AVG.atb3, label: "좌측 45도", key: 'atb3L', cx: 40, cy: 140 },
        { path: ZONE_PATHS.ATB3_C, data: zData.atb3C, avg: AVG.atb3, label: "탑 오브 더 키", key: 'atb3C', cx: 217, cy: 80 },
        { path: ZONE_PATHS.ATB3_R, data: zData.atb3R, avg: AVG.atb3, label: "우측 45도", key: 'atb3R', cx: 395, cy: 140 },
        { path: ZONE_PATHS.C3_R, data: zData.c3R, avg: AVG.c3, label: "우측 코너", key: 'c3R', cx: 400, cy: 350 },
    ], [zData, AVG]);

    // Stats Grid Calculation
    const fgPct = s.fga > 0 ? (s.fgm / s.fga * 100).toFixed(1) + '%' : '0%';
    const p3Pct = s.p3a > 0 ? (s.p3m / s.p3a * 100).toFixed(1) + '%' : '0%';
    const ftPct = s.fta > 0 ? (s.ftm / s.fta * 100).toFixed(1) + '%' : '0%';
    const tsPct = (s.fga + 0.44 * s.fta) > 0 
        ? (s.pts / (2 * (s.fga + 0.44 * s.fta)) * 100).toFixed(1) + '%' 
        : '0%';

    const row1 = [
        { l: 'GP', v: s.g, r: undefined }, 
        { l: 'MIN', v: (s.g > 0 ? (s.mp / s.g).toFixed(1) : 0), r: getRank('mp') },
        { l: 'PTS', v: (s.g > 0 ? (s.pts / s.g).toFixed(1) : 0), r: getRank('pts') }, 
        { l: 'OREB', v: (s.g > 0 ? (s.offReb / s.g).toFixed(1) : 0), r: getRank('offReb') },
        { l: 'DREB', v: (s.g > 0 ? (s.defReb / s.g).toFixed(1) : 0), r: getRank('defReb') },
        { l: 'AST', v: (s.g > 0 ? (s.ast / s.g).toFixed(1) : 0), r: getRank('ast') }, 
        { l: 'STL', v: (s.g > 0 ? (s.stl / s.g).toFixed(1) : 0), r: getRank('stl') },
        { l: 'BLK', v: (s.g > 0 ? (s.blk / s.g).toFixed(1) : 0), r: getRank('blk') }
    ];

    const row2 = [
        { l: 'TOV', v: (s.g > 0 ? (s.tov / s.g).toFixed(1) : 0), r: getRank('tov') },
        { l: 'PF', v: (s.g > 0 ? ((s.pf || 0) / s.g).toFixed(1) : 0), r: getRank('pf') },
        { l: 'FGM', v: (s.g > 0 ? (s.fgm / s.g).toFixed(1) : 0), r: getRank('fgm') },
        { l: 'FGA', v: (s.g > 0 ? (s.fga / s.g).toFixed(1) : 0), r: getRank('fga') },
        { l: 'FG%', v: fgPct, r: getPctRank('fg', 'fga', 3.0) },
        { l: '3PM', v: (s.g > 0 ? (s.p3m / s.g).toFixed(1) : 0), r: getRank('p3m') },
        { l: '3PA', v: (s.g > 0 ? (s.p3a / s.g).toFixed(1) : 0), r: getRank('p3a') },
        { l: '3P%', v: p3Pct, r: getPctRank('3p', 'p3a', 1.0) },
    ];

    const row3 = [
        { l: 'FTM', v: (s.g > 0 ? (s.ftm / s.g).toFixed(1) : 0), r: getRank('ftm') },
        { l: 'FTA', v: (s.g > 0 ? (s.fta / s.g).toFixed(1) : 0), r: getRank('fta') },
        { l: 'FT%', v: ftPct, r: getPctRank('ft', 'fta', 1.0) },
        { l: 'TS%', v: tsPct, r: getPctRank('ts', 'fga', 3.0) },
    ];

    return (
        <div className="flex flex-col lg:flex-row items-start gap-8 w-full animate-in fade-in slide-in-from-bottom-2 duration-500 h-full">
            
            {/* Left Column: Stats & Zone List */}
            <div className="w-full lg:w-[55%] flex flex-col gap-6 h-full">
                {/* 1. Season Stats (3 Rows) */}
                <div className="flex flex-col gap-2">
                    <h5 className="text-base font-black text-white uppercase tracking-tight pl-1 flex justify-between items-center">
                        <span>시즌 스탯</span>
                        {/* Always show legend if players are available, regardless of scouting mode (since we force ranks now) */}
                        {allPlayers && (
                            <span className="text-[10px] text-slate-500 font-bold bg-slate-900 px-2 py-1 rounded">
                                Rank: Per Game (League)
                            </span>
                        )}
                    </h5>
                    <div className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-3 shadow-sm flex flex-col gap-3">
                        <div className="grid grid-cols-8 gap-y-2">
                             {row1.map((item, idx) => <StatItem key={idx} label={item.l} value={item.v} rank={item.r} />)}
                        </div>
                        <div className="w-full h-px bg-slate-800/50"></div>
                        <div className="grid grid-cols-8 gap-y-2">
                             {row2.map((item, idx) => <StatItem key={idx} label={item.l} value={item.v} rank={item.r} />)}
                        </div>
                        <div className="w-full h-px bg-slate-800/50"></div>
                        <div className="grid grid-cols-8 gap-y-2">
                             {row3.map((item, idx) => <StatItem key={idx} label={item.l} value={item.v} rank={item.r} />)}
                        </div>
                    </div>
                </div>
                
                {/* 2. Zone Efficiency List */}
                <div className="flex flex-col gap-2 mt-2">
                     <h5 className="text-base font-black text-white uppercase tracking-tight pl-1 flex justify-between">
                         <span>구역별 야투 효율</span>
                     </h5>
                     <div className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-3 shadow-sm">
                         <div className="grid grid-cols-2 md:grid-cols-5 gap-y-2 gap-x-1">
                            {zones.map((z, i) => {
                                const style = getZoneStyle(z.data.m, z.data.a, z.avg);
                                const pct = z.data.a > 0 ? (z.data.m / z.data.a * 100).toFixed(0) : '0';

                                let colorClass = 'text-slate-400';
                                if (style.isHot) colorClass = 'text-emerald-400';
                                else if (style.isCold) colorClass = 'text-red-400';
                                else if (z.data.a > 0) colorClass = 'text-yellow-400';
                             

                                 return (
                                     <div key={i} className="flex flex-col items-center justify-center p-1.5 text-center min-w-0">
                                         <span className="text-[10px] font-bold text-white w-full px-1 mb-0.5 leading-tight truncate" title={z.label}>{z.label}</span>
                                         <span className={`text-sm font-black ${colorClass} tabular-nums`}>{pct}%</span>
                                         <span className="text-xs font-bold text-slate-400 tabular-nums">{z.data.m}/{z.data.a}</span>
                                     </div>
                                 )
                            })}
                         </div>
                     </div>
                </div>
            </div>

            {/* Right Column: Shot Chart */}
            <div className="w-full lg:w-[45%] flex flex-col items-center justify-start">
                <div className="flex flex-col gap-2 w-full max-w-[400px]">
                    <h5 className="text-base font-black text-white uppercase tracking-tight pl-1 flex justify-between items-center">
                        <span>샷 차트</span>
                        <div className="flex gap-3 text-[10px]">
                            <span className="text-emerald-400 flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-emerald-500 rounded-sm"></div> HOT</span>
                            <span className="text-yellow-400 flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-yellow-500 rounded-sm"></div> AVG</span>
                            <span className="text-red-400 flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-red-500 rounded-sm"></div> COLD</span>
                        </div>
                    </h5>
                    
                    <div className="relative w-full aspect-[435/403] bg-slate-950 rounded-xl overflow-hidden shadow-2xl border border-slate-800">
                        <svg viewBox="0 0 435 403" className="w-full h-full">
                            {/* Layer 0: Background (Slate-950) to contrast with Slate-900 lines */}
                            <rect x="0" y="0" width="435" height="403" fill="#020617" />
                            
                            {/* Layer 1: Shot Zones (Heatmap) */}
                            <g className="zones">
                                {zones.map((z, i) => {
                                    const style = getZoneStyle(z.data.m, z.data.a, z.avg);
                                    return (
                                        <path
                                            key={i}
                                            d={z.path}
                                            fill={style.fill}
                                            fillOpacity={style.opacity}
                                            stroke="none" // Removed Stroke
                                            className="transition-all duration-300" // Removed cursor-help
                                        >
                                        </path>
                                    );
                                })}
                            </g>

                            {/* Layer 2: Court Lines Overlay (Slate-900) */}
                            <g className="court-lines" fill="none" stroke="#0f172a" strokeWidth="2" strokeOpacity="1" pointerEvents="none">
                                {COURT_LINES.map((d, i) => (
                                    <path key={i} d={d} />
                                ))}
                            </g>

                             {/* Layer 3: Data Labels Overlay (Only in Data Mode) - Pill Design */}
                            <g className="data-labels" pointerEvents="none">
                                {zones.map((z, i) => {
                                const pct = z.data.a > 0 ? (z.data.m / z.data.a * 100).toFixed(0) : '0';

                                const style = getZoneStyle(z.data.m, z.data.a, z.avg);
                                const { pillFill, textFill, borderStroke } = getZonePillColors(style.isHot, style.isCold, z.data.a > 0);

                                // Dynamic Width Calculation based on text content (Fix for 100% bug)
                                const isWide = pct.length >= 4; // e.g. "100%"
                                const width = isWide ? 60 : 48; // Increased from 48/38
                                const height = 36; // Increased from 26

                                return (
                                    <g key={i} transform={`translate(${z.cx}, ${z.cy})`}>
                                        <rect 
                                            x={-width / 2} 
                                            y={-height / 2} 
                                            width={width} 
                                            height={height} 
                                            rx={6} 
                                            fill={pillFill} 
                                            stroke={borderStroke}
                                            strokeWidth={1}
                                            fillOpacity={0.95} // Increased opacity
                                        />
                                        <text 
                                            textAnchor="middle" 
                                            y={-4} 
                                            fill={textFill} 
                                            fontSize="13px" // Increased Font Size (Two steps up from 10/11px)
                                            fontWeight="800" 
                                            style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.5)' }}
                                        >
                                            {pct}%
                                        </text>
                                        <text 
                                            textAnchor="middle" 
                                            y={12} 
                                            fill={'#ffffff'} // Changed from slate-400 to white
                                            fontSize="10px" // Increased from 9px to 10px
                                            fontWeight="600" 
                                        >
                                            {z.data.m}/{z.data.a}
                                        </text>
                                    </g>
                                );
                                })}
                            </g>
                        </svg>
                    </div>
                </div>
            </div>
        </div>
    );
});
