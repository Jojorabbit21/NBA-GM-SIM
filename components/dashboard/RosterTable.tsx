
import React from 'react';
import { Users, Eye, ShieldAlert } from 'lucide-react';
import { Player, Team, GameTactics, DepthChart } from '../../types';
import { getOvrBadgeStyle } from '../SharedComponents';
import { calculatePlayerOvr } from '../../utils/constants';
import { StartingLineup } from '../roster/StartingLineup';
import { DepthChartEditor } from './DepthChartEditor';

interface RosterTableProps {
  mode: 'mine' | 'opponent';
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

const StatCell: React.FC<{ value: string | number, isPercent?: boolean, className?: string }> = ({ value, isPercent, className }) => (
    <td className={`py-1.5 px-1 text-right text-xs font-bold font-mono text-slate-400 tabular-nums ${className || ''}`}>
        {value}{isPercent ? '%' : ''}
    </td>
);

export const RosterTable: React.FC<RosterTableProps> = ({ 
  mode, team, opponent, 
  healthySorted, injuredSorted, oppHealthySorted, 
  tactics, onUpdateTactics, onViewPlayer,
  depthChart, onUpdateDepthChart
}) => {
    const { starters } = tactics;

    return (
        <div className="flex flex-col h-full overflow-hidden bg-slate-950/20">
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {mode === 'mine' ? (
                    <div className="flex flex-col">
                        <div className="p-8 pb-4 bg-slate-900/30">
                            <StartingLineup team={team} tactics={tactics} roster={team.roster} />
                        </div>

                        <div className="mt-2">
                             <DepthChartEditor 
                                team={team} 
                                tactics={tactics} 
                                depthChart={depthChart || null} 
                                onUpdateDepthChart={onUpdateDepthChart || (() => {})} 
                                onUpdateTactics={onUpdateTactics}
                            />
                        </div>

                        <div className="mt-6">
                            <table className="w-full text-left border-collapse table-fixed">
                                <thead>
                                    <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-y border-white/10 bg-slate-950/50">
                                        <th className="py-2 px-6 w-[20%]">선수명</th>
                                        <th className="py-2 px-1 text-center w-[8%]">POS</th>
                                        <th className="py-2 px-1 text-center w-[8%]">OVR</th>
                                        <th className="py-2 px-1 text-center w-[8%]">COND</th>
                                        <th className="py-2 px-1 text-center w-[8%] text-slate-400">INS</th>
                                        <th className="py-2 px-1 text-center w-[8%] text-slate-400">OUT</th>
                                        <th className="py-2 px-1 text-center w-[8%] text-slate-400">ATH</th>
                                        <th className="py-2 px-1 text-center w-[8%] text-slate-400">PLM</th>
                                        <th className="py-2 px-1 text-center w-[8%] text-slate-400">DEF</th>
                                        <th className="py-2 px-1 text-center w-[8%] text-slate-400">REB</th>
                                        <th className="w-[8%]"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {healthySorted.map(p => {
                                        const assignedSlot = Object.entries(starters).find(([slot, id]) => id === p.id)?.[0];
                                        const isStarter = !!assignedSlot;
                                        const cond = Math.round(p.condition ?? 100); 
                                        const displayOvr = calculatePlayerOvr(p, assignedSlot || p.position);
                                        
                                        let condColor = 'text-emerald-500';
                                        if (cond < 60) condColor = 'text-red-500';
                                        else if (cond < 80) condColor = 'text-amber-500';

                                        return (
                                            <tr key={p.id} className={`transition-all ${isStarter ? 'bg-indigo-500/5' : 'hover:bg-white/5'}`}>
                                                <td className="py-2 px-6 cursor-pointer" onClick={() => onViewPlayer(p)}>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`font-bold text-xs truncate hover:text-indigo-400 hover:underline ${isStarter ? 'text-white' : 'text-slate-400'}`}>{p.name}</span>
                                                    </div>
                                                </td>
                                                <td className="py-2 px-1 text-center">
                                                    <span className="text-[10px] font-bold text-slate-500">{p.position}</span>
                                                </td>
                                                <td className="py-2 px-1 text-center">
                                                    <div className={getOvrBadgeStyle(displayOvr) + " !w-7 !h-7 !text-xs !mx-auto"}>{displayOvr}</div>
                                                </td>
                                                <td className="py-2 px-1 text-center">
                                                    <span className={`text-xs font-black ${condColor}`}>{cond}</span>
                                                </td>
                                                <AttrCell value={p.ins} />
                                                <AttrCell value={p.out} />
                                                <AttrCell value={p.ath} />
                                                <AttrCell value={p.plm} />
                                                <AttrCell value={p.def} />
                                                <AttrCell value={p.reb} />
                                                <td></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        
                        {injuredSorted.length > 0 && (
                            <div className="flex flex-col mt-10 border-t border-red-900/30 bg-red-950/5">
                                <div className="px-8 py-3 bg-red-950/20 flex items-center gap-2 border-b border-red-900/20">
                                    <ShieldAlert size={16} className="text-red-500" />
                                    <h4 className="text-xs font-black uppercase text-red-400 tracking-[0.2em] oswald">Injured Reserve</h4>
                                </div>
                                <table className="w-full text-left border-collapse table-fixed">
                                    <thead>
                                        <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/10 bg-slate-950/50">
                                            <th className="py-2 px-8 w-[25%]">선수명</th>
                                            <th className="py-2 px-1 text-center w-[10%]">POS</th>
                                            <th className="py-2 px-1 text-center w-[10%]">OVR</th>
                                            <th className="py-2 px-4 text-left w-auto">부상 내용</th>
                                            <th className="py-2 px-8 text-left w-[150px]">복귀 예정일</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {injuredSorted.map(p => {
                                            const ovr = calculatePlayerOvr(p);
                                            return (
                                                <tr key={p.id} className="hover:bg-red-500/5 transition-all group">
                                                    <td className="py-2 px-8 cursor-pointer" onClick={() => onViewPlayer(p)}>
                                                        <span className="font-bold text-xs text-slate-400 group-hover:text-red-400">{p.name}</span>
                                                    </td>
                                                    <td className="py-2 px-1 text-center">
                                                        <span className="text-[10px] font-bold text-slate-600">{p.position}</span>
                                                    </td>
                                                    <td className="py-2 px-1 text-center">
                                                        <div className={getOvrBadgeStyle(ovr) + " !w-6 !h-6 !text-xs !mx-auto grayscale opacity-70"}>{ovr}</div>
                                                    </td>
                                                    <td className="py-2 px-4 text-left">
                                                        <span className="pretendard text-xs font-bold text-red-500">
                                                            {p.injuryType || 'Unknown'}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-8 text-left">
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
                        {opponent ? (
                            <table className="w-full text-left border-collapse table-fixed">
                                <thead>
                                    <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/10 bg-slate-950/50">
                                        <th className="py-3 px-8 w-[20%]">선수명</th>
                                        <th className="py-3 px-1 text-center w-[8%]">POS</th>
                                        <th className="py-3 px-1 text-center w-[8%]">OVR</th>
                                        <th className="py-3 px-1 text-center w-[7%] text-slate-400">INS</th>
                                        <th className="py-3 px-1 text-center w-[7%] text-slate-400">OUT</th>
                                        <th className="py-3 px-1 text-center w-[7%] text-slate-400">ATH</th>
                                        <th className="py-3 px-1 text-center w-[7%] text-slate-400">PLM</th>
                                        <th className="py-3 px-1 text-center w-[7%] text-slate-400">DEF</th>
                                        <th className="py-3 px-1 text-center w-[7%] text-slate-400 border-r border-white/10">REB</th>
                                        <th className="py-3 px-1 text-right w-[6%] text-slate-400">PTS</th>
                                        <th className="py-3 px-1 text-right w-[6%] text-slate-400">REB</th>
                                        <th className="py-3 px-1 text-right w-[6%] text-slate-400 pr-8">FG%</th>
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
                                                <td className="py-2.5 px-8 cursor-pointer" onClick={() => onViewPlayer(p)}>
                                                    <span className="font-bold text-xs text-slate-300 hover:text-white hover:underline truncate block">{p.name}</span>
                                                </td>
                                                <td className="py-2.5 px-1 text-center">
                                                    <span className="text-[10px] font-black text-slate-500">{p.position}</span>
                                                </td>
                                                <td className="py-2.5 px-1 text-center"><div className={getOvrBadgeStyle(ovr) + " !w-7 !h-7 !text-xs !mx-auto"}>{ovr}</div></td>
                                                <AttrCell value={p.ins} />
                                                <AttrCell value={p.out} />
                                                <AttrCell value={p.ath} />
                                                <AttrCell value={p.plm} />
                                                <AttrCell value={p.def} />
                                                <AttrCell value={p.reb} className="border-r border-white/10" />
                                                <StatCell value={(s.pts/g).toFixed(1)} />
                                                <StatCell value={(s.reb/g).toFixed(1)} />
                                                <StatCell value={fgPct} isPercent className="pr-8" />
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-32">
                                <Users size={48} className="opacity-20 mb-4" />
                                <div className="text-center">
                                    <p className="font-black uppercase text-lg tracking-widest oswald text-slate-400">No Data</p>
                                    <p className="text-xs font-bold mt-1">상대 팀 정보를 불러올 수 없습니다.</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
