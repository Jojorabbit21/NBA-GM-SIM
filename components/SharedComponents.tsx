
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, X, User, Activity, Shield, Zap, Target, Database, Lock, ShieldAlert } from 'lucide-react';
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
  const baseClass = "w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-md font-black text-xs md:text-sm transition-all border ";
  
  // 95+ (Elite): Cyan/Blue with Glow
  if (val >= 95) return baseClass + 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50 shadow-[0_0_10px_rgba(34,211,238,0.4)]';

  // 90-94 (Great): Emerald
  if (val >= 90) return baseClass + 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50';
  
  // 80-89 (Good): Green
  if (val >= 80) return baseClass + 'bg-green-500/20 text-green-400 border-green-500/50';
  
  // 70-79 (Average): Yellow
  if (val >= 70) return baseClass + 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
  
  // 60-69 (Below Avg): Orange
  if (val >= 60) return baseClass + 'bg-orange-500/20 text-orange-400 border-orange-500/50';
  
  // < 60 (Low): Red
  return baseClass + 'bg-red-500/20 text-red-400 border-red-500/50';
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

export const PlayerDetailModal: React.FC<{ player: Player, teamName?: string, teamId?: string, onClose: () => void }> = ({ player, teamName, teamId, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);

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
        <div className="bg-slate-950 px-8 py-6 border-b border-slate-800 flex justify-between items-center flex-shrink-0">
           <div className="flex items-center gap-8">
              <div className="flex gap-4">
                  <div className="flex flex-col items-center gap-1">
                     <div className={getOvrBadgeStyle(player.ovr) + " !w-16 !h-16 !text-3xl !rounded-2xl ring-4 ring-white/5"}>{player.ovr}</div>
                     <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">OVR</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                     <div className={getOvrBadgeStyle(player.potential) + " !w-16 !h-16 !text-3xl !rounded-2xl opacity-100"}>{player.potential}</div>
                     <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">POT</span>
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
           <button onClick={onClose} className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-2xl transition-colors shadow-lg border border-slate-700">
              <X size={24} />
           </button>
        </div>
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
