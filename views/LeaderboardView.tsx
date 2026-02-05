
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Team, Player } from '../types';
import { getOvrBadgeStyle } from '../components/SharedComponents';
import { PlayerDetailModal } from '../components/PlayerDetailModal';
import { ChevronDown, BarChart3, Trophy, Medal } from 'lucide-react';
import { calculatePlayerOvr } from '../utils/constants';

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
  { id: 'PTS', label: '득점 (Points)', getValue: p => p.stats.g > 0 ? p.stats.pts / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'REB', label: '리바운드 (Rebounds)', getValue: p => p.stats.g > 0 ? p.stats.reb / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'AST', label: '어시스트 (Assists)', getValue: p => p.stats.g > 0 ? p.stats.ast / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'STL', label: '스틸 (Steals)', getValue: p => p.stats.g > 0 ? p.stats.stl / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'BLK', label: '블록 (Blocks)', getValue: p => p.stats.g > 0 ? p.stats.blk / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'FG%', label: '야투율 (FG%)', getValue: p => p.stats.fga > 0 ? p.stats.fgm / p.stats.fga : 0, format: v => (v * 100).toFixed(1) + '%' },
  { id: '3PM', label: '3점 성공 (3PM)', getValue: p => p.stats.g > 0 ? p.stats.p3m / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: '3P%', label: '3점 성공률 (3P%)', getValue: p => p.stats.p3a > 0 ? p.stats.p3m / p.stats.p3a : 0, format: v => (v * 100).toFixed(1) + '%' },
  { id: 'FT%', label: '자유투 성공률 (FT%)', getValue: p => p.stats.fta > 0 ? p.stats.ftm / p.stats.fta : 0, format: v => (v * 100).toFixed(1) + '%' },
  { id: 'TS%', label: 'TS% (True Shooting)', getValue: p => { const tsa = p.stats.fga + 0.44 * p.stats.fta; return tsa > 0 ? p.stats.pts / (2 * tsa) : 0; }, format: v => (v * 100).toFixed(1) + '%' },
  { id: 'ORB', label: '공격 리바 (ORB)', getValue: p => p.stats.g > 0 ? p.stats.offReb / p.stats.g : 0, format: v => v.toFixed(1) },
  { id: 'DRB', label: '수비 리바 (DRB)', getValue: p => p.stats.g > 0 ? p.stats.defReb / p.stats.g : 0, format: v => v.toFixed(1) },
];

// --- Internal Component: Leaderboard Card ---
const LeaderboardCard: React.FC<{
    title?: string;
    defaultStat: StatCategory;
    players: ExtendedPlayer[];
    onPlayerClick: (p: ExtendedPlayer) => void;
}> = ({ defaultStat, players, onPlayerClick }) => {
    const [currentStat, setCurrentStat] = useState<StatCategory>(defaultStat);
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

    const statDef = STAT_CATS.find(s => s.id === currentStat)!;

    const sortedData = useMemo(() => {
        // Filter minimal games to remove noise
        let filtered = players.filter(p => p.stats.g > 0);
        
        // Qualification filters
        if (currentStat === 'FG%') filtered = filtered.filter(p => p.stats.fga >= p.stats.g * 3);
        if (currentStat === '3P%') filtered = filtered.filter(p => p.stats.p3a >= p.stats.g * 1);
        if (currentStat === 'FT%') filtered = filtered.filter(p => p.stats.fta >= p.stats.g * 1);
        
        return filtered.sort((a, b) => statDef.getValue(b) - statDef.getValue(a)).slice(0, 50);
    }, [players, currentStat, statDef]);

    return (
        <div className="flex flex-col bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-xl h-full">
            {/* Card Header with Dropdown */}
            <div className="px-5 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between sticky top-0 z-30">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-800/50 rounded-lg text-indigo-400">
                        <BarChart3 size={18} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">RANKING</span>
                        <span className="text-sm font-black text-white uppercase tracking-tight">{statDef.id} Leaders</span>
                    </div>
                </div>
                
                <div className="relative" ref={dropdownRef}>
                    <button 
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-colors border border-slate-700"
                    >
                        <span>Change</span>
                        <ChevronDown size={12} />
                    </button>
                    
                    {isDropdownOpen && (
                        <div className="absolute right-0 top-full mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden max-h-80 overflow-y-auto custom-scrollbar p-1">
                            {STAT_CATS.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => { setCurrentStat(cat.id); setIsDropdownOpen(false); }}
                                    className={`w-full text-left px-3 py-2.5 rounded-lg text-[11px] font-bold uppercase transition-colors flex justify-between items-center ${currentStat === cat.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                                >
                                    <span>{cat.label}</span>
                                    {currentStat === cat.id && <div className="w-1.5 h-1.5 rounded-full bg-white"></div>}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Table Body - No Scroll here, expands naturally */}
            <div className="flex-1">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-950/50 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5">
                        <tr>
                            <th className="py-3 pl-5 w-12 text-center">#</th>
                            <th className="py-3 px-2">Player</th>
                            <th className="py-3 pr-5 text-right">Value</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {sortedData.map((p, i) => {
                            const rank = i + 1;
                            const ovr = calculatePlayerOvr(p);
                            const isTop3 = rank <= 3;
                            
                            let rankColor = 'text-slate-500';
                            let rankIcon = null;
                            
                            if (rank === 1) { rankColor = 'text-yellow-400'; rankIcon = <Trophy size={12} className="text-yellow-500 fill-yellow-500 mb-0.5" />; }
                            else if (rank === 2) { rankColor = 'text-slate-300'; rankIcon = <Medal size={12} className="text-slate-300 fill-slate-300 mb-0.5" />; }
                            else if (rank === 3) { rankColor = 'text-amber-600'; rankIcon = <Medal size={12} className="text-amber-700 fill-amber-700 mb-0.5" />; }

                            return (
                                <tr key={p.id} className={`group transition-colors ${isTop3 ? 'bg-slate-900/40 hover:bg-slate-800/60' : 'hover:bg-slate-900'}`}>
                                    <td className="py-3 pl-5 text-center">
                                        <div className="flex flex-col items-center justify-center">
                                            {rankIcon}
                                            <span className={`text-sm font-black ${rankColor} font-mono leading-none`}>{rank}</span>
                                        </div>
                                    </td>
                                    <td className="py-3 px-2 cursor-pointer" onClick={() => onPlayerClick(p)}>
                                        <div className="flex items-center gap-3">
                                            <div className={getOvrBadgeStyle(ovr) + " !w-8 !h-8 !text-xs !mx-0"}>{ovr}</div>
                                            <div className="flex flex-col min-w-0">
                                                <span className={`text-xs font-bold truncate group-hover:text-indigo-400 group-hover:underline ${isTop3 ? 'text-white' : 'text-slate-300'}`}>{p.name}</span>
                                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                                                    <span>{p.position}</span>
                                                    <span className="w-0.5 h-0.5 bg-slate-600 rounded-full"></span>
                                                    <div className="flex items-center gap-1">
                                                        <img src={p.teamLogo} className="w-3 h-3 object-contain opacity-70" alt="" />
                                                        <span>{p.teamName}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-3 pr-5 text-right">
                                        <span className={`text-base font-black font-mono tabular-nums ${isTop3 ? 'text-white' : 'text-slate-400'}`}>
                                            {statDef.format(statDef.getValue(p))}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {sortedData.length === 0 && (
                    <div className="py-12 text-center text-slate-600 text-xs font-bold">
                        데이터가 없습니다.
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Main View ---
export const LeaderboardView: React.FC<LeaderboardViewProps> = ({ teams }) => {
  const [viewPlayer, setViewPlayer] = useState<ExtendedPlayer | null>(null);
  
  const flatPlayers = useMemo(() => {
    return teams.flatMap(t => t.roster.map(p => ({ ...p, teamLogo: t.logo, teamName: t.name, teamCity: t.city, teamId: t.id }))) as ExtendedPlayer[];
  }, [teams]);

  return (
    <div className="flex flex-col animate-in fade-in duration-500 ko-normal pb-20">
      {viewPlayer && <PlayerDetailModal player={{...viewPlayer, ovr: calculatePlayerOvr(viewPlayer)}} teamName={viewPlayer.teamName} teamId={viewPlayer.teamId} onClose={() => setViewPlayer(null)} />}
      
      {/* Header - Simple Title */}
      <div className="flex flex-col mb-8 border-b border-slate-800 pb-6">
           <div className="flex items-center gap-3">
             <h2 className="text-4xl lg:text-5xl font-black ko-tight text-slate-100 uppercase tracking-tight">리그 리더보드</h2>
           </div>
           <p className="text-sm font-bold text-slate-500 mt-2 ml-1">2025-26 시즌 카테고리별 선수 순위 (Top 50)</p>
      </div>

      {/* Grid of 3 Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <LeaderboardCard 
              defaultStat="PTS" 
              players={flatPlayers} 
              onPlayerClick={setViewPlayer} 
          />
          <LeaderboardCard 
              defaultStat="REB" 
              players={flatPlayers} 
              onPlayerClick={setViewPlayer} 
          />
          <LeaderboardCard 
              defaultStat="AST" 
              players={flatPlayers} 
              onPlayerClick={setViewPlayer} 
          />
      </div>
    </div>
  );
};
