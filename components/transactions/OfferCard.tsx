
import React from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import { Player, TradeOffer } from '../../types';
import { OvrBadge } from '../common/OvrBadge';
import { calculatePlayerOvr } from '../../utils/constants';
import { TEAM_DATA } from '../../data/teamData';
import { TeamLogo } from '../common/TeamLogo';

interface OfferCardProps {
  offer: TradeOffer;
  onAccept: () => void;
  onPlayerClick: (p: Player) => void;
}

export const OfferCard: React.FC<OfferCardProps> = ({ offer, onAccept, onPlayerClick }) => {
  const fullTeamName = offer.teamName; // API returns correct name
  const analysis = offer.analysis || [];
  
  const teamColor = TEAM_DATA[offer.teamId]?.colors.primary || '#4f46e5';

  return (
    // [Optimization] bg-slate-900 (Solid background)
    // Dynamic Border Color on Hover
    <div 
        className="bg-slate-900 border border-slate-800 rounded-3xl p-6 transition-all group relative overflow-hidden shadow-xl"
        style={{ '--team-color': teamColor } as React.CSSProperties}
    >
       <style>{`
         .group:hover { border-color: var(--team-color); }
       `}</style>
       
       <div 
          className="absolute top-0 right-0 w-32 h-32 blur-[60px] rounded-full transition-opacity opacity-20 group-hover:opacity-40" 
          style={{ backgroundColor: teamColor }}
       />
       
       <div className="flex flex-col gap-6 relative z-10">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-4">
                 <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 shadow-md flex-shrink-0">
                    <TeamLogo teamId={offer.teamId} size="lg" />
                 </div>
                 <div className="min-w-0">
                    <h4 
                        className="text-lg font-black uppercase text-slate-100 oswald tracking-tight leading-none truncate"
                        style={{ color: teamColor !== '#000000' ? teamColor : '#ffffff' }}
                    >
                        {fullTeamName}
                    </h4>
                    <div className={`mt-1.5 text-[10px] font-black uppercase inline-block px-2 py-0.5 rounded ${offer.diffValue >= 0 ? 'text-emerald-400 bg-emerald-400/10' : 'text-slate-500 bg-slate-800'}`}>
                        {offer.diffValue >= 0 ? 'Value Gain' : 'Value Balanced'}
                    </div>
                 </div>
              </div>
              <button 
                  onClick={onAccept} 
                  className="py-3 px-6 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-[0_4px_20px_rgba(0,0,0,0.4)] transition-all active:scale-95 flex-shrink-0 flex items-center gap-2 hover:brightness-110"
                  style={{ backgroundColor: teamColor }}
              >
                수락하기 <ChevronRight size={14} />
              </button>
          </div>
          <div className="space-y-3">
             <div className="flex justify-between items-center mb-1 px-1">
                <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: teamColor !== '#000000' ? teamColor : '#94a3b8' }}>제안된 패키지 ({offer.players.length}인)</div>
                <div className="text-[10px] font-mono font-black text-slate-500">합계: ${offer.players.reduce((s,p)=>s+p.salary,0).toFixed(1)}M</div>
             </div>
             <div className="flex flex-col gap-2">
                {offer.players.map(p => {
                  const displayOvr = calculatePlayerOvr(p);
                  
                  return (
                  <div key={p.id} className="flex items-center justify-between bg-slate-950/40 p-3 rounded-2xl border border-slate-800/50 hover:bg-slate-950/80 transition-colors">
                     <div className="flex items-center gap-4 flex-1 min-w-0">
                       <div className="flex-shrink-0">
                          <OvrBadge value={displayOvr} size="md" className="!mx-0 !w-10 !h-10 !text-xl" />
                       </div>
                       <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onPlayerClick(p)}>
                         <div className="flex items-center gap-2">
                            <div className="font-bold text-sm text-slate-100 truncate hover:text-indigo-400 hover:underline">{p.name}</div>
                            {p.health !== 'Healthy' && (
                                <span 
                                    className={`px-1.5 py-0.5 rounded-[4px] text-[8px] font-black uppercase cursor-help ${p.health === 'Injured' ? 'bg-red-900/50 text-red-400 border border-red-500/30' : 'bg-amber-900/50 text-amber-400 border border-amber-500/30'}`}
                                    title={`부상: ${p.injuryType || 'Unknown'} (복귀: ${p.returnDate || 'TBD'})`}
                                >
                                    {p.health === 'Injured' ? 'OUT' : 'DTD'}
                                </span>
                            )}
                         </div>
                         <div className="text-[10px] text-slate-500 uppercase font-black tracking-tight">{p.position}</div>
                       </div>
                     </div>
                     <div className="ml-4 text-sm font-mono font-black text-slate-300 flex-shrink-0">${p.salary.toFixed(1)}M</div>
                  </div>
                  );
                })}
             </div>
             
             {/* AI Analysis Log */}
             {analysis.length > 0 && (
                 <div className="mt-4 p-3 bg-slate-950 rounded-xl border border-slate-800/50">
                    <div className="flex items-center gap-2 mb-2 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                        <FileText size={12} /> AI Analysis
                    </div>
                    <div className="space-y-1">
                        {analysis.map((log, i) => (
                            <p key={i} className="text-[10px] text-slate-400 font-mono leading-tight">{log}</p>
                        ))}
                    </div>
                 </div>
             )}
          </div>
       </div>
    </div>
  );
};
