
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, X, User, Activity, Shield, Zap, Target, Database } from 'lucide-react';
import { Team, Player } from './types';
import { getTeamLogoUrl } from './constants';

export const getOvrBadgeStyle = (ovr: number) => {
  const baseClass = "w-8 h-8 flex items-center justify-center rounded-md font-black oswald text-base shadow-lg text-shadow-ovr mx-auto ";
  if (ovr >= 95) return baseClass + 'bg-[linear-gradient(rgb(255,150,223),rgb(173,56,138))] text-white shadow-[0_0_20px_rgba(255,150,223,0.7)] ring-1 ring-fuchsia-300 animate-pulse-subtle';
  if (ovr >= 90) return baseClass + 'bg-gradient-to-br from-red-500 to-red-800 text-white shadow-red-900/40';
  if (ovr >= 85) return baseClass + 'bg-gradient-to-br from-blue-500 to-blue-800 text-white shadow-blue-900/40';
  if (ovr >= 80) return baseClass + 'bg-gradient-to-br from-emerald-500 to-emerald-800 text-white shadow-emerald-900/40';
  if (ovr >= 75) return baseClass + 'bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-amber-900/40';
  if (ovr >= 70) return baseClass + 'bg-gradient-to-br from-amber-700 to-amber-900 text-white shadow-amber-950/40';
  return baseClass + 'bg-gradient-to-br from-slate-700 to-slate-900 text-slate-300 border border-slate-600';
};

export const getRankStyle = (val: number) => {
  const baseClass = "w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-md font-black text-xs md:text-sm transition-all ";
  
  // 95+: Sky (God Tier)
  if (val >= 95) return baseClass + 'bg-sky-500/20 text-sky-400 border border-sky-500/30 shadow-[0_0_10px_rgba(14,165,233,0.2)]';
  
  // 90-94: Cyan (Elite)
  if (val >= 90) return baseClass + 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';
  
  // 85-89: Teal (Great)
  if (val >= 85) return baseClass + 'bg-teal-500/20 text-teal-400 border border-teal-500/30';
  
  // 80-84: Emerald (Very Good)
  if (val >= 80) return baseClass + 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
  
  // 75-79: Green (Good)
  if (val >= 75) return baseClass + 'bg-green-500/20 text-green-400 border border-green-500/30';
  
  // 70-74: Lime (Above Average)
  if (val >= 70) return baseClass + 'bg-lime-500/20 text-lime-400 border border-lime-500/30';
  
  // 65-69: Yellow (Average)
  if (val >= 65) return baseClass + 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30';
  
  // 60-64: Amber/Orange (Below Average)
  if (val >= 60) return baseClass + 'bg-orange-500/20 text-orange-400 border border-orange-500/30';
  
  // 50-59: Red (Bad)
  if (val >= 50) return baseClass + 'bg-red-600/20 text-red-400 border border-red-600/30';
  
  // < 50: Dark Red (Very Bad)
  return baseClass + 'bg-red-950/40 text-red-600 border border-red-900/50';
};

export const Toast: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[300] animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-slate-900 border border-indigo-500/50 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] px-6 py-4 flex items-center gap-4 min-w-[320px] max-w-[90vw]">
        <div className="bg-indigo-500/20 p-2 rounded-full">
          <CheckCircle2 size={20} className="text-indigo-400" />
        </div>
        <p className="text-sm font-bold text-slate-100 flex-grow ko-normal">{message}</p>
        <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-lg text-slate-500 transition-colors">
          <X size={18} />
        </button>
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

export const PlayerDetailModal: React.FC<{ player: Player, teamName?: string, onClose: () => void }> = ({ player, teamName, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Prevent background scrolling
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

  // Try to determine team ID from player ID structure (teamid-firstname-lastname)
  const teamId = player.id.includes('-') ? player.id.split('-')[0] : '';
  const teamLogo = teamId ? getTeamLogoUrl(teamId) : null;

  const attrGroups = [
    {
      label: "내곽 득점 (INS)",
      score: player.ins,
      attrs: [
        { label: "INSIDE", val: player.ins },
        { label: "LAYUP", val: player.layup },
        { label: "DUNK", val: player.dunk },
        { label: "POST PLAY", val: player.postPlay },
        { label: "DRAW FOUL", val: player.drawFoul },
        { label: "HANDS", val: player.hands },
      ]
    },
    {
      label: "외곽 득점 (OUT)",
      score: player.out,
      attrs: [
        { label: "OUTSIDE", val: player.out },
        { label: "CLOSE", val: player.closeShot },
        { label: "MIDRANGE", val: player.midRange },
        { label: "3PT", val: Math.round((player.threeCorner + player.three45 + player.threeTop)/3) },
        { label: "FT", val: player.ft },
        { label: "SHOT IQ", val: player.shotIq },
      ]
    },
    {
      label: "운동능력 (ATH)",
      score: player.ath,
      attrs: [
        { label: "ATH", val: player.ath },
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
      score: player.plm,
      attrs: [
        { label: "PLAYMAKING", val: player.plm },
        { label: "ACCURACY", val: player.passAcc },
        { label: "PASS VISION", val: player.passVision },
        { label: "PASS IQ", val: player.passIq },
        { label: "HANDLE", val: player.handling },
        { label: "SPD BALL", val: player.spdBall },
      ]
    },
    {
      label: "수비 (DEF)",
      score: player.def,
      attrs: [
        { label: "DEFENSE", val: player.def },
        { label: "INTERIOR", val: player.intDef },
        { label: "PERIMETER", val: player.perDef },
        { label: "LOCKDOWN", val: player.lockdown },
        { label: "STEAL", val: player.steal },
        { label: "BLOCK", val: player.blk },
        { label: "DEF IQ", val: player.helpDefIq },
      ]
    },
    {
      label: "리바운드 (REB)",
      score: player.reb,
      attrs: [
        { label: "REBOUND", val: player.reb },
        { label: "OFF REB", val: player.offReb },
        { label: "DEF REB", val: player.defReb },
      ]
    }
  ];

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
      <div ref={modalRef} className="bg-slate-900 border border-slate-700 rounded-[2rem] w-full max-w-5xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh] mx-4 relative animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-slate-950 px-8 py-6 border-b border-slate-800 flex justify-between items-center flex-shrink-0">
           <div className="flex items-center gap-8">
              {/* Badges */}
              <div className="flex gap-4">
                  <div className="flex flex-col items-center gap-1">
                     <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">OVR</span>
                     <div className={getOvrBadgeStyle(player.ovr) + " !w-16 !h-16 !text-3xl !rounded-2xl"}>{player.ovr}</div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                     <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">POT</span>
                     <div className={getOvrBadgeStyle(player.potential) + " !w-16 !h-16 !text-3xl !rounded-2xl opacity-80"}>{player.potential}</div>
                  </div>
              </div>

              {/* Player Info - Single Line with Logo */}
              <div className="flex flex-col">
                 <h2 className="text-4xl font-black text-white uppercase oswald tracking-tight leading-none mb-2">{player.name}</h2>
                 
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
           
           <button onClick={onClose} className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-2xl transition-colors shadow-lg border border-slate-700">
              <X size={24} />
           </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-900/50 custom-scrollbar">
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {attrGroups.map((group, idx) => (
                 <div key={idx} className="bg-slate-950/60 rounded-2xl border border-slate-800 p-5 flex flex-col gap-4 shadow-sm">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800/50 h-10 px-2">
                       <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{group.label}</h4>
                       <div className={`!w-8 !h-8 !text-xs !rounded-md ${getRankStyle(group.score)}`}>{group.score}</div>
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
              ))}
           </div>
        </div>

      </div>
    </div>,
    document.body
  );
};
