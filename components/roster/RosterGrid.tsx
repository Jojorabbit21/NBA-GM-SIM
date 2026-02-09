
import React, { useState, useMemo } from 'react';
import { Player, Team } from '../../types';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';

interface RosterGridProps {
    team: Team;
    tab: 'roster' | 'stats' | 'salary';
    onPlayerClick: (player: Player) => void;
}

type SortConfig = { key: string; direction: 'asc' | 'desc'; };

// Column Definitions
const ALL_ROSTER_COLUMNS = [
    { key: 'ins', label: 'INS', tooltip: 'Inside Scoring' },
    { key: 'closeShot', label: 'CLS', tooltip: 'Close Shot' },
    { key: 'layup', label: 'LAY', tooltip: 'Layup' },
    { key: 'dunk', label: 'DNK', tooltip: 'Dunk' },
    { key: 'postPlay', label: 'PST', tooltip: 'Post Play' },
    { key: 'out', label: 'OUT', tooltip: 'Outside Scoring' },
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
    { key: 'pf', label: 'PF' }, // Added PF
    { key: 'fg%', label: 'FG%' }, { key: '3p%', label: '3P%' }, { key: 'ft%', label: 'FT%' },
    { key: 'ts%', label: 'TS%' }
];

const SALARY_COLUMNS = [
    { key: 'salary', label: 'SALARY' }, 
    { key: 'contractYears', label: 'YEARS' }, 
    { key: 'totalValue', label: 'TOTAL' },
];

export const RosterGrid: React.FC<RosterGridProps> = ({ team, tab, onPlayerClick }) => {
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'ovr', direction: 'desc' });

    const handleSort = (key: string) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
    };

    const getSortValue = (p: Player, key: string): number | string => {
        // Basic Info
        if (key === 'name') return p.name;
        if (key === 'position') return p.position;
        if (key === 'age') return p.age;
        if (key === 'ovr') return calculatePlayerOvr(p);
        
        // Salary
        if (key === 'salary') return p.salary;
        if (key === 'contractYears') return p.contractYears;
        if (key === 'totalValue') return p.salary * p.contractYears;

        // Attributes
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
        return [...team.roster].sort((a, b) => {
            const aVal = getSortValue(a, sortConfig.key);
            const bVal = getSortValue(b, sortConfig.key);
            
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return sortConfig.direction === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        });
    }, [team.roster, sortConfig]);

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <Table>
                <TableHead>
                    <TableHeaderCell align="left" className="pl-6 w-[220px]">PLAYER NAME</TableHeaderCell>
                    <TableHeaderCell sortable onSort={() => handleSort('position')} sortDirection={sortConfig.key === 'position' ? sortConfig.direction : null} className="w-16">POS</TableHeaderCell>
                    <TableHeaderCell sortable onSort={() => handleSort('age')} sortDirection={sortConfig.key === 'age' ? sortConfig.direction : null} className="w-16">AGE</TableHeaderCell>
                    <TableHeaderCell sortable onSort={() => handleSort('ovr')} sortDirection={sortConfig.key === 'ovr' ? sortConfig.direction : null} className="w-16 border-r border-slate-800/50">OVR</TableHeaderCell>

                    {tab === 'roster' && ALL_ROSTER_COLUMNS.map(col => (
                        <TableHeaderCell 
                            key={col.key} 
                            sortable 
                            onSort={() => handleSort(col.key)} 
                            sortDirection={sortConfig.key === col.key ? sortConfig.direction : null}
                            className="min-w-[40px]"
                            title={col.tooltip}
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
                            className="min-w-[50px]"
                        >
                            {col.label}
                        </TableHeaderCell>
                    ))}

                    {tab === 'salary' && SALARY_COLUMNS.map(col => (
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
                            <TableRow key={p.id} onClick={() => onPlayerClick(p)}>
                                {/* Player Info */}
                                <TableCell className="pl-6 py-3">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-slate-200 group-hover:text-white group-hover:underline transition-colors">{p.name}</span>
                                        {p.health !== 'Healthy' && (
                                            <span className={`text-[9px] font-black uppercase tracking-wider ${p.health === 'Injured' ? 'text-red-500' : 'text-amber-500'}`}>
                                                {p.health} {p.injuryType ? `- ${p.injuryType}` : ''}
                                            </span>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell value={p.position} align="center" className="font-bold text-slate-500" />
                                <TableCell value={p.age} align="center" className="font-bold text-slate-500" />
                                <TableCell align="center" className="border-r border-slate-800/50">
                                    <div className="flex justify-center">
                                        <OvrBadge value={ovr} size="sm" />
                                    </div>
                                </TableCell>

                                {/* Attributes */}
                                {tab === 'roster' && ALL_ROSTER_COLUMNS.map(col => (
                                    <TableCell 
                                        key={col.key} 
                                        variant="attribute" 
                                        value={(p as any)[col.key]} 
                                        colorScale 
                                        className="border-r border-slate-800/30 last:border-0"
                                    />
                                ))}

                                {/* Stats */}
                                {tab === 'stats' && TRADITIONAL_STATS_COLUMNS.map(col => {
                                    let valStr = '';
                                    if (col.key === 'g' || col.key === 'gs') valStr = String(s[col.key as keyof typeof s]);
                                    else if (col.key.includes('%')) {
                                        let n=0, d=0;
                                        if (col.key === 'fg%') { n=s.fgm; d=s.fga; }
                                        if (col.key === '3p%') { n=s.p3m; d=s.p3a; }
                                        if (col.key === 'ft%') { n=s.ftm; d=s.fta; }
                                        if (col.key === 'ts%') { n=s.pts; d=2*(s.fga + 0.44*s.fta); }
                                        valStr = d > 0 ? ((n/d)*100).toFixed(1) + '%' : '-';
                                    } else {
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
    );
};
