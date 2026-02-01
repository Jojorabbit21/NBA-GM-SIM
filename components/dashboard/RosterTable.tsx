
import React from 'react';
import { Users, Eye, ShieldAlert, Lock } from 'lucide-react';
import { Player, Team, GameTactics } from '../../types';
import { getOvrBadgeStyle, getRankStyle } from '../SharedComponents';
import { calculatePlayerOvr } from '../../utils/constants';
import { StartingLineup } from '../roster/StartingLineup';

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
}

export const RosterTable: React.FC<RosterTableProps> = ({ 
  activeRosterTab, setActiveRosterTab, team, opponent, 
  healthySorted, injuredSorted, oppHealthySorted, 
  tactics, onUpdateTactics, onViewPlayer 
}) => {
    const { starters, minutesLimits, stopperId, defenseTactics } = tactics;
    const isAceStopperActive = defenseTactics.includes('AceStopper');

    const handleAssignStarter = (id: string, pos: keyof typeof starters) => {
        const newStarters = { ...starters };
        Object.keys(newStarters).forEach(k => { if (newStarters[k as keyof typeof starters] === id) newStarters[k as keyof typeof starters] = ''; });
        newStarters[pos] = id;
        onUpdateTactics({ ...tactics, starters: newStarters });
    };

    return (
        <div className="lg:col-span-8 flex flex-col overflow-hidden border-r border-white/5 bg-slate-950/20 rounded-bl-3xl">
            <div className="px-8 border-b border-white/10 bg-slate-950/80 flex items-center justify-between h-[88px] flex-shrink-0">
                <div className="flex items-center gap-6 h-full">
                    <button 
                        onClick={() => setActiveRosterTab('mine')}
                        className={`flex items-center gap-3 transition-all h-full border-b-2 ${activeRosterTab === 'mine' ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 hover:text-slate-300 border-transparent'} `}
                    >
                        <Users size={24} />
                        <span className="text-2xl font-black uppercase oswald tracking-tight ko-tight">로테이션 관리</span>
                    </button>
                    <div className="w-[1px] h-6 bg-white/10"></div>
                    <button 
                        onClick={() => setActiveRosterTab('opponent')}
                        disabled={!opponent}
                        className={`flex items-center gap-3 transition-all h-full border-b-2 ${activeRosterTab === 'opponent' ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 hover:text-slate-300 border-transparent'} ${!opponent ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <Eye size={24} />
                        <span className="text-2xl font-black uppercase oswald tracking-tight ko-tight">상대 전력 분석</span>
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {activeRosterTab === 'mine' ? (
                    <div className="flex flex-col">
                        {/* Starting Lineup Visualizer */}
                        <div className="p-8 pb-4 bg-slate-900/30 border-b border-white/5">
                            <StartingLineup team={team} tactics={tactics} roster={team.roster} />
                        </div>

                        {/* Healthy Players Table */}
                        <table className="w-full text-left border-collapse table-fixed">
                            <thead>
                                <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-white/10 bg-slate-950/50">
                                    <th className="py-3 px-8 min-w-[150px]">이름</th>
                                    <th className="py-3 px-2 text-center w-24">체력</th>
                                    <th className="py-3 px-4 text-center w-16">POS</th>
                                    <th className="py-3 px-4 text-center w-20">OVR</th>
                                    <th className="py-3 px-1 text-center w-44 whitespace-nowrap">선발 포지션</th>
                                    <th className="py-3 px-1 text-center w-14">스토퍼</th>
                                    <th className="py-3 px-1 text-center w-24 whitespace-nowrap">시간 제한</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {healthySorted.map(p => {
                                    const assignedSlot = Object.entries(starters).find(([slot, id]) => id === p.id)?.[0];
                                    const isStarter = !!assignedSlot;
                                    const isSelectedStopper = stopperId === p.id;
                                    const cond = Math.round(p.condition || 100); 
                                    // [Fix] Calculate OVR dynamically
                                    const displayOvr = calculatePlayerOvr(p, assignedSlot || p.position);
                                    
                                    let condColor = 'bg-emerald-500';
                                    if (cond < 60) condColor = 'bg-red-500';
                                    else if (cond < 80) condColor = 'bg-amber-500';

                                    return (
                                        <tr key={p.id} className={`transition-all ${isStarter ? 'bg-indigo-500/5' : 'hover:bg-white/5'}`}>
                                            <td className="py-3 px-8 min-w-[150px] cursor-pointer" onClick={() => onViewPlayer(p)}>
                                                <div className="flex flex-col justify-center h-10">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`font-black text-base break-keep leading-tight hover:text-indigo-400 hover:underline ${isStarter ? 'text-white' : 'text-slate-300'}`}>{p.name}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3 px-2 text-center w-24">
                                                <div className="flex items-center justify-center gap-2">
                                                    <div className="w-12 h-2.5 bg-slate-800 rounded-full overflow-hidden ring-1 ring-white/10 shadow-inner" title={`Condition: ${cond}%`}>
                                                        <div className={`h-full ${condColor} transition-all duration-500`} style={{ width: `${cond}%` }} />
                                                    </div>
                                                    <span className={`text-[11px] font-black leading-none min-w-[20px] text-right ${condColor.replace('bg-', 'text-')}`}>{cond}</span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <div className="flex items-center justify-center h-10">
                                                    <span className="text-xs font-black text-white px-2 py-1 rounded-md border border-white/10 uppercase tracking-tighter">{p.position}</span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <div className="flex items-center justify-center h-10 gap-1.5">
                                                <div className={getOvrBadgeStyle(displayOvr) + " !w-10 !h-10 !text-xl !mx-0"}>{displayOvr}</div>
                                                </div>
                                            </td>
                                            <td className="py-3 px-1">
                                                <div className="flex justify-center h-10 items-center">
                                                    <div className="flex bg-slate-950/80 p-1 rounded-xl border border-white/5 shadow-inner">
                                                        {(['PG', 'SG', 'SF', 'PF', 'C'] as const).map(slot => (
                                                            <button key={slot} onClick={() => handleAssignStarter(p.id, slot)} className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${starters[slot] === p.id ? 'bg-indigo-600 text-white shadow-lg scale-110 z-10' : 'text-slate-600 hover:text-slate-400'}`}>{slot}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3 px-1 text-center">
                                                <div className="flex justify-center h-10 items-center">
                                                    <button disabled={!isAceStopperActive} onClick={() => onUpdateTactics({...tactics, stopperId: isSelectedStopper ? undefined : p.id})} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all border ${!isAceStopperActive ? 'opacity-20 cursor-not-allowed border-slate-800 bg-slate-900' : isSelectedStopper ? 'bg-fuchsia-600 border-fuchsia-400 text-white shadow-[0_0_15px_rgba(192,38,211,0.4)] scale-110' : 'bg-slate-950 border-white/5 text-slate-600 hover:border-fuchsia-500/30'}`}>
                                                        {isAceStopperActive ? (isSelectedStopper ? <Lock size={16} /> : <ShieldAlert size={16} />) : <Lock size={16} />}
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="py-3 px-1 text-center">
                                                <div className="flex items-center justify-center gap-2 h-10">
                                                    <input type="number" min="0" max="48" placeholder="-" value={minutesLimits[p.id] !== undefined ? minutesLimits[p.id] : ''} onChange={e => {
                                                        const val = e.target.value;
                                                        const next = { ...minutesLimits };
                                                        if (val === '') { delete next[p.id]; }
                                                        else { next[p.id] = Math.min(48, Math.max(0, parseInt(val) || 0)); }
                                                        onUpdateTactics({ ...tactics, minutesLimits: next });
                                                    }} className="w-14 h-10 bg-slate-950 border border-white/5 rounded-lg py-1.5 text-center text-sm font-black text-white focus:outline-none focus:border-indigo-500/50 transition-all" />
                                                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-tighter">분</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        
                        {/* Injured Reserve Table */}
                        {injuredSorted.length > 0 && (
                            <div className="flex flex-col mt-10 border-t-2 border-red-900/30 bg-red-950/10">
                                <div className="px-8 py-4 bg-red-950/20 flex items-center gap-3 border-b border-red-900/20">
                                    <ShieldAlert size={18} className="text-red-500" />
                                    <h4 className="text-sm font-black uppercase text-red-400 tracking-[0.2em] oswald">Injured Reserve (부상자 명단)</h4>
                                </div>
                                <table className="w-full text-left border-collapse table-fixed">
                                    <thead>
                                        <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-900/30">
                                            <th className="py-3 px-8 min-w-[150px]">이름</th>
                                            <th className="py-3 px-4 text-center w-20">OVR</th>
                                            <th className="py-3 px-4 text-center w-16">POS</th>
                                            <th className="py-3 px-4 text-left w-60">부상명</th>
                                            <th className="py-3 px-8 text-left min-w-[180px]">복귀 예정일</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {injuredSorted.map(p => {
                                            // [Fix] Dynamic OVR
                                            const ovr = calculatePlayerOvr(p);
                                            return (
                                                <tr key={p.id} className="hover:bg-red-500/5 transition-all group">
                                                    <td className="py-4 px-8 cursor-pointer" onClick={() => onViewPlayer(p)}>
                                                        <span className="font-black text-base text-slate-400 group-hover:text-red-400">{p.name}</span>
                                                    </td>
                                                    <td className="py-4 px-4 text-center">
                                                        <div className={getOvrBadgeStyle(ovr) + " !w-9 !h-9 !text-lg !mx-auto grayscale opacity-70"}>{ovr}</div>
                                                    </td>
                                                    <td className="py-4 px-4 text-center">
                                                        <span className="text-xs font-black text-slate-600 px-2 py-1 rounded-md border border-slate-800 uppercase tracking-tighter">{p.position}</span>
                                                    </td>
                                                    <td className="py-4 px-4 text-left">
                                                        <span className="pretendard text-sm font-bold text-red-500 whitespace-nowrap">
                                                            {p.injuryType || 'Unknown Injury'}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-8 text-left">
                                                        <span className="pretendard text-sm font-black text-slate-400 tracking-tight">
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
                                    <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-white/10 bg-slate-950/50">
                                        <th className="py-3 px-8">이름</th>
                                        <th className="py-3 px-4 text-center w-16">POS</th>
                                        <th className="py-3 px-4 text-center w-20">OVR</th>
                                        <th className="py-3 px-2 text-center w-16">ATH</th>
                                        <th className="py-3 px-2 text-center w-16">OUT</th>
                                        <th className="py-3 px-2 text-center w-16">INS</th>
                                        <th className="py-3 px-2 text-center w-16">PLM</th>
                                        <th className="py-3 px-2 text-center w-16">DEF</th>
                                        <th className="py-3 px-2 text-center w-16">REB</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {oppHealthySorted.map((p) => {
                                        // [Fix] Dynamic OVR
                                        const ovr = calculatePlayerOvr(p);
                                        return (
                                            <tr key={p.id} className="hover:bg-white/5 transition-all">
                                                <td className="py-3 px-8 cursor-pointer" onClick={() => onViewPlayer(p)}>
                                                    <div className="flex flex-col justify-center h-10">
                                                        <span className="font-black text-base break-keep leading-tight text-slate-300 hover:text-white hover:underline">{p.name}</span>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                    <div className="flex items-center justify-center h-10">
                                                        <span className="text-xs font-black text-white px-2 py-1 rounded-md border border-white/10 uppercase tracking-tighter">{p.position}</span>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-center"><div className="flex items-center justify-center h-10"><div className={getOvrBadgeStyle(ovr) + " !w-10 !h-10 !text-xl !mx-0"}>{ovr}</div></div></td>
                                                <td className="py-3 px-2 text-center"><div className="flex items-center justify-center h-10"><div className={`mx-auto !w-10 !h-10 !text-sm ${getRankStyle(p.ath)}`}>{p.ath}</div></div></td>
                                                <td className="py-3 px-2 text-center"><div className="flex items-center justify-center h-10"><div className={`mx-auto !w-10 !h-10 !text-sm ${getRankStyle(p.out)}`}>{p.out}</div></div></td>
                                                <td className="py-3 px-2 text-center"><div className="flex items-center justify-center h-10"><div className={`mx-auto !w-10 !h-10 !text-sm ${getRankStyle(p.ins)}`}>{p.ins}</div></div></td>
                                                <td className="py-3 px-2 text-center"><div className="flex items-center justify-center h-10"><div className={`mx-auto !w-10 !h-10 !text-sm ${getRankStyle(p.plm)}`}>{p.plm}</div></div></td>
                                                <td className="py-3 px-2 text-center"><div className="flex items-center justify-center h-10"><div className={`mx-auto !w-10 !h-10 !text-sm ${getRankStyle(p.def)}`}>{p.def}</div></div></td>
                                                <td className="py-3 px-2 text-center"><div className="flex items-center justify-center h-10"><div className={`mx-auto !w-10 !h-10 !text-sm ${getRankStyle(p.reb)}`}>{p.reb}</div></div></td>
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
