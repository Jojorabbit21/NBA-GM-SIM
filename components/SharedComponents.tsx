
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, X, User, Activity, Shield, Zap, Target, Database, Lock, ShieldAlert, BarChart3, PieChart, Info, RefreshCw, ChevronRight } from 'lucide-react';
import { Team, Player, PlayerStats } from '../types';
import { getTeamLogoUrl } from '../utils/constants';
import { VisualShotChart } from './VisualShotChart'; // [NEW] Import Separated Component

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

export const PlayerDetailModal: React.FC<{ player: Player, teamName?: string, teamId?: string, onClose: () => void }> = ({ player, teamName, teamId, onClose }) => {
    // 탭 상태 추가
    const [activeTab, setActiveTab] = useState<'attributes' | 'stats'>('attributes');

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

                {/* Tab Navigation */}
                <div className="px-8 border-b border-slate-800 bg-slate-950 flex gap-6">
                    <button 
                        onClick={() => setActiveTab('attributes')}
                        className={`py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'attributes' ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 border-transparent hover:text-white'}`}
                    >
                        능력치 (Attributes)
                    </button>
                    <button 
                        onClick={() => setActiveTab('stats')}
                        className={`py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'stats' ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 border-transparent hover:text-white'}`}
                    >
                        시즌 기록 (Stats)
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900/50">
                    <div className="p-8">
                        
                        {/* Tab 1: Attributes Grid */}
                        {activeTab === 'attributes' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in duration-300">
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
                        )}

                        {/* Tab 2: Stats & Shot Chart */}
                        {activeTab === 'stats' && (
                            <div className="animate-in fade-in duration-300">
                                <VisualShotChart player={player} />
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
