
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, X, User, Activity, Shield, Zap, Target, Database, Lock, ShieldAlert, BarChart3, PieChart, Info, RefreshCw } from 'lucide-react';
import { Team, Player } from '../types';
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

const ShotZonePath: React.FC<{ path: string, pct: number, leagueAvg: number, hasData: boolean }> = ({ path, pct, leagueAvg, hasData }) => {
    let fillColor = 'rgba(30, 41, 59, 0.1)'; 
    let strokeColor = '#334155';
    let strokeOpacity = 0.2; 
    
    if (hasData) {
        if (pct >= leagueAvg + 0.05) {
            fillColor = 'rgba(16, 185, 129, 0.5)'; 
            strokeColor = '#34d399';
            strokeOpacity = 0.5;
        } else if (pct <= leagueAvg - 0.05) {
            fillColor = 'rgba(239, 68, 68, 0.2)'; 
            strokeColor = '#f87171';
            strokeOpacity = 0.5;
        } else {
            fillColor = 'rgba(234, 179, 8, 0.2)'; 
            strokeColor = '#facc15';
            strokeOpacity = 0.5;
        }
    }

    return (
        <path d={path} fill={fillColor} stroke={strokeColor} strokeOpacity={strokeOpacity} strokeWidth="1.5" className="transition-all duration-300" />
    );
};

const ShotLabel: React.FC<{ makes: number, attempts: number, pct: number, leagueAvg: number, x: number, y: number }> = ({ makes, attempts, pct, leagueAvg, x, y }) => {
    const hasData = attempts > 0;
    let statusColor = '#334155';
    let textColor = '#94a3b8'; 

    if (hasData) {
        if (pct >= leagueAvg + 0.05) {
            statusColor = '#34d399';
            textColor = '#4ade80'; 
        } else if (pct <= leagueAvg - 0.05) {
            statusColor = '#f87171';
            textColor = '#f87171'; 
        } else {
            statusColor = '#facc15';
            textColor = '#facc15'; 
        }
    }

    const width = 110;
    const height = 60;

    return (
        <g className="pointer-events-none">
            <rect x={x - width/2} y={y - height/2} width={width} height={height} rx="10" fill="rgba(15, 23, 42, 0.95)" stroke={statusColor} strokeWidth="2" />
            {hasData ? (
                <>
                    <text x={x} y={y - 5} textAnchor="middle" fill="#fff" fontSize="22" fontWeight="900" fontFamily="sans-serif">
                        {makes}/{attempts}
                    </text>
                    <text x={x} y={y + 18} textAnchor="middle" fill={textColor} fontSize="18" fontWeight="bold" fontFamily="sans-serif">
                        {(pct * 100).toFixed(1)}%
                    </text>
                </>
            ) : (
                <text x={x} y={y + 5} textAnchor="middle" fill="#475569" fontSize="16" fontWeight="bold" className="select-none opacity-50">
                    No Data
                </text>
            )}
        </g>
    );
};

const VisualShotChart: React.FC<{ player: Player }> = ({ player }) => {
    const s = player.stats;
    const g = s.g || 1;
    
    const pathMidRange = `M 30 0 L 30 140 A 237.5 237.5 0 0 0 470 140 L 470 0 Z`;
    const pathPaint = `M 170 0 L 170 190 L 330 190 L 330 0 Z`;
    const path3PT = "M 0 0 h 500 v 470 h -500 Z";

    const p3Pct = s.p3a > 0 ? s.p3m / s.p3a : 0;
    const midPct = s.midA > 0 ? s.midM / s.midA : 0;
    const rimPct = s.rimA > 0 ? s.rimM / s.rimA : 0;

    const row1 = [
        { l: 'GP', v: s.g }, { l: 'GS', v: s.gs }, { l: 'MIN', v: (s.mp / g).toFixed(1) },
        { l: 'PTS', v: (s.pts / g).toFixed(1) }, { l: 'REB', v: (s.reb / g).toFixed(1) },
        { l: 'OREB', v: (s.offReb / g).toFixed(1) }, { l: 'AST', v: (s.ast / g).toFixed(1) },
        { l: 'STL', v: (s.stl / g).toFixed(1) }, { l: 'BLK', v: (s.blk / g).toFixed(1) },
        { l: 'TOV', v: (s.tov / g).toFixed(1) }
    ];

    const row2 = [
        { l: 'FGM', v: (s.fgm / g).toFixed(1) }, { l: 'FGA', v: (s.fga / g).toFixed(1) },
        { l: 'FG%', v: s.fga > 0 ? ((s.fgm / s.fga) * 100).toFixed(1) + '%' : '-' },
        { l: '3PM', v: (s.p3m / g).toFixed(1) }, { l: '3PA', v: (s.p3a / g).toFixed(1) },
        { l: '3P%', v: s.p3a > 0 ? ((s.p3m / s.p3a) * 100).toFixed(1) + '%' : '-' },
        { l: 'FTM', v: (s.ftm / g).toFixed(1) }, { l: 'FTA', v: (s.fta / g).toFixed(1) },
        { l: 'FT%', v: s.fta > 0 ? ((s.ftm / s.fta) * 100).toFixed(1) + '%' : '-' },
    ];

    const row3 = [
        { l: 'INSM', v: s.rimM }, { l: 'INSA', v: s.rimA },
        { l: 'INS%', v: s.rimA > 0 ? ((s.rimM / s.rimA) * 100).toFixed(1) + '%' : '-' },
        { l: 'MIDM', v: s.midM }, { l: 'MIDA', v: s.midA },
        { l: 'MID%', v: s.midA > 0 ? ((s.midM / s.midA) * 100).toFixed(1) + '%' : '-' },
        { l: '3PM', v: s.p3m }, { l: '3PA', v: s.p3a },
        { l: '3P%', v: s.p3a > 0 ? ((s.p3m / s.p3a) * 100).toFixed(1) + '%' : '-' },
    ];

    return (
        <div className="flex flex-col lg:flex-row items-center gap-8 w-full animate-in fade-in slide-in-from-bottom-2 duration-500 h-full">
            <div className="w-full lg:w-[70%] flex flex-col gap-4 h-full justify-center">
                <div className="flex flex-col gap-1">
                    <h5 className="text-base font-black text-white uppercase tracking-tight pl-1">Traditional</h5>
                    <div className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-3 shadow-sm grid grid-cols-5 md:grid-cols-10 gap-2">
                        {row1.map((item, idx) => <StatItem key={idx} label={item.l} value={item.v} />)}
                    </div>
                </div>
                <div className="flex flex-col gap-1">
                    <h5 className="text-base font-black text-white uppercase tracking-tight pl-1">Shooting</h5>
                    <div className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-3 shadow-sm grid grid-cols-5 md:grid-cols-9 gap-2">
                        {row2.map((item, idx) => <StatItem key={idx} label={item.l} value={item.v} />)}
                    </div>
                </div>
                <div className="flex flex-col gap-1">
                    <h5 className="text-base font-black text-white uppercase tracking-tight pl-1">Efficiency by Zone</h5>
                    <div className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-3 shadow-sm grid grid-cols-5 md:grid-cols-9 gap-2">
                        {row3.map((item, idx) => <StatItem key={idx} label={item.l} value={item.v} />)}
                    </div>
                </div>
            </div>
            <div className="w-full lg:w-[30%] flex flex-col items-center justify-center">
                <div className="flex flex-col gap-1 w-full max-w-[350px]">
                    <h5 className="text-base font-black text-white uppercase tracking-tight pl-1">SHOT ZONE</h5>
                    <div className="relative w-full aspect-[500/470] bg-slate-950 rounded-xl overflow-hidden shadow-2xl border border-slate-800">
                        <svg viewBox="0 0 500 470" className="w-full h-full">
                            <rect x="0" y="0" width="500" height="470" fill="#0f172a" />
                            <ShotZonePath path={path3PT} pct={p3Pct} leagueAvg={0.36} hasData={s.p3a > 0} />
                            <ShotZonePath path={pathMidRange} pct={midPct} leagueAvg={0.42} hasData={s.midA > 0} />
                            <ShotZonePath path={pathPaint} pct={rimPct} leagueAvg={0.62} hasData={s.rimA > 0} />
                            <g fill="none" stroke="#334155" strokeWidth="2" className="pointer-events-none">
                                <rect x="170" y="0" width="160" height="190" />
                                <circle cx="250" cy="190" r="60" />
                                <path d="M 30 0 L 30 140 A 237.5 237.5 0 0 0 470 140 L 470 0" />
                                <path d="M 190 470 A 60 60 0 0 1 310 470" strokeOpacity="0.5" />
                            </g>
                            <ShotLabel makes={s.p3m} attempts={s.p3a} pct={p3Pct} leagueAvg={0.36} x={250} y={380} />
                            <ShotLabel makes={s.midM} attempts={s.midA} pct={midPct} leagueAvg={0.42} x={250} y={240} />
                            <ShotLabel makes={s.rimM} attempts={s.rimA} pct={rimPct} leagueAvg={0.62} x={250} y={85} />
                        </svg>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const PlayerDetailModal: React.FC<{ player: Player, teamName?: string, teamId?: string, onClose: () => void }> = ({ player, teamName, teamId, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'attributes' | 'zones'>('attributes');

  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.body.style.overflow = originalStyle;
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const teamLogo = teamId ? getTeamLogoUrl(teamId) : null;

  const attrGroups = [
    {
      label: "내곽 득점 (INS)",
      attrs: [
        { label: "LAYUP", val: player.layup },
        { label: "DUNK", val: player.dunk },
        { label: "POST PLAY", val: player.postPlay },
        { label: "DRAW FOUL", val: player.drawFoul },
        { label: "HANDS", val: player.hands },
      ]
    },
    {
      label: "외곽 득점 (OUT)",
      attrs: [
        { label: "CLOSE", val: player.closeShot },
        { label: "MIDRANGE", val: player.midRange },
        { label: "3PT", val: Math.round((player.threeCorner + player.three45 + player.threeTop)/3) },
        { label: "FT", val: player.ft },
        { label: "SHOT IQ", val: player.shotIq },
        { label: "OFF CONSISTENCY", val: player.offConsist },
      ]
    },
    {
      label: "운동능력 (ATH)",
      attrs: [
        { label: "SPEED", val: player.speed },
        { label: "AGILITY", val: player.agility },
        { label: "STRENGTH", val: player.strength },
        { label: "VERTICAL", val: player.vertical },
        { label: "STAMINA", val: player.stamina },
        { label: "HUSTLE", val: player.hustle },
        { label: "DURABILITY", val: player.durability },
      ]
    },
    {
      label: "플레이메이킹 (PLM)",
      attrs: [
        { label: "ACCURACY", val: player.passAcc },
        { label: "PASS VISION", val: player.passVision },
        { label: "PASS IQ", val: player.passIq },
        { label: "HANDLE", val: player.handling },
        { label: "SPD BALL", val: player.spdBall },
      ]
    },
    {
      label: "수비 (DEF)",
      attrs: [
        { label: "PERIMETER", val: player.perDef },
        { label: "INTERIOR", val: player.intDef },
        { label: "STEAL", val: player.steal },
        { label: "BLOCK", val: player.blk },
        { label: "HELP DEFENSE IQ", val: player.helpDefIq },
        { label: "PASS PERCEPTION", val: player.passPerc },
        { label: "DEF CONSISTENCY", val: player.defConsist },
      ]
    },
    {
      label: "리바운드 (REB)",
      attrs: [
        { label: "OFF REB", val: player.offReb },
        { label: "DEF REB", val: player.defReb },
      ]
    }
  ];

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
      <div ref={modalRef} className="bg-slate-900 border border-slate-700 rounded-[2rem] w-full max-w-6xl shadow-2xl flex flex-col overflow-hidden max-h-[95vh] mx-4 relative animate-in zoom-in-95 duration-200">
        <div className="bg-slate-950 px-8 py-6 border-b border-slate-800 flex justify-between items-center flex-shrink-0">
           <div className="flex items-center gap-8">
              <div className="flex gap-4">
                  <div className="flex flex-col items-center gap-1">
                     <div className={getOvrBadgeStyle(player.ovr) + " !w-16 !h-16 !text-3xl !rounded-2xl ring-4 ring-white/5"}>{player.ovr}</div>
                     <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">OVR</span>
                  </div>
              </div>
              <div className="flex flex-col">
                 <h2 className="text-3xl font-black text-white uppercase pretendard tracking-tight leading-none mb-2">{player.name}</h2>
                 <div className="flex items-center gap-4 text-sm font-bold text-slate-400 bg-slate-900/50 px-4 py-2 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-2">
                        {teamLogo && <img src={teamLogo} className="w-6 h-6 object-contain" alt={teamName} />}
                        <span className="text-indigo-400 uppercase tracking-wide">{teamName || "Free Agent"}</span>
                    </div>
                    <div className="w-[1px] h-4 bg-slate-700"></div>
                    <span className="text-slate-200">{player.position}</span>
                    <div className="w-[1px] h-4 bg-slate-700"></div>
                    <span>{player.age}세</span>
                    <div className="w-[1px] h-4 bg-slate-700"></div>
                    <span>{player.height}cm / {player.weight}kg</span>
                    <div className="w-[1px] h-4 bg-slate-700"></div>
                    <span className="text-slate-200 pretendard">Salary: ${player.salary}M</span>
                 </div>
              </div>
           </div>
           
           <div className="flex items-center gap-4">
                <div className="flex bg-slate-800 p-1 rounded-xl">
                    <button 
                        onClick={() => setActiveTab('attributes')}
                        className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-2 ${activeTab === 'attributes' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        <Activity size={14} /> 능력치
                    </button>
                    <button 
                        onClick={() => setActiveTab('zones')}
                        className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-2 ${activeTab === 'zones' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        <Target size={14} /> 기록
                    </button>
                </div>
                <button onClick={onClose} className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-2xl transition-colors shadow-lg border border-slate-700">
                    <X size={24} />
                </button>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-slate-900/50 custom-scrollbar">
           {activeTab === 'attributes' ? (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {attrGroups.map((group, idx) => {
                     // Calculate Group Average
                     const avg = Math.round(group.attrs.reduce((sum, a) => sum + a.val, 0) / group.attrs.length);
                     
                     return (
                        <div key={idx} className="bg-slate-950/60 rounded-2xl border border-slate-800 p-5 flex flex-col gap-4 shadow-sm">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-800/50 h-10 px-2">
                                <div className="flex items-center gap-3">
                                    <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{group.label}</h4>
                                    <div className={`!w-7 !h-6 !text-[10px] !rounded-md ${getRankStyle(avg)}`}>{avg}</div>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                {group.attrs.map((attr, aIdx) => (
                                    <div key={aIdx} className="flex justify-between items-center h-8 px-2 rounded-lg hover:bg-slate-800/50 transition-colors">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{attr.label}</span>
                                        <div className={`!w-8 !h-7 !text-xs !rounded-md ${getRankStyle(Math.round(attr.val))}`}>{Math.round(attr.val)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                     );
                  })}
               </div>
           ) : (
               <div className="flex flex-col items-center h-full justify-center">
                   <VisualShotChart player={player} />
               </div>
           )}
        </div>
      </div>
    </div>,
    document.body
  );
};
