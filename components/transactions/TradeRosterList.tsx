
import React from 'react';
import { Users, Info, ArrowLeftRight, Check, MinusCircle, CheckCircle2 } from 'lucide-react';
import { Player } from '../../types';
import { getOvrBadgeStyle } from '../SharedComponents';

interface TradeRosterListProps {
  roster: Player[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onViewPlayer: (p: Player) => void;
  isTradeDeadlinePassed: boolean;
  emptyMessage?: { title: string; desc: string; icon?: React.ReactNode };
  mode: 'Block' | 'Proposal';
}

export const TradeRosterList: React.FC<TradeRosterListProps> = ({ 
  roster, selectedIds, onToggle, onViewPlayer, isTradeDeadlinePassed, emptyMessage, mode 
}) => {

  if (roster.length === 0) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center px-12 space-y-4">
            <div className="p-8 bg-slate-800/20 rounded-full">
                {emptyMessage?.icon || <Users size={48} className="opacity-20" />}
            </div>
            <p className="text-sm font-bold uppercase tracking-widest oswald italic">
                {emptyMessage?.desc || "No players available"}
            </p>
        </div>
      );
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-2 bg-slate-950/20">
        {roster.map(p => {
            const isSelected = selectedIds.has(p.id);
            // Dynamic styling based on selection and mode
            const baseClass = `w-full flex items-center justify-between p-4 rounded-2xl border transition-all duration-300`;
            const activeClass = isSelected 
                ? 'bg-indigo-600/20 border-indigo-500 shadow-[inset_0_0_20px_rgba(79,70,229,0.1)] ring-1 ring-indigo-500/50' 
                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700';
            const disabledClass = isTradeDeadlinePassed ? 'opacity-50 cursor-not-allowed border-slate-800 bg-slate-900' : '';

            return (
                <div key={p.id} className={`${baseClass} ${disabledClass || activeClass}`}>
                    <div className="flex items-center gap-4 flex-1 cursor-pointer" onClick={() => !isTradeDeadlinePassed && onToggle(p.id)}>
                        <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'border-slate-700 bg-slate-900'}`}>
                            {isSelected && <Check size={20} className="text-white" strokeWidth={3} />}
                        </div>
                        <div className="flex-shrink-0">
                            <div className={getOvrBadgeStyle(p.ovr) + " !mx-0 !w-10 !h-10 !text-xl"}>{p.ovr}</div>
                        </div>
                        <div className="text-left flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <div className="font-black text-white text-sm ko-tight truncate hover:text-indigo-400 hover:underline" onClick={(e) => { e.stopPropagation(); onViewPlayer(p); }}>
                                    {p.name}
                                </div>
                                {p.health !== 'Healthy' && (
                                    <span className={`px-1.5 py-0.5 rounded-[4px] text-[8px] font-black uppercase ${p.health === 'Injured' ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500'}`}>
                                        {p.health === 'Injured' ? 'OUT' : 'DTD'}
                                    </span>
                                )}
                            </div>
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                                {p.position} | {p.age}세 | ${p.salary}M
                            </div>
                        </div>
                    </div>
                    {isSelected && (
                        mode === 'Block' 
                        ? <MinusCircle size={18} className="text-red-500 animate-in zoom-in duration-300 cursor-pointer" onClick={() => onToggle(p.id)} />
                        : <CheckCircle2 size={18} className="text-emerald-500 animate-in zoom-in duration-300 cursor-pointer" onClick={() => onToggle(p.id)} />
                    )}
                </div>
            );
        })}
    </div>
  );
};
