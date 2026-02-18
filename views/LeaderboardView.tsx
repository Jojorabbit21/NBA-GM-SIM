
import React, { useState, useMemo } from 'react';
import { Team, Player, Game } from '../types';
import { OvrBadge } from '../components/common/OvrBadge';
import { PlayerDetailModal } from '../components/PlayerDetailModal';
import { BarChart2, ChevronLeft, ChevronRight, Zap, Filter, Calendar, X, Plus, ChevronDown } from 'lucide-react';
import { calculatePlayerOvr } from '../utils/constants';
import { PageHeader } from '../components/common/PageHeader';
import { TeamLogo } from '../components/common/TeamLogo';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/common/Table';

interface LeaderboardViewProps {
  teams: Team[];
  schedule?: Game[];
}

type SortKey = 'name' | 'team' | 'position' | 'ovr' | 'g' | 'mp' | 'pts' | 'pa' | 'reb' | 'oreb' | 'dreb' | 'ast' | 'stl' | 'blk' | 'tov' | 'fg%' | 'fgm' | 'fga' | '3p%' | '3pm' | '3pa' | 'ft%' | 'ftm' | 'fta' | 'ts%' | 'pm' | 'wins' | 'losses' | 'winPct';
type ViewMode = 'Players' | 'Teams';
type Operator = '>' | '<' | '>=' | '<=' | '=';

interface FilterItem {
    id: string;
    type: 'stat' | 'date';
    category?: string;
    operator?: Operator;
    value?: number | string;
    label: string;
}

const ITEMS_PER_PAGE = 50;

// Column Widths
const WIDTHS = {
    RANK: 50,
    NAME: 200,   // Reduced slightly to fit more cols
    POS: 50,
    OVR: 50,
    STAT: 50,    // Reduced standard stat width
    PCT: 60,     // Percentages need a bit more
    // New Team Columns
    W: 40,
    L: 40,
};

const STAT_OPTIONS = [
    { value: 'pts', label: 'PTS' },
    { value: 'reb', label: 'REB' },
    { value: 'oreb', label: 'OREB' },
    { value: 'dreb', label: 'DREB' },
    { value: 'ast', label: 'AST' },
    { value: 'stl', label: 'STL' },
    { value: 'blk', label: 'BLK' },
    { value: 'tov', label: 'TOV' },
    { value: 'fgm', label: 'FGM' },
    { value: 'fga', label: 'FGA' },
    { value: 'fg%', label: 'FG%' },
    { value: '3pm', label: '3PM' },
    { value: '3pa', label: '3PA' },
    { value: '3p%', label: '3P%' },
    { value: 'ftm', label: 'FTM' },
    { value: 'fta', label: 'FTA' },
    { value: 'ovr', label: 'OVR' },
];

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({ teams, schedule = [] }) => {
  const [mode, setMode] = useState<ViewMode>('Players');
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'pts', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [showHeatmap, setShowHeatmap] = useState(true);

  // --- Filter State ---
  const [activeFilters, setActiveFilters] = useState<FilterItem[]>([]);
  
  // Stat Filter Inputs
  const [filterCat, setFilterCat] = useState('pts');
  const [filterOp, setFilterOp] = useState<Operator>('>=');
  const [filterVal, setFilterVal] = useState('');

  // Date Filter Inputs
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  // --- Filter Logic ---

  const addStatFilter = () => {
      if (!filterVal) return;
      const catLabel = STAT_OPTIONS.find(o => o.value === filterCat)?.label || filterCat;
      const newItem: FilterItem = {
          id: Date.now().toString(),
          type: 'stat',
          category: filterCat,
          operator: filterOp,
          value: parseFloat(filterVal),
          label: `${catLabel} ${filterOp} ${filterVal}`
      };
      setActiveFilters([...activeFilters, newItem]);
      setFilterVal(''); // Reset input
  };

  const addDateFilter = () => {
      if (!dateStart || !dateEnd) return;
      // Remove existing date filters to avoid conflict
      const cleanFilters = activeFilters.filter(f => f.type !== 'date');
      const newItem: FilterItem = {
          id: Date.now().toString(),
          type: 'date',
          value: JSON.stringify({ start: dateStart, end: dateEnd }),
          label: `${dateStart} ~ ${dateEnd}`
      };
      setActiveFilters([...cleanFilters, newItem]);
      setDateStart('');
      setDateEnd('');
  };

  const removeFilter = (id: string) => {
      setActiveFilters(activeFilters.filter(f => f.id !== id));
  };

  // --- Data Processing ---

  // 1. Flatten Players
  const allPlayers = useMemo(() => {
    return teams.flatMap(t => 
        t.roster.map(p => ({ 
            ...p, 
            teamId: t.id, 
            teamName: t.name,
            teamCity: t.city
        }))
    );
  }, [teams]);

  // 2. Aggregate Team Stats
  const teamStats = useMemo(() => {
    // Check for active date filter
    const dateFilter = activeFilters.find(f => f.type === 'date');
    let targetSchedule = schedule;

    if (dateFilter && typeof dateFilter.value === 'string') {
        const { start, end } = JSON.parse(dateFilter.value);
        // Robust string comparison for YYYY-MM-DD
        targetSchedule = schedule.filter(g => {
            const gDate = g.date; // Assuming YYYY-MM-DD
            return gDate >= start && gDate <= end;
        });
    }

    return teams.map(t => {
        // Calculate precise scoring stats from schedule
        const teamGames = targetSchedule.filter(g => g.played && (g.homeTeamId === t.id || g.awayTeamId === t.id));
        const playedCount = teamGames.length || 1; // Avoid divide by zero if 0 games found in range
        
        let totalPts = 0;
        let totalPa = 0;
        let wins = 0;
        let losses = 0;
        
        teamGames.forEach(g => {
            let myScore = 0;
            let oppScore = 0;
            if (g.homeTeamId === t.id) {
                myScore = g.homeScore || 0;
                oppScore = g.awayScore || 0;
                totalPts += myScore;
                totalPa += oppScore;
            } else {
                myScore = g.awayScore || 0;
                oppScore = g.homeScore || 0;
                totalPts += myScore;
                totalPa += oppScore;
            }
            if (myScore > oppScore) wins++;
            else losses++;
        });

        // Aggregate other stats from roster
        const totals = t.roster.reduce((acc, p) => ({
            reb: acc.reb + p.stats.reb,
            offReb: acc.offReb + (p.stats.offReb || 0),
            defReb: acc.defReb + (p.stats.defReb || 0),
            ast: acc.ast + p.stats.ast,
            stl: acc.stl + p.stats.stl,
            blk: acc.blk + p.stats.blk,
            tov: acc.tov + p.stats.tov,
            fgm: acc.fgm + p.stats.fgm,
            fga: acc.fga + p.stats.fga,
            p3m: acc.p3m + p.stats.p3m,
            p3a: acc.p3a + p.stats.p3a,
            ftm: acc.ftm + p.stats.ftm,
            fta: acc.fta + p.stats.fta,
        }), { reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0 });

        const tsa = totals.fga + 0.44 * totals.fta;
        
        return {
            ...t,
            wins, // Override with filtered wins
            losses, // Override with filtered losses
            stats: {
                g: playedCount,
                mp: 48,
                pts: totalPts / playedCount,
                pa: totalPa / playedCount,
                
                // Aggregated stats per game
                reb: totals.reb / (t.wins + t.losses || 1), 
                oreb: totals.offReb / (t.wins + t.losses || 1),
                dreb: totals.defReb / (t.wins + t.losses || 1),
                ast: totals.ast / (t.wins + t.losses || 1),
                stl: totals.stl / (t.wins + t.losses || 1),
                blk: totals.blk / (t.wins + t.losses || 1),
                tov: totals.tov / (t.wins + t.losses || 1),
                
                fgm: totals.fgm / (t.wins + t.losses || 1),
                fga: totals.fga / (t.wins + t.losses || 1),
                fgPct: totals.fga > 0 ? totals.fgm / totals.fga : 0,
                
                p3m: totals.p3m / (t.wins + t.losses || 1),
                p3a: totals.p3a / (t.wins + t.losses || 1),
                p3Pct: totals.p3a > 0 ? totals.p3m / totals.p3a : 0,
                
                ftm: totals.ftm / (t.wins + t.losses || 1),
                fta: totals.fta / (t.wins + t.losses || 1),
                ftPct: totals.fta > 0 ? totals.ftm / totals.fta : 0,
                
                tsPct: tsa > 0 ? (totalPts / playedCount) / (2 * (tsa/playedCount)) : 0, 
                pm: (totalPts - totalPa) / playedCount,
            }
        };
    });
  }, [teams, schedule, activeFilters]);

  // 3. Calculate Global Min/Max for Color Scale (Heatmap)
  const statRanges = useMemo(() => {
    const ranges: Record<string, { min: number, max: number }> = {};
    const update = (k: string, v: number) => {
        if (!ranges[k]) ranges[k] = { min: v, max: v };
        else {
            ranges[k].min = Math.min(ranges[k].min, v);
            ranges[k].max = Math.max(ranges[k].max, v);
        }
    };

    if (mode === 'Players') {
        allPlayers.forEach(p => {
            const s = p.stats;
            const g = s.g || 1;
            update('g', s.g);
            update('mp', s.mp / g);
            update('pts', s.pts / g);
            update('reb', s.reb / g);
            update('oreb', (s.offReb || 0) / g);
            update('dreb', (s.defReb || 0) / g);
            update('ast', s.ast / g);
            update('stl', s.stl / g);
            update('blk', s.blk / g);
            update('tov', s.tov / g);
            
            update('fgm', s.fgm / g);
            update('fga', s.fga / g);
            update('fg%', s.fga > 0 ? s.fgm / s.fga : 0);
            
            update('3pm', s.p3m / g);
            update('3pa', s.p3a / g);
            update('3p%', s.p3a > 0 ? s.p3m / s.p3a : 0);
            
            update('ftm', s.ftm / g);
            update('fta', s.fta / g);
            update('ft%', s.fta > 0 ? s.ftm / s.fta : 0);
            
            const tsa = s.fga + 0.44 * s.fta;
            update('ts%', tsa > 0 ? s.pts / (2 * tsa) : 0);
            update('pm', s.plusMinus / g);
        });
    } else {
        teamStats.forEach(t => {
            const s = t.stats;
            update('wins', t.wins);
            update('losses', t.losses);
            update('winPct', (t.wins + t.losses) > 0 ? t.wins / (t.wins + t.losses) : 0);
            update('pts', s.pts);
            update('pa', s.pa);
            update('reb', s.reb);
            update('oreb', s.oreb);
            update('dreb', s.dreb);
            update('ast', s.ast);
            update('stl', s.stl);
            update('blk', s.blk);
            update('tov', s.tov);
            
            update('fgm', s.fgm);
            update('fga', s.fga);
            update('fg%', s.fgPct);
            
            update('3pm', s.p3m);
            update('3pa', s.p3a);
            update('3p%', s.p3Pct);
            
            update('ftm', s.ftm);
            update('fta', s.fta);
            update('ft%', s.ftPct);
            
            update('ts%', s.tsPct);
            update('pm', s.pm);
        });
    }
    return ranges;
  }, [mode, allPlayers, teamStats]);

  const getBgStyle = (key: string, value: number) => {
    if (!showHeatmap) return undefined;
    if (key === 'g' || key === 'mp') return undefined; // No heatmap for G/MIN

    const range = statRanges[key];
    if (!range || range.max === range.min) return undefined;
    
    // Normalize value to 0..1
    let ratio = (value - range.min) / (range.max - range.min);
    ratio = Math.max(0, Math.min(1, ratio));

    // Determine if "Higher is Better" or "Lower is Better"
    // Inverse Stats: TOV, Losses, PA (Points Against)
    const isInverse = ['tov', 'losses', 'pa'].includes(key);

    let color = '';
    let opacity = 0;

    if (isInverse) {
        if (ratio < 0.5) {
            color = '16, 185, 129'; // Emerald
            opacity = (0.5 - ratio) * 2 * 0.5;
        } else {
            color = '239, 68, 68'; // Red
            opacity = (ratio - 0.5) * 2 * 0.5;
        }
    } else {
        if (ratio > 0.5) {
            color = '16, 185, 129'; // Emerald
            opacity = (ratio - 0.5) * 2 * 0.5;
        } else {
            color = '239, 68, 68'; // Red
            opacity = (0.5 - ratio) * 2 * 0.5;
        }
    }
    
    if (opacity < 0.05) return undefined;

    return { backgroundColor: `rgba(${color}, ${opacity})` };
  };

  const handleSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
        direction = 'asc';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };

  const sortedData = useMemo(() => {
    // Explicitly type data as any[] to avoid TS union array mismatch errors
    let data: any[] = mode === 'Players' ? [...allPlayers.filter(p => p.stats.g > 0)] : [...teamStats];

    // --- APPLY STAT FILTERS ---
    if (activeFilters.length > 0) {
        data = data.filter(item => {
            return activeFilters.every(filter => {
                if (filter.type !== 'stat') return true; 
                
                let itemVal = 0;
                
                if (mode === 'Players') {
                    const p = item as Player;
                    const g = p.stats.g || 1;
                    if (filter.category === 'pts') itemVal = p.stats.pts / g;
                    else if (filter.category === 'reb') itemVal = p.stats.reb / g;
                    else if (filter.category === 'oreb') itemVal = (p.stats.offReb || 0) / g;
                    else if (filter.category === 'dreb') itemVal = (p.stats.defReb || 0) / g;
                    else if (filter.category === 'ast') itemVal = p.stats.ast / g;
                    else if (filter.category === 'stl') itemVal = p.stats.stl / g;
                    else if (filter.category === 'blk') itemVal = p.stats.blk / g;
                    else if (filter.category === 'tov') itemVal = p.stats.tov / g;
                    
                    else if (filter.category === 'fgm') itemVal = p.stats.fgm / g;
                    else if (filter.category === 'fga') itemVal = p.stats.fga / g;
                    else if (filter.category === 'fg%') itemVal = (p.stats.fga > 0 ? p.stats.fgm / p.stats.fga : 0) * 100;
                    
                    else if (filter.category === '3pm') itemVal = p.stats.p3m / g;
                    else if (filter.category === '3pa') itemVal = p.stats.p3a / g;
                    else if (filter.category === '3p%') itemVal = (p.stats.p3a > 0 ? p.stats.p3m / p.stats.p3a : 0) * 100;
                    
                    else if (filter.category === 'ftm') itemVal = p.stats.ftm / g;
                    else if (filter.category === 'fta') itemVal = p.stats.fta / g;
                    else if (filter.category === 'ovr') itemVal = calculatePlayerOvr(p);
                } else {
                    const t = item as typeof teamStats[0];
                    if (filter.category === 'pts') itemVal = t.stats.pts;
                    else if (filter.category === 'reb') itemVal = t.stats.reb;
                    else if (filter.category === 'oreb') itemVal = t.stats.oreb;
                    else if (filter.category === 'dreb') itemVal = t.stats.dreb;
                    else if (filter.category === 'ast') itemVal = t.stats.ast;
                    else if (filter.category === 'stl') itemVal = t.stats.stl;
                    else if (filter.category === 'blk') itemVal = t.stats.blk;
                    else if (filter.category === 'tov') itemVal = t.stats.tov;
                    
                    else if (filter.category === 'fgm') itemVal = t.stats.fgm;
                    else if (filter.category === 'fga') itemVal = t.stats.fga;
                    else if (filter.category === 'fg%') itemVal = t.stats.fgPct * 100;
                    
                    else if (filter.category === '3pm') itemVal = t.stats.p3m;
                    else if (filter.category === '3pa') itemVal = t.stats.p3a;
                    else if (filter.category === '3p%') itemVal = t.stats.p3Pct * 100;
                    
                    else if (filter.category === 'ftm') itemVal = t.stats.ftm;
                    else if (filter.category === 'fta') itemVal = t.stats.fta;
                }

                const criteria = filter.value as number;

                switch (filter.operator) {
                    case '>': return itemVal > criteria;
                    case '<': return itemVal < criteria;
                    case '>=': return itemVal >= criteria;
                    case '<=': return itemVal <= criteria;
                    case '=': return Math.abs(itemVal - criteria) < 0.1;
                    default: return true;
                }
            });
        });
    }

    return data.sort((a, b) => {
        let valA: number | string = 0;
        let valB: number | string = 0;

        if (mode === 'Players') {
            const pA = a as Player;
            const pB = b as Player;
            const gA = pA.stats.g || 1;
            const gB = pB.stats.g || 1;

            switch (sortConfig.key) {
                case 'name': valA = pA.name; valB = pB.name; break;
                case 'position': valA = pA.position; valB = pB.position; break;
                case 'ovr': valA = calculatePlayerOvr(pA); valB = calculatePlayerOvr(pB); break;
                case 'team': valA = (pA as any).teamCity; valB = (pB as any).teamCity; break; 
                case 'g': valA = pA.stats.g; valB = pB.stats.g; break;
                case 'mp': valA = pA.stats.mp / gA; valB = pB.stats.mp / gB; break;
                case 'pts': valA = pA.stats.pts / gA; valB = pB.stats.pts / gB; break;
                case 'reb': valA = pA.stats.reb / gA; valB = pB.stats.reb / gB; break;
                case 'oreb': valA = (pA.stats.offReb || 0) / gA; valB = (pB.stats.offReb || 0) / gB; break;
                case 'dreb': valA = (pA.stats.defReb || 0) / gA; valB = (pB.stats.defReb || 0) / gB; break;
                case 'ast': valA = pA.stats.ast / gA; valB = pB.stats.ast / gB; break;
                case 'stl': valA = pA.stats.stl / gA; valB = pB.stats.stl / gB; break;
                case 'blk': valA = pA.stats.blk / gA; valB = pB.stats.blk / gB; break;
                case 'tov': valA = pA.stats.tov / gA; valB = pB.stats.tov / gB; break;
                case 'fgm': valA = pA.stats.fgm / gA; valB = pB.stats.fgm / gB; break;
                case 'fga': valA = pA.stats.fga / gA; valB = pB.stats.fga / gB; break;
                case 'fg%': valA = pA.stats.fga > 0 ? pA.stats.fgm / pA.stats.fga : 0; valB = pB.stats.fga > 0 ? pB.stats.fgm / pB.stats.fga : 0; break;
                case '3pm': valA = pA.stats.p3m / gA; valB = pB.stats.p3m / gB; break;
                case '3pa': valA = pA.stats.p3a / gA; valB = pB.stats.p3a / gB; break;
                case '3p%': valA = pA.stats.p3a > 0 ? pA.stats.p3m / pA.stats.p3a : 0; valB = pB.stats.p3a > 0 ? pB.stats.p3m / pB.stats.p3a : 0; break;
                case 'ftm': valA = pA.stats.ftm / gA; valB = pB.stats.ftm / gB; break;
                case 'fta': valA = pA.stats.fta / gA; valB = pB.stats.fta / gB; break;
                case 'ft%': valA = pA.stats.fta > 0 ? pA.stats.ftm / pA.stats.fta : 0; valB = pB.stats.fta > 0 ? pB.stats.ftm / pB.stats.fta : 0; break;
                case 'ts%': {
                    const tsaA = pA.stats.fga + 0.44 * pA.stats.fta;
                    const tsaB = pB.stats.fga + 0.44 * pB.stats.fta;
                    valA = tsaA > 0 ? pA.stats.pts / (2 * tsaA) : 0;
                    valB = tsaB > 0 ? pB.stats.pts / (2 * tsaB) : 0;
                    break;
                }
                case 'pm': valA = pA.stats.plusMinus / gA; valB = pB.stats.plusMinus / gB; break;
            }
        } else {
            const tA = a as typeof teamStats[0];
            const tB = b as typeof teamStats[0];
            
            switch (sortConfig.key) {
                case 'name': valA = tA.city; valB = tB.city; break;
                case 'wins': valA = tA.wins; valB = tB.wins; break;
                case 'losses': valA = tA.losses; valB = tB.losses; break;
                case 'winPct': 
                    valA = (tA.wins + tA.losses) > 0 ? tA.wins / (tA.wins + tA.losses) : 0;
                    valB = (tB.wins + tB.losses) > 0 ? tB.wins / (tB.wins + tB.losses) : 0;
                    break;
                case 'g': valA = tA.stats.g; valB = tB.stats.g; break;
                case 'mp': valA = tA.stats.mp; valB = tB.stats.mp; break;
                case 'pts': valA = tA.stats.pts; valB = tB.stats.pts; break;
                case 'pa': valA = tA.stats.pa; valB = tB.stats.pa; break;
                case 'reb': valA = tA.stats.reb; valB = tB.stats.reb; break;
                case 'oreb': valA = tA.stats.oreb; valB = tB.stats.oreb; break;
                case 'dreb': valA = tA.stats.dreb; valB = tB.stats.dreb; break;
                case 'ast': valA = tA.stats.ast; valB = tB.stats.ast; break;
                case 'stl': valA = tA.stats.stl; valB = tB.stats.stl; break;
                case 'blk': valA = tA.stats.blk; valB = tB.stats.blk; break;
                case 'tov': valA = tA.stats.tov; valB = tB.stats.tov; break;
                
                case 'fgm': valA = tA.stats.fgm; valB = tB.stats.fgm; break;
                case 'fga': valA = tA.stats.fga; valB = tB.stats.fga; break;
                case 'fg%': valA = tA.stats.fgPct; valB = tB.stats.fgPct; break;
                
                case '3pm': valA = tA.stats.p3m; valB = tB.stats.p3m; break;
                case '3pa': valA = tA.stats.p3a; valB = tB.stats.p3a; break;
                case '3p%': valA = tA.stats.p3Pct; valB = tB.stats.p3Pct; break;
                
                case 'ftm': valA = tA.stats.ftm; valB = tB.stats.ftm; break;
                case 'fta': valA = tA.stats.fta; valB = tB.stats.fta; break;
                case 'ft%': valA = tA.stats.ftPct; valB = tB.stats.ftPct; break;
                
                case 'ts%': valA = tA.stats.tsPct; valB = tB.stats.tsPct; break;
                case 'pm': valA = tA.stats.pm; valB = tB.stats.pm; break;
            }
        }

        if (typeof valA === 'string' && typeof valB === 'string') {
            return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return sortConfig.direction === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
  }, [allPlayers, teamStats, mode, sortConfig, activeFilters]);

  const totalPages = Math.ceil(sortedData.length / ITEMS_PER_PAGE);
  const currentData = sortedData.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // --- Rendering Helpers ---

  const formatStat = (val: number, isPct: boolean = false) => {
      if (isPct) return (val * 100).toFixed(1) + '%';
      return val.toFixed(1);
  };

  const SortHeader = ({ label, sKey, width, align }: { label: string, sKey: SortKey, width?: number, align?: 'left'|'center'|'right' }) => (
      <TableHeaderCell 
        align={align || 'center'} 
        width={width}
        sortable 
        onSort={() => handleSort(sKey)} 
        sortDirection={sortConfig.key === sKey ? sortConfig.direction : null}
        className={`border-r border-slate-800 ${sortConfig.key === sKey ? 'text-indigo-400 font-bold' : 'text-slate-400'}`}
      >
          {label}
      </TableHeaderCell>
  );

  // Helper for sticky column styling to prevent gaps
  const getStickyStyle = (left: number, width: number, isLast: boolean = false) => ({
      left: left,
      width: width,
      minWidth: width, // Explicitly set min/max to prevent squishing
      maxWidth: width,
      position: 'sticky' as 'sticky',
      zIndex: 30,
      borderRight: isLast ? undefined : 'none', // Remove right border for seamless sticky unless last
      boxShadow: 'none' // [UPDATED] Removed all shadow
  });

  // Calculate Sticky Positions
  // Players Mode Config (Team Column Removed)
  const P_LEFT_RANK = 0;
  // const P_LEFT_TEAM_LOGO = WIDTHS.RANK; // Removed
  const P_LEFT_NAME = WIDTHS.RANK; // Name moves left
  const P_LEFT_POS = P_LEFT_NAME + WIDTHS.NAME;
  const P_LEFT_OVR = P_LEFT_POS + WIDTHS.POS;

  // Teams Mode Config (Rank -> TeamName)
  // W, L, PCT will NOT be sticky, they will scroll with other stats.
  const T_LEFT_RANK = 0;
  const T_LEFT_NAME = WIDTHS.RANK; 
  
  // [Updated] Text color set to text-white for data columns
  const contentTextClass = "text-xs font-medium text-white font-mono tabular-nums";

  return (
    <div className="flex flex-col animate-in fade-in duration-500 ko-normal gap-6 pb-20">
      {viewPlayer && (
        <PlayerDetailModal 
            player={{...viewPlayer, ovr: calculatePlayerOvr(viewPlayer)}} 
            teamName={(viewPlayer as any).teamName} 
            teamId={(viewPlayer as any).teamId} 
            onClose={() => setViewPlayer(null)} 
            allTeams={teams} 
        />
      )}
      
      <PageHeader 
        title="리그 리더보드" 
        description={mode === 'Players' ? "2025-26 시즌 선수별 주요 스탯 랭킹" : "2025-26 시즌 팀별 평균 기록"}
        icon={<BarChart2 size={24} />}
      />

      {/* Main Content Wrapper (Card Style) */}
      <div className="bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
          
          {/* Top Toolbar: View Mode Selector & Filters & Heatmap Toggle */}
          <div className="flex flex-col border-b border-slate-800 bg-slate-900">
              <div className="px-6 py-4 flex flex-col xl:flex-row items-center gap-6">
                  
                  {/* Left Group: View Mode */}
                  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
                      <button 
                          onClick={() => { setMode('Players'); setCurrentPage(1); setSortConfig({key: 'pts', direction: 'desc'}); }}
                          className={`flex items-center gap-2 px-6 py-2 rounded-lg text-xs font-black uppercase transition-all ${mode === 'Players' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                          선수
                      </button>
                      <button 
                          onClick={() => { setMode('Teams'); setCurrentPage(1); setSortConfig({key: 'wins', direction: 'desc'}); }}
                          className={`flex items-center gap-2 px-6 py-2 rounded-lg text-xs font-black uppercase transition-all ${mode === 'Teams' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                          팀
                      </button>
                  </div>

                  {/* Filter Group (Stat + Date) */}
                  <div className="flex flex-col md:flex-row items-center gap-4 flex-1 overflow-x-auto w-full xl:w-auto">
                      
                      {/* Integrated Stat Filter */}
                      <div className="flex items-center h-[42px] bg-slate-950 rounded-xl border border-slate-700/50 shadow-sm shrink-0">
                          <div className="px-3 flex items-center justify-center border-r border-slate-700/50 h-full text-slate-500">
                              <Filter size={16} />
                          </div>
                          
                          {/* Category */}
                          <div className="relative h-full border-r border-slate-700/50">
                            <select 
                                className="h-full bg-transparent pl-3 pr-7 text-sm font-medium text-white outline-none cursor-pointer appearance-none hover:bg-slate-800/30 transition-colors w-28"
                                value={filterCat}
                                onChange={(e) => setFilterCat(e.target.value)}
                            >
                                {STAT_OPTIONS.map(opt => <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-300">{opt.label}</option>)}
                            </select>
                            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                          </div>

                          {/* Operator */}
                          <div className="relative h-full border-r border-slate-700/50">
                            <select 
                                className="h-full bg-transparent px-2 text-sm font-medium text-indigo-400 outline-none cursor-pointer appearance-none text-center hover:bg-slate-800/30 transition-colors w-14"
                                value={filterOp}
                                onChange={(e) => setFilterOp(e.target.value as Operator)}
                            >
                                {['>=', '<=', '>', '<', '='].map(op => <option key={op} value={op} className="bg-slate-900 text-slate-300">{op}</option>)}
                            </select>
                          </div>

                          {/* Value Input */}
                          <input 
                              type="number" 
                              placeholder="Value" 
                              className="h-full bg-transparent px-3 w-20 text-sm font-medium text-white outline-none placeholder:text-slate-600 [&::-webkit-inner-spin-button]:appearance-none"
                              value={filterVal}
                              onChange={(e) => setFilterVal(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && addStatFilter()}
                          />

                          {/* Add Button */}
                          <button onClick={addStatFilter} className="h-full px-3 flex items-center justify-center border-l border-slate-700/50 text-slate-400 hover:text-white hover:bg-indigo-600/20 transition-all rounded-r-xl">
                              <Plus size={16} />
                          </button>
                      </div>

                      {/* Integrated Date Filter */}
                      <div className="flex items-center h-[42px] bg-slate-950 rounded-xl border border-slate-700/50 shadow-sm shrink-0">
                          <div className="px-3 flex items-center justify-center border-r border-slate-700/50 h-full text-slate-500">
                              <Calendar size={16} />
                          </div>
                          
                          <div className="flex items-center h-full">
                              <input 
                                  type="date" 
                                  className="h-full bg-transparent px-3 text-sm font-medium text-white outline-none w-32 [&::-webkit-calendar-picker-indicator]:hidden"
                                  value={dateStart}
                                  onChange={(e) => setDateStart(e.target.value)}
                              />
                              <span className="text-slate-600 text-sm px-1">~</span>
                              <input 
                                  type="date" 
                                  className="h-full bg-transparent px-3 text-sm font-medium text-white outline-none w-32 [&::-webkit-calendar-picker-indicator]:hidden"
                                  value={dateEnd}
                                  onChange={(e) => setDateEnd(e.target.value)}
                              />
                          </div>

                          <button onClick={addDateFilter} className="h-full px-3 flex items-center justify-center border-l border-slate-700/50 text-slate-400 hover:text-white hover:bg-indigo-600/20 transition-all rounded-r-xl">
                              <Plus size={16} />
                          </button>
                      </div>

                      {/* Heatmap Toggle */}
                      <div 
                          className="flex items-center gap-3 cursor-pointer group select-none shrink-0 ml-2" 
                          onClick={() => setShowHeatmap(!showHeatmap)}
                          title="스탯 분포 색상 표시"
                      >
                            <div className={`w-10 h-5 rounded-full relative transition-colors duration-300 ${showHeatmap ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                                <div className={`absolute top-1 bottom-1 w-3 h-3 rounded-full bg-white transition-all duration-300 shadow-sm ${showHeatmap ? 'left-6' : 'left-1'}`} />
                            </div>
                            <div className={`text-sm font-medium transition-colors ${showHeatmap ? 'text-indigo-400' : 'text-slate-500'}`}>
                                <span className="hidden md:inline">색상 스케일</span>
                            </div>
                      </div>
                  </div>
              </div>

              {/* Active Filter Chips */}
              {activeFilters.length > 0 && (
                  <div className="px-6 pb-3 flex flex-wrap gap-2 animate-in slide-in-from-top-2">
                      {activeFilters.map(filter => (
                          <div key={filter.id} className="flex items-center gap-2 px-3 py-1 bg-indigo-900/30 border border-indigo-500/30 rounded-full text-xs font-bold text-indigo-300">
                              <span>{filter.label}</span>
                              <button onClick={() => removeFilter(filter.id)} className="hover:text-white transition-colors"><X size={12} /></button>
                          </div>
                      ))}
                      <button onClick={() => setActiveFilters([])} className="text-sm font-bold text-slate-500 hover:text-red-400 underline decoration-slate-700 underline-offset-2 transition-colors ml-2">모두 삭제</button>
                  </div>
              )}
          </div>

          {/* Table Area (Auto Height) */}
          <div className="w-full">
            <Table className="!rounded-none !border-0 !shadow-none" fullHeight={false} style={{ tableLayout: 'fixed', minWidth: '100%' }}>
                <colgroup>
                    <col style={{ width: WIDTHS.RANK }} />
                    {mode === 'Players' ? (
                        <>
                            {/* <col style={{ width: WIDTHS.TEAM }} /> Removed */}
                            <col style={{ width: WIDTHS.NAME }} />
                            <col style={{ width: WIDTHS.POS }} />
                            <col style={{ width: WIDTHS.OVR }} />
                            {/* Players have G and MIN */}
                            <col style={{ width: WIDTHS.STAT }} /> {/* G */}
                            <col style={{ width: WIDTHS.STAT }} /> {/* MIN */}
                        </>
                    ) : (
                        <>
                            <col style={{ width: WIDTHS.NAME }} />
                            {/* Teams have W, L, PCT instead of G, MIN */}
                            <col style={{ width: WIDTHS.W }} /> {/* W */}
                            <col style={{ width: WIDTHS.L }} /> {/* L */}
                            <col style={{ width: WIDTHS.PCT }} /> {/* PCT */}
                        </>
                    )}
                    
                    <col style={{ width: WIDTHS.STAT }} /> {/* PTS */}
                    {mode === 'Teams' && <col style={{ width: WIDTHS.STAT }} />} {/* PA for Teams */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* OREB */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* DREB */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* REB */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* AST */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* STL */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* BLK */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* TOV */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* FGM */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* FGA */}
                    <col style={{ width: WIDTHS.PCT }} /> {/* FG% */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* 3PM */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* 3PA */}
                    <col style={{ width: WIDTHS.PCT }} /> {/* 3P% */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* FTM */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* FTA */}
                    <col style={{ width: WIDTHS.PCT }} /> {/* FT% */}
                    <col style={{ width: WIDTHS.PCT }} /> {/* TS% */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* +/- */}
                </colgroup>

                <TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm">
                    {/* Rank is common */}
                    <TableHeaderCell style={getStickyStyle(0, WIDTHS.RANK)} stickyLeft align="center" className="border-r border-slate-800 bg-slate-950">#</TableHeaderCell>
                    
                    {mode === 'Players' ? (
                        <>
                            {/* Team Column (Removed) */}
                            {/* Player Name with Logo */}
                            <TableHeaderCell style={getStickyStyle(P_LEFT_NAME, WIDTHS.NAME)} stickyLeft align="left" className="pl-4 border-r border-slate-800 bg-slate-950" sortable onSort={() => handleSort('name')} sortDirection={sortConfig.key === 'name' ? sortConfig.direction : null}>PLAYER</TableHeaderCell>
                            
                            <TableHeaderCell style={getStickyStyle(P_LEFT_POS, WIDTHS.POS)} stickyLeft align="center" className="border-r border-slate-800 bg-slate-950" sortable onSort={() => handleSort('position')} sortDirection={sortConfig.key === 'position' ? sortConfig.direction : null}>POS</TableHeaderCell>
                            
                            {/* Last Sticky Column with Clip Path for Shadow */}
                            <TableHeaderCell style={{ ...getStickyStyle(P_LEFT_OVR, WIDTHS.OVR, true), clipPath: 'inset(0 -15px 0 0)' }} stickyLeft align="center" className="border-r border-slate-800 bg-slate-950" sortable onSort={() => handleSort('ovr')} sortDirection={sortConfig.key === 'ovr' ? sortConfig.direction : null}>OVR</TableHeaderCell>
                            
                            <SortHeader label="G" sKey="g" width={WIDTHS.STAT} />
                            <SortHeader label="MIN" sKey="mp" width={WIDTHS.STAT} />
                        </>
                    ) : (
                        <>
                            {/* Team Name is Last Sticky for Teams Mode */}
                            <TableHeaderCell style={{ ...getStickyStyle(T_LEFT_NAME, WIDTHS.NAME, true), clipPath: 'inset(0 -15px 0 0)' }} stickyLeft align="left" className="pl-4 border-r border-slate-800 bg-slate-950" sortable onSort={() => handleSort('name')} sortDirection={sortConfig.key === 'name' ? sortConfig.direction : null}>TEAM NAME</TableHeaderCell>
                            
                            {/* W, L, PCT instead of G, MIN */}
                            <SortHeader label="W" sKey="wins" width={WIDTHS.W} />
                            <SortHeader label="L" sKey="losses" width={WIDTHS.L} />
                            <SortHeader label="WIN%" sKey="winPct" width={WIDTHS.PCT} />
                        </>
                    )}
                    
                    <SortHeader label="PTS" sKey="pts" width={WIDTHS.STAT} />
                    {mode === 'Teams' && <SortHeader label="PA" sKey="pa" width={WIDTHS.STAT} />}
                    <SortHeader label="OREB" sKey="oreb" width={WIDTHS.STAT} />
                    <SortHeader label="DREB" sKey="dreb" width={WIDTHS.STAT} />
                    <SortHeader label="REB" sKey="reb" width={WIDTHS.STAT} />
                    <SortHeader label="AST" sKey="ast" width={WIDTHS.STAT} />
                    <SortHeader label="STL" sKey="stl" width={WIDTHS.STAT} />
                    <SortHeader label="BLK" sKey="blk" width={WIDTHS.STAT} />
                    <SortHeader label="TOV" sKey="tov" width={WIDTHS.STAT} />
                    
                    <SortHeader label="FGM" sKey="fgm" width={WIDTHS.STAT} />
                    <SortHeader label="FGA" sKey="fga" width={WIDTHS.STAT} />
                    <SortHeader label="FG%" sKey="fg%" width={WIDTHS.PCT} />
                    
                    <SortHeader label="3PM" sKey="3pm" width={WIDTHS.STAT} />
                    <SortHeader label="3PA" sKey="3pa" width={WIDTHS.STAT} />
                    <SortHeader label="3P%" sKey="3p%" width={WIDTHS.PCT} />
                    
                    <SortHeader label="FTM" sKey="ftm" width={WIDTHS.STAT} />
                    <SortHeader label="FTA" sKey="fta" width={WIDTHS.STAT} />
                    <SortHeader label="FT%" sKey="ft%" width={WIDTHS.PCT} />
                    
                    <SortHeader label="TS%" sKey="ts%" width={WIDTHS.PCT} />
                    <SortHeader label="+/-" sKey="pm" width={WIDTHS.STAT} />
                </TableHead>
                <TableBody>
                    {currentData.map((item, index) => {
                        const rank = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;
                        const rankColor = rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-slate-300' : rank === 3 ? 'text-amber-600' : 'text-slate-600';
                        
                        // [Fix] Hover effect for sticky columns
                        const stickyCellClass = "bg-slate-900 group-hover:bg-slate-800 transition-colors z-30";

                        if (mode === 'Players') {
                            const p = item as Player & { teamName: string; teamId: string };
                            const s = p.stats;
                            const g = s.g || 1;
                            const ovr = calculatePlayerOvr(p);
                            
                            const fgPct = s.fga > 0 ? s.fgm/s.fga : 0;
                            const p3Pct = s.p3a > 0 ? s.p3m/s.p3a : 0;
                            const ftPct = s.fta > 0 ? s.ftm/s.fta : 0;
                            const tsPct = (s.fga + 0.44 * s.fta) > 0 ? s.pts / (2 * (s.fga + 0.44 * s.fta)) : 0;

                            return (
                                <TableRow key={p.id} onClick={() => setViewPlayer(p)} className="group h-10">
                                    <TableCell style={getStickyStyle(0, WIDTHS.RANK)} stickyLeft align="center" className={`font-medium text-xs ${rankColor} border-r border-slate-800 ${stickyCellClass}`}>{rank}</TableCell>
                                    
                                    {/* Merged Team Logo + Name Column */}
                                    <TableCell style={getStickyStyle(P_LEFT_NAME, WIDTHS.NAME)} stickyLeft className={`pl-4 border-r border-slate-800 ${stickyCellClass}`}>
                                        <div className="flex items-center gap-3">
                                            <TeamLogo teamId={p.teamId} size="sm" />
                                            <span className="text-xs font-semibold text-slate-200 truncate group-hover:text-indigo-300 block">{p.name}</span>
                                        </div>
                                    </TableCell>
                                    
                                    <TableCell style={getStickyStyle(P_LEFT_POS, WIDTHS.POS)} stickyLeft align="center" className={`text-xs font-semibold text-slate-500 border-r border-slate-800 ${stickyCellClass}`}>{p.position}</TableCell>
                                    
                                    <TableCell style={{ ...getStickyStyle(P_LEFT_OVR, WIDTHS.OVR, true), clipPath: 'inset(0 -15px 0 0)' }} stickyLeft align="center" className={`border-r border-slate-800 ${stickyCellClass}`}>
                                        <div className="flex justify-center"><OvrBadge value={ovr} size="sm" className="!w-7 !h-7 !text-xs !shadow-none" /></div>
                                    </TableCell>
                                    
                                    {/* Updated Text Color to White */}
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('g', s.g)}>{s.g}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('mp', s.mp/g)}>{(s.mp/g).toFixed(1)}</TableCell>
                                    
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('pts', s.pts/g)}>{(s.pts/g).toFixed(1)}</TableCell>
                                    
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('oreb', (s.offReb||0)/g)}>{((s.offReb||0)/g).toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('dreb', (s.defReb||0)/g)}>{((s.defReb||0)/g).toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('reb', s.reb/g)}>{(s.reb/g).toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('ast', s.ast/g)}>{(s.ast/g).toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('stl', s.stl/g)}>{(s.stl/g).toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('blk', s.blk/g)}>{(s.blk/g).toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('tov', s.tov/g)}>{(s.tov/g).toFixed(1)}</TableCell>
                                    
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('fgm', s.fgm/g)}>{(s.fgm/g).toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('fga', s.fga/g)}>{(s.fga/g).toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('fg%', fgPct)}>{formatStat(fgPct, true)}</TableCell>
                                    
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('3pm', s.p3m/g)}>{(s.p3m/g).toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('3pa', s.p3a/g)}>{(s.p3a/g).toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('3p%', p3Pct)}>{formatStat(p3Pct, true)}</TableCell>
                                    
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('ftm', s.ftm/g)}>{(s.ftm/g).toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('fta', s.fta/g)}>{(s.fta/g).toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('ft%', ftPct)}>{formatStat(ftPct, true)}</TableCell>
                                    
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('ts%', tsPct)}>{formatStat(tsPct, true)}</TableCell>
                                    
                                    {/* +/- gets colored */}
                                    <TableCell align="center" className={`font-mono font-medium text-xs border-r border-slate-800/30 ${s.plusMinus > 0 ? 'text-emerald-400' : s.plusMinus < 0 ? 'text-red-400' : 'text-slate-500'}`} style={getBgStyle('pm', s.plusMinus/g)}>
                                        {s.plusMinus > 0 ? '+' : ''}{(s.plusMinus/g).toFixed(1)}
                                    </TableCell>
                                </TableRow>
                            );
                        } else {
                            const t = item as typeof teamStats[0];
                            const s = t.stats;
                            const winPct = (t.wins + t.losses) > 0 ? t.wins / (t.wins + t.losses) : 0;
                            
                            return (
                                <TableRow key={t.id} className="hover:bg-slate-800/30 group h-10">
                                    <TableCell style={getStickyStyle(0, WIDTHS.RANK)} stickyLeft align="center" className={`font-medium text-xs ${rankColor} border-r border-slate-800 ${stickyCellClass}`}>{rank}</TableCell>
                                    
                                    <TableCell style={{ ...getStickyStyle(T_LEFT_NAME, WIDTHS.NAME, true), clipPath: 'inset(0 -15px 0 0)' }} stickyLeft className={`pl-4 border-r border-slate-800 ${stickyCellClass}`}>
                                        <div className="flex items-center gap-3">
                                            <TeamLogo teamId={t.id} size="sm" />
                                            <span className="text-xs font-semibold text-slate-200 uppercase truncate">{t.name}</span>
                                        </div>
                                    </TableCell>
                                    
                                    {/* Team Stats: W, L, PCT */}
                                    <TableCell align="center" className={`${contentTextClass} text-emerald-400 border-r border-slate-800/30`} style={getBgStyle('wins', t.wins)}>{t.wins}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} text-red-400 border-r border-slate-800/30`} style={getBgStyle('losses', t.losses)}>{t.losses}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} text-slate-200 border-r border-slate-800/30`} style={getBgStyle('winPct', winPct)}>{winPct.toFixed(3)}</TableCell>

                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('pts', s.pts)}>{s.pts.toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} text-red-300 border-r border-slate-800/30`} style={getBgStyle('pa', s.pa)}>{s.pa.toFixed(1)}</TableCell>
                                    
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('oreb', s.oreb)}>{s.oreb.toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('dreb', s.dreb)}>{s.dreb.toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('reb', s.reb)}>{s.reb.toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('ast', s.ast)}>{s.ast.toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('stl', s.stl)}>{s.stl.toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('blk', s.blk)}>{s.blk.toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('tov', s.tov)}>{s.tov.toFixed(1)}</TableCell>
                                    
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('fgm', s.fgm)}>{s.fgm.toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('fga', s.fga)}>{s.fga.toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('fg%', s.fgPct)}>{formatStat(s.fgPct, true)}</TableCell>
                                    
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('3pm', s.p3m)}>{s.p3m.toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('3pa', s.p3a)}>{s.p3a.toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('3p%', s.p3Pct)}>{formatStat(s.p3Pct, true)}</TableCell>
                                    
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('ftm', s.ftm)}>{s.ftm.toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('fta', s.fta)}>{s.fta.toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('ft%', s.ftPct)}>{formatStat(s.ftPct, true)}</TableCell>
                                    
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('ts%', s.tsPct)}>{formatStat(s.tsPct, true)}</TableCell>
                                    
                                    <TableCell align="center" className={`font-mono font-medium text-xs border-r border-slate-800/30 ${s.pm > 0 ? 'text-emerald-400' : s.pm < 0 ? 'text-red-400' : 'text-slate-500'}`} style={getBgStyle('pm', s.pm)}>
                                        {s.pm > 0 ? '+' : ''}{s.pm.toFixed(1)}
                                    </TableCell>
                                </TableRow>
                            );
                        }
                    })}
                    
                    {currentData.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={24} className="py-20 text-center text-slate-500 font-bold uppercase tracking-widest">
                                데이터가 없습니다.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
          </div>

          {/* Pagination Footer */}
          <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-t border-slate-800 shadow-[0_-4px_10px_rgba(0,0,0,0.2)] flex-shrink-0 z-50">
              <div className="text-xs font-bold text-slate-500">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, sortedData.length)} of {sortedData.length}
              </div>
              
              <div className="flex gap-2">
                  <button 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                      <ChevronLeft size={16} />
                  </button>
                  
                  <div className="flex items-center gap-1 px-2">
                      <span className="text-sm font-black text-white">{currentPage}</span>
                      <span className="text-xs font-bold text-slate-600">/</span>
                      <span className="text-xs font-bold text-slate-500">{totalPages}</span>
                  </div>

                  <button 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                      <ChevronRight size={16} />
                  </button>
              </div>
          </div>
      </div>
    </div>
  );
};
