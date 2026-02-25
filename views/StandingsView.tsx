
import React, { useState, useMemo } from 'react';
import { Team, Game } from '../types';
import { Loader2, Trophy } from 'lucide-react';
import { TeamLogo } from '../components/common/TeamLogo';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/common/Table';
import { computeStandingsStats, StandingsRecord } from '../utils/standingsStats';
import { DIVISION_KOREAN } from '../data/mappings';

interface StandingsViewProps {
    teams: Team[];
    schedule: Game[];
    onTeamClick: (id: string) => void;
}

type StandingsMode = 'League' | 'Conference' | 'Division';

const DIVISIONS = ['Atlantic', 'Central', 'Southeast', 'Northwest', 'Pacific', 'Southwest'];

const MODE_LABELS: Record<StandingsMode, string> = {
    League: '리그',
    Conference: '컨퍼런스',
    Division: '디비전',
};

interface RankedTeam {
    team: Team;
    rank: number;
    rec: StandingsRecord;
    gb: string;
    status: 'clinched_playoff' | 'clinched_playin' | 'eliminated' | null;
    groupLabel?: string; // division or conference label for separator rows
}

export const StandingsView: React.FC<StandingsViewProps> = ({ teams, schedule, onTeamClick }) => {
    const [mode, setMode] = useState<StandingsMode>('League');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'pct', direction: 'desc' });

    // Compute extended stats
    const statsMap = useMemo(() => computeStandingsStats(teams, schedule), [teams, schedule]);

    // Playoff status calculation (existing algorithm preserved)
    const teamStatusMap = useMemo(() => {
        const map: Record<string, 'clinched_playoff' | 'clinched_playin' | 'eliminated' | null> = {};
        ['East', 'West'].forEach(conf => {
            const confTeams = teams.filter(t => t.conference === conf);
            const sorted = [...confTeams].sort((a, b) => {
                const aPct = (a.wins + a.losses === 0) ? 0 : a.wins / (a.wins + a.losses);
                const bPct = (b.wins + b.losses === 0) ? 0 : b.wins / (b.wins + b.losses);
                return bPct - aPct || b.wins - a.wins;
            });

            const rank7 = sorted[6];
            const rank10 = sorted[9];
            const rank11 = sorted[10];

            sorted.forEach(t => {
                const remaining = 82 - (t.wins + t.losses);
                const maxWins = t.wins + remaining;

                if (rank10 && maxWins < rank10.wins) {
                    map[t.id] = 'eliminated';
                    return;
                }
                if (rank7) {
                    const rank7Max = rank7.wins + (82 - (rank7.wins + rank7.losses));
                    if (t.wins > rank7Max) {
                        map[t.id] = 'clinched_playoff';
                        return;
                    }
                }
                if (rank11) {
                    const rank11Max = rank11.wins + (82 - (rank11.wins + rank11.losses));
                    if (t.wins > rank11Max) {
                        map[t.id] = 'clinched_playin';
                        return;
                    }
                }
            });
        });
        return map;
    }, [teams]);

    // Sort helper
    const getSortValue = (t: Team, rec: StandingsRecord, key: string): number => {
        switch (key) {
            case 'pct': return rec.pct;
            case 'wins': return rec.wins;
            case 'losses': return rec.losses;
            case 'home': return rec.home.w / Math.max(1, rec.home.w + rec.home.l);
            case 'away': return rec.away.w / Math.max(1, rec.away.w + rec.away.l);
            case 'div': return rec.div.w / Math.max(1, rec.div.w + rec.div.l);
            case 'conf': return rec.conf.w / Math.max(1, rec.conf.w + rec.conf.l);
            case 'ppg': return rec.ppg;
            case 'oppg': return rec.oppg;
            case 'diff': return rec.diff;
            case 'streak': {
                const n = parseInt(rec.streak.slice(1)) || 0;
                return rec.streak.startsWith('W') ? n : -n;
            }
            case 'l10': return rec.l10.w;
            default: return 0;
        }
    };

    // Build ranked rows grouped by mode
    const rankedRows = useMemo((): RankedTeam[] => {
        const sortTeams = (list: Team[]): Team[] => {
            return [...list].sort((a, b) => {
                const recA = statsMap[a.id];
                const recB = statsMap[b.id];
                if (!recA || !recB) return 0;

                // Primary sort: user-selected column
                const valA = getSortValue(a, recA, sortConfig.key);
                const valB = getSortValue(b, recB, sortConfig.key);
                const diff = sortConfig.direction === 'desc' ? valB - valA : valA - valB;
                if (diff !== 0) return diff;

                // Tiebreaker: PCT desc, then wins desc
                const pctDiff = recB.pct - recA.pct;
                if (pctDiff !== 0) return pctDiff;
                return recB.wins - recA.wins;
            });
        };

        const buildGroup = (list: Team[], groupLabel?: string): RankedTeam[] => {
            const sorted = sortTeams(list);
            const leader = sorted[0];
            const leaderRec = leader ? statsMap[leader.id] : null;

            return sorted.map((t, i) => {
                const rec = statsMap[t.id];
                let gb = '-';
                if (leader && leaderRec && t.id !== leader.id) {
                    gb = (((leaderRec.wins - leaderRec.losses) - (rec.wins - rec.losses)) / 2).toFixed(1);
                }
                return {
                    team: t,
                    rank: i + 1,
                    rec,
                    gb,
                    status: teamStatusMap[t.id] || null,
                    groupLabel: i === 0 ? groupLabel : undefined,
                };
            });
        };

        if (mode === 'League') {
            return buildGroup(teams);
        }
        if (mode === 'Conference') {
            return [
                ...buildGroup(teams.filter(t => t.conference === 'East'), '동부 컨퍼런스'),
                ...buildGroup(teams.filter(t => t.conference === 'West'), '서부 컨퍼런스'),
            ];
        }
        // Division
        const rows: RankedTeam[] = [];
        for (const div of DIVISIONS) {
            const divTeams = teams.filter(t => t.division === div);
            if (divTeams.length > 0) {
                rows.push(...buildGroup(divTeams, DIVISION_KOREAN[div] || div));
            }
        }
        return rows;
    }, [teams, statsMap, teamStatusMap, mode, sortConfig]);

    const handleSort = (key: string) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
        }));
    };

    if (!teams || teams.length === 0) return (
        <div className="flex h-[400px] items-center justify-center">
            <Loader2 size={40} className="text-indigo-500 animate-spin" />
        </div>
    );

    const COLS = [
        { key: 'rank', label: '#', width: 44, align: 'center' as const, sortable: false },
        { key: 'team', label: 'TEAM', width: 200, align: 'left' as const, sortable: false },
        { key: 'wins', label: 'W', width: 48, align: 'center' as const, sortable: true },
        { key: 'losses', label: 'L', width: 48, align: 'center' as const, sortable: true },
        { key: 'pct', label: 'PCT', width: 60, align: 'center' as const, sortable: true },
        { key: 'gb', label: 'GB', width: 52, align: 'center' as const, sortable: false },
        { key: 'home', label: 'HOME', width: 64, align: 'center' as const, sortable: true },
        { key: 'away', label: 'AWAY', width: 64, align: 'center' as const, sortable: true },
        { key: 'div', label: 'DIV', width: 64, align: 'center' as const, sortable: true },
        { key: 'conf', label: 'CONF', width: 64, align: 'center' as const, sortable: true },
        { key: 'ppg', label: 'PPG', width: 58, align: 'center' as const, sortable: true },
        { key: 'oppg', label: 'OPPG', width: 58, align: 'center' as const, sortable: true },
        { key: 'diff', label: 'DIFF', width: 58, align: 'center' as const, sortable: true },
        { key: 'streak', label: 'STRK', width: 56, align: 'center' as const, sortable: true },
        { key: 'l10', label: 'L10', width: 56, align: 'center' as const, sortable: true },
    ];

    const dataTextBase = 'font-mono text-xs tabular-nums';

    // Format helpers
    const fmtRecord = (r: { w: number; l: number }) => `${r.w}-${r.l}`;
    const fmtPct = (v: number) => v.toFixed(3).replace(/^0/, '');
    const fmtPpg = (v: number) => v > 0 ? v.toFixed(1) : '-';
    const fmtDiff = (v: number) => {
        if (v === 0) return '0.0';
        return (v > 0 ? '+' : '') + v.toFixed(1);
    };

    const getCellValue = (rec: StandingsRecord, key: string, gb: string) => {
        switch (key) {
            case 'wins': return rec.wins;
            case 'losses': return rec.losses;
            case 'pct': return fmtPct(rec.pct);
            case 'gb': return gb;
            case 'home': return fmtRecord(rec.home);
            case 'away': return fmtRecord(rec.away);
            case 'div': return fmtRecord(rec.div);
            case 'conf': return fmtRecord(rec.conf);
            case 'ppg': return fmtPpg(rec.ppg);
            case 'oppg': return fmtPpg(rec.oppg);
            case 'diff': return fmtDiff(rec.diff);
            case 'streak': return rec.streak;
            case 'l10': return fmtRecord(rec.l10);
            default: return '';
        }
    };

    const getDiffColor = (v: number) => {
        if (v > 0) return 'text-emerald-400';
        if (v < 0) return 'text-red-400';
        return 'text-slate-500';
    };

    const getStreakColor = (s: string) => {
        if (s.startsWith('W')) return 'text-emerald-400';
        if (s.startsWith('L')) return 'text-red-400';
        return 'text-slate-500';
    };

    const getL10Color = (l10: { w: number; l: number }) => {
        if (l10.w > l10.l) return 'text-emerald-400';
        if (l10.l > l10.w) return 'text-red-400';
        return '';
    };

    // Precompute cutoff line positions (team IDs after which to draw lines)
    const cutoffLines = useMemo(() => {
        if (mode !== 'Conference') return { playoff: new Set<string>(), playin: new Set<string>() };
        const playoff = new Set<string>();
        const playin = new Set<string>();
        let rank = 0;
        for (const row of rankedRows) {
            if (row.groupLabel) rank = 0;
            rank++;
            if (rank === 6) playoff.add(row.team.id);
            if (rank === 10) playin.add(row.team.id);
        }
        return { playoff, playin };
    }, [rankedRows, mode]);

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-500 overflow-hidden">
            {/* Header Bar */}
            <div className="flex-shrink-0 px-6 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Trophy size={16} className="text-slate-500" />
                    <span className="text-xs font-black text-slate-300 uppercase tracking-widest">리그 순위표</span>
                </div>
                <div className="flex p-1 bg-slate-900 rounded-xl border border-slate-800">
                    {(['League', 'Conference', 'Division'] as StandingsMode[]).map(m => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                mode === m
                                    ? 'bg-indigo-600 text-white shadow-md'
                                    : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            {MODE_LABELS[m]}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 min-h-0">
                <Table
                    style={{ tableLayout: 'fixed', minWidth: '100%' }}
                    fullHeight={true}
                    className="!rounded-none !border-x-0 !border-t-0"
                >
                    <colgroup>
                        {COLS.map(c => (
                            <col key={c.key} style={{ width: c.width }} />
                        ))}
                    </colgroup>
                    {/* League mode: sticky header; Conference/Division: header per group */}
                    {mode === 'League' && (
                        <TableHead noRow>
                            <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest h-10">
                                {COLS.map(c => (
                                    <TableHeaderCell
                                        key={c.key}
                                        align={c.align}
                                        width={c.width}
                                        className={`border-r border-slate-800 bg-slate-950 ${c.key === 'team' ? 'pl-4' : ''}`}
                                        sortable={c.sortable}
                                        onSort={c.sortable ? () => handleSort(c.key) : undefined}
                                        sortDirection={sortConfig.key === c.key ? sortConfig.direction : null}
                                    >
                                        {c.label}
                                    </TableHeaderCell>
                                ))}
                            </tr>
                        </TableHead>
                    )}
                    <TableBody>
                        {rankedRows.map((row) => {
                            const { team: t, rank, rec, gb, status, groupLabel } = row;

                            const nameColor = status === 'clinched_playoff'
                                ? 'text-emerald-400'
                                : status === 'eliminated'
                                    ? 'text-slate-600'
                                    : 'text-slate-100';

                            const showPlayoffLine = cutoffLines.playoff.has(t.id);
                            const showPlayinLine = cutoffLines.playin.has(t.id);

                            return (
                                <React.Fragment key={`${mode}-${t.id}`}>
                                    {/* Group sub-header: group title in merged #/TEAM + column labels */}
                                    {groupLabel && (
                                        <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest h-10">
                                            <td colSpan={2} className="pl-4 bg-slate-950 border-b border-slate-800 border-r border-slate-800 text-indigo-400">
                                                {groupLabel}
                                            </td>
                                            {COLS.slice(2).map(c => (
                                                <td
                                                    key={c.key}
                                                    onClick={c.sortable ? () => handleSort(c.key) : undefined}
                                                    className={`text-center bg-slate-950 border-b border-slate-800 border-r border-slate-800 ${c.sortable ? 'cursor-pointer hover:text-slate-300 select-none' : ''}`}
                                                >
                                                    {c.label}
                                                    {c.sortable && sortConfig.key === c.key && (
                                                        <span className="ml-0.5 text-indigo-400">{sortConfig.direction === 'desc' ? '▼' : '▲'}</span>
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    )}

                                    <TableRow onClick={() => onTeamClick(t.id)} className="group cursor-pointer">
                                        {/* Rank */}
                                        <TableCell align="center" className={`${dataTextBase} text-white border-r border-slate-800/30`}>
                                            {rank}
                                        </TableCell>

                                        {/* Team */}
                                        <TableCell className="pl-4 border-r border-slate-800/30">
                                            <div className="flex items-center gap-2.5 group-hover:translate-x-0.5 transition-transform">
                                                <TeamLogo teamId={t.id} size="sm" />
                                                <span className={`text-xs truncate transition-colors ${nameColor} group-hover:text-indigo-400`}>
                                                    {t.city} {t.name}
                                                </span>
                                            </div>
                                        </TableCell>

                                        {/* Data columns */}
                                        {COLS.slice(2).map(c => {
                                            const val = getCellValue(rec, c.key, gb);
                                            let colorClass = 'text-white';
                                            if (c.key === 'diff') colorClass = getDiffColor(rec.diff);
                                            else if (c.key === 'streak') colorClass = getStreakColor(rec.streak);
                                            else if (c.key === 'l10') colorClass = getL10Color(rec.l10) || 'text-white';

                                            return (
                                                <TableCell
                                                    key={c.key}
                                                    align="center"
                                                    className={`${dataTextBase} ${colorClass} border-r border-slate-800/30`}
                                                >
                                                    {val}
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>

                                    {/* Playoff cutoff line */}
                                    {showPlayoffLine && (
                                        <tr>
                                            <td colSpan={COLS.length} className="p-0">
                                                <div className="h-[1px] bg-emerald-500/40" />
                                            </td>
                                        </tr>
                                    )}

                                    {/* Play-in cutoff line */}
                                    {showPlayinLine && (
                                        <tr>
                                            <td colSpan={COLS.length} className="p-0">
                                                <div className="h-[1px] bg-amber-500/40" />
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};
