
import React from 'react';
import { Users, Eye, ShieldAlert, Lock, ListOrdered } from 'lucide-react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { getOvrBadgeStyle } from '../SharedComponents';
import { calculatePlayerOvr } from '../../utils/constants';
import { StartingLineup } from '../roster/StartingLineup';
import { DepthChartEditor } from './DepthChartEditor';

interface RosterTableProps {
  activeRosterTab: 'mine' | 'opponent';
  setActiveRosterTab: (tab: 'mine' | 'opponent') => void;
  team: Team;
  opponent?: Team;
  healthySorted: Player[];
  injuredSorted: Player[];
  oppHealthySorted: Player[];
  tactics: GameTactics;
  onUpdateTactics: (t: GameTactics) => void;
  onViewPlayer: (p: Player) => void;
  depthChart?: DepthChart | null; 
  onUpdateDepthChart?: (dc: DepthChart) => void;
}

// Helper for Attribute Color Coding (Same as PlayerDetailModal)
const getAttrColor = (val: number) => {
    if (val >= 90) return 'text-fuchsia-400';
    if (val >= 80) return 'text-emerald-400';
    if (val >= 70) return 'text-amber-400';
    return 'text-slate-500';
};

const AttrCell: React.FC<{ value: number; className?: string }> = ({ value, className }) => (
    <td className={`py-1.5 px-1 text-center text-xs font-black font-mono ${getAttrColor(value)} ${className || ''}`}>
        {value}
    </td>
);

// [Updated] Font weight lowered to bold, added className prop for padding
const StatCell: React.FC<{ value: string | number, isPercent?: boolean, className?: string }> = ({ value, isPercent, className }) => (
    <td className={`py-1.5 px-1 text-right text-xs font-bold font-mono text-slate-400 tabular-nums ${className || ''}`}>
        {value}{isPercent ? '%' : ''}
    </td>
);

export const RosterTable: React.FC<RosterTableProps> = ({ 
  activeRosterTab, setActiveRosterTab, team, opponent, 
  healthySorted, injuredSorted, oppHealthySorted, 
  tactics, onUpdateTactics, onViewPlayer,
  depthChart, onUpdateDepthChart
}) => {
    const { starters, minutesLimits, stopperId, defenseTactics } = tactics;
    const isAceStopperActive = defenseTactics.includes('AceStopper');

    return (
        <div className="lg:col-span-8 flex flex-col overflow-hidden border-r border-white/5 bg-slate-950/20 rounded-bl-3xl">
            <div className="px-8 border-b border-white/10 bg-slate-950/80 flex items-center justify-between h-[88px] flex-shrink-0">
                <div className="flex items-center gap-6 h-full">
                    <button 
                        onClick={() => setActiveRosterTab('mine')}
                        className={`flex items-center gap-3 transition-all h-full border-b-2 ${activeRosterTab === 'mine' ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 hover:text-slate-300 border-transparent'} `}
                    >
                        <Users size={20} />
                        <span className="text-lg font-black uppercase oswald tracking-tight ko-tight">로스터 관리</span>
                    </button>
                    
                    <div className="w-[1px] h-6 bg-white/10"></div>
                    
                    <button 
                        onClick={() => setActiveRosterTab('opponent')}
                        disabled={!opponent}
                        className={`flex items-center gap-3 transition-all h-full border-b-2 ${activeRosterTab === 'opponent' ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 hover:text-slate-300 border-transparent'} ${!opponent ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <Eye size={20} />
                        <span className="text-lg font-black uppercase oswald tracking-tight ko-tight">상대 전력 분석</span>
                    </button>
                </div>
            </div>

            {/* Changed back to overflow-y-auto to remove horizontal scroll */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {activeRosterTab === 'mine' ? (
                    <div className="flex flex-col">
                        {/* 1. Starting Lineup Visualizer */}
                        <div className="p-8 pb-0 bg-slate-900/30">
                            <StartingLineup team={team} tactics={tactics} roster={team.roster} />
                        </div>

                        {/* 2. Depth Chart Editor (Integrated & Compact) */}
                        <div className="mt-4">
                             <DepthChartEditor 
                                team={team} 
                                tactics={tactics} 
                                depthChart={depthChart || null} 
                                onUpdateDepthChart={onUpdateDepthChart || (() => {})} 
                                onUpdateTactics={onUpdateTactics}
                            />
                        </div>

                        {/* 3. Detailed Roster Table (Redesigned) - Removed Title Header */}
                        <div className="mt-0">
                            <table className="w-full text-left border-collapse table-fixed">
                                <thead>
                                    <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-y border-white/10 bg-slate-950/50">
                                        {/* Changed fixed pixels to percentages for alignment */}
                                        <th className="py-2 px-4 w-[16%]">이름</th>
                                        <th className="py-2 px-1 text-center w-[5%]">POS</th>
                                        <th className="py-2 px-1 text-center w-[5%]">OVR</th>
                                        <th className="py-2 px-1 text-center w-[5%]">COND</th>
                                        
                                        <th className="py-2 px-1 text-center w-10 text-slate-400">INS</th>
                                        <th className="py-2 px-1 text-center w-10 text-slate-400">OUT</th>
                                        <th className="py-2 px-1 text-center w-10 text-slate-400">ATH</th>
                                        <th className="py-2 px-1 text-center w-10 text-slate-400">PLM</th>
                                        <th className="py-2 px-1 text-center w-10 text-slate-400">DEF</th>
                                        <th className="py-2 px-1 text-center w-10 text-slate-400">REB</th>

                                        <th className="py-2 px-1 text-center w-12">스토퍼</th>
                                        <th className="py-2 px-1 text-center w-16">시간 제한</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {healthySorted.map(p => {
                                        const assignedSlot = Object.entries(starters).find(([slot, id]) => id === p.id)?.[0];
                                        const isStarter = !!assignedSlot;
                                        const isSelectedStopper = stopperId === p.id;
                                        const cond = Math.round(p.condition ?? 100); 
                                        const displayOvr = calculatePlayerOvr(p, assignedSlot || p.position);
                                        
                                        let condColor = 'text-emerald-500';
                                        if (cond < 60) condColor = 'text-red-500';
                                        else if (cond < 80) condColor = 'text-amber-500';

                                        return (
                                            <tr key={p.id} className={`transition-all ${isStarter ? 'bg-indigo-500/5' : 'hover:bg-white/5'}`}>
                                                {/* Name */}
                                                <td className="py-1.5 px-4 cursor-pointer" onClick={() => onViewPlayer(p)}>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`font-bold text-xs truncate hover:text-indigo-400 hover:underline ${isStarter ? 'text-white' : 'text-slate-400'}`}>{p.name}</span>
                                                    </div>
                                                </td>

                                                {/* POS */}
                                                <td className="py-1.5 px-1 text-center">
                                                    <span className="text-[10px] font-bold text-slate-500">{p.position}</span>
                                                </td>

                                                {/* OVR */}
                                                <td className="py-1.5 px-1 text-center">
                                                    <div className={getOvrBadgeStyle(displayOvr) + " !w-7 !h-7 !text-xs !mx-auto"}>{displayOvr}</div>
                                                </td>

                                                {/* Condition (Text Only) */}
                                                <td className="py-1.5 px-1 text-center">
                                                    <span className={`text-xs font-black ${condColor}`}>{cond}</span>
                                                </td>

                                                {/* Attributes */}
                                                <AttrCell value={p.ins} />
                                                <AttrCell value={p.out} />
                                                <AttrCell value={p.ath} />
                                                <AttrCell value={p.plm} />
                                                <AttrCell value={p.def} />
                                                <AttrCell value={p.reb} />

                                                {/* Stopper Toggle */}
                                                <td className="py-1.5 px-1 text-center">
                                                    <div className="flex justify-center items-center">
                                                        <button disabled={!isAceStopperActive} onClick={() => onUpdateTactics({...tactics, stopperId: isSelectedStopper ? undefined : p.id})} className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all border ${!isAceStopperActive ? 'opacity-20 cursor-not-allowed border-slate-800 bg-slate-900' : isSelectedStopper ? 'bg-fuchsia-600 border-fuchsia-400 text-white shadow-[0_0_10px_rgba(192,38,211,0.4)]' : 'bg-slate-950 border-white/10 text-slate-600 hover:border-fuchsia-500/30'}`}>
                                                            {isAceStopperActive ? (isSelectedStopper ? <Lock size={10} /> : <ShieldAlert size={10} />) : <Lock size={10} />}
                                                        </button>
                                                    </div>
                                                </td>

                                                {/* Minutes Input */}
                                                <td className="py-1.5 px-1 text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <input type="number" min="0" max="48" placeholder="-" value={minutesLimits[p.id] !== undefined ? minutesLimits[p.id] : ''} onChange={e => {
                                                            const val = e.target.value;
                                                            const next = { ...minutesLimits };
                                                            if (val === '') { delete next[p.id]; }
                                                            else { next[p.id] = Math.min(48, Math.max(0, parseInt(val) || 0)); }
                                                            onUpdateTactics({ ...tactics, minutesLimits: next });
                                                        }} className="w-10 h-7 bg-slate-950 border border-white/10 rounded-md py-0.5 text-center text-xs font-black text-white focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-700" />
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        
                        {/* Injured Reserve Table - Redesigned */}
                        {injuredSorted.length > 0 && (
                            <div className="flex flex-col mt-6 border-t border-red-900/30 bg-red-950/10">
                                <div className="px-6 py-2 bg-red-950/20 flex items-center gap-2 border-b border-red-900/20">
                                    <ShieldAlert size={14} className="text-red-500" />
                                    <h4 className="text-[10px] font-black uppercase text-red-400 tracking-[0.2em] oswald">Injured Reserve</h4>
                                </div>
                                <table className="w-full text-left border-collapse table-fixed">
                                    <thead>
                                        {/* Match Header Style of Main Table (Using Percentages) */}
                                        <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/10 bg-slate-950/50">
                                            <th className="py-2 px-4 w-[16%]">이름</th>
                                            <th className="py-2 px-1 text-center w-[5%]">POS</th>
                                            <th className="py-2 px-1 text-center w-[5%]">OVR</th>
                                            
                                            {/* Stacked to the right of OVR, Left Aligned */}
                                            <th className="py-2 px-4 text-left w-auto">부상명</th>
                                            <th className="py-2 px-4 text-left w-[120px]">복귀 예정일</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {injuredSorted.map(p => {
                                            const ovr = calculatePlayerOvr(p);
                                            return (
                                                <tr key={p.id} className="hover:bg-red-500/5 transition-all group">
                                                    <td className="py-1.5 px-4 cursor-pointer" onClick={() => onViewPlayer(p)}>
                                                        <span className="font-bold text-xs text-slate-400 group-hover:text-red-400">{p.name}</span>
                                                    </td>
                                                    <td className="py-1.5 px-1 text-center">
                                                        <span className="text-[10px] font-bold text-slate-600">{p.position}</span>
                                                    </td>
                                                    <td className="py-1.5 px-1 text-center">
                                                        <div className={getOvrBadgeStyle(ovr) + " !w-6 !h-6 !text-xs !mx-auto grayscale opacity-70"}>{ovr}</div>
                                                    </td>
                                                    
                                                    <td className="py-1.5 px-4 text-left">
                                                        <span className="pretendard text-xs font-bold text-red-500 whitespace-nowrap">
                                                            {p.injuryType || 'Unknown Injury'}
                                                        </span>
                                                    </td>
                                                    <td className="py-1.5 px-4 text-left">
                                                        <span className="pretendard text-xs font-black text-slate-500 tracking-tight">
                                                            {p.returnDate || 'TBD'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col h-full">
                        {/* Opponent table with Stats */}
                        {opponent ? (
                            // [Updated] Removed min-width, readjusted percentages to fit 100% width
                            <table className="w-full text-left border-collapse table-fixed">
                                <thead>
                                    <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/10 bg-slate-950/50">
                                        <th className="py-2 px-6 w-[20%]">이름</th>
                                        <th className="py-2 px-1 text-center w-[5%]">POS</th>
                                        <th className="py-2 px-1 text-center w-[5%]">OVR</th>
                                        
                                        {/* Attributes - ~5% each (Total 30%) */}
                                        <th className="py-2 px-1 text-center w-[5%] text-slate-400">INS</th>
                                        <th className="py-2 px-1 text-center w-[5%] text-slate-400">OUT</th>
                                        <th className="py-2 px-1 text-center w-[5%] text-slate-400">ATH</th>
                                        <th className="py-2 px-1 text-center w-[5%] text-slate-400">PLM</th>
                                        <th className="py-2 px-1 text-center w-[5%] text-slate-400">DEF</th>
                                        <th className="py-2 px-1 text-center w-[5%] text-slate-400 border-r border-white/10">REB</th>
                                        
                                        {/* Stats - ~5% each (Total 40%) */}
                                        <th className="py-2 px-1 text-right w-[6%] text-slate-400">PTS</th>
                                        <th className="py-2 px-1 text-right w-[5%] text-slate-400">REB</th>
                                        <th className="py-2 px-1 text-right w-[5%] text-slate-400">AST</th>
                                        <th className="py-2 px-1 text-right w-[5%] text-slate-400">STL</th>
                                        <th className="py-2 px-1 text-right w-[5%] text-slate-400">BLK</th>
                                        <th className="py-2 px-1 text-right w-[5%] text-slate-400">TOV</th>
                                        <th className="py-2 px-1 text-right w-[9%] text-slate-400 pr-6">FG%</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {oppHealthySorted.map((p) => {
                                        const ovr = calculatePlayerOvr(p);
                                        const s = p.stats;
                                        const g = s.g > 0 ? s.g : 1;
                                        const fgPct = s.fga > 0 ? (s.fgm / s.fga * 100).toFixed(1) : '0.0';

                                        return (
                                            <tr key={p.id} className="hover:bg-white/5 transition-all">
                                                <td className="py-1.5 px-6 cursor-pointer" onClick={() => onViewPlayer(p)}>
                                                    <span className="font-bold text-xs text-slate-300 hover:text-white hover:underline truncate block">{p.name}</span>
                                                </td>
                                                <td className="py-1.5 px-1 text-center">
                                                    <span className="text-[10px] font-black text-slate-500">{p.position}</span>
                                                </td>
                                                <td className="py-1.5 px-1 text-center"><div className={getOvrBadgeStyle(ovr) + " !w-7 !h-7 !text-xs !mx-auto"}>{ovr}</div></td>
                                                
                                                {/* Reordered Attributes */}
                                                <AttrCell value={p.ins} />
                                                <AttrCell value={p.out} />
                                                <AttrCell value={p.ath} />
                                                <AttrCell value={p.plm} />
                                                <AttrCell value={p.def} />
                                                <AttrCell value={p.reb} className="border-r border-white/10" />
                                                
                                                {/* Stats Cells */}
                                                <StatCell value={(s.pts/g).toFixed(1)} />
                                                <StatCell value={(s.reb/g).toFixed(1)} />
                                                <StatCell value={(s.ast/g).toFixed(1)} />
                                                <StatCell value={(s.stl/g).toFixed(1)} />
                                                <StatCell value={(s.blk/g).toFixed(1)} />
                                                <StatCell value={(s.tov/g).toFixed(1)} />
                                                <StatCell value={fgPct} isPercent className="pr-6" />
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 space-y-4">
                                <div className="p-6 bg-slate-800/30 rounded-full">
                                    <Users size={48} className="opacity-20" />
                                </div>
                                <div className="text-center">
                                    <p className="font-black uppercase text-lg tracking-widest oswald text-slate-400">No Opponent</p>
                                    <p className="text-xs font-bold mt-1">오늘 경기 일정이 없습니다.</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
