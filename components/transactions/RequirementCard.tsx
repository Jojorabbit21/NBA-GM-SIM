
import React from 'react';
import { Target, ChevronRight } from 'lucide-react';
import { Player, TradeOffer } from '../../types';
import { getOvrBadgeStyle } from '../SharedComponents';
import { getTeamLogoUrl } from '../../utils/constants';

interface RequirementCardProps {
  requirement: TradeOffer;
  targetPlayers: Player[];
  onAccept: () => void;
  onPlayerClick: (p: Player) => void;
}

export const RequirementCard: React.FC<RequirementCardProps> = ({ requirement, targetPlayers, onAccept, onPlayerClick }) => {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 hover:border-emerald-500/70 transition-all group relative overflow-hidden shadow-xl">
       <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-600/5 blur-[50px] rounded-full group-hover:bg-emerald-600/10 transition-colors" />
       <div className="flex flex-col gap-6 relative z-10">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-4">
                 <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 shadow-md flex-shrink-0">
                    <img src={getTeamLogoUrl(requirement.teamId)} className="w-12 h-12 object-contain" alt={requirement.teamName} />
                 </div>
                 <div className="min-w-0">
                    <h4 className="text-lg font-black uppercase text-slate-100 oswald tracking-tight leading-none truncate">{requirement.teamName}</h4>
                    <div className={`mt-1.5 text-[10px] font-black uppercase inline-block px-2 py-0.5 rounded ${requirement.diffValue >= 0 ? 'text-emerald-400 bg-emerald-400/10' : 'text-slate-500 bg-slate-800'}`}>
                        {requirement.diffValue >= 0 ? 'Value Gain' : 'Value Balanced'}
                    </div>
                 </div>
              </div>
              <button onClick={onAccept} className="py-3 px-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-[0_4px_20px_rgba(16,185,129,0.4)] transition-all active:scale-95 flex-shrink-0 flex items-center gap-2">
                제안 수락 <ChevronRight size={14} />
              </button>
          </div>
          <div className="space-y-3">
             <div className="flex justify-between items-center mb-1 px-1">
                <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">내 팀 요구 자산 ({requirement.players.length}인)</div>
                <div className="text-[10px] font-mono font-black text-slate-500">합계: ${requirement.players.reduce((s,p)=>s+p.salary,0).toFixed(1)}M</div>
             </div>
             <div className="flex flex-col gap-2">
                {requirement.players.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-slate-950/40 p-3 rounded-2xl border border-slate-800/50 hover:bg-slate-900/60 transition-colors">
                     <div className="flex items-center gap-4 flex-1 min-w-0">
                       <div className="flex-shrink-0"><div className={getOvrBadgeStyle(p.ovr) + " !mx-0 !w-10 !h-10 !text-xl"}>{p.ovr}</div></div>
                       <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onPlayerClick(p)}>
                         <div className="font-bold text-sm text-slate-100 truncate hover:text-indigo-400 hover:underline">{p.name}</div>
                         <div className="text-[10px] text-slate-500 uppercase font-black tracking-tight">{p.position}</div>
                       </div>
                     </div>
                     <div className="ml-4 text-sm font-mono font-black text-slate-300 flex-shrink-0">${p.salary.toFixed(1)}M</div>
                  </div>
                ))}
             </div>
          </div>
       </div>
    </div>
  );
};
