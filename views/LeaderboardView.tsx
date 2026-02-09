
import React, { useState, useMemo } from 'react';
import { Team, Player } from '../types';
import { OvrBadge } from '../components/common/OvrBadge';
import { PlayerDetailModal } from '../components/PlayerDetailModal';
import { ChevronDown, BarChart3, Trophy, Medal } from 'lucide-react';
import { calculatePlayerOvr } from '../utils/constants';
import { PageHeader } from '../components/common/PageHeader';
import { Dropdown } from '../components/common/Dropdown';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/common/Table';

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

    const dropdownItems = useMemo(() => STAT_CATS.map(cat => ({
        id: cat.id,
        label: (
             <div className="flex justify-between items-center w-full">
                <span>{cat.label}</span>
                {currentStat === cat.id && <div className="w-1.5 h-1.5 rounded-full bg-white"></div>}
            </div>
        ),
        onClick: () => setCurrentStat(cat.id),
        active: currentStat === cat.id
    })), [currentStat]);

    return (
        <div className="flex flex-col bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl h-full">
            {/* Card Header with Dropdown (Matched with StandingTable Title Bar) */}
            <div className="bg-slate-800/40 px-5 py-4 border-b border-slate-800 flex items-center justify-between sticky top-0 z-30 rounded-t-xl">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-white uppercase tracking-wider oswald">{statDef.label}</span>
                </div>
                
                <Dropdown
                    items={dropdownItems}
                    width="w-48"
                    trigger={
                        <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/60 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-black uppercase transition-colors border border-slate-700/50">
                            <span>카테고리</span>
                            <ChevronDown size={12} />
                        </button>
                    }
                />
            </div>

            {/* Table Body */}
            <div className="flex-1">
                <Table className="rounded-none border-0 shadow-none">
                    <TableHead className="rounded-none bg-slate-950/50">
                        <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest h-10">
                            <TableHeaderCell align="center" className="pl-4 w-10 !rounded-none border-none">#</TableHeaderCell>
                            <TableHeaderCell align="left" className="px-2 border-none">TEAM / PLAYER</TableHeaderCell>
                            <TableHeaderCell align="right" className="pr-4 border-none">{statDef.id}</TableHeaderCell>
                        </tr>
                    </TableHead>
                    <TableBody>
                        {sortedData.map((p, i) => {
                            const rank = i + 1;
                            const ovr = calculatePlayerOvr(p);
                            const isTop3 = rank <= 3;
                            
                            let rankColor = 'text-slate-500';
                            let rankIcon = null;
                            
                            if (rank === 1) { rankColor = 'text-yellow-400'; rankIcon = <Trophy size={10} className="text-yellow-500 fill-yellow-500 mb-0.5" />; }
                            else if (rank === 2) { rankColor = 'text-slate-300'; rankIcon = <Medal size={10} className="text-slate-300 fill-slate-300 mb-0.5" />; }
                            else if (rank === 3) { rankColor = 'text-amber-600'; rankIcon = <Medal size={10} className="text-amber-700 fill-amber-700 mb-0.5" />; }

                            const rowClass = isTop3 ? 'bg-slate-900/40' : '';

                            return (
                                <TableRow key={p.id} className={rowClass}>
                                    <TableCell align="center" className="pl-4">
                                        <div className="flex flex-col items-center justify-center">
                                            {rankIcon}
                                            <span className={`text-xs font-black ${rankColor} font-mono leading-none`}>{rank}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-2" onClick={() => onPlayerClick(p)}>
                                        <div className="flex items-center gap-3">
                                            <OvrBadge value={ovr} size="sm" className="!w-7 !h-7 !text-xs !mx-0" />
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className={`text-xs font-bold truncate group-hover:text-indigo-400 group-hover:underline ${isTop3 ? 'text-white' : 'text-slate-300'}`}>{p.name}</span>
                                                <span className="text-[10px] text-slate-600">|</span>
                                                <span className="text-[10px] font-bold text-slate-500">{p.position}</span>
                                                <span className="text-[10px] text-slate-600">|</span>
                                                <span className="text-[10px] font-bold text-slate-500 truncate max-w-[80px]">{p.teamName}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell align="right" className="pr-4">
                                        <span className={`text-sm font-black font-mono tabular-nums ${isTop3 ? 'text-white' : 'text-slate-400'}`}>
                                            {statDef.format(statDef.getValue(p))}
                                        </span>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {sortedData.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={3} className="py-12 text-center text-slate-600 text-xs font-bold uppercase tracking-widest">
                                    No Data Recorded
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
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
      {viewPlayer && <PlayerDetailModal player={{...viewPlayer, ovr: calculatePlayerOvr(viewPlayer)}} teamName={viewPlayer.teamName} teamId={viewPlayer.teamId} onClose={() => setViewPlayer(null)} allTeams={teams} />}
      
      <PageHeader 
        title="리그 리더보드" 
        description="2025-26 시즌 카테고리별 선수 순위 (Top 50)"
        icon={<BarChart3 size={24} />}
      />

      {/* Grid of 3 Cards - Added margin top to match StandingsView */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start mt-8">
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
