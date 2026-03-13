
import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Player, PlayerStats, Team } from '../types';
import { getTeamLogoUrl, calculatePlayerOvr } from '../utils/constants';
import { TEAM_DATA } from '../data/teamData';
import { getTeamTheme } from '../utils/teamTheme';
import { OvrBadge } from '../components/common/OvrBadge';
import { StarRating } from '../components/common/StarRating';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/common/Table';
import {
    ZONE_PATHS, COURT_LINES, ZONE_AVG,
    ZONE_CONFIG as CHART_ZONES,
    getZoneStyle, getZoneVolumeStyle, getZonePillColors
} from '../utils/courtZones';
import { ATTR_GROUPS, ATTR_AVG_KEYS, ATTR_KR_LABEL } from '../data/attributeConfig';
import { generateScoutReport } from '../utils/scoutReport';
import { usePlayerGameLog } from '../services/queries';
import { HeaderAwardTrophies } from '../components/common/PlayerAwardBadges';

interface PlayerDetailViewProps {
    player: Player;
    teamName?: string;
    teamId?: string;
    allTeams?: Team[];
    tendencySeed?: string;
    onBack: () => void;
}


// ── Stats Sections Config (matches Leaderboard Player > Traditional) ──
const TRAD_COLS = [
    { key: 'g', label: 'G' }, { key: 'mp', label: 'MIN' },
    { key: 'pts', label: 'PTS' }, { key: 'oreb', label: 'OREB' }, { key: 'dreb', label: 'DREB' },
    { key: 'reb', label: 'REB' }, { key: 'ast', label: 'AST' }, { key: 'stl', label: 'STL' },
    { key: 'blk', label: 'BLK' }, { key: 'tov', label: 'TOV' }, { key: 'pf', label: 'PF' },
    { key: 'fgm', label: 'FGM' }, { key: 'fga', label: 'FGA' }, { key: 'fg%', label: 'FG%' },
    { key: '3pm', label: '3PM' }, { key: '3pa', label: '3PA' }, { key: '3p%', label: '3P%' },
    { key: 'ftm', label: 'FTM' }, { key: 'fta', label: 'FTA' }, { key: 'ft%', label: 'FT%' },
    { key: 'pm', label: '+/-' },
];

// ── Advanced (matches Leaderboard Player > Advanced) ──
const ADVANCED_COLS = [
    { key: 'ts%', label: 'TS%' }, { key: 'efg%', label: 'eFG%' }, { key: 'tov%', label: 'TOV%' },
    { key: 'usg%', label: 'USG%' }, { key: 'ast%', label: 'AST%' },
    { key: 'orb%', label: 'ORB%' }, { key: 'drb%', label: 'DRB%' }, { key: 'trb%', label: 'TRB%' },
    { key: 'stl%', label: 'STL%' }, { key: 'blk%', label: 'BLK%' },
    { key: '3par', label: '3PAr' }, { key: 'ftr', label: 'FTr' },
    { key: 'tf', label: 'TF' }, { key: 'ff', label: 'FF' },
];

// ── Zone stat key mapping (for shot chart SVG) ──
const ZONE_TABLE = [
    { key: 'rim', label: 'RIM', keyM: 'zone_rim_m', keyA: 'zone_rim_a' },
    { key: 'paint', label: 'PAINT', keyM: 'zone_paint_m', keyA: 'zone_paint_a' },
    { key: 'midL', label: 'MID-L', keyM: 'zone_mid_l_m', keyA: 'zone_mid_l_a' },
    { key: 'midC', label: 'MID-C', keyM: 'zone_mid_c_m', keyA: 'zone_mid_c_a' },
    { key: 'midR', label: 'MID-R', keyM: 'zone_mid_r_m', keyA: 'zone_mid_r_a' },
    { key: 'c3L', label: 'C3-L', keyM: 'zone_c3_l_m', keyA: 'zone_c3_l_a' },
    { key: 'atb3L', label: 'ATB-L', keyM: 'zone_atb3_l_m', keyA: 'zone_atb3_l_a' },
    { key: 'atb3C', label: 'ATB-C', keyM: 'zone_atb3_c_m', keyA: 'zone_atb3_c_a' },
    { key: 'atb3R', label: 'ATB-R', keyM: 'zone_atb3_r_m', keyA: 'zone_atb3_r_a' },
    { key: 'c3R', label: 'C3-R', keyM: 'zone_c3_r_m', keyA: 'zone_c3_r_a' },
];
const ZONE_STAT_KEYS: Record<string, { keyM: string; keyA: string }> = {};
ZONE_TABLE.forEach(z => { ZONE_STAT_KEYS[z.key] = { keyM: z.keyM, keyA: z.keyA }; });

// ── Game Log Columns (matches Traditional + DATE/OPP/RESULT) ──
const GAME_LOG_COLS = [
    { key: 'date', label: 'DATE' }, { key: 'opp', label: 'OPP' }, { key: 'result', label: 'RESULT' },
    { key: 'min', label: 'MIN' },
    { key: 'pts', label: 'PTS' }, { key: 'oreb', label: 'OREB' }, { key: 'dreb', label: 'DREB' },
    { key: 'reb', label: 'REB' }, { key: 'ast', label: 'AST' }, { key: 'stl', label: 'STL' },
    { key: 'blk', label: 'BLK' }, { key: 'tov', label: 'TOV' }, { key: 'pf', label: 'PF' },
    { key: 'tf', label: 'TF' }, { key: 'ff', label: 'FF' },
    { key: 'fg%', label: 'FG%' }, { key: '3p%', label: '3P%' }, { key: 'ft%', label: 'FT%' },
    { key: 'ts%', label: 'TS%' }, { key: 'pm', label: '+/-' },
];

const getAttrColor = (val: number) => {
    if (val >= 90) return 'text-fuchsia-400';
    if (val >= 80) return 'text-emerald-400';
    if (val >= 70) return 'text-amber-400';
    return 'text-slate-500';
};

const getAttrBg = (val: number) => {
    if (val >= 90) return 'bg-fuchsia-500/10';
    if (val >= 80) return 'bg-emerald-500/10';
    if (val >= 70) return 'bg-amber-500/10';
    return '';
};

const formatSalary = (salary: number): string => {
    if (salary >= 1_000_000) return `$${(salary / 1_000_000).toFixed(1)}M`;
    if (salary >= 1_000) return `$${(salary / 1_000).toFixed(0)}k`;
    return `$${salary}`;
};

// ── Hidden Archetypes ──
function getHiddenArchetypes(p: Player): string[] {
    const list: string[] = [];
    const threeVal = Math.round((p.threeCorner + p.three45 + p.threeTop) / 3);

    if (p.intangibles >= 90 && p.shotIq >= 85) list.push('Curtain Call');
    if (p.intangibles >= 85 && p.offConsist >= 88) list.push('Ice in Veins');
    if (p.intangibles >= 85 && p.strength >= 85 && p.ins >= 85) list.push('High Roller');
    if (p.midRange >= 97) list.push('Mr. Fundamental');
    if (threeVal >= 90 && p.shotIq >= 85) list.push('Rangemaster');
    if (p.ins >= 90 && (p.strength >= 88 || p.vertical >= 88)) list.push('Tyrant');
    if (p.closeShot >= 96 && p.agility >= 85 && p.height <= 195) list.push('Levitator');
    if (p.speed >= 95 && p.agility >= 93) list.push('Afterburner');
    if ((p.position === 'PG' || p.position === 'SG') && p.vertical >= 95 && p.closeShot >= 93) list.push('Ascendant');
    if (p.shotIq >= 88 && p.offConsist >= 88) list.push('Deadeye');
    if (p.steal >= 85 && p.agility >= 92) list.push('The Pickpocket');
    if (p.helpDefIq >= 85 && p.passPerc >= 80 && p.steal >= 75) list.push('The Hawk');
    if (p.height >= 216 && p.blk >= 80) list.push('The Alien');
    else if (p.vertical >= 95 && p.blk >= 75) list.push('Skywalker');
    else if (p.helpDefIq >= 92 && p.blk >= 80) list.push('Defensive Anchor');
    if (p.drawFoul >= 95 && p.shotIq >= 88) list.push('Manipulator');
    if (p.offReb >= 95 || p.defReb >= 95) list.push('Harvester');
    if (p.height <= 200 && p.offReb >= 90 && p.vertical >= 90) list.push('Raider');
    if (p.passIq >= 92 && p.passVision >= 90 && p.passAcc >= 90) list.push('Clairvoyant');
    if (p.passIq >= 88 && p.passAcc >= 95) list.push('Overseer');
    if (p.passAcc >= 93 && p.passIq >= 88) list.push('Needle');

    return list;
}

// ── Stat value resolver ──
function resolveStatVal(st: PlayerStats, key: string): { display: string; color: string } {
    const dash = { display: '-', color: 'text-slate-600' };
    const gp = st.g || 1;
    const noData = st.mp === 0;
    if (noData && key !== 'g' && key !== 'gs') return dash;

    let val: string;
    let color = 'text-slate-300';

    switch (key) {
        case 'g': val = String(st.g); break;
        case 'gs': val = String(st.gs); break;
        case 'mp': val = (st.mp / gp).toFixed(1); break;
        case 'oreb': val = ((st.offReb || 0) / gp).toFixed(1); break;
        case 'dreb': val = ((st.defReb || 0) / gp).toFixed(1); break;
        case 'pf': val = ((st.pf || 0) / gp).toFixed(1); break;
        case 'pm': {
            const v = st.plusMinus / gp;
            val = (v > 0 ? '+' : '') + v.toFixed(1);
            color = v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-slate-500';
            break;
        }
        case 'fgm': val = (st.fgm / gp).toFixed(1); break;
        case 'fga': val = (st.fga / gp).toFixed(1); break;
        case '3pm': val = (st.p3m / gp).toFixed(1); break;
        case '3pa': val = (st.p3a / gp).toFixed(1); break;
        case 'ftm': val = (st.ftm / gp).toFixed(1); break;
        case 'fta': val = (st.fta / gp).toFixed(1); break;
        case 'fg%': val = st.fga > 0 ? (st.fgm / st.fga * 100).toFixed(1) + '%' : '-'; break;
        case '3p%': val = st.p3a > 0 ? (st.p3m / st.p3a * 100).toFixed(1) + '%' : '-'; break;
        case 'ft%': val = st.fta > 0 ? (st.ftm / st.fta * 100).toFixed(1) + '%' : '-'; break;
        case 'ts%': {
            const tsa = st.fga + 0.44 * st.fta;
            val = tsa > 0 ? (st.pts / (2 * tsa) * 100).toFixed(1) + '%' : '-';
            break;
        }
        case 'efg%': {
            val = st.fga > 0 ? ((st.fgm + 0.5 * st.p3m) / st.fga * 100).toFixed(1) + '%' : '-';
            break;
        }
        case 'tov%': {
            const den = st.fga + 0.44 * st.fta + st.tov;
            val = den > 0 ? (st.tov / den * 100).toFixed(1) + '%' : '-';
            break;
        }
        case '3par': val = st.fga > 0 ? (st.p3a / st.fga * 100).toFixed(1) + '%' : '-'; break;
        case 'ftr': val = st.fga > 0 ? (st.fta / st.fga * 100).toFixed(1) + '%' : '-'; break;
        case 'usg%': case 'ast%': case 'orb%': case 'drb%': case 'trb%': case 'stl%': case 'blk%': {
            const v = (st as any)[key];
            val = (v !== undefined && v > 0) ? (v * 100).toFixed(1) + '%' : '-';
            break;
        }
        case 'tf': val = String(st.techFouls || 0); break;
        case 'ff': val = String(st.flagrantFouls || 0); break;
        default:
            if (['pts', 'reb', 'ast', 'stl', 'blk', 'tov'].includes(key)) {
                val = ((st as any)[key] / gp).toFixed(1);
            } else {
                val = '0';
            }
    }
    return { display: val, color };
}

// ── Reusable: Stats sub-table (header + single data row), uses common Table ──
const StatsSubTable: React.FC<{ cols: { key: string; label: string }[]; stats: PlayerStats }> = ({ cols, stats }) => (
    <Table className="!rounded-none !border-0 !shadow-none !bg-transparent [&_thead]:!bg-slate-900 [&_tbody]:!bg-transparent [&_table]:table-fixed" fullHeight={false}>
        <TableHead>
            {cols.map((c, i) => (
                <TableHeaderCell
                    key={c.key}
                    align="center"
                    className={i < cols.length - 1 ? 'border-r border-r-slate-800/30' : ''}
                >
                    {c.label}
                </TableHeaderCell>
            ))}
        </TableHead>
        <TableBody>
            <TableRow className="h-10">
                {cols.map((c, i) => {
                    const { display, color } = resolveStatVal(stats, c.key);
                    return (
                        <TableCell
                            key={c.key}
                            align="center"
                            className={i < cols.length - 1 ? 'border-r border-r-slate-800/30' : ''}
                        >
                            <span className={`font-mono font-medium tabular-nums ${color}`}>{display}</span>
                        </TableCell>
                    );
                })}
            </TableRow>
        </TableBody>
    </Table>
);

// ── Game log cell builder ──
function buildGameLogCells(g: any): { val: string; color?: string }[] {
    const dateStr = g.date ? `${parseInt(g.date.split('-')[1])}/${parseInt(g.date.split('-')[2])}` : '-';
    const oppLabel = g.isHome ? g.opponentId?.toUpperCase() : `@${g.opponentId?.toUpperCase()}`;
    const won = g.teamScore > g.opponentScore;
    const resultStr = `${won ? 'W' : 'L'} ${g.teamScore}-${g.opponentScore}`;
    const fgPct = g.fga > 0 ? (g.fgm / g.fga * 100).toFixed(1) + '%' : '-';
    const p3Pct = g.p3a > 0 ? (g.p3m / g.p3a * 100).toFixed(1) + '%' : '-';
    const ftPct = g.fta > 0 ? (g.ftm / g.fta * 100).toFixed(1) + '%' : '-';
    const tsa = g.fga + 0.44 * (g.fta || 0);
    const tsPct = tsa > 0 ? ((g.pts || 0) / (2 * tsa) * 100).toFixed(1) + '%' : '-';
    const pmVal = g.plusMinus || 0;
    const pmStr = (pmVal > 0 ? '+' : '') + pmVal;

    return [
        { val: dateStr },
        { val: oppLabel },
        { val: resultStr, color: won ? 'text-emerald-400' : 'text-red-400' },
        { val: String(Math.round(g.mp || 0)) },
        { val: String(g.pts || 0) },
        { val: String(g.offReb || 0) },
        { val: String(g.defReb || 0) },
        { val: String(g.reb || 0) },
        { val: String(g.ast || 0) },
        { val: String(g.stl || 0) },
        { val: String(g.blk || 0) },
        { val: String(g.tov || 0) },
        { val: String(g.pf || 0) },
        { val: String(g.techFouls || 0) },
        { val: String(g.flagrantFouls || 0) },
        { val: fgPct },
        { val: p3Pct },
        { val: ftPct },
        { val: tsPct },
        { val: pmStr, color: pmVal > 0 ? 'text-emerald-400' : pmVal < 0 ? 'text-red-400' : undefined },
    ];
}

const ROW_HEIGHT = 40; // h-10 = 40px
const OVERSCAN = 5;

const VirtualGameLog: React.FC<{ gameLog: any[] | undefined; gameLogLoading: boolean; teamId?: string }> = React.memo(({ gameLog, gameLogLoading, teamId }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => setContainerHeight(entry.contentRect.height));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const processedRows = useMemo(() => {
        if (!gameLog || gameLog.length === 0) return [];
        return gameLog.map((g: any) => buildGameLogCells(g));
    }, [gameLog]);

    const totalRows = processedRows.length;
    const headerHeight = ROW_HEIGHT; // thead height
    const totalHeight = headerHeight + totalRows * ROW_HEIGHT;

    // visible range (account for sticky header)
    const scrollOffset = Math.max(0, scrollTop - headerHeight);
    const startIdx = Math.max(0, Math.floor(scrollOffset / ROW_HEIGHT) - OVERSCAN);
    const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT) + OVERSCAN * 2;
    const endIdx = Math.min(totalRows, startIdx + visibleCount);

    return (
        <div className="relative overflow-hidden" style={{ contain: 'strict' }}>
            <div
                ref={scrollRef}
                className="absolute inset-0 overflow-y-auto"
                onScroll={handleScroll}
            >
                {gameLogLoading && teamId && (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 size={16} className="text-slate-500 animate-spin" />
                    </div>
                )}
                {!gameLogLoading && (!gameLog || gameLog.length === 0) && (
                    <div className="flex items-center justify-center py-8">
                        <span className="text-xs text-slate-600">경기 기록이 없습니다</span>
                    </div>
                )}
                {totalRows > 0 && (
                    <div style={{ height: totalHeight, position: 'relative' }}>
                        <table className="w-full text-left border-separate border-spacing-0">
                            <thead className="bg-slate-900 sticky top-0 z-40 border-b border-slate-800 shadow-sm">
                                <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest h-10">
                                    {GAME_LOG_COLS.map((c, i) => (
                                        <th
                                            key={c.key}
                                            className={`py-3 px-1.5 whitespace-nowrap border-b border-slate-800 text-center ${i < GAME_LOG_COLS.length - 1 ? 'border-r border-r-slate-800/30' : ''}`}
                                        >
                                            <div className="flex items-center gap-1 justify-center">
                                                <span className="truncate min-w-0">{c.label}</span>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {/* top spacer */}
                                {startIdx > 0 && (
                                    <tr><td colSpan={GAME_LOG_COLS.length} style={{ height: startIdx * ROW_HEIGHT, padding: 0, border: 'none' }} /></tr>
                                )}
                                {processedRows.slice(startIdx, endIdx).map((cells, vi) => (
                                    <tr key={startIdx + vi} className="transition-colors hover:bg-white/5" style={{ height: ROW_HEIGHT }}>
                                        {cells.map((cell, ci) => (
                                            <td
                                                key={ci}
                                                className={`py-2 px-1.5 text-center whitespace-nowrap ${ci < cells.length - 1 ? 'border-r border-r-slate-800/30' : ''}`}
                                            >
                                                <span className={`font-mono font-medium tabular-nums ${cell.color || 'text-white'}`}>
                                                    {cell.val}
                                                </span>
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                                {/* bottom spacer */}
                                {endIdx < totalRows && (
                                    <tr><td colSpan={GAME_LOG_COLS.length} style={{ height: (totalRows - endIdx) * ROW_HEIGHT, padding: 0, border: 'none' }} /></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
});

export const PlayerDetailView: React.FC<PlayerDetailViewProps> = ({ player, teamName, teamId, allTeams, tendencySeed, onBack }) => {
    const teamColors = teamId ? (TEAM_DATA[teamId]?.colors || null) : null;
    const theme = getTeamTheme(teamId || null, teamColors);
    const calculatedOvr = calculatePlayerOvr(player);

    const scoutReport = useMemo(() => generateScoutReport(player, tendencySeed), [player, tendencySeed]);

    // 포지션 내 백분위 → 별점 (0.5~5.0)
    const positionStars = useMemo(() => {
        if (!allTeams) return null;
        const allPlayers = allTeams.flatMap(t => t.roster);
        const samePos = allPlayers.filter(p => p.position === player.position);
        const ovrs = samePos.map(p => calculatePlayerOvr(p));
        const belowCount = ovrs.filter(o => o < calculatedOvr).length;
        const pct = belowCount / Math.max(1, ovrs.length);
        return Math.round(Math.max(0.5, Math.min(5.0, 0.5 + pct * 4.5)) * 2) / 2;
    }, [player, allTeams, calculatedOvr]);

    const { data: gameLog, isLoading: gameLogLoading } = usePlayerGameLog(player.id, teamId);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onBack]);

    const s = player.stats;

    const chartZones = useMemo(() =>
        CHART_ZONES.map(z => {
            const sk = ZONE_STAT_KEYS[z.key];
            const m = sk ? ((s as any)[sk.keyM] || 0) : 0;
            const a = sk ? ((s as any)[sk.keyA] || 0) : 0;
            return { ...z, m, a, avg: ZONE_AVG[z.avgKey] };
        }),
    [s]);

    const hasPlayoffs = (player.playoffStats?.g ?? 0) > 0;
    const [showPlayoffStats, setShowPlayoffStats] = useState(false);
    const [shotChartMode, setShotChartMode] = useState<'efficiency' | 'volume'>('efficiency');
    const maxAttempts = useMemo(() => Math.max(...chartZones.map(z => z.a), 0), [chartZones]);
    const totalAttempts = useMemo(() => chartZones.reduce((sum, z) => sum + z.a, 0), [chartZones]);

    // Compute advanced rate stats (USG%, AST%, ORB%, etc.) for display
    // These are normally computed only in the leaderboard hook, not on the original stats objects.
    const displayStats = useMemo(() => {
        const rawStats = showPlayoffStats ? player.playoffStats! : s;
        if (!rawStats || !allTeams || !teamId) return rawStats;

        const team = allTeams.find(t => t.id === teamId);
        if (!team) return rawStats;

        const enriched = { ...rawStats } as any;
        const mp = enriched.mp || 0;
        if (mp === 0) return enriched;

        // Compute team totals from roster
        const getStats = (p: Player) => showPlayoffStats ? (p.playoffStats || { mp: 0, fga: 0, fta: 0, tov: 0, fgm: 0, offReb: 0, defReb: 0, reb: 0, stl: 0, blk: 0, p3a: 0 } as any) : p.stats;
        const teamMin = team.roster.reduce((sum, p) => sum + (getStats(p).mp || 0), 0) || 1;
        const teamFga = team.roster.reduce((sum, p) => sum + (getStats(p).fga || 0), 0);
        const teamFta = team.roster.reduce((sum, p) => sum + (getStats(p).fta || 0), 0);
        const teamTov = team.roster.reduce((sum, p) => sum + (getStats(p).tov || 0), 0);
        const teamFgm = team.roster.reduce((sum, p) => sum + (getStats(p).fgm || 0), 0);
        const teamOreb = team.roster.reduce((sum, p) => sum + (getStats(p).offReb || 0), 0);
        const teamDreb = team.roster.reduce((sum, p) => sum + (getStats(p).defReb || 0), 0);
        const teamReb = team.roster.reduce((sum, p) => sum + (getStats(p).reb || 0), 0);
        const teamUsage = teamFga + 0.44 * teamFta + teamTov;

        // USG%
        const playerPoss = enriched.fga + 0.44 * enriched.fta + enriched.tov;
        if (teamUsage > 0) {
            enriched['usg%'] = (playerPoss * (teamMin / 5)) / (mp * teamUsage);
        }

        // AST%
        const astDenom = ((mp / (teamMin / 5)) * teamFgm) - enriched.fgm;
        enriched['ast%'] = astDenom > 0 ? enriched.ast / astDenom : 0;

        // For opponent-dependent stats, approximate using league-wide averages
        let leagueOreb = 0, leagueDreb = 0, leagueReb = 0, leagueFga = 0, leagueFta = 0, leagueTov = 0, leagueOrebAll = 0, league3pa = 0;
        let playoffTeamCount = 0;
        allTeams.forEach(t => {
            let tOreb = 0, tDreb = 0, tReb = 0, tFga = 0, tFta = 0, tTov = 0, tOrebAll = 0, t3pa = 0, hasData = false;
            t.roster.forEach(p => {
                const ps = getStats(p);
                if ((ps.g || 0) > 0) hasData = true;
                tOreb += (ps.offReb || 0); tDreb += (ps.defReb || 0); tReb += (ps.reb || 0);
                tFga += (ps.fga || 0); tFta += (ps.fta || 0); tTov += (ps.tov || 0);
                tOrebAll += (ps.offReb || 0); t3pa += (ps.p3a || 0);
            });
            if (hasData) {
                playoffTeamCount++;
                leagueOreb += tOreb; leagueDreb += tDreb; leagueReb += tReb;
                leagueFga += tFga; leagueFta += tFta; leagueTov += tTov;
                leagueOrebAll += tOrebAll; league3pa += t3pa;
            }
        });

        if (playoffTeamCount > 1) {
            // Average opponent stats (exclude own team)
            const oppDreb = (leagueDreb - teamDreb) / (playoffTeamCount - 1);
            const oppOreb = (leagueOreb - teamOreb) / (playoffTeamCount - 1);
            const oppReb = (leagueReb - teamReb) / (playoffTeamCount - 1);
            const oppFga = (leagueFga - teamFga) / (playoffTeamCount - 1);
            const oppFta = (leagueFta - teamFta) / (playoffTeamCount - 1);
            const oppTov = (leagueTov - teamTov) / (playoffTeamCount - 1);
            const oppOrebApprox = (leagueOrebAll - teamOreb) / (playoffTeamCount - 1);
            const opp3pa = (league3pa - team.roster.reduce((sum, p) => sum + (getStats(p).p3a || 0), 0)) / (playoffTeamCount - 1);
            const oppPoss = oppFga + 0.44 * oppFta + oppTov - oppOrebApprox;
            const opp2pa = oppFga - opp3pa;

            const totalOrebChances = teamOreb + oppDreb;
            if (totalOrebChances > 0) enriched['orb%'] = ((enriched.offReb || 0) * (teamMin / 5)) / (mp * totalOrebChances);

            const totalDrebChances = teamDreb + oppOreb;
            if (totalDrebChances > 0) enriched['drb%'] = ((enriched.defReb || 0) * (teamMin / 5)) / (mp * totalDrebChances);

            const totalRebChances = teamReb + oppReb;
            if (totalRebChances > 0) enriched['trb%'] = (enriched.reb * (teamMin / 5)) / (mp * totalRebChances);

            if (oppPoss > 0) enriched['stl%'] = (enriched.stl * (teamMin / 5)) / (mp * oppPoss);
            if (opp2pa > 0) enriched['blk%'] = (enriched.blk * (teamMin / 5)) / (mp * opp2pa);
        }

        return enriched;
    }, [player.stats, player.playoffStats, showPlayoffStats, allTeams, teamId]);

    const archetypes = useMemo(() => getHiddenArchetypes(player), [player]);

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300 overflow-hidden">

            {/* ═══ Single scrollable area (header + body) ═══ */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">

                {/* ═══ HEADER ═══ */}
                <div className="border-b border-white/5 relative overflow-hidden" style={{ backgroundColor: theme.bg }}>
                    {/* Dark overlay — heavier tint than DashboardHeader */}
                    <div className="absolute inset-0 bg-black/40 pointer-events-none" />

                    {/* Back button row */}
                    <div className="px-6 pt-5 pb-4 relative z-10">
                        <button
                            onClick={onBack}
                            className="flex items-center gap-1.5 bg-black/30 hover:bg-black/50 backdrop-blur-sm ring-1 ring-white/15 px-3 py-1.5 rounded-lg transition-colors"
                            style={{ color: theme.text }}
                        >
                            <ArrowLeft size={14} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">뒤로</span>
                        </button>
                    </div>

                    {/* Player name + OVR + Header Trophies */}
                    <div className="px-6 pt-1 pb-4 relative z-10 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                            <OvrBadge value={calculatedOvr} size="md" />
                            <h2 className="text-3xl font-black uppercase tracking-tight truncate" style={{ color: theme.text }}>{player.name}</h2>
                            {player.health && player.health !== 'Healthy' && (
                                <span className="text-xs font-black text-red-400 bg-red-950/50 px-2 py-1 rounded-md shrink-0">
                                    {player.injuryType || player.health}
                                    {player.returnDate && <span className="text-red-500/70 ml-1">({player.returnDate})</span>}
                                </span>
                            )}
                        </div>
                        {player.awards && player.awards.length > 0 && (
                            <HeaderAwardTrophies awards={player.awards} />
                        )}
                    </div>

                    {/* Spacer */}
                    <div className="mx-6" />

                    {/* Player info table */}
                    <div className="px-6 py-3 relative z-10">
                        <table className="text-sm" style={{ color: theme.text, opacity: 0.7 }}>
                            <thead>
                                <tr className="text-xs uppercase tracking-wider border-b border-white/15" style={{ opacity: 0.5 }}>
                                    <th className="pr-5 pb-2 text-left font-bold">팀</th>
                                    <th className="pr-5 pb-2 text-left font-bold">포지션</th>
                                    <th className="pr-5 pb-2 text-left font-bold">나이</th>
                                    <th className="pr-5 pb-2 text-left font-bold">신장</th>
                                    <th className="pr-5 pb-2 text-left font-bold">체중</th>
                                    <th className="pr-5 pb-2 text-left font-bold">연봉</th>
                                    <th className="pr-5 pb-2 text-left font-bold">계약</th>
                                    <th className="pr-5 pb-2 text-left font-bold">리그에서의 레벨</th>
                                    <th className="pb-2 text-left font-bold">포지션 평점</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="font-bold">
                                    <td className="pr-5 pt-2">
                                        {teamId ? (
                                            <span className="flex items-center gap-1.5">
                                                <img src={getTeamLogoUrl(teamId)} className="w-4 h-4 object-contain" alt="" />
                                                {teamName || 'FA'}
                                            </span>
                                        ) : 'FA'}
                                    </td>
                                    <td className="pr-5 pt-2">{player.position}</td>
                                    <td className="pr-5 pt-2">{player.age}세</td>
                                    <td className="pr-5 pt-2">{player.height}cm</td>
                                    <td className="pr-5 pt-2">{player.weight}kg</td>
                                    <td className="pr-5 pt-2">{player.salary > 0 ? formatSalary(player.salary) : '-'}</td>
                                    <td className="pr-5 pt-2">{player.contractYears > 0 ? `${player.contractYears}년` : '-'}</td>
                                    <td className="pr-5 pt-2"><StarRating ovr={calculatedOvr} size="md" /></td>
                                    <td className="pt-2">{positionStars !== null ? <StarRating stars={positionStars} size="md" /> : '-'}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Spacer */}
                    <div className="mx-6" />

                    {/* Scout Report */}
                    {(archetypes.length > 0 || scoutReport.length > 0) && (
                        <div className="px-6 pt-3 pb-6 relative z-10 flex flex-col gap-2">
                            {scoutReport.length > 0 && (
                                <span className="text-sm leading-relaxed italic" style={{ color: theme.text, opacity: 0.6 }}>
                                    "{scoutReport}"
                                </span>
                            )}
                            {archetypes.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {archetypes.map((arch, i) => (
                                        <span key={i} className="px-2.5 py-0.5 rounded-full text-xs font-bold border" style={{ color: theme.accent, borderColor: theme.accent, opacity: 0.8 }}>
                                            {arch}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ═══ BODY — 3 sections ═══ */}
                <div className="text-xs bg-slate-950">

                    {/* ═══ SECTION 1: 시즌 기록 (Traditional + Advanced 수직 배치) ═══ */}
                    <div className="border-b-2 border-slate-700">
                        <div className="px-6 py-3 bg-slate-700 flex items-center justify-between">
                            <span className="text-sm font-black text-slate-300 uppercase tracking-widest">
                                {showPlayoffStats ? '플레이오프 스탯' : '2025-26 시즌 스탯'}
                            </span>
                            {hasPlayoffs && (
                                <div
                                    className="flex items-center gap-2.5 cursor-pointer select-none"
                                    onClick={() => setShowPlayoffStats(prev => !prev)}
                                >
                                    <span className={`text-xs font-bold transition-colors ${!showPlayoffStats ? 'text-white' : 'text-slate-500'}`}>
                                        정규시즌
                                    </span>
                                    <div className={`w-8 h-4 rounded-full relative transition-colors duration-300 ${showPlayoffStats ? 'bg-indigo-600' : 'bg-slate-600'}`}>
                                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300 shadow-sm ${showPlayoffStats ? 'right-0.5' : 'left-0.5'}`} />
                                    </div>
                                    <span className={`text-xs font-bold transition-colors ${showPlayoffStats ? 'text-white' : 'text-slate-500'}`}>
                                        플레이오프
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="overflow-x-auto custom-scrollbar">
                            <StatsSubTable key={showPlayoffStats ? 'trad-p' : 'trad-r'} cols={TRAD_COLS} stats={displayStats} />
                            <StatsSubTable key={showPlayoffStats ? 'adv-p' : 'adv-r'} cols={ADVANCED_COLS} stats={displayStats} />
                        </div>
                    </div>

                    {/* ═══ SECTION 2: 능력치 6개 그룹 ═══ */}
                    <div className="border-b-2 border-slate-700">
                        <div className="px-6 py-3 bg-slate-700 flex items-center">
                            <span className="text-sm font-black text-slate-300 uppercase tracking-widest">능력치</span>
                        </div>
                        {(() => {
                            const maxRows = Math.max(...ATTR_GROUPS.map(gr => gr.keys.filter(k => !ATTR_AVG_KEYS.has(k)).length));
                            return (
                                <div className="grid grid-cols-6">
                                    {ATTR_GROUPS.map((gr, gi) => {
                                        const attrKeys = gr.keys.filter(k => !ATTR_AVG_KEYS.has(k));
                                        const avgVal = (player as any)[gr.keys[0]] || 0;
                                        const isLastCol = gi === ATTR_GROUPS.length - 1;
                                        const emptyRows = maxRows - attrKeys.length;
                                        return (
                                            <div key={gr.id} className={`flex flex-col ${!isLastCol ? 'border-r border-slate-800/30' : ''}`}>
                                                {/* Group header */}
                                                <div className="bg-slate-900 h-10 flex items-center justify-center border-b border-slate-800">
                                                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{ATTR_KR_LABEL[gr.keys[0]] || gr.label}</span>
                                                </div>
                                                {/* Attribute rows */}
                                                {attrKeys.map((k) => {
                                                    const val = (player as any)[k] || 0;
                                                    const seasonDelta = player.seasonStartAttributes
                                                        ? val - (player.seasonStartAttributes[k] ?? val)
                                                        : 0;
                                                    const attrEvents = (seasonDelta !== 0 && player.changeLog)
                                                        ? player.changeLog.filter(e => e.attribute === k)
                                                        : [];
                                                    return (
                                                        <div key={k} className={`flex items-center justify-between px-3 h-9 border-b border-slate-800/50 transition-colors hover:bg-white/5 ${getAttrBg(val)}`}>
                                                            <span className="text-xs text-white truncate mr-2">{ATTR_KR_LABEL[k] || k}</span>
                                                            <div className="flex items-center gap-3 shrink-0">
                                                                {seasonDelta !== 0 && (
                                                                    <span className={`relative group font-mono font-black text-xs tabular-nums cursor-default ${seasonDelta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                        {seasonDelta > 0 ? '▲' : '▼'} {Math.abs(seasonDelta)}
                                                                        {attrEvents.length > 0 && (
                                                                            <span className="pointer-events-none absolute bottom-full right-0 mb-1.5 hidden group-hover:flex flex-col gap-0.5 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 shadow-xl z-50 whitespace-nowrap">
                                                                                {attrEvents.map((evt, i) => (
                                                                                    <span key={i} className="flex items-center gap-2 text-[11px] font-normal">
                                                                                        <span className="text-slate-500 font-mono">{evt.date.slice(5)}</span>
                                                                                        <span className={evt.delta > 0 ? 'text-emerald-400' : 'text-rose-400'}>{evt.delta > 0 ? '▲' : '▼'}</span>
                                                                                        <span className="text-slate-300 font-mono">{evt.oldValue} → {evt.newValue}</span>
                                                                                    </span>
                                                                                ))}
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                )}
                                                                <span className={`font-mono font-black text-xs tabular-nums ${getAttrColor(val)}`}>{val}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {/* Empty rows with dividers to align columns */}
                                                {Array.from({ length: emptyRows }).map((_, i) => (
                                                    <div key={`empty-${i}`} className="h-9 border-b border-slate-800/50" />
                                                ))}
                                                {/* AVG row */}
                                                <div className={`flex items-center justify-between px-3 h-10 bg-slate-900 border-t border-slate-800 ${getAttrBg(avgVal)}`}>
                                                    <span className="text-xs font-black text-slate-500 uppercase tracking-widest">종합</span>
                                                    <span className={`font-mono font-black text-xs tabular-nums ${getAttrColor(avgVal)}`}>{avgVal}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()}
                    </div>


                    {/* ═══ SECTION 3: 샷차트 | 최근경기 — 4:6 비율, 헤더 행 공유 ═══ */}
                    <div className="grid" style={{ gridTemplateColumns: '3fr 7fr', gridTemplateRows: 'auto 1fr' }}>

                        {/* Row 1, Col 1: 샷 차트 헤더 */}
                        <div className="px-6 py-3 bg-slate-700 flex items-center justify-between border-r border-slate-800">
                            <span className="text-sm font-black text-slate-300 uppercase tracking-widest">샷 차트</span>
                            <button
                                onClick={() => setShotChartMode(shotChartMode === 'efficiency' ? 'volume' : 'efficiency')}
                                className="px-2.5 py-1 text-[10px] font-bold rounded-lg border border-slate-600 bg-slate-600 text-white transition-colors hover:bg-slate-500"
                            >
                                {shotChartMode === 'efficiency' ? '성공률' : '시도수'}
                            </button>
                        </div>

                        {/* Row 1, Col 2: 최근 경기 헤더 */}
                        <div className="px-6 py-3 bg-slate-700 flex items-center">
                            <span className="text-sm font-black text-slate-300 uppercase tracking-widest">최근 경기</span>
                        </div>

                        {/* Row 2, Col 1: 샷 차트 본문 */}
                        <div className="border-r border-slate-800 p-4">
                            <div className="relative w-full aspect-[435/403] bg-slate-950 rounded-lg overflow-hidden border-[1.5px] border-green-900">
                                <svg viewBox="0 0 435 403" className="w-full h-full">
                                    <rect x="0" y="0" width="435" height="403" fill="#020617" />
                                    <g>
                                        {chartZones.map((z, i) => {
                                            const style = shotChartMode === 'efficiency'
                                                ? getZoneStyle(z.m, z.a, z.avg)
                                                : getZoneVolumeStyle(z.a, maxAttempts);
                                            return (
                                                <path key={i} d={ZONE_PATHS[z.pathKey]} fill={style.fill} fillOpacity={style.opacity} stroke={style.fill} strokeWidth={0.5} strokeOpacity={style.opacity} className="transition-all duration-300" />
                                            );
                                        })}
                                    </g>
                                    <g fill="#0f172a" fillRule="evenodd" stroke="none" pointerEvents="none">
                                        {COURT_LINES.map((d, i) => <path key={i} d={d} />)}
                                    </g>
                                    <g pointerEvents="none">
                                        {chartZones.map((z, i) => {
                                            if (shotChartMode === 'efficiency') {
                                                const pct = z.a > 0 ? (z.m / z.a * 100).toFixed(0) : '0';
                                                const style = getZoneStyle(z.m, z.a, z.avg);
                                                const { pillFill, textFill, borderStroke } = getZonePillColors(style.delta, z.a > 0);
                                                const w = 54, h = z.a > 0 ? 42 : 32;
                                                return (
                                                    <g key={i} transform={`translate(${z.cx}, ${z.cy})`}>
                                                        <rect x={-w/2} y={-h/2} width={w} height={h} rx={8} fill={pillFill} stroke={borderStroke} strokeWidth={1} />
                                                        <text textAnchor="middle" y={z.a > 0 ? -5 : 0} fill={textFill} fontSize="13px" fontWeight="800" dominantBaseline="middle">
                                                            {pct}%
                                                        </text>
                                                        {z.a > 0 && (
                                                            <text textAnchor="middle" y={12} fill="rgba(255,255,255,0.7)" fontSize="9px" fontWeight="600" dominantBaseline="middle">
                                                                {z.m}/{z.a}
                                                            </text>
                                                        )}
                                                    </g>
                                                );
                                            } else {
                                                const volPct = totalAttempts > 0 ? (z.a / totalAttempts * 100).toFixed(1) : '0.0';
                                                const w = 54, h = z.a > 0 ? 42 : 32;
                                                const pillFill = z.a > 0 ? 'rgba(0,0,0,0.6)' : 'rgba(30,41,59,0.8)';
                                                const textFill = z.a > 0 ? '#ffffff' : '#94a3b8';
                                                const borderStroke = z.a > 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)';
                                                return (
                                                    <g key={i} transform={`translate(${z.cx}, ${z.cy})`}>
                                                        <rect x={-w/2} y={-h/2} width={w} height={h} rx={8} fill={pillFill} stroke={borderStroke} strokeWidth={1} />
                                                        <text textAnchor="middle" y={z.a > 0 ? -5 : 0} fill={textFill} fontSize="13px" fontWeight="800" dominantBaseline="middle">
                                                            {z.a}
                                                        </text>
                                                        {z.a > 0 && (
                                                            <text textAnchor="middle" y={12} fill="rgba(255,255,255,0.7)" fontSize="9px" fontWeight="600" dominantBaseline="middle">
                                                                {volPct}%
                                                            </text>
                                                        )}
                                                    </g>
                                                );
                                            }
                                        })}
                                    </g>
                                </svg>
                            </div>
                        </div>

                        {/* Row 2, Col 2: 최근 경기 본문 — 샷 차트 높이에 맞춰 스크롤 */}
                        <VirtualGameLog
                            gameLog={gameLog}
                            gameLogLoading={gameLogLoading}
                            teamId={teamId}
                        />

                    </div>

                    {/* ── SECTION 4: 부상 이력 + 수상 내역 + 계약 정보 (3분할) ── */}
                    <div className="border-t-2 border-slate-700 grid grid-cols-3">
                        {/* 좌측: 부상 이력 */}
                        <div>
                            <div className="px-6 py-3 bg-slate-700">
                                <span className="text-xs font-black text-white uppercase tracking-widest">부상 이력</span>
                            </div>
                            <div className="overflow-x-auto custom-scrollbar min-h-[440px]">
                            {!player.injuryHistory || player.injuryHistory.length === 0 ? (
                                <div className="flex items-center justify-center h-[400px]">
                                    <span className="text-slate-500 text-sm">부상 이력이 없습니다</span>
                                </div>
                            ) : (
                                    <Table className="!rounded-none !border-0 !shadow-none !bg-transparent [&_thead]:!bg-slate-900 [&_tbody]:!bg-transparent [&_table]:table-fixed" fullHeight={false}>
                                        <TableHead>
                                            {['날짜', '부상 유형', '기간', '경위'].map((h, i) => (
                                                <TableHeaderCell
                                                    key={h}
                                                    align="center"
                                                    className={`text-xs ${i < 3 ? 'border-r border-r-slate-800/30' : ''}`}
                                                >
                                                    {h}
                                                </TableHeaderCell>
                                            ))}
                                        </TableHead>
                                        <TableBody>
                                            {[...player.injuryHistory]
                                                .sort((a, b) => b.date.localeCompare(a.date))
                                                .map((entry, idx) => {
                                                    const dateStr = entry.date.slice(5).replace('-', '/');
                                                    const severityColor =
                                                        entry.severity === 'Season-Ending' ? 'text-red-400' :
                                                        entry.severity === 'Major' ? 'text-amber-400' :
                                                        'text-white';
                                                    return (
                                                        <TableRow key={idx} className="h-10">
                                                            <TableCell align="center" className="border-r border-r-slate-800/30">
                                                                <span className="font-mono font-medium tabular-nums text-xs text-slate-300">{dateStr}</span>
                                                            </TableCell>
                                                            <TableCell align="center" className="border-r border-r-slate-800/30">
                                                                <span className={`font-mono font-medium tabular-nums text-xs ${severityColor}`}>{entry.injuryType}</span>
                                                            </TableCell>
                                                            <TableCell align="center" className="border-r border-r-slate-800/30">
                                                                <span className="font-mono font-medium tabular-nums text-xs text-slate-300">{entry.duration}</span>
                                                            </TableCell>
                                                            <TableCell align="center">
                                                                <span className={`font-mono font-medium tabular-nums text-xs ${entry.isTraining ? 'text-amber-400' : 'text-sky-400'}`}>
                                                                    {entry.isTraining ? '훈련' : '경기'}
                                                                </span>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                        </TableBody>
                                    </Table>
                            )}
                            </div>
                        </div>
                        {/* 우측: 수상 내역 */}
                        <div className="border-l border-slate-600">
                            <div className="px-6 py-3 bg-slate-700">
                                <span className="text-xs font-black text-white uppercase tracking-widest">수상 내역</span>
                            </div>
                            <div className="overflow-x-auto custom-scrollbar min-h-[440px]">
                            {!player.awards || player.awards.length === 0 ? (
                                <div className="flex items-center justify-center h-[400px]">
                                    <span className="text-slate-500 text-sm">수상 내역이 없습니다</span>
                                </div>
                            ) : (
                                <Table className="!rounded-none !border-0 !shadow-none !bg-transparent [&_thead]:!bg-slate-900 [&_tbody]:!bg-transparent [&_table]:table-fixed" fullHeight={false}>
                                    <TableHead>
                                        {['시즌', '이름', '내용'].map((h, i) => (
                                            <TableHeaderCell
                                                key={h}
                                                align="center"
                                                className={`text-xs ${i < 2 ? 'border-r border-r-slate-800/30' : ''}`}
                                            >
                                                {h}
                                            </TableHeaderCell>
                                        ))}
                                    </TableHead>
                                    <TableBody>
                                        {[...player.awards]
                                            .sort((a, b) => {
                                                const sc = b.season.localeCompare(a.season);
                                                if (sc !== 0) return sc;
                                                const orderMap: Record<string, number> = {
                                                    CHAMPION: 0, REG_SEASON_CHAMPION: 1, MVP: 2, FINALS_MVP: 3, DPOY: 4,
                                                    ALL_NBA_1: 5, ALL_NBA_2: 6, ALL_NBA_3: 7, ALL_DEF_1: 8, ALL_DEF_2: 9,
                                                };
                                                return (orderMap[a.type] ?? 99) - (orderMap[b.type] ?? 99);
                                            })
                                            .map((entry, idx) => {
                                                const nameMap: Record<string, string> = {
                                                    CHAMPION: '챔피언', REG_SEASON_CHAMPION: '정규시즌 우승', MVP: '올해의 선수',
                                                    FINALS_MVP: '파이널 MVP', DPOY: '올해의 수비수',
                                                    ALL_NBA_1: '올-오펜시브 팀', ALL_NBA_2: '올-오펜시브 팀', ALL_NBA_3: '올-오펜시브 팀',
                                                    ALL_DEF_1: '올-디펜시브 팀', ALL_DEF_2: '올-디펜시브 팀',
                                                };
                                                const detailMap: Record<string, string> = {
                                                    CHAMPION: '우승', REG_SEASON_CHAMPION: '우승',
                                                    FINALS_MVP: '수상',
                                                    ALL_NBA_1: '1st', ALL_NBA_2: '2nd', ALL_NBA_3: '3rd',
                                                    ALL_DEF_1: '1st', ALL_DEF_2: '2nd',
                                                };
                                                // MVP/DPOY: rank 기반 표시
                                                let detail: string;
                                                if ((entry.type === 'MVP' || entry.type === 'DPOY') && entry.rank != null) {
                                                    detail = entry.rank === 1 ? '1위 (수상)' : `${entry.rank}위`;
                                                } else {
                                                    detail = detailMap[entry.type] ?? '-';
                                                }
                                                return (
                                                    <TableRow key={idx} className="h-10">
                                                        <TableCell align="center" className="border-r border-r-slate-800/30">
                                                            <span className="font-mono font-medium tabular-nums text-xs text-slate-300">{entry.season}</span>
                                                        </TableCell>
                                                        <TableCell align="center" className="border-r border-r-slate-800/30">
                                                            <span className="font-mono font-medium tabular-nums text-xs text-white">{nameMap[entry.type] ?? entry.type}</span>
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <span className="font-mono font-medium tabular-nums text-xs text-slate-300">{detail}</span>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                    </TableBody>
                                </Table>
                            )}
                            </div>
                        </div>
                        {/* 우측: 계약 정보 */}
                        <div className="border-l border-slate-600">
                            <div className="px-6 py-3 bg-slate-700">
                                <span className="text-xs font-black text-white uppercase tracking-widest">계약 정보</span>
                            </div>
                            <div className="overflow-x-auto custom-scrollbar min-h-[440px]">
                            {!player.contract || player.contract.years.length === 0 ? (
                                <div className="flex items-center justify-center h-[400px]">
                                    <span className="text-slate-500 text-sm">계약 정보가 없습니다</span>
                                </div>
                            ) : (
                                <Table className="!rounded-none !border-0 !shadow-none !bg-transparent [&_thead]:!bg-slate-900 [&_tbody]:!bg-transparent [&_table]:table-fixed" fullHeight={false}>
                                    <TableHead>
                                        {['항목', '내용'].map((h, i) => (
                                            <TableHeaderCell
                                                key={h}
                                                align="center"
                                                className={`text-xs ${i < 1 ? 'border-r border-r-slate-800/30' : ''}`}
                                            >
                                                {h}
                                            </TableHeaderCell>
                                        ))}
                                    </TableHead>
                                    <TableBody>
                                        <TableRow className="h-10">
                                            <TableCell align="center" className="border-r border-r-slate-800/30">
                                                <span className="font-mono font-medium tabular-nums text-xs text-slate-300">계약 유형</span>
                                            </TableCell>
                                            <TableCell align="center">
                                                <span className="font-mono font-medium tabular-nums text-xs text-white">{player.contract.type}</span>
                                            </TableCell>
                                        </TableRow>
                                        <TableRow className="h-10">
                                            <TableCell align="center" className="border-r border-r-slate-800/30">
                                                <span className="font-mono font-medium tabular-nums text-xs text-slate-300">총 계약 기간</span>
                                            </TableCell>
                                            <TableCell align="center">
                                                <span className="font-mono font-medium tabular-nums text-xs text-white">{player.contract.years.length}년</span>
                                            </TableCell>
                                        </TableRow>
                                        <TableRow className="h-10">
                                            <TableCell align="center" className="border-r border-r-slate-800/30">
                                                <span className="font-mono font-medium tabular-nums text-xs text-slate-300">잔여 기간</span>
                                            </TableCell>
                                            <TableCell align="center">
                                                <span className="font-mono font-medium tabular-nums text-xs text-white">{player.contract.years.length - player.contract.currentYear}년</span>
                                            </TableCell>
                                        </TableRow>
                                        {player.contract.noTrade && (
                                            <TableRow className="h-10">
                                                <TableCell align="center" className="border-r border-r-slate-800/30">
                                                    <span className="font-mono font-medium tabular-nums text-xs text-slate-300">NTC</span>
                                                </TableCell>
                                                <TableCell align="center">
                                                    <span className="font-mono font-medium tabular-nums text-xs text-white">No-Trade Clause</span>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        {player.contract.option && (
                                            <TableRow className="h-10">
                                                <TableCell align="center" className="border-r border-r-slate-800/30">
                                                    <span className="font-mono font-medium tabular-nums text-xs text-slate-300">옵션</span>
                                                </TableCell>
                                                <TableCell align="center">
                                                    <span className="font-mono font-medium tabular-nums text-xs text-white">
                                                        {player.contract.option.type === 'player' ? 'Player Option' : 'Team Option'} (Year {player.contract.option.year + 1})
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        {/* 구분선 역할의 빈 행 */}
                                        <TableRow className="h-2">
                                            <TableCell align="center" className="!p-0 border-r border-r-slate-800/30 bg-slate-900" />
                                            <TableCell align="center" className="!p-0 bg-slate-900" />
                                        </TableRow>
                                        {/* 연차별 연봉 */}
                                        {player.contract.years.map((yearSalary, idx) => {
                                            const isCurrent = idx === player.contract!.currentYear;
                                            const isPast = idx < player.contract!.currentYear;
                                            const isOption = player.contract!.option && idx === player.contract!.option.year;
                                            const optionLabel = isOption ? (player.contract!.option!.type === 'player' ? ' (PO)' : ' (TO)') : '';
                                            return (
                                                <TableRow key={idx} className={`h-10 ${isCurrent ? 'bg-indigo-500/10' : ''}`}>
                                                    <TableCell align="center" className="border-r border-r-slate-800/30">
                                                        <span className={`font-mono font-medium tabular-nums text-xs ${isCurrent ? 'text-indigo-300 font-bold' : isPast ? 'text-slate-500' : 'text-slate-300'}`}>
                                                            Year {idx + 1}{isCurrent ? ' *' : ''}{optionLabel}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <span className={`font-mono font-medium tabular-nums text-xs ${isCurrent ? 'text-white font-bold' : isPast ? 'text-slate-500' : 'text-slate-300'}`}>
                                                            {formatSalary(yearSalary)}
                                                        </span>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};
