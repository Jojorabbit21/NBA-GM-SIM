
import React, { useState, useMemo } from 'react';
import { Team, Player } from '../types';
import { OvrBadge } from '../components/common/OvrBadge';
import { PlayerDetailModal } from '../components/PlayerDetailModal';
import { BarChart2, ChevronLeft, ChevronRight, Users, Shield } from 'lucide-react';
import { calculatePlayerOvr } from '../utils/constants';
import { PageHeader } from '../components/common/PageHeader';
import { TeamLogo } from '../components/common/TeamLogo';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/common/Table';

interface LeaderboardViewProps {
  teams: Team[];
}

type SortKey = 'name' | 'team' | 'ovr' | 'g' | 'mp' | 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'tov' | 'fg%' | '3p%' | 'ft%' | 'ts%' | 'pm' | 'wins';
type ViewMode = 'Players' | 'Teams';

const ITEMS_PER_PAGE = 50;

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({ teams }) => {
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
        const games = t.wins + t.losses || 1; // Avoid div by zero
        const totals = t.roster.reduce((acc, p) => ({
            pts: acc.pts + p.stats.pts,
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
            pm: acc.pm + p.stats.plusMinus,
        }), { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, pm: 0 });

        const tsa = totals.fga + 0.44 * totals.fta;

        return {
            ...t,
            // Pre-calculate per-game stats for sorting
            stats: {
                pts: totals.pts / games,
                reb: totals.reb / games,
                ast: totals.ast / games,
                stl: totals.stl / games,
                blk: totals.blk / games,
                tov: totals.tov / games,
                fgPct: totals.fga > 0 ? totals.fgm / totals.fga : 0,
                p3Pct: totals.p3a > 0 ? totals.p3m / totals.p3a : 0,
                ftPct: totals.fta > 0 ? totals.ftm / totals.fta : 0,
                tsPct: tsa > 0 ? totals.pts / (2 * tsa) : 0,
                pm: totals.pm / games, // Average margin
            }
        };
    });
  }, [teams]);

  // --- Sorting & Pagination Logic ---

  const handleSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
        direction = 'asc';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1); // Reset to first page on sort
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
                case 'ovr': valA = calculatePlayerOvr(pA); valB = calculatePlayerOvr(pB); break;
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
                case 'wins': valA = tA.wins; valB = tB.wins; break; // Secondary sort for team list
                case 'pts': valA = tA.stats.pts; valB = tB.stats.pts; break;
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

  const SortHeader = ({ label, sKey, width, align }: { label: string, sKey: SortKey, width?: string, align?: 'left'|'center'|'right' }) => (
      <TableHeaderCell 
        align={align || 'center'} 
        width={width}
        sortable 
        onSort={() => handleSort(sKey)} 
        sortDirection={sortConfig.key === sKey ? sortConfig.direction : null}
        className={sortConfig.key === sKey ? 'text-indigo-400 font-bold' : ''}
      >
          {label}
      </TableHeaderCell>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] animate-in fade-in duration-500 ko-normal gap-6">
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
        actions={
            <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                <button 
                    onClick={() => { setMode('Players'); setCurrentPage(1); setSortConfig({key: 'pts', direction: 'desc'}); }}
                    className={`flex items-center gap-2 px-6 py-2 rounded-lg text-xs font-black uppercase transition-all ${mode === 'Players' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <Users size={14} /> Players
                </button>
                <button 
                    onClick={() => { setMode('Teams'); setCurrentPage(1); setSortConfig({key: 'wins', direction: 'desc'}); }}
                    className={`flex items-center gap-2 px-6 py-2 rounded-lg text-xs font-black uppercase transition-all ${mode === 'Teams' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <Shield size={14} /> Teams
                </button>
            </div>
        }
      />

      {/* Main Table Area */}
      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col min-h-0">
          <Table className="!rounded-none !border-0 !shadow-none" fullHeight>
              <TableHead className="bg-slate-950">
                  <TableHeaderCell align="center" width="40" className="pl-4">#</TableHeaderCell>
                  {mode === 'Players' ? (
                      <>
                        <SortHeader label="PLAYER NAME" sKey="name" align="left" />
                        <SortHeader label="POS" sKey="ovr" width="50" />
                        <SortHeader label="TEAM" sKey="team" width="50" />
                        <SortHeader label="OVR" sKey="ovr" width="50" />
                        <SortHeader label="G" sKey="g" width="50" />
                        <SortHeader label="MP" sKey="mp" width="50" />
                      </>
                  ) : (
                      <>
                        <SortHeader label="TEAM NAME" sKey="name" align="left" />
                        <SortHeader label="W-L" sKey="wins" width="80" />
                      </>
                  )}
                  
                  {/* Common Stats Cols */}
                  <SortHeader label="PTS" sKey="pts" width="60" />
                  <SortHeader label="REB" sKey="reb" width="60" />
                  <SortHeader label="AST" sKey="ast" width="60" />
                  <SortHeader label="STL" sKey="stl" width="60" />
                  <SortHeader label="BLK" sKey="blk" width="60" />
                  <SortHeader label="TOV" sKey="tov" width="60" />
                  <SortHeader label="FG%" sKey="fg%" width="60" />
                  <SortHeader label="3P%" sKey="3p%" width="60" />
                  <SortHeader label="FT%" sKey="ft%" width="60" />
                  <SortHeader label="TS%" sKey="ts%" width="60" />
                  <SortHeader label="+/-" sKey="pm" width="60" />
              </TableHead>
              <TableBody>
                  {currentData.map((item, index) => {
                      const rank = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;
                      const isTop3 = rank <= 3;
                      const rankColor = rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-slate-300' : rank === 3 ? 'text-amber-600' : 'text-slate-600';
                      
                      if (mode === 'Players') {
                          const p = item as Player & { teamName: string; teamId: string };
                          const s = p.stats;
                          const g = s.g || 1;
                          const ovr = calculatePlayerOvr(p);
                          
                          // Calc derived stats
                          const fgPct = s.fga > 0 ? s.fgm/s.fga : 0;
                          const p3Pct = s.p3a > 0 ? s.p3m/s.p3a : 0;
                          const ftPct = s.fta > 0 ? s.ftm/s.fta : 0;
                          const tsPct = (s.fga + 0.44 * s.fta) > 0 ? s.pts / (2 * (s.fga + 0.44 * s.fta)) : 0;

                          return (
                              <TableRow key={p.id} onClick={() => setViewPlayer(p)}>
                                  <TableCell align="center" className={`pl-4 font-black ${rankColor}`}>{rank}</TableCell>
                                  <TableCell variant="player" value={p.name} subText={p.position} />
                                  <TableCell align="center" className="text-xs font-bold text-slate-500">{p.position}</TableCell>
                                  <TableCell align="center">
                                     <div className="flex justify-center"><TeamLogo teamId={p.teamId} size="xs" /></div>
                                  </TableCell>
                                  <TableCell align="center" variant="ovr" value={ovr} />
                                  <TableCell align="center" variant="stat" value={s.g} />
                                  <TableCell align="center" variant="stat" value={(s.mp/g).toFixed(1)} />
                                  
                                  {/* Stats */}
                                  <TableCell align="center" variant="stat" value={(s.pts/g).toFixed(1)} className="text-white" />
                                  <TableCell align="center" variant="stat" value={(s.reb/g).toFixed(1)} />
                                  <TableCell align="center" variant="stat" value={(s.ast/g).toFixed(1)} />
                                  <TableCell align="center" variant="stat" value={(s.stl/g).toFixed(1)} />
                                  <TableCell align="center" variant="stat" value={(s.blk/g).toFixed(1)} />
                                  <TableCell align="center" variant="stat" value={(s.tov/g).toFixed(1)} />
                                  
                                  <TableCell align="center" variant="stat" value={formatStat(fgPct, true)} className="text-slate-400" />
                                  <TableCell align="center" variant="stat" value={formatStat(p3Pct, true)} className="text-slate-400" />
                                  <TableCell align="center" variant="stat" value={formatStat(ftPct, true)} className="text-slate-400" />
                                  <TableCell align="center" variant="stat" value={formatStat(tsPct, true)} className="text-slate-400" />
                                  
                                  <TableCell align="center" className={`font-mono font-bold text-xs ${s.plusMinus > 0 ? 'text-emerald-400' : s.plusMinus < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                      {s.plusMinus > 0 ? '+' : ''}{(s.plusMinus/g).toFixed(1)}
                                  </TableCell>
                              </TableRow>
                          );
                      } else {
                          const t = item as typeof teamStats[0];
                          const s = t.stats;
                          
                          return (
                              <TableRow key={t.id} className="hover:bg-slate-800/30">
                                  <TableCell align="center" className={`pl-4 font-black ${rankColor}`}>{rank}</TableCell>
                                  <TableCell className="px-3">
                                      <div className="flex items-center gap-3">
                                          <TeamLogo teamId={t.id} size="sm" />
                                          <span className="text-sm font-bold text-white uppercase">{t.name}</span>
                                      </div>
                                  </TableCell>
                                  <TableCell align="center" className="font-mono font-bold text-xs text-slate-400">{t.wins}-{t.losses}</TableCell>

                                  <TableCell align="center" variant="stat" value={s.pts.toFixed(1)} className="text-white" />
                                  <TableCell align="center" variant="stat" value={s.reb.toFixed(1)} />
                                  <TableCell align="center" variant="stat" value={s.ast.toFixed(1)} />
                                  <TableCell align="center" variant="stat" value={s.stl.toFixed(1)} />
                                  <TableCell align="center" variant="stat" value={s.blk.toFixed(1)} />
                                  <TableCell align="center" variant="stat" value={s.tov.toFixed(1)} />
                                  
                                  <TableCell align="center" variant="stat" value={formatStat(s.fgPct, true)} className="text-slate-400" />
                                  <TableCell align="center" variant="stat" value={formatStat(s.p3Pct, true)} className="text-slate-400" />
                                  <TableCell align="center" variant="stat" value={formatStat(s.ftPct, true)} className="text-slate-400" />
                                  <TableCell align="center" variant="stat" value={formatStat(s.tsPct, true)} className="text-slate-400" />
                                  
                                  <TableCell align="center" className={`font-mono font-bold text-xs ${s.pm > 0 ? 'text-emerald-400' : s.pm < 0 ? 'text-red-400' : 'text-slate-500'}`}>
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
      <div className="flex items-center justify-between px-6 py-4 bg-slate-900/50 border border-slate-800 rounded-xl flex-shrink-0">
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
  );
};
