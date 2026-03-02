
import React, { useMemo, useEffect } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Player, PlayerStats, Team } from '../types';
import { getTeamLogoUrl, calculatePlayerOvr } from '../utils/constants';
import { TEAM_DATA } from '../data/teamData';
import { getTeamTheme } from '../utils/teamTheme';
import { OvrBadge } from '../components/common/OvrBadge';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/common/Table';
import {
    ZONE_PATHS, COURT_LINES, ZONE_AVG,
    ZONE_CONFIG as CHART_ZONES,
    getZoneStyle, getZonePillColors
} from '../utils/courtZones';
import { ATTR_GROUPS, ATTR_AVG_KEYS, ATTR_KR_LABEL } from '../data/attributeConfig';
import { generateScoutReport } from '../utils/scoutReport';
import { usePlayerGameLog } from '../services/queries';

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
    { key: 'fg%', label: 'FG%' }, { key: '3p%', label: '3P%' }, { key: 'ft%', label: 'FT%' },
    { key: 'ts%', label: 'TS%' }, { key: 'pm', label: '+/-' },
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
        case 'tf': val = ((st.techFouls || 0) / gp).toFixed(1); break;
        case 'ff': val = ((st.flagrantFouls || 0) / gp).toFixed(1); break;
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
        { val: fgPct },
        { val: p3Pct },
        { val: ftPct },
        { val: tsPct },
        { val: pmStr, color: pmVal > 0 ? 'text-emerald-400' : pmVal < 0 ? 'text-red-400' : undefined },
    ];
}

export const PlayerDetailView: React.FC<PlayerDetailViewProps> = ({ player, teamName, teamId, tendencySeed, onBack }) => {
    const teamColors = teamId ? (TEAM_DATA[teamId]?.colors || null) : null;
    const theme = getTeamTheme(teamId || null, teamColors);
    const calculatedOvr = calculatePlayerOvr(player);

    const scoutReport = useMemo(() => generateScoutReport(player, tendencySeed), [player, tendencySeed]);
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

                    {/* Player info row */}
                    <div className="px-6 pb-4 relative z-10 flex items-center gap-4 flex-wrap">
                        <OvrBadge value={calculatedOvr} size="md" />
                        <h2 className="text-lg font-black uppercase tracking-tight oswald" style={{ color: theme.text }}>{player.name}</h2>
                        {teamId && (
                            <div className="flex items-center gap-2 text-lg" style={{ color: theme.text, opacity: 0.7 }}>
                                <img src={getTeamLogoUrl(teamId)} className="w-5 h-5 object-contain" alt="" />
                                <span className="font-bold">{teamName || 'FA'}</span>
                            </div>
                        )}
                        <span className="text-lg font-bold" style={{ color: theme.text, opacity: 0.7 }}>{player.position}</span>
                        <span className="text-lg font-bold" style={{ color: theme.text, opacity: 0.7 }}>{player.age}세</span>
                        <span className="text-lg font-bold" style={{ color: theme.text, opacity: 0.7 }}>{player.height}cm</span>
                        <span className="text-lg font-bold" style={{ color: theme.text, opacity: 0.7 }}>{player.weight}kg</span>
                        {player.salary > 0 && (
                            <span className="text-lg font-bold" style={{ color: theme.text, opacity: 0.7 }}>
                                {formatSalary(player.salary)}
                                {player.contractYears > 0 && <span className="ml-0.5">· {player.contractYears}yr</span>}
                            </span>
                        )}
                        {player.health && player.health !== 'Healthy' && (
                            <span className="text-xs font-black text-red-400 bg-red-950/50 px-2 py-1 rounded-md">
                                {player.injuryType || player.health}
                                {player.returnDate && <span className="text-red-500/70 ml-1">({player.returnDate})</span>}
                            </span>
                        )}
                    </div>

                    {/* Scout Report */}
                    {(archetypes.length > 0 || scoutReport.length > 0) && (
                        <div className="px-6 pb-4 relative z-10">
                            {archetypes.length > 0 && (
                                <span className="text-sm font-bold mr-2" style={{ color: theme.accent }}>
                                    {archetypes.join(' / ')}
                                </span>
                            )}
                            {scoutReport.length > 0 && (
                                <span className="text-sm leading-relaxed" style={{ color: theme.text, opacity: 0.6 }}>
                                    {scoutReport}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* ═══ BODY — 3 sections ═══ */}
                <div className="text-xs bg-slate-950">

                    {/* ═══ SECTION 1: 시즌 기록 (Traditional + Advanced 수직 배치) ═══ */}
                    <div className="pb-6 border-b-2 border-slate-700">
                        <div className="px-6 py-3 flex items-center relative overflow-hidden" style={{ backgroundColor: theme.bg }}>
                            <div className="absolute inset-0 bg-black/60 pointer-events-none" />
                            <span className="relative z-10 text-sm font-black uppercase tracking-widest" style={{ color: theme.text }}>2025-26 시즌 스탯</span>
                        </div>
                        <div className="overflow-x-auto custom-scrollbar">
                            <StatsSubTable cols={TRAD_COLS} stats={s} />
                            <StatsSubTable cols={ADVANCED_COLS} stats={s} />
                        </div>
                    </div>
                    {hasPlayoffs && (
                        <div className="pb-6 border-b-2 border-slate-700">
                            <div className="px-6 py-3 flex items-center relative overflow-hidden" style={{ backgroundColor: theme.bg }}>
                                <div className="absolute inset-0 bg-black/60 pointer-events-none" />
                                <span className="relative z-10 text-sm font-black uppercase tracking-widest" style={{ color: theme.text }}>플레이오프 스탯</span>
                            </div>
                            <div className="overflow-x-auto custom-scrollbar">
                                <StatsSubTable cols={TRAD_COLS} stats={player.playoffStats!} />
                                <StatsSubTable cols={ADVANCED_COLS} stats={player.playoffStats!} />
                            </div>
                        </div>
                    )}

                    {/* ═══ SECTION 2: 능력치 6개 그룹 ═══ */}
                    <div className="pb-6 border-b-2 border-slate-700">
                        <div className="px-6 py-3 flex items-center relative overflow-hidden" style={{ backgroundColor: theme.bg }}>
                            <div className="absolute inset-0 bg-black/60 pointer-events-none" />
                            <span className="relative z-10 text-sm font-black uppercase tracking-widest" style={{ color: theme.text }}>능력치</span>
                        </div>
                        <div className="grid grid-cols-6">
                            {ATTR_GROUPS.map((gr, gi) => {
                                const attrKeys = gr.keys.filter(k => !ATTR_AVG_KEYS.has(k));
                                const avgVal = (player as any)[gr.keys[0]] || 0;
                                const isLastCol = gi === ATTR_GROUPS.length - 1;
                                return (
                                    <div key={gr.id} className={`flex flex-col ${!isLastCol ? 'border-r border-slate-800/30' : ''}`}>
                                        {/* Group header */}
                                        <div className="bg-slate-900 h-10 flex items-center justify-center border-b border-slate-800">
                                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{ATTR_KR_LABEL[gr.keys[0]] || gr.label}</span>
                                        </div>
                                        {/* Attribute rows */}
                                        {attrKeys.map(k => {
                                            const val = (player as any)[k] || 0;
                                            return (
                                                <div key={k} className={`flex items-center justify-between px-3 h-9 border-b border-slate-800/50 transition-colors hover:bg-white/5 ${getAttrBg(val)}`}>
                                                    <span className="text-xs text-white truncate mr-2">{ATTR_KR_LABEL[k] || k}</span>
                                                    <span className={`font-mono font-black text-xs tabular-nums shrink-0 ${getAttrColor(val)}`}>{val}</span>
                                                </div>
                                            );
                                        })}
                                        {/* Spacer to align AVG */}
                                        <div className="flex-1" />
                                        {/* AVG row */}
                                        <div className={`flex items-center justify-between px-3 h-10 bg-slate-900 border-t border-slate-800 ${getAttrBg(avgVal)}`}>
                                            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">종합</span>
                                            <span className={`font-mono font-black text-xs tabular-nums ${getAttrColor(avgVal)}`}>{avgVal}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ═══ SECTION 3: 샷차트 | 최근경기 — 4:6 비율 ═══ */}
                    <div className="pb-6 border-b-2 border-slate-700 grid items-stretch" style={{ gridTemplateColumns: '4fr 6fr' }}>

                        {/* Col 1: 샷 차트 */}
                        <div className="border-r border-slate-800">
                            <div className="px-6 py-3 flex items-center justify-between relative overflow-hidden" style={{ backgroundColor: theme.bg }}>
                                <div className="absolute inset-0 bg-black/60 pointer-events-none" />
                                <span className="relative z-10 text-sm font-black uppercase tracking-widest" style={{ color: theme.text }}>샷 차트</span>
                                <div className="relative z-10 flex items-center gap-1.5 text-[9px] text-slate-500">
                                    <span>LOW</span>
                                    <div className="flex gap-0.5">
                                        <div className="w-3 h-2.5 rounded-sm bg-emerald-500/10" />
                                        <div className="w-3 h-2.5 rounded-sm bg-emerald-500/25" />
                                        <div className="w-3 h-2.5 rounded-sm bg-emerald-500/50" />
                                    </div>
                                    <span>HIGH</span>
                                </div>
                            </div>
                            <div className="p-4">
                            <div className="relative w-full aspect-[435/403] bg-slate-950 rounded-lg overflow-hidden">
                                <svg viewBox="0 0 435 403" className="w-full h-full">
                                    <rect x="0" y="0" width="435" height="403" fill="#020617" />
                                    <g>
                                        {chartZones.map((z, i) => {
                                            const style = getZoneStyle(z.m, z.a, z.avg);
                                            return (
                                                <path key={i} d={ZONE_PATHS[z.pathKey]} fill={style.fill} fillOpacity={style.opacity} stroke="none" className="transition-all duration-300" />
                                            );
                                        })}
                                    </g>
                                    <g fill="none" stroke="#0f172a" strokeWidth="0.5" strokeOpacity="1" pointerEvents="none">
                                        {COURT_LINES.map((d, i) => <path key={i} d={d} />)}
                                    </g>
                                    <g pointerEvents="none">
                                        {chartZones.map((z, i) => {
                                            const pct = z.a > 0 ? (z.m / z.a * 100).toFixed(0) : '0';
                                            const style = getZoneStyle(z.m, z.a, z.avg);
                                            const { pillFill, textFill, borderStroke } = getZonePillColors(style.delta, z.a > 0);
                                            const w = 52, h = z.a > 0 ? 36 : 30;
                                            return (
                                                <g key={i} transform={`translate(${z.cx}, ${z.cy})`}>
                                                    <rect x={-w/2} y={-h/2} width={w} height={h} rx={6} fill={pillFill} stroke={borderStroke} strokeWidth={1} fillOpacity={0.95} />
                                                    <text textAnchor="middle" y={z.a > 0 ? -6 : -2} fill={textFill} fontSize="12px" fontWeight="800" style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.5)' }}>
                                                        {pct}%
                                                    </text>
                                                    {z.a > 0 && (
                                                        <text textAnchor="middle" y={10} fill="#ffffff" fontSize="9px" fontWeight="600">
                                                            {z.m}/{z.a}
                                                        </text>
                                                    )}
                                                </g>
                                            );
                                        })}
                                    </g>
                                </svg>
                            </div>
                            </div>
                        </div>

                        {/* Col 2: 최근 경기 (full Traditional stats) */}
                        <div className="flex flex-col min-h-0">
                            <div className="px-6 py-3 flex items-center relative overflow-hidden" style={{ backgroundColor: theme.bg }}>
                                <div className="absolute inset-0 bg-black/60 pointer-events-none" />
                                <span className="relative z-10 text-sm font-black uppercase tracking-widest" style={{ color: theme.text }}>최근 경기</span>
                            </div>
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
                            {gameLog && gameLog.length > 0 && (
                                <Table className="!rounded-none !border-0 !shadow-none !bg-transparent [&_thead]:!bg-slate-900 [&_tbody]:!bg-transparent [&_table]:table-fixed" fullHeight={false} style={{ maxHeight: 520 }}>
                                    <TableHead>
                                        {GAME_LOG_COLS.map((c, i) => (
                                            <TableHeaderCell
                                                key={c.key}
                                                align="center"
                                                className={i < GAME_LOG_COLS.length - 1 ? 'border-r border-r-slate-800/30' : ''}
                                            >
                                                {c.label}
                                            </TableHeaderCell>
                                        ))}
                                    </TableHead>
                                    <TableBody>
                                        {gameLog.map((g: any, i: number) => {
                                            const cells = buildGameLogCells(g);
                                            return (
                                                <TableRow key={i} className="h-10">
                                                    {cells.map((cell, ci) => (
                                                        <TableCell
                                                            key={ci}
                                                            align="center"
                                                            className={ci < cells.length - 1 ? 'border-r border-r-slate-800/30' : ''}
                                                        >
                                                            <span className={`font-mono font-medium tabular-nums ${cell.color || 'text-white'}`}>
                                                                {cell.val}
                                                            </span>
                                                        </TableCell>
                                                    ))}
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
    );
};
