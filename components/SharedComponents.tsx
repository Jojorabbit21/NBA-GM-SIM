
import React, { useEffect, useState } from 'react';
import { CheckCircle2, X, RefreshCw } from 'lucide-react';
import { Team } from '../types';
import { TeamLogo } from './common/TeamLogo';

export const getOvrBadgeStyle = (ovr: number) => {
  const baseClass = "w-8 h-8 flex items-center justify-center rounded-md font-black text-base shadow-lg text-shadow-ovr mx-auto transition-all ";

  // 97+ - Generational (White-Violet Plasma + Dual Glow)
  if (ovr >= 97) return baseClass + 'bg-gradient-to-br from-white via-fuchsia-300 to-violet-600 text-purple-950 shadow-[0_0_20px_rgba(192,132,252,0.7),0_0_40px_rgba(232,121,249,0.4)] border border-white/70 ring-1 ring-fuchsia-300/60';

  // 94-96 - Superstar (Deep Violet)
  if (ovr >= 94) return baseClass + 'bg-gradient-to-br from-violet-400 via-purple-600 to-purple-900 text-white shadow-[0_0_14px_rgba(139,92,246,0.6)] border border-violet-400/50';

  // 91-93 - All-NBA (Fuchsia/Magenta)
  if (ovr >= 91) return baseClass + 'bg-gradient-to-br from-fuchsia-400 via-fuchsia-600 to-fuchsia-800 text-white shadow-[0_0_10px_rgba(232,121,249,0.5)] border border-fuchsia-400/40';

  // 88-90 - All-Star (Pink)
  if (ovr >= 88) return baseClass + 'bg-gradient-to-br from-pink-400 via-pink-600 to-pink-800 text-white shadow-[0_0_10px_rgba(244,114,182,0.4)] border border-pink-400/40';

  // 85-87 - Starter+ (Rose)
  if (ovr >= 85) return baseClass + 'bg-gradient-to-br from-rose-400 via-rose-600 to-rose-800 text-white shadow-rose-500/30 border border-rose-400/40';

  // 82-84 - Starter (Red)
  if (ovr >= 82) return baseClass + 'bg-gradient-to-br from-red-400 via-red-600 to-red-800 text-white shadow-red-500/30 border border-red-400/40';

  // 79-81 - Rotation (Orange)
  if (ovr >= 79) return baseClass + 'bg-gradient-to-br from-orange-400 via-orange-600 to-orange-800 text-white shadow-orange-600/30 border border-orange-400/30';

  // 76-78 - Bench (Amber)
  if (ovr >= 76) return baseClass + 'bg-gradient-to-br from-amber-500 via-amber-600 to-yellow-900 text-white shadow-amber-700/20 border border-amber-400/30';

  // 73-75 - Depth (Warm Stone)
  if (ovr >= 73) return baseClass + 'bg-gradient-to-br from-stone-400 via-stone-600 to-zinc-700 text-stone-100 shadow-stone-700/20 border border-stone-400/30';

  // <73 - Two-Way (Dark Clay)
  return baseClass + 'bg-gradient-to-br from-orange-800 via-stone-800 to-neutral-900 text-orange-200/70 shadow-orange-900/20 border border-orange-800/30';
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
      <TeamLogo teamId={team.id} size="custom" className="max-w-[70%] max-h-full group-hover:scale-110 transition-transform drop-shadow-lg" />
    </div>
    <div className="w-full px-3 text-center">
      <div className="text-lg font-semibold pretendard text-white ko-tight uppercase leading-tight break-keep">
        {team.city} {team.name}
      </div>
    </div>
  </button>
);
