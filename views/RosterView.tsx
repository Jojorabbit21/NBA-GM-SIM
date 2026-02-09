
import React, { useState, useMemo, useEffect } from 'react';
import { Users } from 'lucide-react';
import { Team, Player } from '../types';
import { PlayerDetailModal } from '../components/PlayerDetailModal';
import { calculatePlayerOvr } from '../utils/constants';
import { 
    Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell 
} from '../components/common/Table';
import { PageHeader } from '../components/common/PageHeader';
import { Dropdown, DropdownButton } from '../components/common/Dropdown';
import { TeamLogo } from '../components/common/TeamLogo';
import { SalaryCapDashboard } from '../components/roster/SalaryCapDashboard';
import { OvrBadge } from '../components/common/OvrBadge';

interface RosterViewProps {
  allTeams: Team[];
  myTeamId: string;
  initialTeamId?: string | null;
}

// Columns Definitions
const ALL_ROSTER_COLUMNS = [
    { key: 'ins', label: 'INS', tooltip: 'Inside' },
    { key: 'closeShot', label: 'CLS', tooltip: 'Close Shot' },
    { key: 'layup', label: 'LAY', tooltip: 'Layup' },
    { key: 'dunk', label: 'DNK', tooltip: 'Dunk' },
    { key: 'postPlay', label: 'PST', tooltip: 'Post Play' },
    { key: 'out', label: 'OUT', tooltip: 'Outside' },
    { key: 'midRange', label: 'MID', tooltip: 'Mid-Range' },
    { key: 'threeCorner', label: '3PT', tooltip: '3-Point' },
    { key: 'ft', label: 'FT', tooltip: 'Free Throw' },
    { key: 'plm', label: 'PLM', tooltip: 'Playmaking' },
    { key: 'passAcc', label: 'PAS', tooltip: 'Passing' },
    { key: 'handling', label: 'HDL', tooltip: 'Handling' },
    { key: 'def', label: 'DEF', tooltip: 'Defense' },
    { key: 'perDef', label: 'PER', tooltip: 'Perimeter Def' },
    { key: 'intDef', label: 'INT', tooltip: 'Interior Def' },
    { key: 'steal', label: 'STL', tooltip: 'Steal' },
    { key: 'blk', label: 'BLK', tooltip: 'Block' },
    { key: 'reb', label: 'REB', tooltip: 'Rebound' },
    { key: 'ath', label: 'ATH', tooltip: 'Athleticism' },
    { key: 'speed', label: 'SPD', tooltip: 'Speed' },
    { key: 'stamina', label: 'STA', tooltip: 'Stamina' },
];

const TRADITIONAL_STATS_COLUMNS = [
  { key: 'g', label: 'GP' }, { key: 'gs', label: 'GS' }, { key: 'mp', label: 'MIN' }, 
  { key: 'pts', label: 'PTS' }, { key: 'reb', label: 'REB' }, { key: 'ast', label: 'AST' }, 
  { key: 'stl', label: 'STL' }, { key: 'blk', label: 'BLK' }, { key: 'tov', label: 'TOV' }, 
  { key: 'fg%', label: 'FG%' }, { key: '3p%', label: '3P%' }, { key: 'ft%', label: 'FT%' },
  { key: 'ts%', label: 'TS%' }, { key: 'pf', label: 'PF' }
];

const SALARY_COLUMNS = [
  { key: 'age', label: 'AGE' }, 
  { key: 'salary', label: 'SALARY' }, 
  { key: 'contractYears', label: 'YEARS' }, 
  { key: 'totalValue', label: 'TOTAL' },
];

type SortConfig = { key: string; direction: 'asc' | 'desc'; };

export const RosterView: React.FC<RosterViewProps> = ({ allTeams, myTeamId, initialTeamId }) => {
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId || myTeamId);
  const [tab, setTab] = useState<'roster' | 'stats' | 'salary'>('roster');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'ovr', direction: 'desc' });
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);

  useEffect(() => { if (initialTeamId) setSelectedTeamId(initialTeamId); }, [initialTeamId]);

  const selectedTeam = allTeams.find(t => t.id === selectedTeamId);

  // Sorting Logic
  const handleSort = (key: string) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
  };

  const getSortValue = (p: Player, key: string): number | string => {
      // Basic & Salary
      if (key === 'name') return p.name;
      if (key === 'position') return p.position; // Simplification
      if (key === 'age') return p.age;
      if (key === 'ovr') return calculatePlayerOvr(p);
      if (key === 'salary') return p.salary;
      if (key === 'contractYears') return p.contractYears;
      if (key === 'totalValue') return p.salary * p.contractYears;
      
      // Attributes (Direct access)
      if (key in p) return (p as any)[key];

      // Stats
      const s = p.stats;
      const g = s.g || 1;
      if (key === 'g') return s.g;
      if (key === 'gs') return s.gs;
      if (key === 'mp') return s.mp / g;
      if (key === 'pts') return s.pts / g;
      if (key === 'reb') return s.reb / g;
      if (key === 'ast') return s.ast / g;
      if (key === 'stl') return s.stl / g;
      if (key === 'blk') return s.blk / g;
      if (key === 'tov') return s.tov / g;
      if (key === 'pf') return (s.pf || 0) / g;
      if (key === 'fg%') return s.fga > 0 ? s.fgm / s.fga : 0;
      if (key === '3p%') return s.p3a > 0 ? s.p3m / s.p3a : 0;
      if (key === 'ft%') return s.fta > 0 ? s.ftm / s.fta : 0;
      if (key === 'ts%') { const tsa = s.fga + 0.44 * s.fta; return tsa > 0 ? s.pts / (2 * tsa) : 0; }
      
      return 0;
  };

  const sortedRoster = useMemo(() => {
    if (!selectedTeam) return [];
    return [...selectedTeam.roster].sort((a, b) => {
      const aVal = getSortValue(a, sortConfig.key);
      const bVal = getSortValue(b, sortConfig.key);
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortConfig.direction === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [selectedTeam, sortConfig]);

  const teamStats = useMemo(() => {
    if (!selectedTeam) return null;
    const roster = selectedTeam.roster;
    const totalSalary = roster.reduce((sum, p) => sum + p.salary, 0);
    const totalAge = roster.reduce((sum, p) => sum + p.age, 0);
    return { 
        salary: totalSalary, 
        age: (totalAge / (roster.length || 1)).toFixed(1),
        count: roster.length
    };
  }, [selectedTeam]);

  // Dropdown Items
  const teamItems = useMemo(() => allTeams.map(t => ({
      id: t.id,
      label: (
          <div className="flex items-center gap-3">
              <TeamLogo teamId={t.id} size="sm" />
              <span className="uppercase">{t.city} {t.name}</span>
          </div>
      ),
      onClick: () => setSelectedTeamId(t.id),
      active: selectedTeamId === t.id
  })), [allTeams, selectedTeamId]);


  if (!selectedTeam) return null;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-20">
      {viewPlayer && (
        <PlayerDetailModal 
            player={{...viewPlayer, ovr: calculatePlayerOvr(viewPlayer)}} 
            teamName={selectedTeam.name} 
            teamId={selectedTeam.id} 
            onClose={() => setViewPlayer(null)} 
            allTeams={allTeams} 
        />
      )}

      {/* 1. Header */}
      <PageHeader 
        title="Team Roster" 
        description="선수단 구성 및 기록 확인"
        icon={<Users size={24} />}
        actions={
            <Dropdown 
                trigger={
                    <DropdownButton 
                        label={`${selectedTeam.city} ${selectedTeam.name}`} 
                        icon={<TeamLogo teamId={selectedTeam.id} size="sm" />} 
                    />
                }
                items={teamItems}
                align="right"
                width="w-72"
            />
        }
      />

      {/* 2. Salary Cap Info (Only on Salary Tab) */}
      {tab === 'salary' && teamStats && <SalaryCapDashboard currentTotalSalary={teamStats.salary} />}

      {/* 3. Tab Navigation */}
      <div className="flex bg-slate-950 rounded-xl p-1.5 border border-slate-800 w-fit">
          {['roster', 'stats', 'salary'].map((t) => (
             <button 
                key={t}
                onClick={() => setTab(t as any)} 
                className={`px-8 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${tab === t ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
                {t === 'roster' ? '능력치' : t === 'stats' ? '기록' : '샐러리'}
            </button>
          ))}
      </div>

      {/* 4. Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <Table>
            <TableHead>
                <TableHeaderCell align="left" className="pl-6 w-[200px]">PLAYER NAME</TableHeaderCell>
                <TableHeaderCell sortable onSort={() => handleSort('position')} sortDirection={sortConfig.key === 'position' ? sortConfig.direction : null}>POS</TableHeaderCell>
                <TableHeaderCell sortable onSort={() => handleSort('age')} sortDirection={sortConfig.key === 'age' ? sortConfig.direction : null}>AGE</TableHeaderCell>
                <TableHeaderCell sortable onSort={() => handleSort('ovr')} sortDirection={sortConfig.key === 'ovr' ? sortConfig.direction : null}>OVR</TableHeaderCell>

                {tab === 'roster' && ALL_ROSTER_COLUMNS.map(col => (
                    <TableHeaderCell 
                        key={col.key} 
                        sortable 
                        onSort={() => handleSort(col.key)} 
                        sortDirection={sortConfig.key === col.key ? sortConfig.direction : null}
                    >
                        {col.label}
                    </TableHeaderCell>
                ))}
                
                {tab === 'stats' && TRADITIONAL_STATS_COLUMNS.map(col => (
                    <TableHeaderCell 
                        key={col.key} 
                        sortable 
                        onSort={() => handleSort(col.key)} 
                        sortDirection={sortConfig.key === col.key ? sortConfig.direction : null}
                        align="right"
                    >
                        {col.label}
                    </TableHeaderCell>
                ))}

                {tab === 'salary' && SALARY_COLUMNS.slice(1).map(col => (
                    <TableHeaderCell 
                        key={col.key} 
                        sortable 
                        onSort={() => handleSort(col.key)} 
                        sortDirection={sortConfig.key === col.key ? sortConfig.direction : null}
                        align="right"
                        width="150px"
                    >
                        {col.label}
                    </TableHeaderCell>
                ))}
            </TableHead>
            
            <TableBody>
                {sortedRoster.map(p => {
                    const ovr = calculatePlayerOvr(p);
                    const s = p.stats;
                    const g = s.g || 1;

                    return (
                        <TableRow key={p.id} onClick={() => setViewPlayer(p)}>
                            {/* Player Info */}
                            <TableCell 
                                variant="player" 
                                value={p.name} 
                                subText={p.health !== 'Healthy' ? `${p.health}` : undefined}
                                className="pl-6"
                                onClick={() => setViewPlayer(p)}
                            />
                            <TableCell value={p.position} align="center" className="font-bold text-slate-500" />
                            <TableCell value={p.age} align="center" className="font-bold text-slate-500" />
                            <TableCell variant="ovr" value={ovr} />

                            {/* Attributes */}
                            {tab === 'roster' && ALL_ROSTER_COLUMNS.map(col => (
                                <TableCell 
                                    key={col.key} 
                                    variant="attribute" 
                                    value={(p as any)[col.key]} 
                                    colorScale 
                                />
                            ))}

                            {/* Stats */}
                            {tab === 'stats' && TRADITIONAL_STATS_COLUMNS.map(col => {
                                let valStr = '';
                                if (col.key === 'g' || col.key === 'gs') valStr = String(s[col.key as keyof typeof s]);
                                else if (col.key.includes('%')) {
                                    // Percentages
                                    let n=0, d=0;
                                    if (col.key === 'fg%') { n=s.fgm; d=s.fga; }
                                    if (col.key === '3p%') { n=s.p3m; d=s.p3a; }
                                    if (col.key === 'ft%') { n=s.ftm; d=s.fta; }
                                    if (col.key === 'ts%') { n=s.pts; d=2*(s.fga+0.44*s.fta); }
                                    valStr = d > 0 ? ((n/d)*100).toFixed(1) + '%' : '-';
                                } else {
                                    // Per Game Stats
                                    const statKey = col.key as keyof typeof s;
                                    if (s[statKey] !== undefined) valStr = (Number(s[statKey])/g).toFixed(1);
                                }
                                return <TableCell key={col.key} variant="stat" value={valStr} />;
                            })}

                            {/* Salary */}
                            {tab === 'salary' && (
                                <>
                                    <TableCell variant="stat" value={`$${p.salary.toFixed(1)}M`} />
                                    <TableCell variant="stat" value={`${p.contractYears} yrs`} />
                                    <TableCell variant="stat" value={`$${(p.salary * p.contractYears).toFixed(1)}M`} />
                                </>
                            )}
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
      </div>
    </div>
  );
};
