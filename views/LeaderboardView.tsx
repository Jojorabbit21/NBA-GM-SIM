
import React, { useState, useMemo } from 'react';
import { Team, Player, Game } from '../types';
import { OvrBadge } from '../components/common/OvrBadge';
import { PlayerDetailModal } from '../components/PlayerDetailModal';
import { BarChart2, ChevronLeft, ChevronRight } from 'lucide-react';
import { calculatePlayerOvr } from '../utils/constants';
import { PageHeader } from '../components/common/PageHeader';
import { TeamLogo } from '../components/common/TeamLogo';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/common/Table';

interface LeaderboardViewProps {
  teams: Team[];
  schedule?: Game[];
}

type SortKey = 'name' | 'team' | 'position' | 'ovr' | 'g' | 'mp' | 'pts' | 'pa' | 'reb' | 'ast' | 'stl' | 'blk' | 'tov' | 'fg%' | '3p%' | 'ft%' | 'ts%' | 'pm' | 'wins' | 'losses' | 'winPct';
type ViewMode = 'Players' | 'Teams';

const ITEMS_PER_PAGE = 50;

// Column Widths
const WIDTHS = {
    RANK: 50,
    TEAM: 60,     // Moved before Name
    NAME: 180,
    POS: 60,
    OVR: 60,
    STAT: 60,
    // New Team Columns
    W: 45,
    L: 45,
    PCT: 65,
};

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({ teams, schedule = [] }) => {
  const [mode, setMode] = useState<ViewMode>('Players');
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'pts', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);

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
    return teams.map(t => {
        // Calculate precise scoring stats from schedule
        const teamGames = schedule.filter(g => g.played && (g.homeTeamId === t.id || g.awayTeamId === t.id));
        const playedCount = teamGames.length || 1;
        
        let totalPts = 0;
        let totalPa = 0;
        
        teamGames.forEach(g => {
            if (g.homeTeamId === t.id) {
                totalPts += g.homeScore || 0;
                totalPa += g.awayScore || 0;
            } else {
                totalPts += g.awayScore || 0;
                totalPa += g.homeScore || 0;
            }
        });

        // Aggregate other stats from roster
        const totals = t.roster.reduce((acc, p) => ({
            reb: acc.reb + p.stats.reb,
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
        }), { reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0 });

        const tsa = totals.fga + 0.44 * totals.fta;

        return {
            ...t,
            stats: {
                g: playedCount,
                mp: 48,
                pts: totalPts / playedCount,
                pa: totalPa / playedCount,
                reb: totals.reb / playedCount,
                ast: totals.ast / playedCount,
                stl: totals.stl / playedCount,
                blk: totals.blk / playedCount,
                tov: totals.tov / playedCount,
                fgPct: totals.fga > 0 ? totals.fgm / totals.fga : 0,
                p3Pct: totals.p3a > 0 ? totals.p3m / totals.p3a : 0,
                ftPct: totals.fta > 0 ? totals.ftm / totals.fta : 0,
                tsPct: tsa > 0 ? (totalPts / playedCount) / (2 * (tsa/playedCount)) : 0,
                pm: (totalPts - totalPa) / playedCount,
            }
        };
    });
  }, [teams, schedule]);

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
            update('ast', s.ast / g);
            update('stl', s.stl / g);
            update('blk', s.blk / g);
            update('tov', s.tov / g);
            update('fg%', s.fga > 0 ? s.fgm / s.fga : 0);
            update('3p%', s.p3a > 0 ? s.p3m / s.p3a : 0);
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
            update('ast', s.ast);
            update('stl', s.stl);
            update('blk', s.blk);
            update('tov', s.tov);
            update('fg%', s.fgPct);
            update('3p%', s.p3Pct);
            update('ft%', s.ftPct);
            update('ts%', s.tsPct);
            update('pm', s.pm);
        });
    }
    return ranges;
  }, [mode, allPlayers, teamStats]);

  const getBgStyle = (key: string, value: number) => {
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
        // Inverse: Lower (0.0) is Better (Green), Higher (1.0) is Worse (Red)
        if (ratio < 0.5) {
            // Good Side (Green)
            color = '16, 185, 129'; // Emerald-500
            // Map 0.0->0.5 opacity (Best), 0.5->0.0 opacity (Avg)
            opacity = (0.5 - ratio) * 2 * 0.5;
        } else {
            // Bad Side (Red)
            color = '239, 68, 68'; // Red-500
            // Map 1.0->0.5 opacity (Worst), 0.5->0.0 opacity (Avg)
            opacity = (ratio - 0.5) * 2 * 0.5;
        }
    } else {
        // Normal: Higher (1.0) is Better (Green), Lower (0.0) is Worse (Red)
        if (ratio > 0.5) {
            // Good Side (Green)
            color = '16, 185, 129'; // Emerald-500
            // Map 1.0->0.5 opacity (Best), 0.5->0.0 opacity (Avg)
            opacity = (ratio - 0.5) * 2 * 0.5;
        } else {
            // Bad Side (Red)
            color = '239, 68, 68'; // Red-500
            // Map 0.0->0.5 opacity (Worst), 0.5->0.0 opacity (Avg)
            opacity = (0.5 - ratio) * 2 * 0.5;
        }
    }
    
    // Filter noise near average (opacity < 0.05) to keep UI clean
    if (opacity < 0.05) return undefined;

    return { backgroundColor: `rgba(${color}, ${opacity})` };
  };

  // --- Sorting & Pagination Logic ---

  const handleSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
        direction = 'asc';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };

  const sortedData = useMemo(() => {
    const data = mode === 'Players' ? [...allPlayers.filter(p => p.stats.g > 0)] : [...teamStats];

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
                case 'team': valA = (pA as any).teamCity; valB = (pB as any).teamCity; break; // This sort might be disabled in UI but kept in logic
                case 'g': valA = pA.stats.g; valB = pB.stats.g; break;
                case 'mp': valA = pA.stats.mp / gA; valB = pB.stats.mp / gB; break;
                case 'pts': valA = pA.stats.pts / gA; valB = pB.stats.pts / gB; break;
                case 'reb': valA = pA.stats.reb / gA; valB = pB.stats.reb / gB; break;
                case 'ast': valA = pA.stats.ast / gA; valB = pB.stats.ast / gB; break;
                case 'stl': valA = pA.stats.stl / gA; valB = pB.stats.stl / gB; break;
                case 'blk': valA = pA.stats.blk / gA; valB = pB.stats.blk / gB; break;
                case 'tov': valA = pA.stats.tov / gA; valB = pB.stats.tov / gB; break;
                case 'fg%': valA = pA.stats.fga > 0 ? pA.stats.fgm / pA.stats.fga : 0; valB = pB.stats.fga > 0 ? pB.stats.fgm / pB.stats.fga : 0; break;
                case '3p%': valA = pA.stats.p3a > 0 ? pA.stats.p3m / pA.stats.p3a : 0; valB = pB.stats.p3a > 0 ? pB.stats.p3m / pB.stats.p3a : 0; break;
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
                case 'ast': valA = tA.stats.ast; valB = tB.stats.ast; break;
                case 'stl': valA = tA.stats.stl; valB = tB.stats.stl; break;
                case 'blk': valA = tA.stats.blk; valB = tB.stats.blk; break;
                case 'tov': valA = tA.stats.tov; valB = tB.stats.tov; break;
                case 'fg%': valA = tA.stats.fgPct; valB = tB.stats.fgPct; break;
                case '3p%': valA = tA.stats.p3Pct; valB = tB.stats.p3Pct; break;
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
  }, [allPlayers, teamStats, mode, sortConfig]);

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
      boxShadow: isLast ? '4px 0 4px -2px rgba(0,0,0,0.5)' : 'none' // Shadow only on last
  });

  // Calculate Sticky Positions (Updated Order: Rank -> Team -> Name -> Pos -> Ovr)
  // Players Mode Config
  const P_LEFT_RANK = 0;
  const P_LEFT_TEAM_LOGO = WIDTHS.RANK;
  const P_LEFT_NAME = WIDTHS.RANK + WIDTHS.TEAM;
  const P_LEFT_POS = P_LEFT_NAME + WIDTHS.NAME;
  const P_LEFT_OVR = P_LEFT_POS + WIDTHS.POS;

  // Teams Mode Config (Rank -> TeamName)
  // W, L, PCT will NOT be sticky, they will scroll with other stats.
  const T_LEFT_RANK = 0;
  const T_LEFT_NAME = WIDTHS.RANK; 
  
  const contentTextClass = "text-xs font-medium text-slate-300 font-mono tabular-nums";

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
          
          {/* Top Toolbar: View Mode Selector */}
          <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-3">
                  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
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
              </div>
          </div>

          {/* Table Area (Auto Height) */}
          <div className="w-full">
            <Table className="!rounded-none !border-0 !shadow-none" fullHeight={false} style={{ tableLayout: 'fixed', minWidth: '100%' }}>
                <colgroup>
                    <col style={{ width: WIDTHS.RANK }} />
                    {mode === 'Players' ? (
                        <>
                            <col style={{ width: WIDTHS.TEAM }} />
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
                    <col style={{ width: WIDTHS.STAT }} /> {/* REB */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* AST */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* STL */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* BLK */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* TOV */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* FG% */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* 3P% */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* FT% */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* TS% */}
                    <col style={{ width: WIDTHS.STAT }} /> {/* +/- */}
                </colgroup>

                <TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm">
                    {/* Rank is common */}
                    <TableHeaderCell style={getStickyStyle(0, WIDTHS.RANK)} stickyLeft align="center" className="border-r border-slate-800 bg-slate-950">#</TableHeaderCell>
                    
                    {mode === 'Players' ? (
                        <>
                            {/* Team Column (Moved Left, Not Sortable) */}
                            <TableHeaderCell style={getStickyStyle(P_LEFT_TEAM_LOGO, WIDTHS.TEAM)} stickyLeft align="center" className="border-r border-slate-800 bg-slate-950">TEAM</TableHeaderCell>
                            
                            <TableHeaderCell style={getStickyStyle(P_LEFT_NAME, WIDTHS.NAME)} stickyLeft align="left" className="pl-4 border-r border-slate-800 bg-slate-950" sortable onSort={() => handleSort('name')} sortDirection={sortConfig.key === 'name' ? sortConfig.direction : null}>PLAYER NAME</TableHeaderCell>
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
                    <SortHeader label="REB" sKey="reb" width={WIDTHS.STAT} />
                    <SortHeader label="AST" sKey="ast" width={WIDTHS.STAT} />
                    <SortHeader label="STL" sKey="stl" width={WIDTHS.STAT} />
                    <SortHeader label="BLK" sKey="blk" width={WIDTHS.STAT} />
                    <SortHeader label="TOV" sKey="tov" width={WIDTHS.STAT} />
                    <SortHeader label="FG%" sKey="fg%" width={WIDTHS.STAT} />
                    <SortHeader label="3P%" sKey="3p%" width={WIDTHS.STAT} />
                    <SortHeader label="FT%" sKey="ft%" width={WIDTHS.STAT} />
                    <SortHeader label="TS%" sKey="ts%" width={WIDTHS.STAT} />
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
                                    
                                    <TableCell style={getStickyStyle(P_LEFT_TEAM_LOGO, WIDTHS.TEAM)} stickyLeft align="center" className={`border-r border-slate-800 ${stickyCellClass}`}>
                                        <div className="flex justify-center"><TeamLogo teamId={p.teamId} size="sm" /></div>
                                    </TableCell>
                                    
                                    <TableCell style={getStickyStyle(P_LEFT_NAME, WIDTHS.NAME)} stickyLeft className={`pl-4 border-r border-slate-800 ${stickyCellClass}`}>
                                        <span className="text-xs font-semibold text-slate-200 truncate group-hover:text-indigo-300 block">{p.name}</span>
                                    </TableCell>
                                    
                                    <TableCell style={getStickyStyle(P_LEFT_POS, WIDTHS.POS)} stickyLeft align="center" className={`text-xs font-semibold text-slate-500 border-r border-slate-800 ${stickyCellClass}`}>{p.position}</TableCell>
                                    
                                    <TableCell style={{ ...getStickyStyle(P_LEFT_OVR, WIDTHS.OVR, true), clipPath: 'inset(0 -15px 0 0)' }} stickyLeft align="center" className={`border-r border-slate-800 ${stickyCellClass}`}>
                                        <div className="flex justify-center"><OvrBadge value={ovr} size="sm" className="!w-7 !h-7 !text-xs !shadow-none" /></div>
                                    </TableCell>
                                    
                                    <TableCell align="center" className={`${contentTextClass} text-slate-400 border-r border-slate-800/30`} style={getBgStyle('g', s.g)}>{s.g}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} text-slate-400 border-r border-slate-800/30`} style={getBgStyle('mp', s.mp/g)}>{(s.mp/g).toFixed(1)}</TableCell>
                                    
                                    <TableCell align="center" className={`${contentTextClass} text-white border-r border-slate-800/30`} style={getBgStyle('pts', s.pts/g)}>{(s.pts/g).toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('reb', s.reb/g)}>{(s.reb/g).toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('ast', s.ast/g)}>{(s.ast/g).toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('stl', s.stl/g)}>{(s.stl/g).toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('blk', s.blk/g)}>{(s.blk/g).toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('tov', s.tov/g)}>{(s.tov/g).toFixed(1)}</TableCell>
                                    
                                    <TableCell align="center" className={`${contentTextClass} text-slate-400 border-r border-slate-800/30`} style={getBgStyle('fg%', fgPct)}>{formatStat(fgPct, true)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} text-slate-400 border-r border-slate-800/30`} style={getBgStyle('3p%', p3Pct)}>{formatStat(p3Pct, true)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} text-slate-400 border-r border-slate-800/30`} style={getBgStyle('ft%', ftPct)}>{formatStat(ftPct, true)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} text-slate-400 border-r border-slate-800/30`} style={getBgStyle('ts%', tsPct)}>{formatStat(tsPct, true)}</TableCell>
                                    
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

                                    <TableCell align="center" className={`${contentTextClass} text-white border-r border-slate-800/30`} style={getBgStyle('pts', s.pts)}>{s.pts.toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} text-red-300 border-r border-slate-800/30`} style={getBgStyle('pa', s.pa)}>{s.pa.toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('reb', s.reb)}>{s.reb.toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('ast', s.ast)}>{s.ast.toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('stl', s.stl)}>{s.stl.toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('blk', s.blk)}>{s.blk.toFixed(1)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} border-r border-slate-800/30`} style={getBgStyle('tov', s.tov)}>{s.tov.toFixed(1)}</TableCell>
                                    
                                    <TableCell align="center" className={`${contentTextClass} text-slate-400 border-r border-slate-800/30`} style={getBgStyle('fg%', s.fgPct)}>{formatStat(s.fgPct, true)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} text-slate-400 border-r border-slate-800/30`} style={getBgStyle('3p%', s.p3Pct)}>{formatStat(s.p3Pct, true)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} text-slate-400 border-r border-slate-800/30`} style={getBgStyle('ft%', s.ftPct)}>{formatStat(s.ftPct, true)}</TableCell>
                                    <TableCell align="center" className={`${contentTextClass} text-slate-400 border-r border-slate-800/30`} style={getBgStyle('ts%', s.tsPct)}>{formatStat(s.tsPct, true)}</TableCell>
                                    
                                    <TableCell align="center" className={`font-mono font-medium text-xs border-r border-slate-800/30 ${s.pm > 0 ? 'text-emerald-400' : s.pm < 0 ? 'text-red-400' : 'text-slate-500'}`} style={getBgStyle('pm', s.pm)}>
                                        {s.pm > 0 ? '+' : ''}{s.pm.toFixed(1)}
                                    </TableCell>
                                </TableRow>
                            );
                        }
                    })}
                    
                    {currentData.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={15} className="py-20 text-center text-slate-500 font-bold uppercase tracking-widest">
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
