
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Team, Player } from '../types';
import { getOvrBadgeStyle, PlayerDetailModal } from '../components/SharedComponents';
import { ChevronDown, BarChart3 } from 'lucide-react';

interface LeaderboardViewProps {
  teams: Team[];
}

interface ExtendedPlayer extends Player {
  teamLogo: string;
  teamName: string;
  teamCity: string;
  teamId: string;
}

type StatCategory = 'PTS' | 'REB' | 'ORB' | 'DRB' | 'AST' | 'STL' | 'BLK' | 'FGM' | 'FGA' | 'FG%' | '3PM' | '3PA' | '3P%' | 'FTM' | 'FTA' | 'FT%' | 'TS%';

interface StatDefinition {
  id: StatCategory;
  label: string;
  getValue: (p: Player) => number;
  format: (val: number) => string;
}

const STAT_CATS: StatDefinition[] = [
  { id: 'PTS', label: '득점', getValue: p => p.stats.g > 0 ? p.stats.pts / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'REB', label: '리바운드', getValue: p => p.stats.g > 0 ? p.stats.reb / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'ORB', label: '공격 리바운드', getValue: p => p.stats.g > 0 ? p.stats.offReb / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'DRB', label: '수비 리바운드', getValue: p => p.stats.g > 0 ? p.stats.defReb / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'AST', label: '어시스트', getValue: p => p.stats.g > 0 ? p.stats.ast / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'STL', label: '스틸', getValue: p => p.stats.g > 0 ? p.stats.stl / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'BLK', label: '블록', getValue: p => p.stats.g > 0 ? p.stats.blk / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'FGM', label: '야투 성공', getValue: p => p.stats.g > 0 ? p.stats.fgm / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'FGA', label: '야투 시도', getValue: p => p.stats.g > 0 ? p.stats.fga / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'FG%', label: '야투율', getValue: p => p.stats.fga > 0 ? p.stats.fgm / p.stats.fga : 0, format: v => (v * 100).toFixed(1) + '%' },
  { id: '3PM', label: '3점 성공', getValue: p => p.stats.g > 0 ? p.stats.p3m / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: '3PA', label: '3점 시도', getValue: p => p.stats.g > 0 ? p.stats.p3a / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: '3P%', label: '3점 성공률', getValue: p => p.stats.p3a > 0 ? p.stats.p3m / p.stats.p3a : 0, format: v => (v * 100).toFixed(1) + '%' },
  { id: 'FTM', label: '자유투 성공', getValue: p => p.stats.g > 0 ? p.stats.ftm / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'FTA', label: '자유투 시도', getValue: p => p.stats.g > 0 ? p.stats.fta / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'FT%', label: '자유투 성공률', getValue: p => p.stats.fta > 0 ? p.stats.ftm / p.stats.fta : 0, format: v => (v * 100).toFixed(1) + '%' },
  { 
    id: 'TS%', 
    label: 'TS%', 
    getValue: p => {
        const tsa = p.stats.fga + 0.44 * p.stats.fta;
        return tsa > 0 ? p.stats.pts / (2 * tsa) : 0;
    }, 
    format: v => (v * 100).toFixed(1) + '%' 
  },
];

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({ teams }) => {
  const [activeStat, setActiveStat] = useState<StatCategory>('PTS');
  const [viewPlayer, setViewPlayer] = useState<ExtendedPlayer | null>(null);
  
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    if (activeStat === 'TS%') filtered = filtered.filter(p => (p.stats.fga + 0.44 * p.stats.fta) >= p.stats.g * 3); // Min 3 True Shooting Attempts/G

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
        </div>
        
        <div className="relative z-50" ref={dropdownRef}>
            <button 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-64 h-12 bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-xl px-5 flex items-center justify-between transition-all shadow-lg group"
            >
                <div className="flex items-center gap-3">
                    <span className="text-indigo-400 font-black text-sm">{currentStatDef.id}</span>
                    <div className="h-4 w-[1px] bg-slate-700"></div>
                    <span className="text-slate-300 text-xs font-bold">{currentStatDef.label}</span>
                </div>
                <ChevronDown size={16} className={`text-slate-500 transition-transform group-hover:text-white ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isDropdownOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-96 overflow-y-auto custom-scrollbar p-1">
                    {STAT_CATS.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => { setActiveStat(cat.id); setIsDropdownOpen(false); }}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-lg hover:bg-slate-800 transition-all group ${activeStat === cat.id ? 'bg-indigo-900/30' : ''}`}
                        >
                            <span className={`text-sm font-black ${activeStat === cat.id ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'}`}>{cat.id}</span>
                            <span className="text-xs font-bold text-slate-500 group-hover:text-slate-400">{cat.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
      </div>

      {/* Main Table Container */}
      {/* [Optimization] bg-slate-900/60 -> bg-slate-900/90, removed backdrop-blur */}
      <div className="flex-1 bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col min-h-0">
          {sortedPlayers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-20 text-slate-500">
                  <BarChart3 size={48} className="mb-4 opacity-20" />
                  <p className="text-lg font-black uppercase tracking-widest">No Stats Data</p>
                  <p className="text-xs font-bold mt-2">아직 기록된 시즌 데이터가 없습니다.</p>
              </div>
          ) : (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                  <table className="w-full text-left border-collapse table-fixed">
                      <thead className="sticky top-0 bg-slate-900/95 z-20 shadow-sm">
                          <tr className="border-b border-slate-800 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                              <th className="py-4 px-2 w-[5%] text-center">Rank</th>
                              <th className="py-4 px-6 w-[28%]">Player</th>
                              <th className="py-4 px-4 w-[22%]">Team</th>
                              <th className="py-4 px-2 w-[15%] text-center">POS</th>
                              <th className="py-4 px-4 w-[7.5%] text-right">G</th>
                              <th className="py-4 px-4 w-[7.5%] text-right">GS</th>
                              <th className="py-4 px-4 w-[7.5%] text-right">MP</th>
                              <th className="py-4 px-6 w-[7.5%] text-right">{activeStat}</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                          {sortedPlayers.map((p, i) => {
                              const rank = i + 1;
                              const isTop3 = rank <= 3;
                              const mpg = p.stats.g > 0 ? (p.stats.mp / p.stats.g).toFixed(1) : '0.0';

                              return (
                                  <tr key={p.id} className={`hover:bg-slate-800/40 transition-colors group ${isTop3 ? 'bg-indigo-900/5' : ''}`}>
                                      <td className="py-4 px-2 text-center align-middle">
                                          <span className={`font-black pretendard tracking-tight text-lg ${getRankNumberStyle(rank)}`}>{rank}</span>
                                      </td>
                                      <td className="py-4 px-6 cursor-pointer align-middle" onClick={() => setViewPlayer(p)}>
                                          <div className="flex items-center gap-4">
                                              <div className={getOvrBadgeStyle(p.ovr) + " !w-9 !h-9 !text-lg !mx-0"}>{p.ovr}</div>
                                              <span className={`font-black text-base truncate max-w-[240px] group-hover:underline underline-offset-4 ${isTop3 ? 'text-white' : 'text-slate-200 group-hover:text-indigo-400'}`}>{p.name}</span>
                                          </div>
                                      </td>
                                      <td className="py-4 px-4 align-middle">
                                          <div className="flex items-center gap-3 opacity-80 group-hover:opacity-100 transition-opacity">
                                              <img src={p.teamLogo} className="w-6 h-6 object-contain" alt="" />
                                              <span className="text-base font-bold text-slate-400 uppercase tracking-tight">{p.teamCity} {p.teamName}</span>
                                          </div>
                                      </td>
                                      <td className="py-4 px-2 text-center align-middle">
                                          <span className="text-xs font-black bg-slate-800 text-slate-400 px-2 py-1 rounded border border-slate-700">{p.position}</span>
                                      </td>
                                      <td className="py-4 px-4 text-right align-middle bg-slate-800/20 text-slate-300 font-medium text-base tabular-nums">
                                          {p.stats.g}
                                      </td>
                                      <td className="py-4 px-4 text-right align-middle bg-slate-800/20 text-slate-300 font-medium text-base tabular-nums">
                                          {p.stats.gs}
                                      </td>
                                      <td className="py-4 px-4 text-right align-middle bg-slate-800/20 text-slate-300 font-medium text-base tabular-nums">
                                          {mpg}
                                      </td>
                                      <td className="py-4 px-6 text-right align-middle bg-slate-800/20">
                                          <span className={`font-black pretendard tracking-tight text-base ${isTop3 ? 'text-white' : 'text-slate-300'}`}>{currentStatDef.format(currentStatDef.getValue(p))}</span>
                                      </td>
                                  </tr>
                              );
                          })}
                      </tbody>
                  </table>
              </div>
          )}
      </div>
    </div>
  );
};
