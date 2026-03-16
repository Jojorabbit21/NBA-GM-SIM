
import React, { useState, useMemo } from 'react';
import { Team, Game } from '../../types';
import { TeamLogo } from '../common/TeamLogo';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell, TableFoot } from '../common/Table';
import { fetchFullGameResult } from '../../services/queries';
import { Loader2 } from 'lucide-react';

interface TeamGameLogProps {
    team: Team;
    schedule: Game[];
    allTeams: Team[];
    onViewGameResult: (result: any) => void;
    userId?: string;
}

// Column definitions for game log table
const GAME_INFO_COLS = [
    { key: 'date', label: '날짜', width: 80 },
    { key: 'ha', label: '구분', width: 36 },
    { key: 'opp', label: '상대', width: 160 },
    { key: 'result', label: '결과', width: 36 },
    { key: 'score', label: '스코어', width: 80 },
];

const STAT_COLS = [
    { key: 'pts', label: 'PTS' },
    { key: 'oreb', label: 'OREB' },
    { key: 'dreb', label: 'DREB' },
    { key: 'reb', label: 'REB' },
    { key: 'ast', label: 'AST' },
    { key: 'stl', label: 'STL' },
    { key: 'blk', label: 'BLK' },
    { key: 'tov', label: 'TOV' },
    { key: 'pf', label: 'PF' },
    { key: 'tf', label: 'TF' },
    { key: 'ff', label: 'FF' },
    { key: 'fgm', label: 'FGM' },
    { key: 'fga', label: 'FGA' },
    { key: 'fg%', label: 'FG%' },
    { key: '3pm', label: '3PM' },
    { key: '3pa', label: '3PA' },
    { key: '3p%', label: '3P%' },
    { key: 'ftm', label: 'FTM' },
    { key: 'fta', label: 'FTA' },
    { key: 'ft%', label: 'FT%' },
    { key: 'ts%', label: 'TS%' },
];

const STAT_WIDTH = 56;
const TOTAL_COLS = GAME_INFO_COLS.length + STAT_COLS.length;

type GameRow = {
    gameId: string;
    date: string;
    isHome: boolean;
    oppId: string;
    isWin: boolean;
    myScore: number;
    oppScore: number;
    isPlayoff: boolean;
    stats: Record<string, number>;
};

export const TeamGameLog: React.FC<TeamGameLogProps> = ({ team, schedule, allTeams, onViewGameResult, userId }) => {
    const [fetchingGameId, setFetchingGameId] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'asc' });

    const handleSort = (key: string) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
    };

    // Build game rows with stats from homeStats/awayStats
    const gameRows = useMemo((): GameRow[] => {
        return schedule
            .filter(g => g.played && (g.homeTeamId === team.id || g.awayTeamId === team.id))
            .map(g => {
                const isHome = g.homeTeamId === team.id;
                const myScore = isHome ? (g.homeScore ?? 0) : (g.awayScore ?? 0);
                const oppScore = isHome ? (g.awayScore ?? 0) : (g.homeScore ?? 0);
                const raw = isHome ? (g as any).homeStats : (g as any).awayStats;
                const s = raw || {};

                const fgm = s.fgm || 0, fga = s.fga || 0;
                const p3m = s.p3m || 0, p3a = s.p3a || 0;
                const ftm = s.ftm || 0, fta = s.fta || 0;
                const tsa = fga + 0.44 * fta;

                return {
                    gameId: g.id,
                    date: g.date,
                    isHome,
                    oppId: isHome ? g.awayTeamId : g.homeTeamId,
                    isWin: myScore > oppScore,
                    myScore,
                    oppScore,
                    isPlayoff: g.isPlayoff || false,
                    stats: {
                        pts: myScore,
                        oreb: s.offReb || 0,
                        dreb: s.defReb || 0,
                        reb: s.reb || 0,
                        ast: s.ast || 0,
                        stl: s.stl || 0,
                        blk: s.blk || 0,
                        tov: s.tov || 0,
                        pf: s.pf || 0,
                        tf: s.techFouls || 0,
                        ff: s.flagrantFouls || 0,
                        fgm, fga,
                        'fg%': fga > 0 ? fgm / fga : 0,
                        '3pm': p3m, '3pa': p3a,
                        '3p%': p3a > 0 ? p3m / p3a : 0,
                        ftm, fta,
                        'ft%': fta > 0 ? ftm / fta : 0,
                        'ts%': tsa > 0 ? myScore / (2 * tsa) : 0,
                    }
                };
            });
    }, [schedule, team.id]);

    // Sort
    const sortedRows = useMemo(() => {
        return [...gameRows].sort((a, b) => {
            let aVal: number, bVal: number;
            if (sortConfig.key === 'date') {
                aVal = a.date.localeCompare(b.date);
                bVal = 0;
                return sortConfig.direction === 'desc' ? -aVal : aVal;
            }
            aVal = a.stats[sortConfig.key] ?? 0;
            bVal = b.stats[sortConfig.key] ?? 0;
            return sortConfig.direction === 'desc' ? bVal - aVal : aVal - bVal;
        });
    }, [gameRows, sortConfig]);

    // Split into regular season / playoff
    const { regularRows, playoffRows } = useMemo(() => ({
        regularRows: sortedRows.filter(r => !r.isPlayoff),
        playoffRows: sortedRows.filter(r => r.isPlayoff),
    }), [sortedRows]);

    // Season averages
    const seasonAvg = useMemo(() => {
        const n = gameRows.length;
        if (n === 0) return null;
        const avg: Record<string, number> = {};
        STAT_COLS.forEach(c => {
            if (c.key.includes('%')) {
                let num = 0, den = 0;
                gameRows.forEach(r => {
                    if (c.key === 'fg%') { num += r.stats.fgm; den += r.stats.fga; }
                    else if (c.key === '3p%') { num += r.stats['3pm']; den += r.stats['3pa']; }
                    else if (c.key === 'ft%') { num += r.stats.ftm; den += r.stats.fta; }
                    else if (c.key === 'ts%') { if (r.stats.fga > 0) { num += r.stats.pts; den += 2 * (r.stats.fga + 0.44 * r.stats.fta); } }
                });
                avg[c.key] = den > 0 ? num / den : 0;
            } else {
                avg[c.key] = gameRows.reduce((sum, r) => sum + (r.stats[c.key] || 0), 0) / n;
            }
        });
        return avg;
    }, [gameRows]);

    const handleGameClick = async (gameId: string) => {
        if (fetchingGameId || !userId) return;
        setFetchingGameId(gameId);
        try {
            const raw = await fetchFullGameResult(gameId, userId);
            if (!raw) return;
            const homeTeam = allTeams.find(t => t.id === raw.home_team_id);
            const awayTeam = allTeams.find(t => t.id === raw.away_team_id);
            if (!homeTeam || !awayTeam) return;
            onViewGameResult({
                home: homeTeam, away: awayTeam,
                homeScore: raw.home_score, awayScore: raw.away_score,
                homeBox: raw.box_score?.home || [], awayBox: raw.box_score?.away || [],
                homeTactics: raw.tactics?.home, awayTactics: raw.tactics?.away,
                pbpLogs: raw.pbp_logs || [], pbpShotEvents: raw.shot_events || [],
                rotationData: raw.rotation_data,
                quarterScoresData: raw.quarter_scores,
                otherGames: [], date: raw.date, recap: []
            });
        } finally {
            setFetchingGameId(null);
        }
    };

    const formatStat = (key: string, val: number) => {
        if (key.includes('%')) return (val * 100).toFixed(1) + '%';
        if (['fgm', 'fga', '3pm', '3pa', 'ftm', 'fta'].includes(key)) return Math.round(val).toString();
        return Math.round(val).toString();
    };

    const formatAvg = (key: string, val: number) => {
        if (key.includes('%')) return (val * 100).toFixed(1) + '%';
        return val.toFixed(1);
    };

    const statCellClass = "text-xs font-medium text-white font-mono tabular-nums";

    const renderGameRow = (row: GameRow) => {
        const oppTeam = allTeams.find(t => t.id === row.oppId);
        const isFetching = fetchingGameId === row.gameId;

        return (
            <TableRow key={row.gameId} className="h-10">
                {/* 날짜 */}
                <TableCell className="border-r border-slate-800/30 text-center align-middle text-xs">
                    <span className="font-medium text-slate-400 tabular-nums">{row.date.slice(5).replace('-', '/')}</span>
                </TableCell>
                {/* 구분 */}
                <TableCell className="border-r border-slate-800/30 text-center align-middle text-xs">
                    <span className="font-medium text-slate-400">
                        {row.isHome ? 'vs' : '@'}
                    </span>
                </TableCell>
                {/* 상대 */}
                <TableCell className="border-r border-slate-800/30 pl-4">
                    <div className="flex items-center gap-2">
                        <TeamLogo teamId={row.oppId} size="sm" />
                        <span className="text-xs font-semibold text-slate-300 uppercase truncate group-hover:text-white transition-colors">
                            {oppTeam?.name || row.oppId}
                        </span>
                    </div>
                </TableCell>
                {/* 결과 */}
                <TableCell className="border-r border-slate-800/30 text-center align-middle text-xs">
                    <span className={`font-medium ${row.isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                        {row.isWin ? 'W' : 'L'}
                    </span>
                </TableCell>
                {/* 스코어 */}
                <TableCell className="border-r border-slate-800/30 text-center align-middle text-xs">
                    {isFetching ? (
                        <Loader2 size={14} className="animate-spin text-indigo-400 mx-auto" />
                    ) : (
                        <span
                            className={`font-medium font-mono tabular-nums cursor-pointer hover:underline ${row.isWin ? 'text-emerald-300' : 'text-red-300'}`}
                            onClick={() => handleGameClick(row.gameId)}
                        >
                            {row.myScore}-{row.oppScore}
                        </span>
                    )}
                </TableCell>
                {/* STAT COLS */}
                {STAT_COLS.map(c => (
                    <TableCell key={c.key} className={`border-r border-slate-800/30 text-center ${statCellClass}`}>
                        {formatStat(c.key, row.stats[c.key])}
                    </TableCell>
                ))}
            </TableRow>
        );
    };

    const renderSectionHeader = (label: string) => (
        <tr key={`section-${label}`} className="h-8">
            <td colSpan={TOTAL_COLS} className="bg-slate-800 border-b border-slate-800/50 h-8">
                <div className="flex items-center h-full pl-4">
                    <span className="text-xs font-black text-slate-500 tracking-widest">{label}</span>
                </div>
            </td>
        </tr>
    );

    if (gameRows.length === 0) {
        return (
            <div className="h-full flex items-center justify-center">
                <span className="text-slate-500 font-bold uppercase tracking-widest text-sm">경기 기록이 없습니다.</span>
            </div>
        );
    }

    return (
        <Table className="!rounded-none !border-0 !shadow-none" fullHeight tableStyle={{ tableLayout: 'fixed', minWidth: '100%' }}>
            <colgroup>
                {GAME_INFO_COLS.map(c => <col key={c.key} style={{ width: c.width }} />)}
                {STAT_COLS.map(c => <col key={c.key} style={{ width: STAT_WIDTH }} />)}
            </colgroup>

            <TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm" noRow>
                {/* Group row */}
                <tr className="h-8">
                    <th colSpan={GAME_INFO_COLS.length} className="bg-slate-950 border-b border-r border-slate-800 h-8">
                        <div className="flex items-center justify-center h-full">
                            <span className="text-xs font-black text-slate-500 tracking-widest">경기 정보</span>
                        </div>
                    </th>
                    <th colSpan={STAT_COLS.length} className="bg-slate-950 border-b border-slate-800 h-8">
                        <div className="flex items-center justify-center h-full">
                            <span className="text-xs font-black text-slate-400 tracking-widest">팀 스탯</span>
                        </div>
                    </th>
                </tr>
                {/* Column headers */}
                <tr className="text-slate-500 text-xs font-black uppercase tracking-widest h-8">
                    {GAME_INFO_COLS.map(c => (
                        <TableHeaderCell
                            key={c.key}
                            align={c.key === 'opp' ? 'left' : 'center'}
                            className={`border-r border-slate-800 bg-slate-950 ${c.key === 'opp' ? 'pl-4' : ''} ${sortConfig.key === c.key ? 'text-indigo-400' : 'text-slate-400'}`}
                            sortable={c.key === 'date'}
                            onSort={c.key === 'date' ? () => handleSort('date') : undefined}
                            sortDirection={sortConfig.key === 'date' && c.key === 'date' ? sortConfig.direction : null}
                        >
                            {c.label}
                        </TableHeaderCell>
                    ))}
                    {STAT_COLS.map(c => (
                        <TableHeaderCell
                            key={c.key}
                            className={`border-r border-slate-800 bg-slate-950 ${sortConfig.key === c.key ? 'text-indigo-400' : 'text-slate-400'}`}
                            sortable
                            onSort={() => handleSort(c.key)}
                            sortDirection={sortConfig.key === c.key ? sortConfig.direction : null}
                        >
                            {c.label}
                        </TableHeaderCell>
                    ))}
                </tr>
            </TableHead>

            <TableBody>
                {regularRows.length > 0 && (
                    <>
                        {renderSectionHeader('정규 시즌')}
                        {regularRows.map(renderGameRow)}
                    </>
                )}
                {playoffRows.length > 0 && (
                    <>
                        {renderSectionHeader('플레이오프')}
                        {playoffRows.map(renderGameRow)}
                    </>
                )}
            </TableBody>

            {seasonAvg && (
                <TableFoot className="bg-slate-900 border-t-2 border-slate-800 sticky bottom-0 z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
                    <tr className="h-10">
                        <TableCell colSpan={GAME_INFO_COLS.length} className="pl-4 text-left bg-slate-950 border-r border-slate-800">
                            <span className="font-black text-indigo-400 text-xs tracking-widest">시즌 평균 ({gameRows.length}경기)</span>
                        </TableCell>
                        {STAT_COLS.map(c => (
                            <TableCell key={c.key} className="border-r border-slate-800/30 text-center">
                                <span className="text-xs font-medium text-slate-400 font-mono tabular-nums">
                                    {formatAvg(c.key, seasonAvg[c.key])}
                                </span>
                            </TableCell>
                        ))}
                    </tr>
                </TableFoot>
            )}
        </Table>
    );
};
