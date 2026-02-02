
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, X, User, Activity, Shield, Zap, Target, Database, Lock, ShieldAlert, BarChart3, PieChart, Info, RefreshCw } from 'lucide-react';
import { Team, Player, PlayerStats } from '../types';
import { getTeamLogoUrl } from '../utils/constants';

export const getOvrBadgeStyle = (ovr: number) => {
  const baseClass = "w-8 h-8 flex items-center justify-center rounded-md font-black oswald text-base shadow-lg text-shadow-ovr mx-auto transition-all ";
  
  // 95+ - Pink Diamond (Bright Magenta + Outline + Glow)
  if (ovr >= 95) return baseClass + 'bg-gradient-to-b from-fuchsia-300 via-fuchsia-500 to-fuchsia-700 text-white shadow-[0_0_25px_rgba(232,121,249,0.9)] border-2 border-white/80 ring-2 ring-fuchsia-500/50';
  
  // 90-94 - Red (Elite)
  if (ovr >= 90) return baseClass + 'bg-gradient-to-br from-red-500 via-red-600 to-rose-700 text-white shadow-red-500/40 border border-red-400';
  
  // 85-89 - Blue (All-Star)
  if (ovr >= 85) return baseClass + 'bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 text-white shadow-blue-500/40 border border-blue-400';
  
  // 80-84 - Green (Starter)
  if (ovr >= 80) return baseClass + 'bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 text-white shadow-emerald-500/40 border border-emerald-400';
  
  // 75-79 - Gold (Solid)
  if (ovr >= 75) return baseClass + 'bg-gradient-to-br from-yellow-400 via-amber-500 to-orange-600 text-white shadow-amber-500/40 border border-amber-300';
  
  // 70-74 - Silver (Brightened)
  if (ovr >= 70) return baseClass + 'bg-gradient-to-br from-slate-300 via-slate-400 to-zinc-600 text-white shadow-slate-500/30 border border-slate-200';
  
  // < 70 - Bronze (Brightened & High Contrast)
  return baseClass + 'bg-gradient-to-br from-amber-600 via-amber-800 to-stone-900 text-amber-100 shadow-orange-900/40 border border-amber-500/50';
};

export const getRankStyle = (val: number) => {
  const baseClass = "w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-md font-medium text-xs md:text-sm transition-all border ";
  
  // 95+ (Elite): Cyan/Blue with Glow
  if (val >= 95) return baseClass + 'bg-cyan-500/10 text-cyan-200 border-cyan-400/30 shadow-[0_0_10px_rgba(34,211,238,0.4)]';

  // 90-94 (Great): Emerald
  if (val >= 90) return baseClass + 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
  
  // 80-89 (Good): Green
  if (val >= 80) return baseClass + 'bg-green-500/10 text-green-300 border-green-500/30';
  
  // 70-79 (Average): Yellow
  if (val >= 70) return baseClass + 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30';
  
  // 60-69 (Below Avg): Orange
  if (val >= 60) return baseClass + 'bg-orange-500/10 text-orange-300 border-orange-500/30';
  
  // < 60 (Low): Red
  return baseClass + 'bg-red-500/10 text-red-300 border-red-500/30';
};

export const Toast: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => {
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const animFrame = requestAnimationFrame(() => setIsClosing(true));
    const timer = setTimeout(onClose, 3000);
    return () => {
      cancelAnimationFrame(animFrame);
      clearTimeout(timer);
    };
  }, [onClose]);

  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[300] animate-in slide-in-from-bottom-5 duration-300">
      <div className="relative bg-slate-900 border border-indigo-500/50 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] px-6 py-4 flex items-center gap-4 min-w-[320px] max-w-[90vw] overflow-hidden">
        <div 
            className="absolute top-0 left-0 h-1 bg-indigo-500 transition-all ease-linear duration-[3000ms] shadow-[0_0_10px_rgba(99,102,241,0.5)]"
            style={{ width: isClosing ? '0%' : '100%' }}
        />
        <div className="bg-indigo-500/20 p-2 rounded-full flex-shrink-0">
          <CheckCircle2 size={20} className="text-indigo-400" />
        </div>
        <p className="text-sm font-bold text-slate-100 flex-grow ko-normal">{message}</p>
        <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-lg text-slate-500 transition-colors flex-shrink-0 z-10">
          <X size={18} />
        </button>
      </div>
    </div>
  );
};

export const ActionToast: React.FC<{ message: string; actionLabel: string; onAction: () => void; onClose: () => void }> = ({ message, actionLabel, onAction, onClose }) => {
  return (
    <div className="fixed top-6 right-6 z-[300] animate-in slide-in-from-right-5 duration-500">
      <div className="relative bg-slate-900 border border-indigo-500/50 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] px-5 py-4 flex items-center gap-4 min-w-[320px] max-w-[90vw]">
        <div className="bg-indigo-500/20 p-2 rounded-full flex-shrink-0">
          <RefreshCw size={18} className="text-indigo-400" />
        </div>
        <p className="text-sm font-bold text-slate-100 flex-grow ko-normal leading-tight">{message}</p>
        <div className="flex items-center gap-3 border-l border-slate-700 pl-3 ml-1">
            <button 
                onClick={onAction}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all active:scale-95 whitespace-nowrap shadow-lg shadow-indigo-900/20"
            >
                {actionLabel}
            </button>
            <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-white transition-colors flex-shrink-0">
                <X size={18} />
            </button>
        </div>
      </div>
    </div>
  );
};

export const NavItem: React.FC<{ active: boolean, icon: React.ReactNode, label: string, onClick: () => void }> = ({ active, icon, label, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all ${active ? 'bg-blue-600 text-white shadow-blue-900/30 ring-1 ring-blue-400/30' : 'text-slate-400 hover:bg-slate-800/60'}`}>
    {icon} <span className="text-sm font-bold ko-tight">{label}</span>
  </button>
);

export const TeamCard: React.FC<{ team: Team, onSelect: () => void }> = ({ team, onSelect }) => (
  <button onClick={onSelect} className="group bg-slate-900/80 border border-slate-800 p-6 rounded-[2rem] hover:border-slate-400 transition-all flex flex-col items-center justify-center shadow-xl w-full aspect-[4/5] overflow-hidden">
    <div className="flex-1 flex items-center justify-center w-full mb-4">
      <img src={team.logo} className="max-w-[70%] max-h-full group-hover:scale-110 transition-transform object-contain drop-shadow-lg" alt={team.name} />
    </div>
    <div className="w-full px-3 text-center">
      <div className="text-lg font-semibold pretendard text-white ko-tight uppercase leading-tight break-keep">
        {team.city} {team.name}
      </div>
    </div>
  </button>
);

const StatItem: React.FC<{ label: string, value: string | number }> = ({ label, value }) => (
    <div className="flex flex-col items-center justify-center">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">{label}</span>
        <span className="text-sm font-bold text-white tabular-nums">{value}</span>
    </div>
);

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

const VisualShotChart: React.FC<{ player: Player }> = ({ player }) => {
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

export const PlayerDetailModal: React.FC<{ player: Player, teamName?: string, teamId?: string, onClose: () => void }> = ({ player, teamName, teamId, onClose }) => {
    // Prevent background scrolling
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = 'unset'; };
    }, []);

    const AttributeRow = ({ label, value, max=99 }: { label: string, value: number, max?: number }) => (
        <div className="flex items-center justify-between py-1 border-b border-slate-800/50 last:border-0">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-tight">{label}</span>
            <span className={`text-sm font-black font-mono ${value >= 90 ? 'text-fuchsia-400' : value >= 80 ? 'text-emerald-400' : value >= 70 ? 'text-amber-400' : 'text-slate-500'}`}>{value}</span>
        </div>
    );

    return createPortal(
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 rounded-[2rem] w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden relative" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                    <div className="flex items-center gap-6">
                        <div className={getOvrBadgeStyle(player.ovr) + " !w-16 !h-16 !text-3xl !rounded-2xl shadow-lg"}>{player.ovr}</div>
                        <div>
                            <h2 className="text-3xl font-black text-white uppercase tracking-tight leading-none oswald">{player.name}</h2>
                            <div className="flex items-center gap-3 mt-2">
                                {teamId && <img src={getTeamLogoUrl(teamId)} className="w-5 h-5 object-contain" alt="" />}
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-800 px-2 py-0.5 rounded">{teamName || 'Free Agent'}</span>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest px-2 py-0.5 border border-slate-700 rounded">{player.position}</span>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{player.height}cm / {player.weight}kg</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900/50">
                    <div className="p-8">
                        {/* Shot Chart & Basic Stats */}
                        <div className="mb-10">
                            <VisualShotChart player={player} />
                        </div>

                        {/* Detailed Attributes Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            
                            {/* Scoring */}
                            <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800">
                                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-800">
                                    <Target size={16} className="text-orange-400" />
                                    <h4 className="text-xs font-black text-slate-200 uppercase tracking-widest">Scoring</h4>
                                </div>
                                <div className="space-y-1">
                                    <AttributeRow label="Inside" value={player.ins} />
                                    <AttributeRow label="Close Shot" value={player.closeShot} />
                                    <AttributeRow label="Layup" value={player.layup} />
                                    <AttributeRow label="Dunk" value={player.dunk} />
                                    <AttributeRow label="Mid-Range" value={player.midRange} />
                                    <AttributeRow label="3PT Shooting" value={player.threeCorner} /> 
                                    <AttributeRow label="Free Throw" value={player.ft} />
                                    <AttributeRow label="Shot IQ" value={player.shotIq} />
                                </div>
                            </div>

                            {/* Playmaking & Mental */}
                            <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800">
                                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-800">
                                    <Zap size={16} className="text-yellow-400" />
                                    <h4 className="text-xs font-black text-slate-200 uppercase tracking-widest">Playmaking</h4>
                                </div>
                                <div className="space-y-1">
                                    <AttributeRow label="Pass Accuracy" value={player.passAcc} />
                                    <AttributeRow label="Ball Handle" value={player.handling} />
                                    <AttributeRow label="Speed w/ Ball" value={player.spdBall} />
                                    <AttributeRow label="Vision" value={player.passVision} />
                                    <AttributeRow label="Pass IQ" value={player.passIq} />
                                    <AttributeRow label="Hands" value={player.hands} />
                                    <AttributeRow label="Off. Consistency" value={player.offConsist} />
                                </div>
                            </div>

                            {/* Defense */}
                            <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800">
                                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-800">
                                    <Shield size={16} className="text-blue-400" />
                                    <h4 className="text-xs font-black text-slate-200 uppercase tracking-widest">Defense</h4>
                                </div>
                                <div className="space-y-1">
                                    <AttributeRow label="Interior Def" value={player.intDef} />
                                    <AttributeRow label="Perimeter Def" value={player.perDef} />
                                    <AttributeRow label="Steal" value={player.steal} />
                                    <AttributeRow label="Block" value={player.blk} />
                                    <AttributeRow label="Help Def IQ" value={player.helpDefIq} />
                                    <AttributeRow label="Def. Consistency" value={player.defConsist} />
                                    <AttributeRow label="Off. Rebound" value={player.offReb} />
                                    <AttributeRow label="Def. Rebound" value={player.defReb} />
                                </div>
                            </div>

                            {/* Athleticism */}
                            <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800">
                                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-800">
                                    <Activity size={16} className="text-emerald-400" />
                                    <h4 className="text-xs font-black text-slate-200 uppercase tracking-widest">Athleticism</h4>
                                </div>
                                <div className="space-y-1">
                                    <AttributeRow label="Speed" value={player.speed} />
                                    <AttributeRow label="Agility" value={player.agility} />
                                    <AttributeRow label="Strength" value={player.strength} />
                                    <AttributeRow label="Vertical" value={player.vertical} />
                                    <AttributeRow label="Stamina" value={player.stamina} />
                                    <AttributeRow label="Hustle" value={player.hustle} />
                                    <AttributeRow label="Durability" value={player.durability} />
                                    <AttributeRow label="Potential" value={player.potential} />
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
