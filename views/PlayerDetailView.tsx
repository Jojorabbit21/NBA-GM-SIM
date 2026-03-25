
import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { ArrowLeft, Loader2, ChevronDown } from 'lucide-react';
import { Player, PlayerStats, Team } from '../types';
import { getTeamLogoUrl, calculatePlayerOvr } from '../utils/constants';
import { formatMoney, formatMoneyFull } from '../utils/formatMoney';
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
    myTeamId?: string;
    onBack: () => void;
    onNegotiate?: () => void;   // FA 계약 협상
    onExtension?: () => void;   // 우리팀 계약 연장
    onRelease?: () => void;     // 우리팀 방출
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
    { key: 'pts', label: 'PTS' },
    { key: 'fgm', label: 'FGM' }, { key: 'fga', label: 'FGA' }, { key: 'fg%', label: 'FG%' },
    { key: '3pm', label: '3PM' }, { key: '3pa', label: '3PA' }, { key: '3p%', label: '3P%' },
    { key: 'ftm', label: 'FTM' }, { key: 'fta', label: 'FTA' }, { key: 'ft%', label: 'FT%' },
    { key: 'ts%', label: 'TS%' },
    { key: 'oreb', label: 'OREB' }, { key: 'dreb', label: 'DREB' }, { key: 'reb', label: 'REB' },
    { key: 'ast', label: 'AST' }, { key: 'stl', label: 'STL' }, { key: 'blk', label: 'BLK' },
    { key: 'tov', label: 'TOV' }, { key: 'pf', label: 'PF' },
    { key: 'tf', label: 'TF' }, { key: 'ff', label: 'FF' },
    { key: 'pm', label: '+/-' },
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
        <span className="text-sm font-black text-white uppercase">{title}</span>
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
        { val: String(g.fgm || 0) }, { val: String(g.fga || 0) }, { val: fgPct },
        { val: String(g.p3m || 0) }, { val: String(g.p3a || 0) }, { val: p3Pct },
        { val: String(g.ftm || 0) }, { val: String(g.fta || 0) }, { val: ftPct },
        { val: tsPct },
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
        { val: pmStr, color: pmVal > 0 ? 'text-emerald-400' : pmVal < 0 ? 'text-red-400' : undefined },
    ];
}

const ROW_HEIGHT = 32; // h-8 = 32px
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
        <div className="relative overflow-hidden h-full" style={{ contain: 'strict' }}>
            <div
                ref={scrollRef}
                className="absolute inset-0 overflow-y-auto overscroll-none"
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
                        <table className="w-full text-left border-separate border-spacing-0 text-xs">
                            <thead className="sticky top-0 z-40">
                                <tr>
                                    {GAME_LOG_COLS.map((c, i) => (
                                        <th
                                            key={c.key}
                                            className={`px-3 py-2 font-bold uppercase whitespace-nowrap border-b border-slate-800 bg-slate-800 text-slate-500 text-center ${i === 0 ? 'sticky left-0 z-10' : ''}`}
                                        >
                                            {c.label}
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

export const PlayerDetailView: React.FC<PlayerDetailViewProps> = ({ player: playerProp, teamName: teamNameProp, teamId: teamIdProp, allTeams, tendencySeed, seasonShort = '2025-26', myTeamId, onBack, onNegotiate, onExtension, onRelease }) => {
    // ── 내비게이션 로컬 state (브레드크럼 드롭다운) ──
    const [player, setPlayer] = useState(playerProp);
    const [teamId, setTeamId] = useState(teamIdProp);
    useEffect(() => { setPlayer(playerProp); setTeamId(teamIdProp); }, [playerProp.id, teamIdProp]);

    const teamName = teamId ? (allTeams?.find(t => t.id === teamId)?.name ?? teamNameProp) : undefined;

    const [teamDropOpen, setTeamDropOpen] = useState(false);
    const [playerDropOpen, setPlayerDropOpen] = useState(false);
    const teamDropRef = useRef<HTMLDivElement>(null);
    const playerDropRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (teamDropRef.current && !teamDropRef.current.contains(e.target as Node)) setTeamDropOpen(false);
            if (playerDropRef.current && !playerDropRef.current.contains(e.target as Node)) setPlayerDropOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const sortedTeams = useMemo(() =>
        [...(allTeams ?? [])].sort((a, b) => (a.id ?? '').localeCompare(b.id ?? '')),
    [allTeams]);

    const currentTeamRoster = useMemo(() => {
        const team = allTeams?.find(t => t.id === teamId);
        if (!team) return [];
        return [...team.roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
    }, [teamId, allTeams]);

    const teamColors = teamId ? (TEAM_DATA[teamId]?.colors || null) : null;
    const theme = getTeamTheme(teamId || null, teamColors);
    const tintColor = getEffectiveTintColor(theme);
    const isLight = luminance(tintColor) > 0.5;
    const sectionBg   = { backgroundColor: theme.bg }; // L5: SectionHeader
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

    // 리그 전체 선수 zone 스탯 합산 → 실제 리그 평균 계산
    const leagueZoneAvg = useMemo(() => {
        const totals = { rim_m: 0, rim_a: 0, paint_m: 0, paint_a: 0, mid_m: 0, mid_a: 0, c3_m: 0, c3_a: 0, atb3_m: 0, atb3_a: 0 };
        const allPlayers = (allTeams ?? []).flatMap(t => t.roster ?? []);
        for (const p of allPlayers) {
            const st = p.stats as any;
            if (!st) continue;
            totals.rim_m   += st.zone_rim_m    || 0; totals.rim_a   += st.zone_rim_a    || 0;
            totals.paint_m += st.zone_paint_m  || 0; totals.paint_a += st.zone_paint_a  || 0;
            totals.mid_m   += (st.zone_mid_l_m || 0) + (st.zone_mid_c_m || 0) + (st.zone_mid_r_m || 0);
            totals.mid_a   += (st.zone_mid_l_a || 0) + (st.zone_mid_c_a || 0) + (st.zone_mid_r_a || 0);
            totals.c3_m    += (st.zone_c3_l_m  || 0) + (st.zone_c3_r_m  || 0);
            totals.c3_a    += (st.zone_c3_l_a  || 0) + (st.zone_c3_r_a  || 0);
            totals.atb3_m  += (st.zone_atb3_l_m || 0) + (st.zone_atb3_c_m || 0) + (st.zone_atb3_r_m || 0);
            totals.atb3_a  += (st.zone_atb3_l_a || 0) + (st.zone_atb3_c_a || 0) + (st.zone_atb3_r_a || 0);
        }
        const pct = (m: number, a: number, fallback: number) => a > 0 ? m / a : fallback;
        return {
            rim:   pct(totals.rim_m,   totals.rim_a,   ZONE_AVG.rim),
            paint: pct(totals.paint_m, totals.paint_a, ZONE_AVG.paint),
            mid:   pct(totals.mid_m,   totals.mid_a,   ZONE_AVG.mid),
            c3:    pct(totals.c3_m,    totals.c3_a,    ZONE_AVG.c3),
            atb3:  pct(totals.atb3_m,  totals.atb3_a,  ZONE_AVG.atb3),
        };
    }, [allTeams]);

    const chartZones = useMemo(() =>
        CHART_ZONES.map(z => {
            const sk = ZONE_STAT_KEYS[z.key];
            const m = sk ? ((s as any)[sk.keyM] || 0) : 0;
            const a = sk ? ((s as any)[sk.keyA] || 0) : 0;
            return { ...z, m, a, avg: leagueZoneAvg[z.avgKey] };
        }),
    [player.stats, leagueZoneAvg]);

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
            {/* ═══ 브레드크럼 바 ═══ */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-white/10 shrink-0" style={{ backgroundColor: theme.bg }}>
                {/* 뒤로 버튼 */}
                <button
                    onClick={onBack}
                    className="flex items-center justify-center w-7 h-7 rounded-md bg-black/30 hover:bg-black/50 transition-colors shrink-0"
                    style={{ color: theme.text }}
                >
                    <ArrowLeft size={14} />
                </button>

                <span className="text-white/30 text-sm mx-1">/</span>

                {/* 팀 드롭다운 */}
                <div ref={teamDropRef} className="relative">
                    <button
                        onClick={() => { setTeamDropOpen(o => !o); setPlayerDropOpen(false); }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-black/20 hover:bg-black/40 transition-colors"
                        style={{ color: theme.text }}
                    >
                        {teamId && <img src={getTeamLogoUrl(teamId)} className="w-4 h-4 object-contain" alt="" />}
                        <span className="text-xs font-bold">{teamName ?? 'FA'}</span>
                        {allTeams && <ChevronDown size={11} className="opacity-60" />}
                    </button>
                    {teamDropOpen && allTeams && (
                        <div className="absolute top-full left-0 mt-1 z-50 w-52 max-h-72 overflow-y-auto custom-scrollbar rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
                            {sortedTeams.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => {
                                        const roster = [...(t.roster ?? [])].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
                                        if (roster.length > 0) { setPlayer(roster[0]); setTeamId(t.id); }
                                        setTeamDropOpen(false);
                                    }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-800 transition-colors ${t.id === teamId ? 'text-white font-bold' : 'text-slate-300'}`}
                                >
                                    <img src={getTeamLogoUrl(t.id)} className="w-4 h-4 object-contain shrink-0" alt="" />
                                    <span className="truncate">{t.name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <span className="text-white/30 text-sm mx-1">›</span>

                {/* 선수 드롭다운 */}
                <div ref={playerDropRef} className="relative min-w-0">
                    <button
                        onClick={() => { setPlayerDropOpen(o => !o); setTeamDropOpen(false); }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-black/20 hover:bg-black/40 transition-colors max-w-[180px]"
                        style={{ color: theme.text }}
                    >
                        <span className="text-xs font-bold truncate">{player.name}</span>
                        {currentTeamRoster.length > 1 && <ChevronDown size={11} className="opacity-60 shrink-0" />}
                    </button>
                    {playerDropOpen && currentTeamRoster.length > 1 && (
                        <div className="absolute top-full left-0 mt-1 z-50 w-56 max-h-72 overflow-y-auto custom-scrollbar rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
                            {currentTeamRoster.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => { setPlayer(p); setPlayerDropOpen(false); }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-800 transition-colors ${p.id === player.id ? 'text-white font-bold' : 'text-slate-300'}`}
                                >
                                    <span className="font-mono w-6 text-center shrink-0 text-slate-400">{calculatePlayerOvr(p)}</span>
                                    <span className="truncate">{p.name}</span>
                                    <span className="text-slate-500 shrink-0">{p.position}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ 단일 스크롤 영역 ═══ */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-none custom-scrollbar bg-slate-950">
                <div className="grid items-start gap-4 p-4" style={{ gridTemplateColumns: '2fr 8fr' }}>

                    {/* ══════════════ 좌열 (3fr) ══════════════ */}
                    <div className="flex flex-col gap-4">

                        {/* ── 위젯 1: 선수 정보 통합 카드 ── */}
                        {(() => {
                            const allAwards: any[] = [
                                ...(player.career_history?.filter(s => !s.playoff).flatMap(s =>
                                    (s.awards ?? []).map((a: any) => normalizeBrefAward(a, s.season)).filter(Boolean)
                                ) ?? []),
                                ...(player.awards ?? []),
                            ];
                            return (
                            <div className="bg-slate-900 border border-slate-800 rounded-lg">

                                {/* ─ 헤더: OVR + 이름 + 액션 버튼 ─ */}
                                <div className="p-4 rounded-t-lg" style={{ backgroundColor: theme.bg }}>
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <OvrBadge value={calculatedOvr} size="md" />
                                            <h2 className="text-xl font-black uppercase tracking-tight truncate" style={{ color: theme.text }}>{player.name}</h2>
                                        </div>
                                        {/* 액션 버튼 그룹 */}
                                        <div className="flex items-center gap-2 shrink-0">
                                            {!teamId && onNegotiate && (
                                                <button
                                                    onClick={onNegotiate}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95 transition-all whitespace-nowrap"
                                                >
                                                    계약 협상
                                                </button>
                                            )}
                                            {myTeamId && teamId === myTeamId && (
                                                <>
                                                    {onExtension && (
                                                        <button
                                                            onClick={onExtension}
                                                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600/80 text-white hover:bg-indigo-500 active:scale-95 transition-all whitespace-nowrap"
                                                        >
                                                            계약 연장
                                                        </button>
                                                    )}
                                                    {onRelease && (
                                                        <button
                                                            onClick={onRelease}
                                                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-700/80 text-white hover:bg-red-600 active:scale-95 transition-all whitespace-nowrap"
                                                        >
                                                            방출
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* ─ 트로피 행 ─ */}
                                {allAwards.length > 0 && (
                                    <div className="px-4 py-3 border-t border-slate-800">
                                        <HeaderAwardTrophies awards={allAwards} />
                                    </div>
                                )}

                                {/* ─ 기본 정보 ─ */}
                                <div className="px-4 pt-3 pb-3 border-t border-slate-800 space-y-1">
                                    {[
                                        { label: '팀', value: teamId ? <span className="flex items-center gap-1"><img src={getTeamLogoUrl(teamId)} className="w-3.5 h-3.5 object-contain" alt="" />{teamName || 'FA'}</span> : 'FA' },
                                        { label: '포지션', value: player.position },
                                        { label: '나이', value: `${player.age}세` },
                                        { label: '신장', value: `${player.height}cm` },
                                        { label: '체중', value: `${player.weight}kg` },
                                        { label: '연봉', value: player.salary > 0 ? formatMoneyFull(player.salary) : '-' },
                                        { label: '계약', value: player.contractYears > 0 ? `${player.contractYears}년` : '-' },
                                        { label: '리그 레벨', value: <StarRating ovr={calculatedOvr} size="md" /> },
                                        { label: '포지션 평점', value: positionStars !== null ? <StarRating stars={positionStars} size="md" /> : '-' },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="flex justify-between items-center text-xs">
                                            <span className="text-slate-500 shrink-0">{label}</span>
                                            <span className="font-semibold text-slate-200 text-right">{value}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* ─ 부상 현황 ─ */}
                                {player.health && player.health !== 'Healthy' && (() => {
                                    const currentInjury = [...(player.injuryHistory ?? [])].sort((a, b) => b.date.localeCompare(a.date))[0];
                                    return (
                                        <div className="px-4 py-3 border-t border-slate-800 space-y-1">
                                            <div className="text-sm font-bold text-white mb-1.5">부상 현황</div>
                                            {[
                                                { label: '부상명', value: player.injuryType ?? '-' },
                                                { label: '기간', value: currentInjury?.duration ?? '-' },
                                                { label: '예상 복귀', value: player.returnDate ?? '-' },
                                            ].map(({ label, value }) => (
                                                <div key={label} className="flex justify-between items-center">
                                                    <span className="text-xs text-slate-500 shrink-0">{label}</span>
                                                    <span className="text-xs font-semibold text-white text-right">{value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}

                                {/* ─ 선수 유형 ─ */}
                                {playerArchetypeState && (
                                    <div className="px-4 py-3 border-t border-slate-800 space-y-1">
                                        <div className="text-sm font-bold text-white mb-1.5">선수 유형</div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs text-slate-500">아키타입</span>
                                            <span className="text-xs font-semibold text-white">{getArchetypeDisplayInfo(playerArchetypeState.primary).label}</span>
                                        </div>
                                        {playerArchetypeState.secondary && (
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs text-slate-500">보조 유형</span>
                                                <span className="text-xs font-semibold text-slate-300">{getArchetypeDisplayInfo(playerArchetypeState.secondary).label}</span>
                                            </div>
                                        )}
                                        {playerArchetypeState.tags.slice(0, 4).map((tag, i) => (
                                            <div key={tag} className="flex justify-between items-center">
                                                <span className="text-xs text-slate-500">{i === 0 ? '특성' : ''}</span>
                                                <span className="text-xs text-slate-300">{getTraitTagDisplayInfo(tag).label}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* ─ 인기도 ─ */}
                                <div className="px-4 py-3 border-t border-slate-800 space-y-1">
                                    <div className="text-sm font-bold text-white mb-1.5">인기도</div>
                                    {[
                                        { label: '지역적인 인기', value: getLocalPopularityLabel(player.popularity?.local ?? 0) },
                                        { label: '전국적인 인기', value: getNationalPopularityLabel(player.popularity?.national ?? 0) },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="flex justify-between items-center">
                                            <span className="text-xs text-slate-500">{label}</span>
                                            <span className="text-xs text-white font-semibold">{value}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* ─ 성격 & 기분 ─ */}
                                {saveTendencies && (
                                    <div className="px-4 py-3 border-t border-slate-800 space-y-1">
                                        <div className="text-sm font-bold text-white mb-1.5">성격 & 기분</div>
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
                                                <div key={label} className="flex justify-between items-center">
                                                    <span className="text-xs text-slate-500">{label}</span>
                                                    <span className={`text-xs font-semibold ${color}`}>{text}</span>
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                )}

                                {/* ─ 스카우팅 리포트 ─ */}
                                {scoutReport.length > 0 && (
                                    <div className="px-4 py-3 border-t border-slate-800">
                                        <div className="text-sm font-bold text-white mb-1.5">스카우팅 리포트</div>
                                        <span className="text-xs text-white">{scoutReport}</span>
                                    </div>
                                )}

                            </div>
                            );
                        })()}

                        {/* ── 위젯 6: 계약 정보 ── */}
                        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                            {player.prevSalary != null ? (
                                // 생성 FA 선수: 직전 계약 전체 연도 표시 (모두 완료됨)
                                <>
                                    <SectionHeader title="직전 계약" style={sectionBg} />
                                    {player.contract && player.contract.years.length > 0 ? (
                                        <div className="px-4 py-3 space-y-1">
                                            {player.contract.years.map((sal, i) => {
                                                const n = player.contract!.years.length;
                                                // career_history는 최신순(index 0 = 가장 최근) → 계약 첫 해 = history[n-1]
                                                const seasonLabel = player.career_history?.[n - 1 - i]?.season;
                                                return (
                                                    <div key={i} className="flex justify-between items-center text-xs">
                                                        <span className="text-slate-600">{seasonLabel ?? `Year ${i + 1}`}</span>
                                                        <span className="font-mono font-bold text-slate-600">{formatMoney(sal)}</span>
                                                    </div>
                                                );
                                            })}
                                            <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-800">
                                                <span className="text-slate-500">AAV</span>
                                                <span className="font-mono text-slate-400">
                                                    {formatMoney(player.contract.years.reduce((a, b) => a + b, 0) / player.contract.years.length)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-slate-500">유형</span>
                                                <span className="text-slate-400">
                                                    {{ rookie: '루키', veteran: '베테랑', max: '맥스', min: '미니멈', extension: '연장' }[player.contract.type] ?? player.contract.type}
                                                </span>
                                            </div>
                                        </div>
                                    ) : null}
                                </>
                            ) : (
                                // 일반 선수: 현재 계약 표시
                                <>
                                    <SectionHeader title="계약 정보" style={sectionBg} />
                                    {!player.contract || player.contract.years.length === 0 ? (
                                        <div className="flex items-center justify-center h-20">
                                            <span className="text-slate-500 text-xs">계약 정보가 없습니다</span>
                                        </div>
                                    ) : (
                                        <div className="px-4 py-3 space-y-1">
                                            {player.contract.years.map((sal, i) => {
                                                const baseYear    = parseInt(seasonShort.split('-')[0]);
                                                const yearStart   = baseYear - player.contract!.currentYear + i;
                                                const seasonLabel = `${yearStart}-${String(yearStart + 1).slice(-2)}`;
                                                const isCurrent   = i === player.contract!.currentYear;
                                                const isCompleted = i < player.contract!.currentYear;
                                                const opt         = player.contract!.option;
                                                const isOptionYear = opt && opt.year === i;
                                                return (
                                                    <div key={i} className="flex justify-between items-center text-xs">
                                                        <span className={`flex items-center gap-1 ${isCompleted ? 'text-slate-600' : 'text-slate-500'}`}>
                                                            {seasonLabel}
                                                            {isCurrent && <span className="text-indigo-400 font-black">현재</span>}
                                                            {isOptionYear && <span className="text-slate-500">{opt!.type === 'player' ? '선수옵션' : '팀옵션'}</span>}
                                                        </span>
                                                        <span className={`font-mono font-bold ${isCompleted ? 'text-slate-600' : 'text-slate-200'}`}>
                                                            {formatMoney(sal)}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                            <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-800">
                                                <span className="text-slate-500">AAV</span>
                                                <span className="font-mono text-slate-300">
                                                    {formatMoney(player.contract.years.slice(player.contract.currentYear).reduce((a, b) => a + b, 0) / (player.contract.years.length - player.contract.currentYear))}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-slate-500">유형</span>
                                                <span className="text-slate-400 flex items-center gap-1">
                                                    {{ rookie: '루키', veteran: '베테랑', max: '맥스', min: '미니멈', extension: '연장' }[player.contract.type] ?? player.contract.type}
                                                    {player.contract.noTrade && <span className="text-amber-400 font-black ml-1">NTC</span>}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* ── 위젯 7: 수상 내역 ── */}
                        {(() => {
                            const historicalAwards = (player.career_history?.filter(s => !s.playoff) ?? []).flatMap(s =>
                                (s.awards ?? []).map((a: any) => normalizeBrefAward(a, s.season)).filter(Boolean) as any[]
                            );
                            const allAwards = [...historicalAwards, ...(player.awards ?? [])].filter(Boolean);
                            if (allAwards.length === 0) return null;
                            return (
                        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                            <SectionHeader title="수상 내역" style={sectionBg} />
                            {(() => {
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
                                const toOrdinal = (n: number) => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
                                return (
                                    <div className="px-4 py-3 space-y-1">
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
                                                    detail = BASE_DETAIL[entry.type] ?? '-';
                                                }
                                                return (
                                                    <div key={idx} className="flex justify-between items-center text-xs">
                                                        <span className="text-slate-500">{entry.season}</span>
                                                        <span className="text-slate-200 font-semibold">{displayName} <span className="text-slate-400 font-normal">{detail}</span></span>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                );
                            })()}
                        </div>
                            );
                        })()}

                        {/* ── 위젯 8: 부상 이력 ── */}
                        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                            <SectionHeader title="부상 이력" style={sectionBg} />
                            {!player.injuryHistory || player.injuryHistory.length === 0 ? (
                                <div className="flex items-center justify-center h-20">
                                    <span className="text-slate-500 text-xs">부상 이력이 없습니다</span>
                                </div>
                            ) : (
                                <div className="px-4 py-3 space-y-1">
                                    {[...player.injuryHistory]
                                        .sort((a, b) => b.date.localeCompare(a.date))
                                        .map((entry, idx) => {
                                            const dateStr = entry.date.slice(5).replace('-', '/');
                                            const severityColor =
                                                entry.severity === 'Season-Ending' ? 'text-red-400' :
                                                entry.severity === 'Major' ? 'text-amber-400' :
                                                'text-slate-200';
                                            return (
                                                <div key={idx} className="flex justify-between items-center text-xs">
                                                    <span className="text-slate-500">{dateStr} <span className={`${entry.isTraining ? 'text-amber-400' : 'text-sky-400'}`}>{entry.isTraining ? '훈련' : '경기'}</span></span>
                                                    <span className={`font-semibold ${severityColor}`}>{entry.injuryType} <span className="text-slate-500 font-normal">{entry.duration}</span></span>
                                                </div>
                                            );
                                        })}
                                </div>
                            )}
                        </div>

                    </div>{/* end 좌열 */}

                    {/* ══════════════ 우열 (7fr) ══════════════ */}
                    <div className="flex flex-col gap-4">

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
                                                <div key={gr.id} className={`flex flex-col ${!isLastCol ? 'border-r border-slate-800' : ''}`}>
                                                    <div className="h-10 flex items-center justify-center border-b border-slate-800 bg-slate-800">
                                                        <span className="text-xs font-black uppercase text-slate-500">{ATTR_KR_LABEL[gr.keys[0]] || gr.label}</span>
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
                                                            <div key={k} className={`flex items-center justify-between px-3 h-9 border-b border-slate-800 transition-colors hover:bg-white/5 ${getAttrBg(val)}`}>
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
                                                        <div key={`empty-${i}`} className="h-9 border-b border-slate-800" />
                                                    ))}
                                                    <div className={`flex items-center justify-between px-3 h-10 border-t border-slate-800 bg-slate-800 ${getAttrBg(avgVal)}`}>
                                                        <span className="text-xs font-black uppercase text-slate-500">종합</span>
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
                                    <select value={careerMode} onChange={e => setCareerMode(e.target.value as 'regular' | 'playoff')} className="pl-2.5 pr-7 py-1 text-xs font-bold rounded-md border-0 cursor-pointer focus:outline-none bg-black/20 hover:bg-black/40 transition-colors text-white">
                                        <option value="regular">정규시즌</option>
                                        {hasCareerPlayoff && <option value="playoff">플레이오프</option>}
                                    </select>
                                    <select value={careerTab} onChange={e => setCareerTab(e.target.value as 'trad' | 'adv')} className="pl-2.5 pr-7 py-1 text-xs font-bold rounded-md border-0 cursor-pointer focus:outline-none bg-black/20 hover:bg-black/40 transition-colors text-white">
                                        <option value="trad">기본</option>
                                        <option value="adv">어드밴스드</option>
                                    </select>
                                </SectionHeader>
                                <div className="overflow-x-auto custom-scrollbar">
                                    <table className="w-full text-left border-separate border-spacing-0 text-xs">
                                        <thead>
                                            <tr>
                                                {(careerTab === 'trad' ? CAREER_TRAD_COLS : CAREER_ADV_COLS).map((col, i) => (
                                                    <th key={col.key} className={`px-3 py-2 font-bold uppercase whitespace-nowrap border-b border-slate-800 bg-slate-800 text-slate-500 ${i === 0 ? 'sticky left-0 z-10' : ''}`}>
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
                                                    const rowBg = groupIdx % 2 !== 0 ? { backgroundColor: 'rgba(255,255,255,0.02)' } : {};
                                                    return (
                                                        <tr key={ri}>
                                                            {cols.map((col, ci) => {
                                                                const raw = (row as any)[col.key];
                                                                const display = (isSubRow && col.key === 'season') ? '' : formatCareerCell(col.key, raw);
                                                                const isSticky = ci === 0;
                                                                const stickyColor = isPlayoffMode ? 'text-amber-300' : isCurrentSeason ? 'text-indigo-300' : 'text-slate-300';
                                                                return (
                                                                    <td key={col.key} className={`px-3 py-2 font-mono tabular-nums whitespace-nowrap border-b border-slate-800 ${isSticky ? `sticky left-0 z-10 font-bold ${stickyColor}` : ''} ${isSubRow ? 'opacity-60' : ''}`}
                                                                        style={{ ...rowBg, ...(isSubRow && isSticky ? { borderLeft: '2px solid #1e293b', paddingLeft: '20px' } : {}), color: isSubRow && !isSticky ? 'rgba(255,255,255,0.65)' : undefined }}>
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
                                                        <tr key={ai} style={isCareer ? { backgroundColor: '#1e293b' } : { backgroundColor: '#1e293b', opacity: 0.75 }}>
                                                            {cols.map((col, ci) => (
                                                                <td key={col.key} className={`px-3 py-1.5 font-mono tabular-nums whitespace-nowrap border-t ${ci === 0 ? 'sticky left-0 z-10 font-black' : isCareer ? 'font-bold text-white' : 'text-slate-300'}`}
                                                                    style={{ backgroundColor: '#1e293b', borderTopColor: isCareer ? '#334155' : '#1e293b', color: '#64748b', ...(isCareer && ci !== 0 ? { color: 'white' } : {}) }}>
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
                        {!gameLogLoading && gameLog && gameLog.length > 0 && <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                            <SectionHeader title="최근 경기" style={sectionBg} />
                            <div style={{ height: Math.min(gameLog.length * ROW_HEIGHT + ROW_HEIGHT, 400) }} className="relative">
                                <VirtualGameLog
                                    gameLog={gameLog}
                                    gameLogLoading={gameLogLoading}
                                    teamId={teamId}
                                    subHeaderStyle={{ backgroundColor: '#1e293b' }}
                                    rowAltStyle={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
                                    rowBaseStyle={{}}
                                    dividerColor="#1e293b"
                                    subHeaderTextStyle={{ color: '#64748b' }}
                                />
                            </div>
                        </div>}

                        {/* ── 위젯 D: 샷차트 + 구역별 야투 기록 ── */}
                        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                            <SectionHeader title="샷 차트" style={sectionBg}>
                                <div className="flex items-center rounded-lg overflow-hidden border border-white/20 text-xs font-bold">
                                    <button
                                        onClick={() => setShotChartMode('efficiency')}
                                        className="px-2.5 py-1 transition-colors"
                                        style={shotChartMode === 'efficiency' ? { backgroundColor: 'rgba(0,0,0,0.35)', color: theme.text } : { backgroundColor: 'transparent', color: 'rgba(255,255,255,0.4)' }}
                                    >성공률</button>
                                    <button
                                        onClick={() => setShotChartMode('volume')}
                                        className="px-2.5 py-1 transition-colors"
                                        style={shotChartMode === 'volume' ? { backgroundColor: 'rgba(0,0,0,0.35)', color: theme.text } : { backgroundColor: 'transparent', color: 'rgba(255,255,255,0.4)' }}
                                    >시도수</button>
                                </div>
                            </SectionHeader>
                            <div className="grid" style={{ gridTemplateColumns: '4fr 6fr' }}>
                            {/* 좌: 샷차트 SVG */}
                            <div className="p-3 border-r border-slate-800">
                                <div className="relative w-full aspect-[435/403] bg-slate-950 rounded-lg overflow-hidden border-[1.5px] border-slate-700">
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
                                        <tr className="bg-slate-800">
                                            <th className="px-3 py-2 font-bold whitespace-nowrap border-b border-slate-800 sticky left-0 z-10 bg-slate-800 text-slate-400">구역</th>
                                            <th className="px-3 py-2 font-bold whitespace-nowrap border-b border-slate-800 text-right text-slate-400">시도</th>
                                            <th className="px-3 py-2 font-bold whitespace-nowrap border-b border-slate-800 text-right text-slate-400">성공</th>
                                            <th className="px-3 py-2 font-bold whitespace-nowrap border-b border-slate-800 text-right text-slate-400">성공률</th>
                                            <th className="px-3 py-2 font-bold whitespace-nowrap border-b border-slate-800 text-right text-slate-400">평균</th>
                                            <th className="px-3 py-2 font-bold whitespace-nowrap border-b border-slate-800 text-right text-slate-400">vs 평균</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {chartZones.map((z, i) => {
                                            const pct = z.a > 0 ? z.m / z.a : null;
                                            const delta = pct !== null ? pct - z.avg : null;
                                            const rowBg = i % 2 !== 0 ? { backgroundColor: 'rgba(255,255,255,0.02)' } : {};
                                            const deltaColor = delta === null ? 'text-slate-600'
                                                : delta > 0.03 ? 'text-emerald-400'
                                                : delta < -0.03 ? 'text-rose-400'
                                                : 'text-slate-400';
                                            return (
                                                <tr key={z.key} style={rowBg}>
                                                    <td className="px-3 py-2 font-bold whitespace-nowrap border-b border-slate-800 sticky left-0 z-10 text-slate-200" style={rowBg}>{(z as any).label}</td>
                                                    <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap border-b border-slate-800 text-right text-slate-300">{z.a > 0 ? z.a : '-'}</td>
                                                    <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap border-b border-slate-800 text-right text-slate-300">{z.a > 0 ? z.m : '-'}</td>
                                                    <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap border-b border-slate-800 text-right font-bold text-white">{pct !== null ? `${(pct * 100).toFixed(1)}%` : '-'}</td>
                                                    <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap border-b border-slate-800 text-right text-slate-400">{(z.avg * 100).toFixed(1)}%</td>
                                                    <td className={`px-3 py-2 font-mono tabular-nums whitespace-nowrap border-b border-slate-800 text-right font-bold ${deltaColor}`}>
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
