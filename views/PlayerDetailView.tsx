
import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Player, PlayerStats, Team } from '../types';
import { getTeamLogoUrl, calculatePlayerOvr } from '../utils/constants';
import { formatMoney } from '../utils/formatMoney';
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
import { assignArchetypes, getArchetypeDisplayInfo, getTraitTagDisplayInfo } from '../services/playerDevelopment/archetypeEvaluator';
import type { PlayerArchetypeState } from '../types/archetype';
import { generateSaveTendencies } from '../utils/hiddenTendencies';
import { getLocalPopularityLabel, getNationalPopularityLabel } from '../services/playerPopularity';
import { getMoraleLabel } from '../services/moraleService';

interface PlayerDetailViewProps {
    player: Player;
    teamName?: string;
    teamId?: string;
    allTeams?: Team[];
    tendencySeed?: string;
    seasonShort?: string;
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

// ── Career History Columns ──
const CAREER_TRAD_COLS = [
    { key: 'season', label: '시즌' }, { key: 'team', label: '팀' }, { key: 'age', label: '나이' },
    { key: 'gp', label: 'G' }, { key: 'gs', label: 'GS' }, { key: 'min', label: 'MIN' },
    { key: 'pts', label: 'PTS' }, { key: 'oreb', label: 'OREB' }, { key: 'dreb', label: 'DREB' },
    { key: 'reb', label: 'REB' }, { key: 'ast', label: 'AST' }, { key: 'stl', label: 'STL' },
    { key: 'blk', label: 'BLK' }, { key: 'tov', label: 'TOV' }, { key: 'pf', label: 'PF' },
    { key: 'fgm', label: 'FGM' }, { key: 'fga', label: 'FGA' }, { key: 'fg_pct', label: 'FG%' },
    { key: 'fg3m', label: '3PM' }, { key: 'fg3a', label: '3PA' }, { key: 'fg3_pct', label: '3P%' },
    { key: 'ftm', label: 'FTM' }, { key: 'fta', label: 'FTA' }, { key: 'ft_pct', label: 'FT%' },
];
const CAREER_ADV_COLS = [
    { key: 'season', label: '시즌' }, { key: 'team', label: '팀' }, { key: 'age', label: '나이' },
    { key: 'ts_pct', label: 'TS%' }, { key: 'efg_pct', label: 'eFG%' }, { key: 'tov_pct', label: 'TOV%' },
    { key: 'fg3a_rate', label: '3PAr' }, { key: 'fta_rate', label: 'FTr' },
    { key: 'usg_pct', label: 'USG%' }, { key: 'ast_pct', label: 'AST%' },
    { key: 'orb_pct', label: 'ORB%' }, { key: 'drb_pct', label: 'DRB%' }, { key: 'trb_pct', label: 'TRB%' },
];

// ── Career table helpers ──
const PCT_COLS = new Set(['fg_pct','fg3_pct','ft_pct','ts_pct','efg_pct','fg3a_rate','fta_rate']);
const RATE_COLS = new Set(['usg_pct','ast_pct','orb_pct','drb_pct','trb_pct','stl_pct','blk_pct','tov_pct']);
const INT_COLS  = new Set(['age','gp','gs']);

function formatCareerCell(key: string, raw: any): string {
    if (raw == null || raw === '') return '-';
    if (PCT_COLS.has(key))  return (Number(raw) * 100).toFixed(1);
    if (RATE_COLS.has(key)) return Number(raw).toFixed(1);
    if (key === 'season' || key === 'team') return String(raw);
    if (INT_COLS.has(key))  return String(Math.round(Number(raw)));
    return Number(raw).toFixed(1);
}

function computeCareerAvg(rows: any[], teamLabel: string): Record<string, any> {
    // 2TM 합산 행 제외, gp>0인 행만
    const valid = rows.filter(r => r.team !== '2TM' && (r.gp ?? 0) > 0);
    if (valid.length === 0) return {};
    const totalGP = valid.reduce((s, r) => s + (r.gp ?? 0), 0);
    const wavg = (key: string) =>
        valid.reduce((s, r) => s + ((r[key] ?? 0) * (r.gp ?? 0)), 0) / totalGP;
    // 슈팅% 는 성분 스탯에서 재계산
    const tot = (key: string) => valid.reduce((s, r) => s + ((r[key] ?? 0) * (r.gp ?? 0)), 0);
    const fga = tot('fga'); const fg3a = tot('fg3a'); const fta = tot('fta');
    return {
        season: `${valid.length}시즌`, team: teamLabel, age: null,
        gp: totalGP,
        gs: valid.reduce((s, r) => s + (r.gs ?? 0), 0),
        min: wavg('min'), pts: wavg('pts'),
        oreb: wavg('oreb'), dreb: wavg('dreb'), reb: wavg('reb'),
        ast: wavg('ast'), stl: wavg('stl'), blk: wavg('blk'),
        tov: wavg('tov'), pf: wavg('pf'),
        fgm: wavg('fgm'), fga: wavg('fga'),
        fg_pct: fga > 0 ? tot('fgm') / fga : null,
        fg3m: wavg('fg3m'), fg3a: wavg('fg3a'),
        fg3_pct: fg3a > 0 ? tot('fg3m') / fg3a : null,
        ftm: wavg('ftm'), fta: wavg('fta'),
        ft_pct: fta > 0 ? tot('ftm') / fta : null,
        ts_pct: wavg('ts_pct'), efg_pct: wavg('efg_pct'), tov_pct: wavg('tov_pct'),
        fg3a_rate: wavg('fg3a_rate'), fta_rate: wavg('fta_rate'),
        usg_pct: wavg('usg_pct'), ast_pct: wavg('ast_pct'),
        orb_pct: wavg('orb_pct'), drb_pct: wavg('drb_pct'), trb_pct: wavg('trb_pct'),
    };
}

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

// ── Hex color → rgba string ──
// BBRef award code → 시뮬 PlayerAwardType 변환 (배지/헤더 표시용)
// BRef는 MVP-1(수상자), MVP-2(2위 후보) 형태로 순위를 코드에 포함
const BREF_BASE_TO_SIM_TYPE: Record<string, string> = {
    CHM: 'CHAMPION', RCHM: 'REG_SEASON_CHAMPION', REG_CHM: 'REG_SEASON_CHAMPION', FMVP: 'FINALS_MVP',
    MVP: 'MVP', DPOY: 'DPOY',
    NBA1: 'ALL_NBA_1', NBA2: 'ALL_NBA_2', NBA3: 'ALL_NBA_3',
    DEF1: 'ALL_DEF_1', DEF2: 'ALL_DEF_2',
};
function normalizeBrefAward(a: any, parentSeason: string) {
    const code = a.code ?? a.type ?? '';
    // 순위 없는 코드 (NBA1, DEF2 등)
    const directType = BREF_BASE_TO_SIM_TYPE[code];
    if (directType) return { type: directType, season: a.season ?? parentSeason, label: a.label };
    // 순위 있는 코드: MVP-1, DPOY-2, ROY-1 등
    const m = code.match(/^([A-Z0-9]+)-(\d+)$/);
    if (m) {
        const simType = BREF_BASE_TO_SIM_TYPE[m[1]];
        if (simType) return { type: simType, season: a.season ?? parentSeason, label: a.label, rank: parseInt(m[2]) };
    }
    return null;
}

function hexAlpha(hex: string, alpha: number): string {
    const n = parseInt(hex.replace('#', ''), 16);
    return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`;
}

// ── Relative luminance (0=black, 1=white) ──
function luminance(hex: string): number {
    const n = parseInt(hex.replace('#', ''), 16);
    return (0.299 * ((n >> 16) & 0xff) + 0.587 * ((n >> 8) & 0xff) + 0.114 * (n & 0xff)) / 255;
}

// ── Pick tint color: use bg if it has enough luminance, else fall back to accent ──
function getEffectiveTintColor(theme: { bg: string; accent: string }): string {
    return luminance(theme.bg) >= 0.05 ? theme.bg : theme.accent;
}

// ── Section Header ──
const SectionHeader: React.FC<{ title: string; className?: string; style?: React.CSSProperties; children?: React.ReactNode }> = ({ title, className, style, children }) => (
    <div className={`px-6 py-3 flex items-center justify-between${className ? ` ${className}` : ''}`} style={style}>
        <span className="text-sm font-black text-white uppercase tracking-widest">{title}</span>
        {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
);

// ── Reusable: Stats sub-table (header + single data row), uses common Table ──
const StatsSubTable: React.FC<{ cols: { key: string; label: string }[]; stats: PlayerStats }> = ({ cols, stats }) => (
    <Table className="!rounded-none !border-0 !shadow-none !bg-transparent [&_tbody]:!bg-transparent [&_table]:table-fixed" fullHeight={false}>
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

const VirtualGameLog: React.FC<{ gameLog: any[] | undefined; gameLogLoading: boolean; teamId?: string; subHeaderStyle?: React.CSSProperties; rowAltStyle?: React.CSSProperties; rowBaseStyle?: React.CSSProperties; dividerColor?: string; subHeaderTextStyle?: React.CSSProperties }> = React.memo(({ gameLog, gameLogLoading, teamId, subHeaderStyle, rowAltStyle, rowBaseStyle, dividerColor, subHeaderTextStyle }) => {
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
                            <thead className="sticky top-0 z-40 border-b border-slate-800 shadow-sm" style={subHeaderStyle}>
                                <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest h-10">
                                    {GAME_LOG_COLS.map((c, i) => (
                                        <th
                                            key={c.key}
                                            className={`py-3 px-1.5 whitespace-nowrap border-b text-center ${i < GAME_LOG_COLS.length - 1 ? 'border-r' : ''}`}
                                            style={{ ...(dividerColor ? { borderBottomColor: dividerColor, borderRightColor: dividerColor } : undefined), ...subHeaderTextStyle }}
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
                                                className={`py-2 px-1.5 text-center whitespace-nowrap ${ci < cells.length - 1 ? 'border-r' : ''}`}
                                                style={{ ...((startIdx + vi) % 2 !== 0 ? rowAltStyle : rowBaseStyle), ...(ci < cells.length - 1 && dividerColor ? { borderRightColor: dividerColor } : undefined) }}
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

export const PlayerDetailView: React.FC<PlayerDetailViewProps> = ({ player, teamName, teamId, allTeams, tendencySeed, seasonShort = '2025-26', onBack }) => {
    const teamColors = teamId ? (TEAM_DATA[teamId]?.colors || null) : null;
    const theme = getTeamTheme(teamId || null, teamColors);
    const tintColor = getEffectiveTintColor(theme);
    const isLight = luminance(tintColor) > 0.5;
    const sectionBg   = { backgroundColor: hexAlpha(tintColor, isLight ? 0.07 : 0.70) }; // L5: SectionHeader
    const subHeaderBg = { backgroundColor: hexAlpha(tintColor, isLight ? 0.04 : 0.35) }; // L4: thead / AVG
    const rowAltBg    = { backgroundColor: hexAlpha(tintColor, isLight ? 0.02 : 0.12) }; // L3: odd rows
    const rowBaseBg   = { backgroundColor: hexAlpha(tintColor, isLight ? 0.008 : 0.06) }; // L2: even rows
    const dividerColor = hexAlpha(tintColor, isLight ? 0.08 : 0.30);
    const heavyDividerColor = hexAlpha(tintColor, isLight ? 0.12 : 0.45);
    const subHeaderTextStyle = { color: hexAlpha(theme.text, isLight ? 0.45 : 0.65) };
    const dropdownStyle = {
        backgroundColor: hexAlpha(tintColor, isLight ? 0.08 : 0.25),
        borderColor: hexAlpha(tintColor, isLight ? 0.30 : 0.55),
        color: 'white',
    };
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
    [player.stats]);

    const [shotChartMode, setShotChartMode] = useState<'efficiency' | 'volume'>('efficiency');
    const [careerTab, setCareerTab] = useState<'trad' | 'adv'>('trad');
    const [careerMode, setCareerMode] = useState<'regular' | 'playoff'>('regular');
    const careerRegular = useMemo(() => player.career_history?.filter(r => !r.playoff) ?? [], [player.career_history]);
    const careerPlayoff = useMemo(() => player.career_history?.filter(r => r.playoff) ?? [], [player.career_history]);
    const hasCareerPlayoff = careerPlayoff.length > 0;
    const maxAttempts = useMemo(() => Math.max(...chartZones.map(z => z.a), 0), [chartZones]);
    const totalAttempts = useMemo(() => chartZones.reduce((sum, z) => sum + z.a, 0), [chartZones]);

    const archetypes = useMemo(() => getHiddenArchetypes(player), [player]);

    // New player identity archetype system (UI display)
    const playerArchetypeState = useMemo<PlayerArchetypeState>(() => {
        if (player.archetypeState) return player.archetypeState;
        return assignArchetypes(player, seasonShort || '2025-26');
    }, [player, seasonShort]);

    const saveTendencies = useMemo(
        () => tendencySeed ? generateSaveTendencies(tendencySeed, player.id) : null,
        [tendencySeed, player.id]
    );

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300 overflow-hidden">
            {/* ═══ 미니 뒤로가기 바 (팀 테마 배경, 전체폭) ═══ */}
            <div className="flex items-center px-4 py-2.5 border-b border-white/10 shrink-0" style={{ backgroundColor: theme.bg }}>
                <button
                    onClick={onBack}
                    className="flex items-center gap-1.5 bg-black/30 hover:bg-black/50 backdrop-blur-sm ring-1 ring-white/15 px-3 py-1.5 rounded-lg transition-colors"
                    style={{ color: theme.text }}
                >
                    <ArrowLeft size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">뒤로</span>
                </button>
            </div>

            {/* ═══ 단일 스크롤 영역 ═══ */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-950">
                <div className="grid items-start" style={{ gridTemplateColumns: '2fr 8fr' }}>

                    {/* ══════════════ 좌열 (3fr) ══════════════ */}
                    <div className="flex flex-col gap-2 p-2">

                        {/* ── 위젯 1: 선수 정보 통합 카드 ── */}
                        {(() => {
                            const allAwards: any[] = [
                                ...(player.career_history?.filter(s => !s.playoff).flatMap(s =>
                                    (s.awards ?? []).map((a: any) => normalizeBrefAward(a, s.season)).filter(Boolean)
                                ) ?? []),
                                ...(player.awards ?? []),
                            ];
                            return (
                            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">

                                {/* ─ 헤더: OVR + 이름 + 트로피 ─ */}
                                <div className="p-4" style={{ backgroundColor: hexAlpha(tintColor, isLight ? 0.15 : 0.55) }}>
                                    <div className="flex items-center gap-3 min-w-0 mb-2">
                                        <OvrBadge value={calculatedOvr} size="md" />
                                        <h2 className="text-xl font-black uppercase tracking-tight truncate" style={{ color: theme.text }}>{player.name}</h2>
                                    </div>
                                    {/* 트로피 행 */}
                                    {allAwards.length > 0 && (
                                        <div className="mb-3">
                                            <HeaderAwardTrophies awards={allAwards} />
                                        </div>
                                    )}
                                    {/* 부상 배지 */}
                                    {player.health && player.health !== 'Healthy' && (
                                        <span className="inline-flex text-xs font-black text-red-400 bg-red-950/50 px-2 py-1 rounded-md mb-3">
                                            {player.injuryType || player.health}
                                            {player.returnDate && <span className="text-red-500/70 ml-1">({player.returnDate})</span>}
                                        </span>
                                    )}
                                    {/* key-value grid */}
                                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs" style={{ color: theme.text }}>
                                        <span className="font-bold opacity-50 uppercase tracking-wider">팀</span>
                                        <span className="font-bold flex items-center gap-1">
                                            {teamId ? (
                                                <><img src={getTeamLogoUrl(teamId)} className="w-3.5 h-3.5 object-contain" alt="" />{teamName || 'FA'}</>
                                            ) : 'FA'}
                                        </span>
                                        <span className="font-bold opacity-50 uppercase tracking-wider">포지션</span>
                                        <span className="font-bold">{player.position}</span>
                                        <span className="font-bold opacity-50 uppercase tracking-wider">나이</span>
                                        <span className="font-bold">{player.age}세</span>
                                        <span className="font-bold opacity-50 uppercase tracking-wider">신장</span>
                                        <span className="font-bold">{player.height}cm</span>
                                        <span className="font-bold opacity-50 uppercase tracking-wider">체중</span>
                                        <span className="font-bold">{player.weight}kg</span>
                                        <span className="font-bold opacity-50 uppercase tracking-wider">연봉</span>
                                        <span className="font-bold">{player.salary > 0 ? formatMoney(player.salary) : '-'}</span>
                                        <span className="font-bold opacity-50 uppercase tracking-wider">계약</span>
                                        <span className="font-bold">{player.contractYears > 0 ? `${player.contractYears}년` : '-'}</span>
                                        <span className="font-bold opacity-50 uppercase tracking-wider">리그 레벨</span>
                                        <span className="font-bold"><StarRating ovr={calculatedOvr} size="md" /></span>
                                        <span className="font-bold opacity-50 uppercase tracking-wider">포지션 평점</span>
                                        <span className="font-bold">{positionStars !== null ? <StarRating stars={positionStars} size="md" /> : '-'}</span>
                                    </div>
                                </div>

                                {/* ─ 선수 유형 ─ */}
                                {playerArchetypeState && (
                                    <>
                                        <SectionHeader title="선수 유형" style={sectionBg} />
                                        <div className="px-4 py-3 space-y-1">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-slate-500">아키타입</span>
                                                <span className="font-semibold text-slate-200">{getArchetypeDisplayInfo(playerArchetypeState.primary).label}</span>
                                            </div>
                                            {playerArchetypeState.secondary && (
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-slate-500">보조 유형</span>
                                                    <span className="font-semibold text-slate-400">{getArchetypeDisplayInfo(playerArchetypeState.secondary).label}</span>
                                                </div>
                                            )}
                                            {playerArchetypeState.tags.slice(0, 4).map((tag, i) => (
                                                <div key={tag} className="flex justify-between items-center text-xs">
                                                    <span className="text-slate-500">{i === 0 ? '특성' : ''}</span>
                                                    <span className="text-slate-400">{getTraitTagDisplayInfo(tag).label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {/* ─ 스카우팅 리포트 ─ */}
                                {scoutReport.length > 0 && (
                                    <>
                                        <SectionHeader title="스카우팅 리포트" style={sectionBg} />
                                        <div className="px-4 py-3">
                                            <span className="text-xs leading-relaxed italic text-slate-300">"{scoutReport}"</span>
                                        </div>
                                    </>
                                )}

                                {/* ─ 인기도 ─ */}
                                <SectionHeader title="인기도" style={sectionBg} />
                                <div className="px-4 py-3 space-y-1">
                                    {[
                                        { label: '지역적인 인기', value: getLocalPopularityLabel(player.popularity?.local ?? 0) },
                                        { label: '전국적인 인기', value: getNationalPopularityLabel(player.popularity?.national ?? 0) },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="flex justify-between items-center text-xs">
                                            <span className="text-slate-500">{label}</span>
                                            <span className="text-slate-200 font-semibold">{value}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* ─ 성격 & 기분 ─ */}
                                {saveTendencies && (
                                    <>
                                        <SectionHeader title="성격 & 기분" style={sectionBg} />
                                        <div className="px-4 py-3 space-y-1">
                                            {(() => {
                                                const ms = player.morale?.score ?? 50;
                                                const moraleColor = ms >= 70 ? 'text-emerald-400' : ms >= 40 ? 'text-amber-400' : 'text-red-400';
                                                const t = saveTendencies;
                                                const egoLbl = t.ego > 0.35 ? { text: '오만', color: 'text-amber-400' } : t.ego < -0.35 ? { text: '겸손', color: 'text-sky-400' } : { text: '보통', color: 'text-slate-400' };
                                                const finLbl = t.financialAmbition > 0.68 ? { text: '탐욕적', color: 'text-amber-400' } : t.financialAmbition < 0.32 ? { text: '검소', color: 'text-sky-400' } : { text: '보통', color: 'text-slate-400' };
                                                const loyLbl = t.loyalty > 0.65 ? { text: '충성', color: 'text-emerald-400' } : t.loyalty < 0.35 ? { text: '이적욕 강함', color: 'text-red-400' } : { text: '보통', color: 'text-slate-400' };
                                                const winLbl = t.winDesire > 0.65 ? { text: '우승 집착', color: 'text-emerald-400' } : t.winDesire < 0.35 ? { text: '역할 우선', color: 'text-slate-400' } : { text: '보통', color: 'text-slate-400' };
                                                const tmpLbl = t.temperament > 0.45 ? { text: '다혈질', color: 'text-red-400' } : t.temperament < -0.40 ? { text: '냉정', color: 'text-sky-400' } : { text: '보통', color: 'text-slate-400' };
                                                return [
                                                    { label: '현재 기분', text: getMoraleLabel(ms), color: moraleColor },
                                                    { label: '자존심', ...egoLbl },
                                                    { label: '금전욕', ...finLbl },
                                                    { label: '팀 충성도', ...loyLbl },
                                                    { label: '우승욕', ...winLbl },
                                                    { label: '기질', ...tmpLbl },
                                                ].map(({ label, text, color }) => (
                                                    <div key={label} className="flex justify-between items-center text-xs">
                                                        <span className="text-slate-500">{label}</span>
                                                        <span className={`font-semibold ${color}`}>{text}</span>
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                    </>
                                )}

                            </div>
                            );
                        })()}

                        {/* ── 위젯 6: 계약 정보 ── */}
                        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                            <SectionHeader title="계약 정보" style={sectionBg} />
                            <div className="overflow-x-auto custom-scrollbar">
                            {!player.contract || player.contract.years.length === 0 ? (
                                <div className="flex items-center justify-center h-32">
                                    <span className="text-slate-500 text-sm">계약 정보가 없습니다</span>
                                </div>
                            ) : (
                                <Table className="!rounded-none !border-0 !shadow-none !bg-transparent [&_tbody]:!bg-transparent [&_table]:table-fixed" fullHeight={false}>
                                    <TableHead style={subHeaderBg}>
                                        {['항목', '내용'].map((h, i) => (
                                            <TableHeaderCell key={h} align="center" className={`text-xs ${i < 1 ? 'border-r border-r-slate-800/30' : ''}`} style={subHeaderTextStyle}>
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
                                                <span className="font-mono font-medium tabular-nums text-xs text-white">{{ rookie: '루키', veteran: '베테랑', max: '맥스', min: '미니멈', extension: '연장' }[player.contract.type] ?? player.contract.type}</span>
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
                                                    <span className="font-mono font-medium tabular-nums text-xs text-slate-300">트레이드 제한</span>
                                                </TableCell>
                                                <TableCell align="center">
                                                    <span className="font-mono font-medium tabular-nums text-xs text-white">트레이드 거부권 보유</span>
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
                                                        {(() => {
                                                            const baseYear = parseInt(seasonShort.split('-')[0]) - player.contract.currentYear + player.contract.option!.year;
                                                            return `${player.contract.option!.type === 'player' ? '선수 옵션' : '팀 옵션'} (${baseYear}-${String(baseYear + 1).slice(-2)})`;
                                                        })()}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        {player.contract.years.map((yearSalary, idx) => {
                                            const baseYear    = parseInt(seasonShort.split('-')[0]);
                                            const seasonStart = baseYear - player.contract!.currentYear + idx;
                                            const seasonLabel = `${seasonStart}-${String(seasonStart + 1).slice(-2)}`;
                                            const isCurrent   = idx === player.contract!.currentYear;
                                            const isCompleted = idx < player.contract!.currentYear;
                                            const isOption    = player.contract!.option && idx === player.contract!.option.year;
                                            const optionLabel = isOption ? (player.contract!.option!.type === 'player' ? ' (선수옵션)' : ' (팀옵션)') : '';
                                            return (
                                                <TableRow key={idx} className="h-10">
                                                    <TableCell align="center" className="border-r border-r-slate-800/30">
                                                        <span className={`font-mono font-medium tabular-nums text-xs flex items-center justify-center gap-1 ${isCompleted ? 'text-slate-500' : 'text-slate-300'}`}>
                                                            {seasonLabel}{optionLabel}
                                                            {isCurrent && <span className="text-indigo-400 font-black">현재</span>}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <span className={`font-mono font-medium tabular-nums text-xs ${isCompleted ? 'text-slate-500' : 'text-slate-300'}`}>
                                                            {formatMoney(yearSalary)}
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

                        {/* ── 위젯 7: 수상 내역 ── */}
                        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                            <SectionHeader title="수상 내역" style={sectionBg} />
                            <div className="custom-scrollbar">
                            {(() => {
                                const historicalAwards = (player.career_history?.filter(s => !s.playoff) ?? []).flatMap(s =>
                                    (s.awards ?? []).map((a: any) => normalizeBrefAward(a, s.season)).filter(Boolean) as any[]
                                );
                                const allAwards = [...historicalAwards, ...(player.awards ?? [])];
                                return allAwards.length === 0 ? (
                                    <div className="flex items-center justify-center h-24">
                                        <span className="text-slate-500 text-sm">수상 내역이 없습니다</span>
                                    </div>
                                ) : (
                                    <Table className="!rounded-none !border-0 !shadow-none !bg-transparent [&_tbody]:!bg-transparent [&_table]:table-fixed" fullHeight={false}>
                                        <TableHead style={subHeaderBg}>
                                            {['시즌', '이름', '내용'].map((h, i) => (
                                                <TableHeaderCell key={h} align="center" className={`text-xs ${i < 2 ? 'border-r border-r-slate-800/30' : ''}`} style={{ ...subHeaderTextStyle, ...subHeaderBg }}>
                                                    {h}
                                                </TableHeaderCell>
                                            ))}
                                        </TableHead>
                                        <TableBody>
                                            {[...allAwards]
                                                .sort((a, b) => {
                                                    const sc = (b.season ?? '').localeCompare(a.season ?? '');
                                                    if (sc !== 0) return sc;
                                                    const orderMap: Record<string, number> = {
                                                        CHAMPION: 0, REG_SEASON_CHAMPION: 1, MVP: 2, FINALS_MVP: 3, DPOY: 4,
                                                        ALL_NBA_1: 5, ALL_NBA_2: 6, ALL_NBA_3: 7, ALL_DEF_1: 8, ALL_DEF_2: 9,
                                                    };
                                                    return (orderMap[a.type] ?? 99) - (orderMap[b.type] ?? 99);
                                                })
                                                .map((entry, idx) => {
                                                    const BASE_NAME: Record<string, string> = {
                                                        CHAMPION: '챔피언', REG_SEASON_CHAMPION: '정규시즌 우승',
                                                        MVP: '올해의 선수', FINALS_MVP: '파이널 MVP', DPOY: '올해의 수비수',
                                                        ALL_NBA_1: '올-오펜시브 팀', ALL_NBA_2: '올-오펜시브 팀', ALL_NBA_3: '올-오펜시브 팀',
                                                        ALL_DEF_1: '올-디펜시브 팀', ALL_DEF_2: '올-디펜시브 팀',
                                                        CHM: '챔피언', RCHM: '정규시즌 우승', FMVP: '파이널 MVP',
                                                        NBA1: '올-오펜시브 팀', NBA2: '올-오펜시브 팀', NBA3: '올-오펜시브 팀',
                                                        DEF1: '올-디펜시브 팀', DEF2: '올-디펜시브 팀',
                                                        ROY: '올해의 신인', CPOY: '올해의 클러치 플레이어',
                                                        MIP: '최고 발전 선수', '6MOY': '식스맨', SMOY: '식스맨',
                                                    };
                                                    const BASE_DETAIL: Record<string, string> = {
                                                        CHAMPION: '우승', REG_SEASON_CHAMPION: '우승', CHM: '우승', RCHM: '우승',
                                                        FINALS_MVP: '수상', FMVP: '수상',
                                                        ALL_NBA_1: '1st', ALL_NBA_2: '2nd', ALL_NBA_3: '3rd',
                                                        ALL_DEF_1: '1st', ALL_DEF_2: '2nd',
                                                        NBA1: '1st', NBA2: '2nd', NBA3: '3rd',
                                                        DEF1: '1st', DEF2: '2nd',
                                                    };
                                                    const toOrdinal = (n: number) =>
                                                        n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
                                                    const ranked = entry.type?.match(/^(.+)-(\d+)$/);
                                                    const baseCode = ranked ? ranked[1] : entry.type;
                                                    const rankNum  = ranked ? parseInt(ranked[2]) : null;
                                                    const displayName = BASE_NAME[baseCode] ?? baseCode;
                                                    let detail: string;
                                                    if (rankNum !== null) {
                                                        detail = toOrdinal(rankNum);
                                                    } else if ((entry.type === 'MVP' || entry.type === 'DPOY') && (entry as any).rank != null) {
                                                        detail = (entry as any).rank === 1 ? '1st (수상)' : toOrdinal((entry as any).rank);
                                                    } else {
                                                        detail = BASE_DETAIL[entry.type] ?? ((entry as any).label ? '' : '-');
                                                    }
                                                    return (
                                                        <TableRow key={idx} className="h-10">
                                                            <TableCell align="center" className="border-r border-r-slate-800/30">
                                                                <span className="font-mono font-medium tabular-nums text-xs text-slate-300">{entry.season}</span>
                                                            </TableCell>
                                                            <TableCell align="center" className="border-r border-r-slate-800/30">
                                                                <span className="font-mono font-medium tabular-nums text-xs text-white">{displayName}</span>
                                                            </TableCell>
                                                            <TableCell align="center">
                                                                <span className="font-mono font-medium tabular-nums text-xs text-slate-300">{detail}</span>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                        </TableBody>
                                    </Table>
                                );
                            })()}
                            </div>
                        </div>

                        {/* ── 위젯 8: 부상 이력 ── */}
                        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                            <SectionHeader title="부상 이력" style={sectionBg} />
                            <div className="overflow-x-auto custom-scrollbar">
                            {!player.injuryHistory || player.injuryHistory.length === 0 ? (
                                <div className="flex items-center justify-center h-24">
                                    <span className="text-slate-500 text-sm">부상 이력이 없습니다</span>
                                </div>
                            ) : (
                                <Table className="!rounded-none !border-0 !shadow-none !bg-transparent [&_tbody]:!bg-transparent [&_table]:table-auto" fullHeight={false}>
                                    <TableHead style={subHeaderBg}>
                                        {['날짜', '부상 유형', '기간', '경위'].map((h, i) => (
                                            <TableHeaderCell key={h} align="center" className={`text-xs ${i < 3 ? 'border-r border-r-slate-800/30' : ''}`} style={subHeaderTextStyle}>
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

                    </div>{/* end 좌열 */}

                    {/* ══════════════ 우열 (7fr) ══════════════ */}
                    <div className="flex flex-col gap-2 p-2">

                        {/* ── 위젯 A: 능력치 ── */}
                        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                            <SectionHeader title="능력치" style={sectionBg} />
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
                                                <div key={gr.id} className={`flex flex-col ${!isLastCol ? 'border-r' : ''}`} style={!isLastCol ? { borderRightColor: dividerColor } : undefined}>
                                                    <div className="h-10 flex items-center justify-center border-b" style={{ ...subHeaderBg, borderBottomColor: dividerColor }}>
                                                        <span className="text-xs font-black uppercase tracking-widest" style={subHeaderTextStyle}>{ATTR_KR_LABEL[gr.keys[0]] || gr.label}</span>
                                                    </div>
                                                    {attrKeys.map((k) => {
                                                        const val = (player as any)[k] || 0;
                                                        const seasonDelta = player.seasonStartAttributes
                                                            ? val - (player.seasonStartAttributes[k] ?? val)
                                                            : 0;
                                                        const attrEvents = (seasonDelta !== 0 && player.changeLog)
                                                            ? player.changeLog.filter(e => e.attribute === k)
                                                            : [];
                                                        return (
                                                            <div key={k} className={`flex items-center justify-between px-3 h-9 border-b transition-colors hover:bg-white/5 ${getAttrBg(val)}`} style={{ borderBottomColor: dividerColor }}>
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
                                                    {Array.from({ length: emptyRows }).map((_, i) => (
                                                        <div key={`empty-${i}`} className="h-9 border-b" style={{ borderBottomColor: dividerColor }} />
                                                    ))}
                                                    <div className={`flex items-center justify-between px-3 h-10 border-t ${getAttrBg(avgVal)}`} style={{ ...subHeaderBg, borderTopColor: dividerColor }}>
                                                        <span className="text-xs font-black uppercase tracking-widest" style={subHeaderTextStyle}>종합</span>
                                                        <span className={`font-mono font-black text-xs tabular-nums ${getAttrColor(avgVal)}`}>{avgVal}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>

                        {/* ── 위젯 B: 커리어 기록 ── */}
                        {player.career_history && player.career_history.length > 0 && (
                            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                                <SectionHeader title="기록" style={sectionBg}>
                                    <select value={careerMode} onChange={e => setCareerMode(e.target.value as 'regular' | 'playoff')} className="pl-2.5 pr-7 py-1 text-xs font-bold rounded-lg border cursor-pointer focus:outline-none" style={dropdownStyle}>
                                        <option value="regular">정규시즌</option>
                                        {hasCareerPlayoff && <option value="playoff">플레이오프</option>}
                                    </select>
                                    <select value={careerTab} onChange={e => setCareerTab(e.target.value as 'trad' | 'adv')} className="pl-2.5 pr-7 py-1 text-xs font-bold rounded-lg border cursor-pointer focus:outline-none" style={dropdownStyle}>
                                        <option value="trad">기본</option>
                                        <option value="adv">어드밴스드</option>
                                    </select>
                                </SectionHeader>
                                <div className="overflow-x-auto custom-scrollbar">
                                    <table className="w-full text-left border-separate border-spacing-0 text-xs">
                                        <thead>
                                            <tr>
                                                {(careerTab === 'trad' ? CAREER_TRAD_COLS : CAREER_ADV_COLS).map((col, i) => (
                                                    <th key={col.key} className={`px-3 py-2 font-bold uppercase tracking-wider whitespace-nowrap border-b ${i === 0 ? 'sticky left-0 z-10' : ''}`} style={{ ...subHeaderBg, borderBottomColor: dividerColor, ...subHeaderTextStyle }}>
                                                        {col.label}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(() => {
                                                const cols = careerTab === 'trad' ? CAREER_TRAD_COLS : CAREER_ADV_COLS;
                                                const isPlayoffMode = careerMode === 'playoff';
                                                const rows = isPlayoffMode ? careerPlayoff : careerRegular;
                                                const multiTeamSeasons = new Set(rows.filter(r => (r as any).team === '2TM').map(r => (r as any).season));
                                                let groupIdx = -1;
                                                return rows.map((row, ri) => {
                                                    const isCurrentSeason = String((row as any).season) === seasonShort;
                                                    const team = (row as any).team;
                                                    const season = (row as any).season;
                                                    const isSubRow = multiTeamSeasons.has(season) && team !== '2TM';
                                                    const isSummaryRow = team === '2TM';
                                                    if (!isSubRow) groupIdx++;
                                                    const rowBg = groupIdx % 2 !== 0 ? rowAltBg : rowBaseBg;
                                                    return (
                                                        <tr key={ri}>
                                                            {cols.map((col, ci) => {
                                                                const raw = (row as any)[col.key];
                                                                const display = (isSubRow && col.key === 'season') ? '' : formatCareerCell(col.key, raw);
                                                                const isSticky = ci === 0;
                                                                const stickyColor = isPlayoffMode ? 'text-amber-300' : isCurrentSeason ? 'text-indigo-300' : 'text-slate-300';
                                                                return (
                                                                    <td key={col.key} className={`px-3 py-2 font-mono tabular-nums whitespace-nowrap border-b ${isSticky ? `sticky left-0 z-10 font-bold ${stickyColor}` : ''} ${isSubRow ? 'opacity-60' : ''}`}
                                                                        style={{ ...rowBg, borderBottomColor: dividerColor, ...(isSubRow && isSticky ? { borderLeft: `2px solid ${dividerColor}`, paddingLeft: '20px' } : {}), color: isSubRow && !isSticky ? 'rgba(255,255,255,0.65)' : undefined }}>
                                                                        {isSummaryRow && col.key === 'team' ? <span className="font-black">{display}</span> : display}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    );
                                                });
                                            })()}
                                        </tbody>
                                        <tfoot>
                                            {(() => {
                                                const cols = careerTab === 'trad' ? CAREER_TRAD_COLS : CAREER_ADV_COLS;
                                                const rows = careerMode === 'playoff' ? careerPlayoff : careerRegular;
                                                const nonTm = rows.filter(r => (r as any).team !== '2TM');
                                                const teamOrder: string[] = [];
                                                nonTm.forEach(r => { const t = (r as any).team; if (!teamOrder.includes(t)) teamOrder.push(t); });
                                                const avgRows = [...teamOrder.map(t => computeCareerAvg(nonTm.filter(r => (r as any).team === t), t)), computeCareerAvg(nonTm, '커리어')].filter(r => r.team);
                                                return avgRows.map((avgRow, ai) => {
                                                    const isCareer = avgRow.team === '커리어';
                                                    return (
                                                        <tr key={ai} style={isCareer ? subHeaderBg : { ...subHeaderBg, opacity: 0.75 }}>
                                                            {cols.map((col, ci) => (
                                                                <td key={col.key} className={`px-3 py-1.5 font-mono tabular-nums whitespace-nowrap border-t ${ci === 0 ? 'sticky left-0 z-10 font-black' : isCareer ? 'font-bold text-white' : 'text-slate-300'}`}
                                                                    style={{ ...subHeaderBg, borderTopColor: isCareer ? heavyDividerColor : dividerColor, ...subHeaderTextStyle, ...(isCareer && ci !== 0 ? { color: 'white' } : {}) }}>
                                                                    {formatCareerCell(col.key, avgRow[col.key])}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    );
                                                });
                                            })()}
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* ── 위젯 C: 최근 경기 ── */}
                        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                            <SectionHeader title="최근 경기" style={sectionBg} />
                            <div style={{ height: '400px' }} className="relative">
                                <VirtualGameLog
                                    gameLog={gameLog}
                                    gameLogLoading={gameLogLoading}
                                    teamId={teamId}
                                    subHeaderStyle={subHeaderBg}
                                    rowAltStyle={rowAltBg}
                                    rowBaseStyle={rowBaseBg}
                                    dividerColor={dividerColor}
                                    subHeaderTextStyle={subHeaderTextStyle}
                                />
                            </div>
                        </div>

                        {/* ── 위젯 D: 샷차트 + 구역별 야투 기록 ── */}
                        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                            <SectionHeader title="샷 차트" style={sectionBg}>
                                <button
                                    onClick={() => setShotChartMode(shotChartMode === 'efficiency' ? 'volume' : 'efficiency')}
                                    className="px-2.5 py-1 text-[10px] font-bold rounded-lg border text-white transition-colors"
                                    style={dropdownStyle}
                                >
                                    {shotChartMode === 'efficiency' ? '성공률' : '시도수'}
                                </button>
                            </SectionHeader>
                            <div className="grid" style={{ gridTemplateColumns: '2fr 8fr' }}>
                            {/* 좌: 샷차트 SVG */}
                            <div className="p-3 border-r border-slate-800">
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
                                                            <text textAnchor="middle" y={z.a > 0 ? -5 : 0} fill={textFill} fontSize="13px" fontWeight="800" dominantBaseline="middle">{pct}%</text>
                                                            {z.a > 0 && <text textAnchor="middle" y={12} fill="rgba(255,255,255,0.7)" fontSize="9px" fontWeight="600" dominantBaseline="middle">{z.m}/{z.a}</text>}
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
                                                            <text textAnchor="middle" y={z.a > 0 ? -5 : 0} fill={textFill} fontSize="13px" fontWeight="800" dominantBaseline="middle">{z.a}</text>
                                                            {z.a > 0 && <text textAnchor="middle" y={12} fill="rgba(255,255,255,0.7)" fontSize="9px" fontWeight="600" dominantBaseline="middle">{volPct}%</text>}
                                                        </g>
                                                    );
                                                }
                                            })}
                                        </g>
                                    </svg>
                                </div>
                            </div>
                            {/* 우: 구역별 야투 기록 테이블 */}
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-left border-separate border-spacing-0 text-xs">
                                    <thead>
                                        <tr style={subHeaderBg}>
                                            <th className="px-3 py-2 font-bold uppercase tracking-wider whitespace-nowrap border-b sticky left-0 z-10" style={{ borderBottomColor: dividerColor, ...subHeaderBg, ...subHeaderTextStyle }}>구역</th>
                                            <th className="px-3 py-2 font-bold uppercase tracking-wider whitespace-nowrap border-b text-right" style={{ borderBottomColor: dividerColor, ...subHeaderTextStyle }}>M/A</th>
                                            <th className="px-3 py-2 font-bold uppercase tracking-wider whitespace-nowrap border-b text-right" style={{ borderBottomColor: dividerColor, ...subHeaderTextStyle }}>FG%</th>
                                            <th className="px-3 py-2 font-bold uppercase tracking-wider whitespace-nowrap border-b text-right" style={{ borderBottomColor: dividerColor, ...subHeaderTextStyle }}>평균</th>
                                            <th className="px-3 py-2 font-bold uppercase tracking-wider whitespace-nowrap border-b text-right" style={{ borderBottomColor: dividerColor, ...subHeaderTextStyle }}>vs 평균</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {chartZones.map((z, i) => {
                                            const pct = z.a > 0 ? z.m / z.a : null;
                                            const delta = pct !== null ? pct - z.avg : null;
                                            const rowBg = i % 2 !== 0 ? rowAltBg : rowBaseBg;
                                            const deltaColor = delta === null ? 'text-slate-600'
                                                : delta > 0.03 ? 'text-emerald-400'
                                                : delta < -0.03 ? 'text-rose-400'
                                                : 'text-slate-400';
                                            return (
                                                <tr key={z.key} style={rowBg}>
                                                    <td className="px-3 py-2 font-bold whitespace-nowrap border-b sticky left-0 z-10 text-slate-200" style={{ borderBottomColor: dividerColor, ...rowBg }}>{(z as any).label}</td>
                                                    <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap border-b text-right text-slate-300" style={{ borderBottomColor: dividerColor }}>{z.a > 0 ? `${z.m}/${z.a}` : '-'}</td>
                                                    <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap border-b text-right font-bold text-white" style={{ borderBottomColor: dividerColor }}>{pct !== null ? `${(pct * 100).toFixed(1)}%` : '-'}</td>
                                                    <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap border-b text-right text-slate-400" style={{ borderBottomColor: dividerColor }}>{(z.avg * 100).toFixed(1)}%</td>
                                                    <td className={`px-3 py-2 font-mono tabular-nums whitespace-nowrap border-b text-right font-bold ${deltaColor}`} style={{ borderBottomColor: dividerColor }}>
                                                        {delta !== null ? `${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)}%` : '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            </div>{/* end grid 2:8 */}
                        </div>

                    </div>{/* end 우열 */}

                </div>
            </div>
        </div>
    );
};
