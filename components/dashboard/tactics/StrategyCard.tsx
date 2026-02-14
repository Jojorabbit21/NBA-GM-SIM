
import React from 'react';
import { Target, Shield, ChevronDown, ShieldAlert } from 'lucide-react';
import { Player, OffenseTactic, DefenseTactic } from '../../../types';
import { TacticalHalfCourt } from './TacticalHalfCourt';
import { calculatePlayerOvr } from '../../../utils/constants';

interface StrategyCardProps {
    type: 'offense' | 'defense';
    starters: Player[];
    selectedTactic: string;
    onChange: (val: string) => void;
    info: { label: string, desc: string, pros: string[], cons: string[] };
    options: { value: string, label: string }[];
    
    // Optional Stopper Logic
    stopperProps?: {
        stopperId?: string;
        onStopperChange: (val: string) => void;
        roster: Player[];
        isDisabled?: boolean; // [New] Prop to disable stopper selection
    };
}

export const StrategyCard: React.FC<StrategyCardProps> = ({ 
    type, starters, selectedTactic, onChange, info, options, stopperProps 
}) => {
    const isOffense = type === 'offense';
    const Icon = isOffense ? Target : Shield;
    const title = isOffense ? "공격 시스템" : "수비 시스템";

    return (
        <div className="bg-slate-950/40 border border-slate-800/50 rounded-2xl overflow-hidden shadow-sm">
             <div className="grid grid-cols-1 md:grid-cols-2">
                {/* Left Side: Half Court Viz */}
                <div className="p-6 border-b md:border-b-0 md:border-r border-slate-800/50 flex flex-col justify-center bg-slate-950/20">
                     <TacticalHalfCourt starters={starters} type={type} />
                </div>
                
                {/* Right Side: Controls */}
                <div className="flex flex-col">
                    <div className="px-6 py-5 border-b border-white/5 space-y-3 bg-slate-950/20">
                        <div className="flex items-center gap-3 text-indigo-400">
                            <Icon size={20} />
                            <span className="font-black text-sm uppercase tracking-widest oswald">{title}</span>
                        </div>
                        <div className="relative group">
                            <select 
                                value={selectedTactic} 
                                onChange={(e) => onChange(e.target.value)} 
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer hover:bg-slate-800 transition-all shadow-inner"
                            >
                                {options.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-indigo-400" size={16} />
                        </div>
                    </div>
                    <div className="p-6 space-y-3 bg-slate-950/20 flex-1">
                        <div className="text-xs font-black text-slate-400 uppercase tracking-widest pb-1 border-b border-white/5 mb-2">{info.desc}</div>
                        <div className="grid grid-cols-1 gap-2.5">
                            {info.pros.map((pro, i) => (
                                <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300"><span className="text-emerald-500 text-xs mt-0.5">✅</span><span className="leading-relaxed">{pro}</span></div>
                            ))}
                            {info.cons.map((con, i) => (
                                <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300"><span className="text-red-500 text-xs mt-0.5">❌</span><span className="leading-relaxed">{con}</span></div>
                            ))}
                        </div>
                    </div>

                    {/* Stopper Logic (Defense Only) */}
                    {stopperProps && (
                        <div className="px-6 py-4 border-t border-white/5 bg-slate-950/20">
                            <div className="flex items-center gap-2 mb-2">
                                <ShieldAlert size={16} className={`text-indigo-400 ${stopperProps.isDisabled ? 'opacity-50' : ''}`} />
                                <span className={`text-xs font-black text-slate-400 uppercase tracking-widest ${stopperProps.isDisabled ? 'opacity-50' : ''}`}>에이스 스토퍼 (Lockdown)</span>
                            </div>
                            <div className="relative group">
                                <select 
                                    value={stopperProps.stopperId || ""} 
                                    onChange={(e) => stopperProps.onStopperChange(e.target.value)}
                                    disabled={stopperProps.isDisabled}
                                    className={`w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-indigo-500 appearance-none shadow-inner transition-all ${stopperProps.isDisabled ? 'opacity-50 cursor-not-allowed text-slate-500' : 'cursor-pointer hover:bg-slate-800'}`}
                                >
                                    {stopperProps.isDisabled ? (
                                        <option value="">지역 방어 사용 중 (지정 불가)</option>
                                    ) : (
                                        <option value="">지정 안함 (팀 수비 모드)</option>
                                    )}
                                    
                                    {!stopperProps.isDisabled && stopperProps.roster.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} ({p.position}) - OVR {calculatePlayerOvr(p)}</option>
                                    ))}
                                </select>
                                {!stopperProps.isDisabled && <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-indigo-400" size={14} />}
                            </div>
                        </div>
                    )}
                </div>
             </div>
        </div>
    );
};
