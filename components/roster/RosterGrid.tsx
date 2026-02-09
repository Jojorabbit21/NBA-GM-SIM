
import React, { useState, useMemo } from 'react';
import { Player, Team } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { OvrBadge } from '../common/OvrBadge';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell, TableFoot } from '../common/Table';
import { ArrowUp, ArrowDown } from 'lucide-react';

interface RosterGridProps {
    team: Team;
    tab: 'roster' | 'stats' | 'salary';
    onPlayerClick: (player: Player) => void;
}

type SortConfig = { key: string; direction: 'asc' | 'desc'; };

// --- Column Configurations ---
// Attribute Groups
const ATTR_GROUPS = [
    {
        id: 'INS', label: 'INSIDE', color: 'text-orange-400',
        main: { key: 'ins', label: 'INS' },
        subs: [
            { key: 'closeShot', label: 'CLS' }, { key: 'layup', label: 'LAY' },
            { key: 'dunk', label: 'DNK' }, { key: 'postPlay', label: 'PST' },
            { key: 'drawFoul', label: 'DRF' }, { key: 'hands', label: 'HND' }
        ]
    },
    {
        id: 'OUT', label: 'OUTSIDE', color: 'text-indigo-400',
        main: { key: 'out', label: 'OUT' },
        subs: [
            { key: 'midRange', label: 'MID' }, { key: 'threeCorner', label: '3PT' },
            { key: 'ft', label: 'FT' }, { key: 'shotIq', label: 'IQ' }, { key: 'offConsist', label: 'CN' }
        ]
    },
    {
        id: 'PLM', label: 'PLAYMAKING', color: 'text-yellow-400',
        main: { key: 'plm', label: 'PLM' },
        subs: [
            { key: 'passAcc', label: 'PAC' }, { key: 'handling', label: 'HDL' },
            { key: 'spdBall', label: 'SPB' }, { key: 'passVision', label: 'VIS' }, { key: 'passIq', label: 'PIQ' }
        ]
    },
    {
        id: 'DEF', label: 'DEFENSE', color: 'text-slate-300',
        main: { key: 'def', label: 'DEF' },
        subs: [
            { key: 'intDef', label: 'INT' }, { key: 'perDef', label: 'PER' },
            { key: 'steal', label: 'STL' }, { key: 'blk', label: 'BLK' },
            { key: 'helpDefIq', label: 'HLP' }, { key: 'passPerc', label: 'PPC' }, { key: 'defConsist', label: 'DCN' }
        ]
    },
    {
        id: 'REB', label: 'REBOUND', color: 'text-emerald-400',
        main: { key: 'reb', label: 'REB' },
        subs: [
            { key: 'offReb', label: 'ORB' }, { key: 'defReb', label: 'DRB' }
        ]
    },
    {
        id: 'ATH', label: 'ATHLETIC', color: 'text-teal-400',
        main: { key: 'ath', label: 'ATH' },
        subs: [
            { key: 'speed', label: 'SPD' }, { key: 'agility', label: 'AGI' },
            { key: 'strength', label: 'STR' }, { key: 'vertical', label: 'VRT' },
            { key: 'stamina', label: 'STA' }, { key: 'hustle', label: 'HUS' }, { key: 'durability', label: 'DUR' }
        ]
    }
];

const STATS_COLS = [
    { key: 'g', label: 'G', w: 40 }, { key: 'gs', label: 'GS', w: 40 }, { key: 'mp', label: 'MIN', w: 50 },
    { key: 'pts', label: 'PTS', w: 50 }, 
    { key: 'reb', label: 'REB', w: 50 }, { key: 'offReb', label: 'ORB', w: 45 }, { key: 'defReb', label: 'DRB', w: 45 },
    { key: 'ast', label: 'AST', w: 50 }, { key: 'stl', label: 'STL', w: 45 }, { key: 'blk', label: 'BLK', w: 45 },
    { key: 'tov', label: 'TOV', w: 45 }, { key: 'pf', label: 'PF', w: 40 },
    { key: 'fgm', label: 'FGM', w: 45 }, { key: 'fga', label: 'FGA', w: 45 }, { key: 'fg%', label: 'FG%', w: 60 },
    { key: '3pm', label: '3PM', w: 45 }, { key: '3pa', label: '3PA', w: 45 }, { key: '3p%', label: '3P%', w: 60 },
    { key: 'ftm', label: 'FTM', w: 45 }, { key: 'fta', label: 'FTA', w: 45 }, { key: 'ft%', label: 'FT%', w: 60 },
    { key: 'ts%', label: 'TS%', w: 60 }, { key: 'pm', label: '+/-', w: 50 }
];

const ZONE_ZONES = [
    { id: 'rim', label: 'RIM' }, { id: 'paint', label: 'PAINT' },
    { id: 'mid_l', label: 'MID-L' }, { id: 'mid_c', label: 'MID-C' }, { id: 'mid_r', label: 'MID-R' },
    { id: 'atb3_l', label: 'ATB-L' }, { id: 'atb3_c', label: 'ATB-C' }, { id: 'atb3_r', label: 'ATB-R' },
    { id: 'c3_l', label: 'CRN-L' }, { id: 'c3_r', label: 'CRN-R' }
];

const SALARY_COLS = [
    { key: 'salary', label: 'THIS YEAR' }, 
    { key: 'contractYears', label: 'YEARS' }, 
    { key: 'totalValue', label: 'TOTAL REMAINING' },
];

export const RosterGrid: React.FC<RosterGridProps> = ({ team, tab, onPlayerClick }) => {
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'ovr', direction: 'desc' });

    const handleSort = (key: string) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
    };

    const getSortValue = (p: Player, key: string): number | string => {
        // Basic
        if (key === 'name') return p.name;
        if (key === 'position') return p.position;
        if (key === 'age') return p.age;
        if (key === 'ovr') return calculatePlayerOvr(p);
        
        // Attributes
        if (key in p) return (p as any)[key];

        // Salary
        if (key === 'salary') return p.salary;
        if (key === 'contractYears') return p.contractYears;
        if (key === 'totalValue') return p.salary * p.contractYears;

        // Stats
        const s = p.stats;
        const g = s.g || 1;
        
        // Per Game Stats
        if (['pts','reb','offReb','defReb','ast','stl','blk','tov','pf'].includes(key)) return s[key as keyof typeof s] / g;
        if (key === 'mp') return s.mp / g;
        if (key === 'pm') return s.plusMinus / g;
        if (key === 'g') return s.g;
        if (key === 'gs') return s.gs;
        
        // Percentages
        if (key === 'fg%') return s.fga > 0 ? s.fgm / s.fga : 0;
        if (key === '3p%') return s.p3a > 0 ? s.p3m / s.p3a : 0;
        if (key === 'ft%') return s.fta > 0 ? s.ftm / s.fta : 0;
        if (key === 'ts%') { const tsa = s.fga + 0.44 * s.fta; return tsa > 0 ? s.pts / (2 * tsa) : 0; }
        
        // Totals
        if (['fgm','fga','3pm','3pa','ftm','fta'].includes(key)) {
            const map: any = { '3pm': 'p3m', '3pa': 'p3a' };
            return s[map[key] || key as keyof typeof s];
        }

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

    // Calculate Averages / Totals
    const averages = useMemo(() => {
        const count = team.roster.length || 1;
        const totalSalary = team.roster.reduce((s, p) => s + p.salary, 0);

        const attrAvg: any = {};
        const allAttrKeys = ATTR_GROUPS.flatMap(g => [g.main.key, ...g.subs.map(s => s.key)]);
        allAttrKeys.push('ovr', 'age');
        
        allAttrKeys.forEach(k => {
            if (k === 'ovr') attrAvg[k] = Math.round(team.roster.reduce((sum, p) => sum + calculatePlayerOvr(p), 0) / count);
            else attrAvg[k] = Math.round(team.roster.reduce((sum, p) => sum + ((p as any)[k] || 0), 0) / count);
        });
        
        const statAvg: any = {};
        STATS_COLS.forEach(c => {
            const k = c.key;
            let sum = 0;
            team.roster.forEach(p => {
                sum += Number(getSortValue(p, k));
            });
            
            if (k.includes('%')) {
                let num=0, den=0;
                team.roster.forEach(p => {
                    const s = p.stats;
                    if (k==='fg%') { num+=s.fgm; den+=s.fga; }
                    else if (k==='3p%') { num+=s.p3m; den+=s.p3a; }
                    else if (k==='ft%') { num+=s.ftm; den+=s.fta; }
                    else if (k==='ts%') { num+=s.pts; den+=2*(s.fga+0.44*s.fta); }
                });
                statAvg[k] = den > 0 ? (num/den) : 0;
            } else {
                statAvg[k] = sum;
                if (k === 'g' || k === 'gs') statAvg[k] = sum / count;
            }
        });

        // Zone Totals
        const zoneTotals: any = {};
        ZONE_ZONES.forEach(z => {
            let m=0, a=0;
            team.roster.forEach(p => {
                 m += (p.stats as any)[`zone_${z.id}_m`] || 0;
                 a += (p.stats as any)[`zone_${z.id}_a`] || 0;
            });
            zoneTotals[`zone_${z.id}_m`] = m;
            zoneTotals[`zone_${z.id}_a`] = a;
        });

        return { attr: attrAvg, stat: statAvg, salary: totalSalary, zone: zoneTotals };
    }, [team.roster]);

    // Sticky Column Config
    const COL_W = { NAME: 180, POS: 50, AGE: 50, OVR: 50 };
    const LEFT_POS = COL_W.NAME;
    const LEFT_AGE = COL_W.NAME + COL_W.POS;
    const LEFT_OVR = COL_W.NAME + COL_W.POS + COL_W.AGE;

    return (
        <div className="space-y-12 pb-10">
            {/* Main Table Container */}
            <Table>
                <TableHead noRow>
                    <tr>
                        {/* Sticky Headers */}
                        <TableHeaderCell 
                            style={{ left: 0, width: COL_W.NAME }} 
                            stickyLeft 
                            onClick={() => handleSort('name')} 
                            sortable sortDirection={sortConfig.key === 'name' ? sortConfig.direction : null}
                            className="pl-4 text-left border-r border-slate-800"
                        >
                            PLAYER NAME
                        </TableHeaderCell>
                        <TableHeaderCell 
                            style={{ left: LEFT_POS, width: COL_W.POS }} 
                            stickyLeft
                            onClick={() => handleSort('position')}
                            sortable sortDirection={sortConfig.key === 'position' ? sortConfig.direction : null}
                            className="border-r border-slate-800"
                        >
                            POS
                        </TableHeaderCell>
                        <TableHeaderCell 
                            style={{ left: LEFT_AGE, width: COL_W.AGE }}
                            stickyLeft
                            onClick={() => handleSort('age')}
                            sortable sortDirection={sortConfig.key === 'age' ? sortConfig.direction : null}
                            className="border-r border-slate-800"
                        >
                            AGE
                        </TableHeaderCell>
                        <TableHeaderCell 
                            style={{ left: LEFT_OVR, width: COL_W.OVR }}
                            stickyLeft
                            onClick={() => handleSort('ovr')}
                            sortable sortDirection={sortConfig.key === 'ovr' ? sortConfig.direction : null}
                            className="border-r border-slate-800 shadow-[4px_0_5px_rgba(0,0,0,0.3)]"
                        >
                            OVR
                        </TableHeaderCell>

                        {/* Attribute Tabs */}
                        {tab === 'roster' && ATTR_GROUPS.map(g => (
                            <React.Fragment key={g.id}>
                                <TableHeaderCell 
                                    width={45} onClick={() => handleSort(g.main.key)} 
                                    sortable sortDirection={sortConfig.key === g.main.key ? sortConfig.direction : null}
                                    className={`border-r border-slate-800 ${g.color}`}
                                >
                                    {g.main.label}
                                </TableHeaderCell>
                                {g.subs.map((sub, idx) => (
                                    <TableHeaderCell 
                                        key={sub.key} width={40} onClick={() => handleSort(sub.key)}
                                        sortable sortDirection={sortConfig.key === sub.key ? sortConfig.direction : null}
                                        className={idx === g.subs.length - 1 ? 'border-r border-slate-800/60' : 'border-r border-slate-800/30 text-slate-600'}
                                    >
                                        {sub.label}
                                    </TableHeaderCell>
                                ))}
                            </React.Fragment>
                        ))}

                        {/* Stats Tab */}
                        {tab === 'stats' && STATS_COLS.map(c => (
                            <TableHeaderCell 
                                key={c.key} width={c.w} onClick={() => handleSort(c.key)}
                                sortable sortDirection={sortConfig.key === c.key ? sortConfig.direction : null}
                                className="border-r border-slate-800/30"
                            >
                                {c.label}
                            </TableHeaderCell>
                        ))}

                        {/* Salary Tab */}
                        {tab === 'salary' && SALARY_COLS.map(c => (
                            <TableHeaderCell 
                                key={c.key} width={100} onClick={() => handleSort(c.key)}
                                sortable sortDirection={sortConfig.key === c.key ? sortConfig.direction : null}
                                className="border-r border-slate-800/30"
                            >
                                {c.label}
                            </TableHeaderCell>
                        ))}
                    </tr>
                </TableHead>
                <TableBody>
                    {sortedRoster.map(p => (
                        <TableRow key={p.id} onClick={() => onPlayerClick(p)}>
                            {/* Sticky Columns */}
                            <TableCell style={{ left: 0, width: COL_W.NAME }} className="pl-4 border-r border-slate-800 bg-slate-900 group-hover:bg-slate-800 transition-colors z-30" stickyLeft>
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-slate-200 truncate group-hover:text-indigo-300">{p.name}</span>
                                    {p.health !== 'Healthy' && (
                                        <span className={`text-[9px] font-black uppercase ${p.health === 'Injured' ? 'text-red-500' : 'text-amber-500'}`}>
                                            {p.health}
                                        </span>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell style={{ left: LEFT_POS, width: COL_W.POS }} className="border-r border-slate-800 text-slate-500 font-bold text-xs bg-slate-900 group-hover:bg-slate-800 transition-colors z-30 text-center" stickyLeft>
                                {p.position}
                            </TableCell>
                            <TableCell style={{ left: LEFT_AGE, width: COL_W.AGE }} className="border-r border-slate-800 text-slate-500 font-bold text-xs bg-slate-900 group-hover:bg-slate-800 transition-colors z-30 text-center" stickyLeft>
                                {p.age}
                            </TableCell>
                            <TableCell style={{ left: LEFT_OVR, width: COL_W.OVR }} className="border-r border-slate-800 shadow-[4px_0_5px_rgba(0,0,0,0.3)] bg-slate-900 group-hover:bg-slate-800 transition-colors z-30 text-center" stickyLeft>
                                <div className="flex justify-center">
                                    <OvrBadge value={calculatePlayerOvr(p)} size="sm" className="!w-7 !h-7 !text-xs !shadow-none" />
                                </div>
                            </TableCell>

                            {/* Attribute Cells */}
                            {tab === 'roster' && ATTR_GROUPS.map(g => (
                                <React.Fragment key={g.id}>
                                    <TableCell className={`font-black font-mono border-r border-slate-800/50 ${g.color} bg-slate-900/30 text-center`} value={(p as any)[g.main.key]} variant="attribute" />
                                    {g.subs.map((sub, idx) => (
                                        <TableCell key={sub.key} className={`font-bold font-mono text-slate-500 text-[11px] text-center ${idx === g.subs.length - 1 ? 'border-r border-slate-800/50' : ''}`} value={(p as any)[sub.key]} variant="text" />
                                    ))}
                                </React.Fragment>
                            ))}

                            {/* Stats Cells */}
                            {tab === 'stats' && STATS_COLS.map(c => (
                                <TableCell key={c.key} className="font-mono font-bold text-xs text-slate-300 text-center" value={getSortValue(p, c.key)} variant="stat" />
                            ))}

                            {/* Salary Cells */}
                            {tab === 'salary' && (
                                <>
                                    <TableCell className="font-mono font-bold text-xs text-emerald-400 text-center" value={`$${p.salary.toFixed(1)}M`} />
                                    <TableCell className="font-mono font-bold text-xs text-slate-400 text-center" value={`${p.contractYears} yrs`} />
                                    <TableCell className="font-mono font-bold text-xs text-slate-300 text-center" value={`$${(p.salary * p.contractYears).toFixed(1)}M`} />
                                </>
                            )}
                        </TableRow>
                    ))}
                </TableBody>
                <TableFoot>
                    <tr>
                        <TableCell style={{ left: 0, width: COL_W.NAME }} className="pl-4 text-left border-r border-slate-800 bg-slate-950 font-black text-slate-500 text-xs z-30" stickyLeft>
                            {tab === 'stats' ? 'TEAM TOTAL' : 'TEAM AVG'}
                        </TableCell>
                        <TableCell style={{ left: LEFT_POS, width: COL_W.POS }} className="border-r border-slate-800 bg-slate-950 text-center text-slate-600 z-30" stickyLeft>-</TableCell>
                        <TableCell style={{ left: LEFT_AGE, width: COL_W.AGE }} className="border-r border-slate-800 bg-slate-950 text-center font-bold text-slate-500 text-xs z-30" stickyLeft>{averages.attr.age}</TableCell>
                        <TableCell style={{ left: LEFT_OVR, width: COL_W.OVR }} className="border-r border-slate-800 bg-slate-950 shadow-[4px_0_5px_rgba(0,0,0,0.3)] z-30 text-center" stickyLeft>
                            <div className="flex justify-center">
                                <OvrBadge value={averages.attr.ovr} size="sm" className="!w-7 !h-7 !text-xs !shadow-none opacity-80" />
                            </div>
                        </TableCell>

                        {tab === 'roster' && ATTR_GROUPS.map(g => (
                            <React.Fragment key={g.id}>
                                <TableCell className={`font-black font-mono border-r border-slate-800 ${g.color} text-center`} value={averages.attr[g.main.key]} variant="attribute" />
                                {g.subs.map((sub, idx) => (
                                    <TableCell key={sub.key} className={`font-bold font-mono text-slate-600 text-[11px] text-center ${idx === g.subs.length - 1 ? 'border-r border-slate-800' : ''}`} value={averages.attr[sub.key]} variant="text" />
                                ))}
                            </React.Fragment>
                        ))}
                        
                        {tab === 'stats' && STATS_COLS.map(c => {
                            let val = averages.stat[c.key];
                            if (typeof val === 'number') {
                                if (c.key.includes('%')) val = (val * 100).toFixed(1) + '%';
                                else if (c.key === 'g' || c.key === 'gs' || c.key === 'mp' || c.key === 'pm') val = val.toFixed(1);
                                else val = val.toFixed(1);
                            }
                            return <TableCell key={c.key} className="font-mono font-black text-xs text-slate-400 text-center" value={val} variant="stat" />;
                        })}

                        {tab === 'salary' && (
                            <TableCell colSpan={3} className="py-2 px-4 text-right font-black font-mono text-emerald-400" value={`TOTAL: $${averages.salary.toFixed(1)}M`} />
                        )}
                    </tr>
                </TableFoot>
            </Table>

            {/* Zone Stats Table (Only visible in Stats Tab) */}
            {tab === 'stats' && (
                <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center gap-2 pl-2">
                        <span className="w-1.5 h-6 bg-indigo-500 rounded-full"></span>
                        <h3 className="text-lg font-black text-white uppercase tracking-tight">상세 야투 구역별 기록 (Zone Shooting)</h3>
                    </div>
                    
                    <Table>
                        <TableHead noRow>
                            <tr>
                                {/* Sticky Placeholders for Header 1 */}
                                <TableHeaderCell style={{ left: 0, width: COL_W.NAME }} className="border-r border-slate-800 bg-slate-950 z-40" stickyLeft>{null}</TableHeaderCell>
                                <TableHeaderCell style={{ left: LEFT_POS, width: COL_W.POS }} className="border-r border-slate-800 bg-slate-950 z-40" stickyLeft>{null}</TableHeaderCell>
                                <TableHeaderCell style={{ left: LEFT_AGE, width: COL_W.AGE }} className="border-r border-slate-800 bg-slate-950 z-40" stickyLeft>{null}</TableHeaderCell>
                                <TableHeaderCell style={{ left: LEFT_OVR, width: COL_W.OVR }} className="border-r border-slate-800 bg-slate-950 z-40 shadow-[4px_0_5px_rgba(0,0,0,0.3)]" stickyLeft>{null}</TableHeaderCell>
                                
                                {ZONE_ZONES.map(z => (
                                    <th key={z.id} colSpan={3} className="py-2 px-2 text-center border-r-2 border-slate-800 bg-slate-900/50">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{z.label}</span>
                                    </th>
                                ))}
                            </tr>
                            <tr>
                                {/* Sticky Headers for Row 2 */}
                                <TableHeaderCell style={{ left: 0, width: COL_W.NAME }} className="pl-4 text-left border-r border-slate-800 bg-slate-950 z-40" stickyLeft onClick={() => handleSort('name')}>PLAYER NAME</TableHeaderCell>
                                <TableHeaderCell style={{ left: LEFT_POS, width: COL_W.POS }} className="border-r border-slate-800 bg-slate-950 z-40" stickyLeft>POS</TableHeaderCell>
                                <TableHeaderCell style={{ left: LEFT_AGE, width: COL_W.AGE }} className="border-r border-slate-800 bg-slate-950 z-40" stickyLeft>AGE</TableHeaderCell>
                                <TableHeaderCell style={{ left: LEFT_OVR, width: COL_W.OVR }} className="border-r border-slate-800 bg-slate-950 z-40 shadow-[4px_0_5px_rgba(0,0,0,0.3)]" stickyLeft>OVR</TableHeaderCell>
                                
                                {ZONE_ZONES.map(z => (
                                    <React.Fragment key={z.id}>
                                        <th className="py-1 px-1 text-[9px] font-bold text-slate-600 bg-slate-950 border-b border-r border-slate-800/30">M</th>
                                        <th className="py-1 px-1 text-[9px] font-bold text-slate-600 bg-slate-950 border-b border-r border-slate-800/30">A</th>
                                        <th className="py-1 px-1 text-[9px] font-bold text-slate-500 bg-slate-950 border-b border-r-2 border-slate-800">%</th>
                                    </React.Fragment>
                                ))}
                            </tr>
                        </TableHead>
                        <TableBody>
                            {sortedRoster.map(p => (
                                <TableRow key={`zone-${p.id}`} onClick={() => onPlayerClick(p)}>
                                    <TableCell style={{ left: 0, width: COL_W.NAME }} className="pl-4 border-r border-slate-800 bg-slate-900 group-hover:bg-slate-800 transition-colors z-30" stickyLeft>
                                        <span className="text-sm font-bold text-slate-200 truncate group-hover:text-indigo-300">{p.name}</span>
                                    </TableCell>
                                    <TableCell style={{ left: LEFT_POS, width: COL_W.POS }} className="border-r border-slate-800 text-slate-500 font-bold text-xs bg-slate-900 group-hover:bg-slate-800 transition-colors z-30 text-center" stickyLeft>{p.position}</TableCell>
                                    <TableCell style={{ left: LEFT_AGE, width: COL_W.AGE }} className="border-r border-slate-800 text-slate-500 font-bold text-xs bg-slate-900 group-hover:bg-slate-800 transition-colors z-30 text-center" stickyLeft>{p.age}</TableCell>
                                    <TableCell style={{ left: LEFT_OVR, width: COL_W.OVR }} className="border-r border-slate-800 shadow-[4px_0_5px_rgba(0,0,0,0.3)] bg-slate-900 group-hover:bg-slate-800 transition-colors z-30 text-center" stickyLeft>
                                        <div className="flex justify-center"><OvrBadge value={calculatePlayerOvr(p)} size="sm" className="!w-7 !h-7 !text-xs !shadow-none" /></div>
                                    </TableCell>

                                    {ZONE_ZONES.map(z => {
                                        const m = (p.stats as any)[`zone_${z.id}_m`] || 0;
                                        const a = (p.stats as any)[`zone_${z.id}_a`] || 0;
                                        const pct = a > 0 ? (m / a * 100).toFixed(0) : '-';
                                        const pctNum = a > 0 ? m/a : 0;
                                        
                                        let colorClass = 'text-slate-500';
                                        if (a > 0) {
                                            if (pctNum >= 0.5) colorClass = 'text-emerald-400';
                                            else if (pctNum >= 0.35) colorClass = 'text-slate-300';
                                            else colorClass = 'text-red-400';
                                        }

                                        return (
                                            <React.Fragment key={z.id}>
                                                <TableCell className="font-mono text-[10px] text-slate-400 text-center" value={m} />
                                                <TableCell className="font-mono text-[10px] text-slate-500 text-center" value={a} />
                                                <TableCell className={`font-mono font-bold text-xs border-r-2 border-slate-800/50 text-center ${colorClass}`} value={pct} />
                                            </React.Fragment>
                                        );
                                    })}
                                </TableRow>
                            ))}
                        </TableBody>
                        <TableFoot>
                            <tr>
                                <TableCell style={{ left: 0, width: COL_W.NAME }} className="pl-4 text-left border-r border-slate-800 bg-slate-950 font-black text-slate-500 text-xs z-30" stickyLeft>TEAM TOTAL</TableCell>
                                <TableCell style={{ left: LEFT_POS, width: COL_W.POS }} className="border-r border-slate-800 bg-slate-950 z-30" stickyLeft></TableCell>
                                <TableCell style={{ left: LEFT_AGE, width: COL_W.AGE }} className="border-r border-slate-800 bg-slate-950 z-30" stickyLeft></TableCell>
                                <TableCell style={{ left: LEFT_OVR, width: COL_W.OVR }} className="border-r border-slate-800 bg-slate-950 shadow-[4px_0_5px_rgba(0,0,0,0.3)] z-30" stickyLeft></TableCell>
                                
                                {ZONE_ZONES.map(z => {
                                    const m = averages.zone[`zone_${z.id}_m`];
                                    const a = averages.zone[`zone_${z.id}_a`];
                                    const pct = a > 0 ? (m / a * 100).toFixed(0) + '%' : '-';
                                    
                                    return (
                                        <React.Fragment key={z.id}>
                                            <TableCell className="font-mono font-bold text-[10px] text-slate-400 text-center" value={m} />
                                            <TableCell className="font-mono font-bold text-[10px] text-slate-500 text-center" value={a} />
                                            <TableCell className="font-mono font-black text-xs text-indigo-400 border-r-2 border-slate-800 text-center" value={pct} />
                                        </React.Fragment>
                                    );
                                })}
                            </tr>
                        </TableFoot>
                    </Table>
                </div>
            )}
        </div>
    );
};
