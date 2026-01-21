
import React, { useState, useMemo } from 'react';
import { Flame, Crosshair, Hand, ShieldCheck, Activity, Percent } from 'lucide-react';
import { Team, Player } from '../types';
import { getOvrBadgeStyle, PlayerDetailModal, getRankStyle } from '../components/SharedComponents';

interface LeaderboardViewProps {
  teams: Team[];
}

interface ExtendedPlayer extends Player {
  teamLogo: string;
  teamName: string;
  teamCity: string;
  teamId: string;
}

type StatCategory = 'PTS' | 'REB' | 'AST' | 'STL' | 'BLK' | 'FG%' | '3P%' | 'FT%';

interface StatDefinition {
  id: StatCategory;
  label: string;
  icon: React.ReactNode;
  getValue: (p: Player) => number;
  format: (val: number) => string;
}

const STAT_CATS: StatDefinition[] = [
  { id: 'PTS', label: '득점', icon: <Flame size={16} />, getValue: p => p.stats.g > 0 ? p.stats.pts / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'REB', label: '리바운드', icon: <Activity size={16} />, getValue: p => p.stats.g > 0 ? p.stats.reb / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'AST', label: '어시스트', icon: <Hand size={16} />, getValue: p => p.stats.g > 0 ? p.stats.ast / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'STL', label: '스틸', icon: <ShieldCheck size={16} />, getValue: p => p.stats.g > 0 ? p.stats.stl / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'BLK', label: '블록', icon: <ShieldCheck size={16} />, getValue: p => p.stats.g > 0 ? p.stats.blk / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'FG%', label: '야투율', icon: <Crosshair size={16} />, getValue: p => p.stats.fga > 0 ? p.stats.fgm / p.stats.fga : 0, format: v => (v * 100).toFixed(1) + '%' },
  { id: '3P%', label: '3점 성공률', icon: <Crosshair size={16} />, getValue: p => p.stats.p3a > 0 ? p.stats.p3m / p.stats.p3a : 0, format: v => (v * 100).toFixed(1) + '%' },
  { id: 'FT%', label: '자유투 성공률', icon: <Percent size={16} />, getValue: p => p.stats.fta > 0 ? p.stats.ftm / p.stats.fta : 0, format: v => (v * 100).toFixed(1) + '%' },
];

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({ teams }) => {
  const [activeStat, setActiveStat] = useState<StatCategory>('PTS');
  const [viewPlayer, setViewPlayer] = useState<ExtendedPlayer | null>(null);

  const flatPlayers = useMemo(() => {
    return teams.flatMap(t => t.roster.map(p => ({ ...p, teamLogo: t.logo, teamName: t.name, teamCity: t.city, teamId: t.id }))) as ExtendedPlayer[];
  }, [teams]);

  const sortedPlayers = useMemo(() => {
    const def = STAT_CATS.find(c => c.id === activeStat)!;
    
    // Filter out players with minimal attempts/games to avoid skewing (e.g. 1 game played, 100% shooting)
    let filtered = flatPlayers.filter(p => p.stats.g > 0);
    
    if (activeStat === 'FG%') filtered = filtered.filter(p => p.stats.fga >= p.stats.g * 3); // Min 3 FGA/G
    if (activeStat === '3P%') filtered = filtered.filter(p => p.stats.p3a >= p.stats.g * 1); // Min 1 3PA/G
    if (activeStat === 'FT%') filtered = filtered.filter(p => p.stats.fta >= p.stats.g * 1); // Min 1 FTA/G

    return filtered.sort((a, b) => def.getValue(b) - def.getValue(a)).slice(0, 50);
  }, [flatPlayers, activeStat]);

  const currentStatDef = STAT_CATS.find(c => c.id === activeStat)!;

  const getRankNumberStyle = (rank: number) => {
      if (rank === 1) return "text-yellow-400 drop-shadow-[0_2px_10px_rgba(250,204,21,0.6)]";
      if (rank === 2) return "text-slate-300 drop-shadow-[0_2px_10px_rgba(203,213,225,0.4)]";
      if (rank === 3) return "text-amber-600 drop-shadow-[0_2px_10px_rgba(217,119,6,0.4)]";
      return "text-slate-500";
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] animate-in fade-in duration-500 ko-normal gap-6">
      {viewPlayer && <PlayerDetailModal player={viewPlayer} teamName={viewPlayer.teamName} teamId={viewPlayer.teamId} onClose={() => setViewPlayer(null)} />}
      
      {/* Standardized Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 border-b border-slate-800 pb-6 flex-shrink-0">
        <div>
           <div className="flex items-center gap-3">
             <h2 className="text-5xl font-black ko-tight text-slate-100 uppercase tracking-tight">리그 리더보드</h2>
           </div>
           <p className="text-slate-500 font-bold mt-1 uppercase text-sm">2025-26 정규시즌 스탯 순위</p>
        </div>
        
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 shadow-lg overflow-x-auto max-w-full custom-scrollbar-hide">
            {STAT_CATS.map(cat => (
                <button
                    key={cat.id}
                    onClick={() => setActiveStat(cat.id)}
                    className={`flex items-center gap-2 px-5 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeStat === cat.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
                >
                    {cat.icon}
                    <span>{cat.id}</span>
                </button>
            ))}
        </div>
      </div>

      {/* Main Table Container */}
      <div className="flex-1 bg-slate-900/60 border border-slate-800 rounded-3xl shadow-2xl backdrop-blur-sm overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
              <table className="w-full text-left border-collapse table-fixed">
                  <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-md z-20 shadow-sm">
                      <tr className="border-b border-slate-800 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          <th className="py-4 px-6 w-[10%] text-center">Rank</th>
                          <th className="py-4 px-6 w-[35%]">Player</th>
                          <th className="py-4 px-4 w-[35%]">Team</th>
                          <th className="py-4 px-4 w-[10%] text-center">POS</th>
                          <th className="py-4 px-6 w-[10%] text-right border-l border-slate-800">{activeStat}</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                      {sortedPlayers.map((p, i) => {
                          const rank = i + 1;
                          const isTop3 = rank <= 3;
                          return (
                              <tr key={p.id} className={`hover:bg-slate-800/40 transition-colors group ${isTop3 ? 'bg-indigo-900/5' : ''}`}>
                                  <td className="py-4 px-6 text-center align-middle">
                                      <span className={`font-black pretendard tracking-tight text-lg ${getRankNumberStyle(rank)}`}>{rank}</span>
                                  </td>
                                  <td className="py-4 px-6 cursor-pointer align-middle" onClick={() => setViewPlayer(p)}>
                                      <div className="flex items-center gap-4">
                                          <div className={getOvrBadgeStyle(p.ovr) + " !w-9 !h-9 !text-sm !mx-0"}>{p.ovr}</div>
                                          <span className={`font-black text-sm truncate max-w-[240px] group-hover:underline underline-offset-4 ${isTop3 ? 'text-white' : 'text-slate-200 group-hover:text-indigo-400'}`}>{p.name}</span>
                                      </div>
                                  </td>
                                  <td className="py-4 px-4 align-middle">
                                      <div className="flex items-center gap-3 opacity-80 group-hover:opacity-100 transition-opacity">
                                          <img src={p.teamLogo} className="w-6 h-6 object-contain" alt="" />
                                          <span className="text-xs font-bold text-slate-400 uppercase tracking-tight">{p.teamCity} {p.teamName}</span>
                                      </div>
                                  </td>
                                  <td className="py-4 px-4 text-center align-middle">
                                      <span className="text-[10px] font-black bg-slate-800 text-slate-400 px-2 py-1 rounded border border-slate-700">{p.position}</span>
                                  </td>
                                  <td className="py-4 px-6 text-right align-middle border-l border-slate-800/50 bg-slate-800/20">
                                      <span className={`font-black pretendard tracking-tight text-lg ${isTop3 ? 'text-white' : 'text-slate-300'}`}>{currentStatDef.format(currentStatDef.getValue(p))}</span>
                                  </td>
                              </tr>
                          );
                      })}
                  </tbody>
              </table>
          </div>
      </div>
    </div>
  );
};
