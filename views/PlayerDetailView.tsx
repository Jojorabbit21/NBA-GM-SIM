
import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { ArrowLeft, Loader2, ChevronDown } from 'lucide-react';
import { Player, PlayerStats, Team, Game } from '../types';
import { calculatePlayerOvr } from '../utils/constants';
import { formatMoneyFull } from '../utils/formatMoney';
import { TEAM_DATA } from '../data/teamData';
import { getTeamTheme } from '../utils/teamTheme';
import { OvrBadge } from '../components/common/OvrBadge';
import { TeamBadge } from '../components/common/TeamBadge';
import { StarRating } from '../components/common/StarRating';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/common/Table';
import { TabBar } from '../components/common/TabBar';
import {
    ZONE_AVG,
    ZONE_CONFIG as CHART_ZONES,
    ZONE_PATHS,
    COURT_LINES,
    getZoneStyle,
} from '../utils/courtZones';
import { hexbin as d3Hexbin } from 'd3-hexbin';
import { scaleSequential } from 'd3-scale';
import { interpolateViridis } from 'd3-scale-chromatic';
import { COMPACT_ATTR_GROUPS, ATTR_KR_LABEL, getCompactAttrValue, type CompactAttrItem } from '../data/attributeConfig';
import { generateScoutReport } from '../utils/scoutReport';
import { usePlayerGameLog } from '../services/queries';
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
    schedule?: Game[];
    tendencySeed?: string;
    seasonShort?: string;
    myTeamId?: string;
    onBack: () => void;
    onNegotiate?: () => void;   // FA 계약 협상
    onExtension?: () => void;   // 우리팀 계약 연장
    onRelease?: () => void;     // 우리팀 방출
    // 브레드크럼 팀/선수 드롭다운으로 다른 선수를 선택했을 때 호출 — 지정 시(멀티플레이어)
    // 이 콜백이 URL 네비게이션(navigate)까지 처리하고, 미지정 시(싱글플레이어) 기존처럼
    // 컴포넌트 로컬 state만 바꾼다. 지정하지 않으면 드롭다운으로 선수를 바꿔도 주소창의
    // playerId가 그대로 남는 문제가 있었다.
    onSelectPlayer?: (playerId: string) => void;
    // 멀티플레이 경량화 — 지정한 섹션을 숨긴다
    hideSections?: Array<'contract' | 'awards' | 'injuryHistory'>;
    // 멀티플레이 경량화 — 외부에서 주입하는 gameLog (없으면 싱글 훅 사용)
    externalGameLog?: any[];
    externalGameLogLoading?: boolean;
    // 샷 차트 탭 — 이 선수의 개별 슛 이벤트(x/y 좌표, courtCoordinates.ts 기준 풀코트
    // x:0~94ft/y:0~50ft). d3-hexbin 밀도 히트맵(메인 샷 차트)의 원본 데이터.
    externalShotEvents?: any[];
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

// ── Defense Zones ──
const DEF_ZONES = ['RA', 'ITP', 'MID', 'CNR', 'WING', 'ATB'] as const;

const DefenseZoneTable: React.FC<{ stats: PlayerStats }> = ({ stats: st }) => (
    <table className="w-full text-[11px]" style={{ tableLayout: 'fixed' }}>
        <thead>
            <tr className="h-6 border-b border-slate-800/60">
                {DEF_ZONES.map((z, zi) => (
                    <th key={z} colSpan={3}
                        className={`text-center text-[9px] font-black uppercase tracking-widest text-slate-400 align-middle
                            ${zi < DEF_ZONES.length - 1 ? 'border-r border-slate-800/40' : ''}`}
                    >
                        {z}
                    </th>
                ))}
            </tr>
            <tr className="h-6 border-b border-slate-800">
                {DEF_ZONES.flatMap((z, zi) =>
                    (['DFGM', 'DFGA', 'DFG%'] as const).map((sub, si) => (
                        <th key={`${z}_${sub}`}
                            className={`text-center text-[9px] font-medium text-slate-500 align-middle
                                ${si === 2 && zi < DEF_ZONES.length - 1 ? 'border-r border-slate-800/40' : ''}`}
                        >
                            {sub}
                        </th>
                    ))
                )}
            </tr>
        </thead>
        <tbody>
            <tr className="h-10">
                {DEF_ZONES.flatMap((z, zi) => {
                    const m = (st as any)[`def${z}Made`] ?? 0;
                    const a = (st as any)[`def${z}Attempted`] ?? 0;
                    const pct = a > 0 ? (m / a * 100).toFixed(1) + '%' : '-';
                    return (['DFGM', 'DFGA', 'DFG%'] as const).map((sub, si) => (
                        <td key={`${z}_${sub}`} align="center"
                            className={`font-mono font-medium tabular-nums text-white text-[11px]
                                ${si === 2 && zi < DEF_ZONES.length - 1 ? 'border-r border-slate-800/40' : ''}`}
                        >
                            {sub === 'DFGM' ? m : sub === 'DFGA' ? a : pct}
                        </td>
                    ));
                })}
            </tr>
        </tbody>
    </table>
);

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
    { key: 'stl_pct', label: 'STL%' }, { key: 'blk_pct', label: 'BLK%' },
    { key: 'cont_pg', label: 'CONT' },
    { key: 'dfg_pct', label: 'DFG%' },
];

// ── Career table helpers ──
const PCT_COLS = new Set(['fg_pct','fg3_pct','ft_pct','ts_pct','efg_pct','fg3a_rate','fta_rate','dfg_pct']);
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

// ── 헤더 시즌/커리어 스탯 라인 ──
const HEADER_STAT_KEYS = [
    { key: 'gp', label: 'G' }, { key: 'min', label: 'MP' },
    { key: 'pts', label: 'PTS' }, { key: 'reb', label: 'REB' }, { key: 'ast', label: 'AST' },
    { key: 'stl', label: 'STL' }, { key: 'blk', label: 'BLK' },
    { key: 'fg_pct', label: 'FG%' }, { key: 'fg3_pct', label: '3P%' }, { key: 'ft_pct', label: 'FT%' },
    { key: 'ts_pct', label: 'TS%' },
];

function formatHeaderStat(key: string, row: Record<string, any> | null): string {
    if (!row || row[key] == null) return '-';
    const formatted = formatCareerCell(key, row[key]);
    return PCT_COLS.has(key) ? `${formatted}%` : formatted;
}

// "2025-2026" → "2025-26" (이미 축약 형식이면 그대로 통과)
function shortenSeasonLabel(s: string): string {
    const m = s.match(/^(\d{4})-(\d{4})$/);
    return m ? `${m[1]}-${m[2].slice(-2)}` : s;
}

function computeCareerAvg(rows: any[], teamLabel: string): Record<string, any> {
    // 2TM 합산 행 제외, gp>0인 행만
    const valid = rows.filter(r => r.team !== '2TM' && (r.gp ?? 0) > 0);
    if (valid.length === 0) return {};
    const totalGP = valid.reduce((s, r) => s + (r.gp ?? 0), 0);
    // 항상 집계되는 스탯 — null 없음
    const wavg = (key: string) =>
        valid.reduce((s, r) => s + ((r[key] ?? 0) * (r.gp ?? 0)), 0) / totalGP;
    // 시대 미집계 가능 스탯 — null 시즌 제외 후 평균, 전부 null이면 null 반환
    const wavgNullable = (key: string): number | null => {
        const tracked = valid.filter(r => r[key] != null);
        if (tracked.length === 0) return null;
        const gpSum = tracked.reduce((s, r) => s + (r.gp ?? 0), 0);
        return tracked.reduce((s, r) => s + (r[key] * (r.gp ?? 0)), 0) / gpSum;
    };
    // 슈팅% 는 성분 스탯에서 재계산
    const tot = (key: string) => valid.reduce((s, r) => s + ((r[key] ?? 0) * (r.gp ?? 0)), 0);
    const fga = tot('fga'); const fg3a = tot('fg3a'); const fta = tot('fta');
    // fg3a: 집계된 시즌이 하나라도 있어야 fg3_pct 계산
    const hasFg3 = valid.some(r => r.fg3a != null);
    return {
        season: `${valid.length}시즌`, team: teamLabel, age: null,
        gp: totalGP,
        gs: valid.reduce((s, r) => s + (r.gs ?? 0), 0),
        min: wavg('min'), pts: wavg('pts'),
        oreb: wavgNullable('oreb'), dreb: wavgNullable('dreb'), reb: wavg('reb'),
        ast: wavg('ast'),
        stl: wavgNullable('stl'), blk: wavgNullable('blk'), tov: wavgNullable('tov'),
        pf: wavg('pf'),
        fgm: wavg('fgm'), fga: wavg('fga'),
        fg_pct: fga > 0 ? tot('fgm') / fga : null,
        fg3m: wavgNullable('fg3m'), fg3a: wavgNullable('fg3a'),
        fg3_pct: (hasFg3 && fg3a > 0) ? tot('fg3m') / fg3a : null,
        ftm: wavg('ftm'), fta: wavg('fta'),
        ft_pct: fta > 0 ? tot('ftm') / fta : null,
        ts_pct: wavg('ts_pct'), efg_pct: wavg('efg_pct'),
        tov_pct: wavgNullable('tov_pct'),
        fg3a_rate: wavgNullable('fg3a_rate'), fta_rate: wavg('fta_rate'),
        usg_pct: wavgNullable('usg_pct'), ast_pct: wavgNullable('ast_pct'),
        orb_pct: wavgNullable('orb_pct'), drb_pct: wavgNullable('drb_pct'), trb_pct: wavgNullable('trb_pct'),
        stl_pct: wavgNullable('stl_pct'), blk_pct: wavgNullable('blk_pct'),
        cont_pg: wavgNullable('cont_pg'),
        dfg_pct: wavgNullable('dfg_pct'),
    };
}

interface TeamAdvCtx {
    tmFga: number; tmFta: number; tmTov: number; tmFgm: number; tmMp: number;
    tmOreb: number; tmDreb: number; tmReb: number;
    oppOreb: number; oppDreb: number; oppReb: number; oppPoss: number; opp2pa: number;
}

/** PlayerStats(시뮬 누적 합계) → CareerSeasonStat 형식(per-game 평균)으로 변환 */
function statsToCareerRow(
    stats: import('../types/player').PlayerStats,
    season: string,
    teamAbbr: string,
    age: number,
    playoff: boolean,
    ctx?: TeamAdvCtx,
): Record<string, any> {
    const g = stats.g;
    const mp  = stats.mp || 0;
    const safe = (n: number) => (g > 0 ? n / g : 0);
    const pct   = (m: number, a: number) => (a > 0 ? m / a : null);
    const fga   = stats.fga;
    const fta   = stats.fta;
    const pts   = stats.pts;
    const p3a   = stats.p3a;
    const tov   = stats.tov;
    const tsD   = 2 * (fga + 0.44 * fta);

    let usg_pct: number | null = null;
    let ast_pct: number | null = null;
    let orb_pct: number | null = null;
    let drb_pct: number | null = null;
    let trb_pct: number | null = null;
    let stl_pct: number | null = null;
    let blk_pct: number | null = null;

    if (ctx && mp > 0) {
        const { tmFga, tmFta, tmTov, tmFgm, tmMp,
                tmOreb, tmDreb, tmReb,
                oppOreb, oppDreb, oppReb, oppPoss, opp2pa } = ctx;
        const tmMp5    = tmMp / 5;
        const tmUsage  = tmFga + 0.44 * tmFta + tmTov;
        const plPoss   = fga + 0.44 * fta + tov;

        if (tmUsage > 0)
            usg_pct = (plPoss * tmMp5) / (mp * tmUsage) * 100;

        const astDen = (mp / tmMp5) * tmFgm - stats.fgm;
        if (astDen > 0)
            ast_pct = (stats.ast / astDen) * 100;

        if ((tmOreb + oppDreb) > 0)
            orb_pct = (stats.offReb * tmMp5) / (mp * (tmOreb + oppDreb)) * 100;
        if ((tmDreb + oppOreb) > 0)
            drb_pct = (stats.defReb * tmMp5) / (mp * (tmDreb + oppOreb)) * 100;
        if ((tmReb + oppReb) > 0)
            trb_pct = (stats.reb    * tmMp5) / (mp * (tmReb  + oppReb))  * 100;
        if (oppPoss > 0)
            stl_pct = (stats.stl   * tmMp5) / (mp * oppPoss) * 100;
        if (opp2pa > 0)
            blk_pct = (stats.blk   * tmMp5) / (mp * opp2pa)  * 100;
    }

    return {
        season,
        team:    teamAbbr,
        age,
        gp:      g,
        gs:      stats.gs,
        min:     safe(stats.mp),
        pts:     safe(pts),
        oreb:    safe(stats.offReb),
        dreb:    safe(stats.defReb),
        reb:     safe(stats.reb),
        ast:     safe(stats.ast),
        stl:     safe(stats.stl),
        blk:     safe(stats.blk),
        tov:     safe(tov),
        pf:      safe(stats.pf),
        fgm:     safe(stats.fgm),
        fga:     safe(fga),
        fg_pct:  pct(stats.fgm, fga),
        fg3m:    safe(stats.p3m),
        fg3a:    safe(p3a),
        fg3_pct: pct(stats.p3m, p3a),
        ftm:     safe(stats.ftm),
        fta:     safe(fta),
        ft_pct:  pct(stats.ftm, fta),
        ts_pct:  tsD > 0 ? pts / tsD : null,
        efg_pct: fga > 0 ? (stats.fgm + 0.5 * stats.p3m) / fga : null,
        tov_pct: (fga + 0.44 * fta + tov) > 0 ? tov / (fga + 0.44 * fta + tov) : null,
        fg3a_rate: fga > 0 ? p3a / fga : null,
        fta_rate:  fga > 0 ? fta / fga : null,
        usg_pct, ast_pct, orb_pct, drb_pct, trb_pct, stl_pct, blk_pct,
        cont_pg: g > 0 ? (stats.contestedAttempted ?? 0) / g : null,
        dfg_pct: (stats.contestedAttempted ?? 0) > 0 ? (stats.contestedMade ?? 0) / (stats.contestedAttempted ?? 0) : null,
        playoff,
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

const getAttrBarColor = (val: number) => {
    if (val >= 90) return 'bg-fuchsia-400';
    if (val >= 80) return 'bg-emerald-400';
    if (val >= 70) return 'bg-amber-400';
    return 'bg-slate-500';
};

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
        case 'cont': {
            const c = st.contestedAttempted ?? 0;
            val = c > 0 ? (c / gp).toFixed(1) : '0';
            break;
        }
        case 'dfg%': {
            const a = st.contestedAttempted ?? 0;
            val = a > 0 ? ((st.contestedMade ?? 0) / a * 100).toFixed(1) + '%' : '-';
            break;
        }
        case 'dfgRim%': {
            const a = st.defRimAttempted ?? 0;
            val = a > 0 ? ((st.defRimMade ?? 0) / a * 100).toFixed(1) + '%' : '-';
            break;
        }
        case 'dfgMid%': {
            const a = st.defMidAttempted ?? 0;
            val = a > 0 ? ((st.defMidMade ?? 0) / a * 100).toFixed(1) + '%' : '-';
            break;
        }
        case 'dfg3%': {
            const a = st.defThreeAttempted ?? 0;
            val = a > 0 ? ((st.defThreeMade ?? 0) / a * 100).toFixed(1) + '%' : '-';
            break;
        }
        case 'dfgRA%': {
            const a = st.defRAAttempted ?? 0;
            val = a > 0 ? ((st.defRAMade ?? 0) / a * 100).toFixed(1) + '%' : '-';
            break;
        }
        case 'dfgITP%': {
            const a = st.defITPAttempted ?? 0;
            val = a > 0 ? ((st.defITPMade ?? 0) / a * 100).toFixed(1) + '%' : '-';
            break;
        }
        case 'dfgMID%': {
            const a = st.defMIDAttempted ?? 0;
            val = a > 0 ? ((st.defMIDMade ?? 0) / a * 100).toFixed(1) + '%' : '-';
            break;
        }
        case 'dfgCNR%': {
            const a = st.defCNRAttempted ?? 0;
            val = a > 0 ? ((st.defCNRMade ?? 0) / a * 100).toFixed(1) + '%' : '-';
            break;
        }
        case 'dfgWING%': {
            const a = st.defWINGAttempted ?? 0;
            val = a > 0 ? ((st.defWINGMade ?? 0) / a * 100).toFixed(1) + '%' : '-';
            break;
        }
        case 'dfgATB%': {
            const a = st.defATBAttempted ?? 0;
            val = a > 0 ? ((st.defATBMade ?? 0) / a * 100).toFixed(1) + '%' : '-';
            break;
        }
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

const ROW_HEIGHT = 36; // text-sm(20px 라인하이트) + py-2(16px) — text-xs(32px)에서 상향
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
                className="absolute inset-0 overflow-hidden"
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
                        <table className="w-full text-left border-separate border-spacing-0 text-sm">
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
                                                <span className={`font-medium ${cell.color || 'text-white'}`}>
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

export const PlayerDetailView: React.FC<PlayerDetailViewProps> = ({ player: playerProp, teamName: teamNameProp, teamId: teamIdProp, allTeams, schedule, tendencySeed, seasonShort = '2025-26', myTeamId, onBack, onNegotiate, onExtension, onRelease, onSelectPlayer, hideSections, externalGameLog, externalGameLogLoading, externalShotEvents }) => {
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

    const currentTeam = useMemo(() => allTeams?.find(t => t.id === teamId), [allTeams, teamId]);

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

    // 헤더 어워드 배지 + 중간열 "수상 내역" 위젯이 함께 쓰는 전체 수상 목록
    // (실제 NBA 커리어 BRef 이력 + 시뮬 어워드 병합, season+type 중복 제거는 각 소비처에서 처리).
    const allAwards = useMemo(() => {
        const historicalAwards = (player.career_history?.filter(s => !s.playoff) ?? []).flatMap(s =>
            (s.awards ?? []).map((a: any) => normalizeBrefAward(a, s.season)).filter(Boolean) as any[]
        );
        // player.awards(현재 멀티 시즌 실시간 스탬프)는 room.season 원본 포맷("2025-2026")을
        // 그대로 갖고 있어 career_history(이미 "2024-25" 축약형)와 섞이면 표기가 어긋난다 — 표시 전 통일.
        const liveAwards = (player.awards ?? []).map(a => ({ ...a, season: shortenSeasonLabel(a.season) }));
        return [...historicalAwards, ...liveAwards].filter(Boolean);
    }, [player.career_history, player.awards]);

    // 헤더 트로피 배지 — 챔피언(플레이오프 한정, REG_SEASON_CHAMPION 제외)/MVP/DPOY/올-오펜시브
    // (ALL_NBA_1~3 통합)/올-디펜시브(ALL_DEF_1~2 통합) 5종만, 카테고리당 1개 배지 + count.
    // 올스타는 아직 어워드 시스템 자체에 없어(runAwardVoting 미구현) 이번엔 제외.
    const headerAwardBadges = useMemo(() => {
        // MVP/DPOY는 수상자만(rank 1 또는 rank 없음) — 후보(2위 이하)는 헤더에 안 보여줌.
        const winnersOnly = allAwards.filter((a: any) => {
            if (a.type === 'MVP' || a.type === 'DPOY') return a.rank === 1 || a.rank == null;
            return true;
        });
        const bySeasons: Record<string, string[]> = { CHAMPION: [], MVP: [], DPOY: [], ALL_LEAGUE: [], ALL_DEF: [] };
        const seen = new Set<string>();
        for (const a of winnersOnly) {
            const dedupeKey = `${a.type}__${a.season}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);
            if (a.type === 'CHAMPION') bySeasons.CHAMPION.push(a.season);
            else if (a.type === 'MVP') bySeasons.MVP.push(a.season);
            else if (a.type === 'DPOY') bySeasons.DPOY.push(a.season);
            else if (a.type === 'ALL_NBA_1' || a.type === 'ALL_NBA_2' || a.type === 'ALL_NBA_3') bySeasons.ALL_LEAGUE.push(a.season);
            else if (a.type === 'ALL_DEF_1' || a.type === 'ALL_DEF_2') bySeasons.ALL_DEF.push(a.season);
        }
        const CATEGORY_META: { key: string; label: string; color: string; bg: string }[] = [
            { key: 'CHAMPION',   label: '챔피언',      color: 'text-amber-400',   bg: 'bg-amber-400/15' },
            { key: 'MVP',        label: 'MVP',         color: 'text-yellow-400',  bg: 'bg-yellow-400/15' },
            { key: 'DPOY',       label: 'DPOY',        color: 'text-blue-400',    bg: 'bg-blue-400/15' },
            { key: 'ALL_LEAGUE', label: '올-오펜시브', color: 'text-indigo-400',  bg: 'bg-indigo-400/15' },
            { key: 'ALL_DEF',    label: '올-디펜시브', color: 'text-emerald-400', bg: 'bg-emerald-400/15' },
        ];
        return CATEGORY_META
            .map(c => ({ ...c, count: bySeasons[c.key].length, seasons: [...bySeasons[c.key]].sort((a, b) => b.localeCompare(a)) }))
            .filter(c => c.count > 0);
    }, [allAwards]);

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

    const { data: internalGameLog, isLoading: internalGameLogLoading } = usePlayerGameLog(player.id, teamId);
    const gameLog        = externalGameLog         !== undefined ? externalGameLog         : internalGameLog;
    const gameLogLoading = externalGameLogLoading  !== undefined ? externalGameLogLoading  : internalGameLogLoading;

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

    // "샷 차트" 탭 최하단 hexbin 밀도 차트용 — 개별 슛 좌표(courtCoordinates.ts 기준
    // 풀코트 x:0~94ft/y:0~50ft, 홈/원정 섞여 있어 x>47이면 94-x로 하프코트 정규화)를
    // courtZones.ts의 435×403 캔버스 좌표로 변환(PAINT 사각형에서 역산한 스케일 재사용)한
    // 뒤 d3-hexbin으로 육각형 비닝, 빈도를 viridis(보라→노랑) 컬러스케일에 매핑.
    const shotHexbins = useMemo(() => {
        if (!externalShotEvents || externalShotEvents.length === 0) return null;
        const SCALE_X = 8.525;  // px per ft, 좌우(원본=y)
        const SCALE_Y = 8.616;  // px per ft, 깊이(원본=x, 베이스라인부터)
        const HOOP_CENTER_X = 217.3;
        const BASELINE_Y = 401.6;
        const points: [number, number][] = (externalShotEvents as any[]).map(ev => {
            const halfX = ev.x > 47 ? 94 - ev.x : ev.x;
            return [
                HOOP_CENTER_X + (ev.y - 25) * SCALE_X,
                BASELINE_Y - halfX * SCALE_Y,
            ];
        });
        const hexbinGen = d3Hexbin<[number, number]>()
            .x(d => d[0])
            .y(d => d[1])
            .radius(9)
            .extent([[0, 0], [435, 403]]);
        const bins = hexbinGen(points);
        const maxCount = Math.max(1, ...bins.map(b => b.length));
        return {
            hexagonPath: hexbinGen.hexagon(),
            bins,
            colorScale: scaleSequential(interpolateViridis).domain([0, maxCount]),
        };
    }, [externalShotEvents]);

    const [careerTab, setCareerTab] = useState<'trad' | 'adv'>('trad');
    const [careerMode, setCareerMode] = useState<'regular' | 'playoff'>('regular');
    const [activeTab, setActiveTab] = useState<'profile' | 'ratings' | 'records' | 'shotchart'>('profile');

    // 현재 시뮬 시즌 팀 약어 (teamId uppercase, 없으면 '—')
    const simTeamAbbr = (teamId ?? '').toUpperCase() || '—';

    // schedule에서 팀 컨텍스트 계산 (advanced rate stats용)
    const teamAdvCtx = useMemo((): TeamAdvCtx | undefined => {
        if (!allTeams || !teamId || !schedule) return undefined;
        const myTeam = allTeams.find(t => t.id === teamId);
        if (!myTeam) return undefined;

        const rs = (p: Player) => p.stats;
        const tmFga  = myTeam.roster.reduce((s, p) => s + (rs(p).fga    || 0), 0);
        const tmFta  = myTeam.roster.reduce((s, p) => s + (rs(p).fta    || 0), 0);
        const tmTov  = myTeam.roster.reduce((s, p) => s + (rs(p).tov    || 0), 0);
        const tmFgm  = myTeam.roster.reduce((s, p) => s + (rs(p).fgm    || 0), 0);
        const tmMp   = myTeam.roster.reduce((s, p) => s + (rs(p).mp     || 0), 0);
        const tmOreb = myTeam.roster.reduce((s, p) => s + (rs(p).offReb || 0), 0);
        const tmDreb = myTeam.roster.reduce((s, p) => s + (rs(p).defReb || 0), 0);
        const tmReb  = myTeam.roster.reduce((s, p) => s + (rs(p).reb    || 0), 0);

        const tmGames = schedule.filter(g => !g.isPlayoff && g.played &&
            (g.homeTeamId === teamId || g.awayTeamId === teamId));

        let oppOreb = 0, oppDreb = 0, oppReb = 0;
        let oppFga = 0, oppFta = 0, oppTov = 0, oppP3a = 0;
        const oppFallback = new Map<string, number>();

        tmGames.forEach(g => {
            const isHome = g.homeTeamId === teamId;
            const oppId  = isHome ? g.awayTeamId : g.homeTeamId;
            const oppBox = isHome ? (g as any).awayStats : (g as any).homeStats;
            if (oppBox) {
                oppOreb += oppBox.offReb || 0;
                oppDreb += oppBox.defReb || 0;
                oppReb  += oppBox.reb    || 0;
                oppFga  += oppBox.fga    || 0;
                oppFta  += oppBox.fta    || 0;
                oppTov  += oppBox.tov    || 0;
                oppP3a  += oppBox.p3a    || 0;
            } else {
                oppFallback.set(oppId, (oppFallback.get(oppId) || 0) + 1);
            }
        });

        // 게임 레벨 데이터 없는 경기 → 상대팀 시즌 평균으로 보정
        oppFallback.forEach((count, oppId) => {
            const oTeam = allTeams.find(t => t.id === oppId);
            if (!oTeam) return;
            const oG = Math.max(oTeam.roster.reduce((mx, p) => Math.max(mx, p.stats.g || 0), 0), 1);
            const sc = count / oG;
            oppOreb += oTeam.roster.reduce((s, p) => s + (p.stats.offReb || 0), 0) * sc;
            oppDreb += oTeam.roster.reduce((s, p) => s + (p.stats.defReb || 0), 0) * sc;
            oppReb  += oTeam.roster.reduce((s, p) => s + (p.stats.reb    || 0), 0) * sc;
            oppFga  += oTeam.roster.reduce((s, p) => s + (p.stats.fga    || 0), 0) * sc;
            oppFta  += oTeam.roster.reduce((s, p) => s + (p.stats.fta    || 0), 0) * sc;
            oppTov  += oTeam.roster.reduce((s, p) => s + (p.stats.tov    || 0), 0) * sc;
            oppP3a  += oTeam.roster.reduce((s, p) => s + (p.stats.p3a    || 0), 0) * sc;
        });

        return {
            tmFga, tmFta, tmTov, tmFgm, tmMp,
            tmOreb, tmDreb, tmReb,
            oppOreb, oppDreb, oppReb,
            oppPoss: oppFga + 0.44 * oppFta + oppTov - oppOreb,
            opp2pa:  oppFga - oppP3a,
        };
    }, [allTeams, teamId, schedule]);

    // 시뮬 정규시즌 행: player.stats.g > 0 일 때만 생성
    const simRegularRow = useMemo(() => {
        if (!player.stats || (player.stats.g ?? 0) === 0) return null;
        return statsToCareerRow(player.stats, seasonShort, simTeamAbbr, player.age, false, teamAdvCtx);
    }, [player.stats, player.age, seasonShort, simTeamAbbr, teamAdvCtx]);

    // 시뮬 플레이오프 행: player.playoffStats?.g > 0 일 때만 생성
    const simPlayoffRow = useMemo(() => {
        if (!player.playoffStats || (player.playoffStats.g ?? 0) === 0) return null;
        return statsToCareerRow(player.playoffStats, seasonShort, simTeamAbbr, player.age, true, teamAdvCtx);
    }, [player.playoffStats, player.age, seasonShort, simTeamAbbr, teamAdvCtx]);

    // career_history에서 현재 시즌과 동일한 행이 있으면 제거 후 앞에 시뮬 행 삽입
    const careerRegular = useMemo(() => {
        const historical = (player.career_history ?? []).filter(r => !r.playoff && r.season !== seasonShort);
        return simRegularRow ? [simRegularRow, ...historical] : historical;
    }, [player.career_history, simRegularRow, seasonShort]);

    // 헤더 "커리어" 스탯 라인 — career_history가 없는 선수(멀티플레이어)는 careerRegular에
    // 이번 시즌 한 행만 있어 "시즌" 줄과 값이 같아짐(멀티는 다중 시즌 이력이 없어 자연스러운 폴백).
    const headerCareerAvg = useMemo(() => {
        const avg = computeCareerAvg(careerRegular, '커리어');
        return avg.gp ? avg : null;
    }, [careerRegular]);

    const careerPlayoff = useMemo(() => {
        const historical = (player.career_history ?? []).filter(r => r.playoff && r.season !== seasonShort);
        return simPlayoffRow ? [simPlayoffRow, ...historical] : historical;
    }, [player.career_history, simPlayoffRow, seasonShort]);

    const hasCareerPlayoff = careerPlayoff.length > 0;

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
            <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-800 bg-slate-950 shrink-0">
                {/* 뒤로 버튼 */}
                <button
                    onClick={onBack}
                    className="flex items-center justify-center w-7 h-7 rounded-md bg-black/30 hover:bg-black/50 text-slate-200 transition-colors shrink-0"
                >
                    <ArrowLeft size={14} />
                </button>

                <span className="text-white/30 text-sm mx-1">/</span>

                {/* 팀 드롭다운 */}
                <div ref={teamDropRef} className="relative">
                    <button
                        onClick={() => { setTeamDropOpen(o => !o); setPlayerDropOpen(false); }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-black/20 hover:bg-black/40 text-white transition-colors"
                    >
                        {teamId && (
                            <TeamBadge
                                teamId={teamId}
                                abbr={currentTeam?.abbr}
                                colorPrimary={currentTeam?.colorPrimary}
                                colorSecondary={currentTeam?.colorSecondary}
                                size="xs"
                            />
                        )}
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
                                        if (roster.length > 0) {
                                            if (onSelectPlayer) onSelectPlayer(roster[0].id);
                                            else { setPlayer(roster[0]); setTeamId(t.id); }
                                        }
                                        setTeamDropOpen(false);
                                    }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-800 transition-colors ${t.id === teamId ? 'text-white font-bold' : 'text-slate-300'}`}
                                >
                                    <TeamBadge
                                        teamId={t.id}
                                        abbr={t.abbr}
                                        colorPrimary={t.colorPrimary}
                                        colorSecondary={t.colorSecondary}
                                        size="xs"
                                    />
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
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-black/20 hover:bg-black/40 text-white transition-colors max-w-[180px]"
                    >
                        <span className="text-xs font-bold truncate">{player.name}</span>
                        {currentTeamRoster.length > 1 && <ChevronDown size={11} className="opacity-60 shrink-0" />}
                    </button>
                    {playerDropOpen && currentTeamRoster.length > 1 && (
                        <div className="absolute top-full left-0 mt-1 z-50 w-56 max-h-72 overflow-y-auto custom-scrollbar rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
                            {currentTeamRoster.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => {
                                        if (onSelectPlayer) onSelectPlayer(p.id);
                                        else setPlayer(p);
                                        setPlayerDropOpen(false);
                                    }}
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

                {/* 액션 버튼 그룹 — 브레드크럼 우측 끝 */}
                {((!teamId && onNegotiate) || (myTeamId && teamId === myTeamId && (onExtension || onRelease))) && (
                    <div className="ml-auto flex items-center gap-2 pl-2 shrink-0">
                        {!teamId && onNegotiate && (
                            <button
                                onClick={onNegotiate}
                                className="px-3 py-1 rounded text-xs font-bold active:scale-95 transition-all whitespace-nowrap"
                                style={{ backgroundColor: theme.text, color: theme.bg }}
                            >
                                계약 협상
                            </button>
                        )}
                        {myTeamId && teamId === myTeamId && (
                            <>
                                {onExtension && (
                                    <button
                                        onClick={onExtension}
                                        className="px-3 py-1 rounded text-xs font-bold active:scale-95 transition-all whitespace-nowrap"
                                        style={{ backgroundColor: theme.text, color: theme.bg }}
                                    >
                                        계약 연장
                                    </button>
                                )}
                                {onRelease && (
                                    <button
                                        onClick={onRelease}
                                        className="px-3 py-1 rounded text-xs font-bold active:scale-95 transition-all whitespace-nowrap"
                                        style={{ backgroundColor: theme.text, color: theme.bg }}
                                    >
                                        방출
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* ═══ 프로필 헤더 — 이름/포지션/소속팀/키/체중/샐러리/등번호 요약 ═══ */}
            <div className="flex items-center gap-4 px-4 py-5 bg-slate-900 border-b border-slate-800 shrink-0">
                {teamId && (
                    <TeamBadge
                        teamId={teamId}
                        abbr={currentTeam?.abbr}
                        colorPrimary={currentTeam?.colorPrimary}
                        colorSecondary={currentTeam?.colorSecondary}
                        size="lg"
                        className="self-stretch !h-auto !w-24 !text-2xl"
                    />
                )}
                <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <OvrBadge value={calculatedOvr} size="lg" className="shrink-0 !w-10 !h-10 !text-2xl" />
                        <h1 className="text-3xl font-black text-white truncate">{player.name}</h1>
                        {player.jerseyNumber != null && (
                            <span className="text-3xl font-bold text-slate-500 shrink-0">#{player.jerseyNumber}</span>
                        )}
                        {headerAwardBadges.length > 0 && (
                            <div className="flex items-center gap-1.5 shrink-0">
                                {headerAwardBadges.map(b => (
                                    <span
                                        key={b.key}
                                        className={`relative group flex items-center gap-1 px-1.5 py-0.5 rounded text-sm font-bold cursor-default ${b.bg}`}
                                    >
                                        <span className={b.color}>{b.label}</span>
                                        {b.count > 1 && <span className={b.color}>×{b.count}</span>}
                                        {/* 네이티브 title 툴팁(호버 ~1초 지연) 대신 group-hover로 즉시 노출 */}
                                        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-xs font-normal text-slate-200 whitespace-nowrap shadow-xl z-50">
                                            {b.seasons.join(', ')}
                                        </span>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2 text-base text-slate-300 whitespace-nowrap">
                        <span>{teamName ?? 'FA'}</span>
                        <span className="text-slate-600">|</span>
                        <span>{player.position}</span>
                        <span className="text-slate-600">|</span>
                        <span>{player.age}세</span>
                        <span className="text-slate-600">|</span>
                        <span>{player.height ? `${player.height}cm` : '-'}</span>
                        <span className="text-slate-600">|</span>
                        <span>{player.weight ? `${player.weight}kg` : '-'}</span>
                        <span className="text-slate-600">|</span>
                        <span>{player.contract ? formatMoneyFull(player.salary) : '-'}</span>
                    </div>
                </div>

                {/* 시즌/커리어 G·MP·PTS·REB·AST·STL·BLK·FG%·3P%·FT%·TS% 테이블 —
                    border-collapse 사용: border-separate+spacing이었을 땐 셀마다 구분선이
                    독립적으로 그려져 칸 사이 여백만큼 선이 뚝뚝 끊겨 보였다. collapse로
                    바꾸면 인접 셀이 하나의 선을 공유해 이어진 실선이 된다 — 대신 예전
                    border-spacing이 주던 칸 간격은 각 셀의 padding(px-3/py-1)으로 대체. */}
                <table className="text-sm ml-auto shrink-0 whitespace-nowrap border-collapse">
                    <thead>
                        <tr>
                            <th className="border-r border-slate-700 pr-3 pb-1" />
                            {HEADER_STAT_KEYS.map(sk => (
                                <th key={sk.key} className="text-right font-normal text-slate-500 px-3 pb-1">{sk.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {([
                            { label: `${shortenSeasonLabel(seasonShort)} 시즌`, row: simRegularRow },
                            { label: '커리어', row: headerCareerAvg },
                        ] as { label: string; row: Record<string, any> | null }[]).map(({ label, row }) => (
                            <tr key={label}>
                                <td className="text-left text-slate-500 border-r border-slate-700 pr-3 py-1">{label}</td>
                                {HEADER_STAT_KEYS.map(sk => (
                                    <td key={sk.key} className="text-right text-white px-3 py-1">{formatHeaderStat(sk.key, row)}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ═══ 탭 바 ═══ */}
            <TabBar
                tabs={[
                    { id: 'profile', label: '프로필' },
                    { id: 'ratings', label: '레이팅' },
                    { id: 'records', label: '기록' },
                    { id: 'shotchart', label: '샷 차트' },
                ]}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                theme={theme}
            />

            {/* ═══ 단일 스크롤 영역 ═══ */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-none custom-scrollbar bg-slate-950">
                {activeTab === 'profile' && (
                <div className="grid min-h-full border border-slate-800" style={{ gridTemplateColumns: '2fr 2fr 6fr' }}>

                    {/* ══════════════ 좌열 (3fr) — 리더보드/순위표처럼 카드 여백 없이 다닥다닥 붙인 그리드 ══════════════ */}
                    <div className="flex flex-col bg-slate-900 border-r border-slate-800">

                        {/* ── 위젯 1: 선수 정보 통합 카드 ── */}
                        {(() => {
                            return (
                            <div>

                                {/* ─ 기본 정보 ─ */}
                                <div className="px-4 pt-3 pb-3 space-y-1">
                                    <div className="text-sm font-bold text-white mb-1.5">선수 정보</div>
                                    {[
                                        { label: '팀', value: teamId ? <span className="flex items-center gap-1"><TeamBadge teamId={teamId} abbr={currentTeam?.abbr} colorPrimary={currentTeam?.colorPrimary} colorSecondary={currentTeam?.colorSecondary} size="xs" />{teamName || 'FA'}</span> : 'FA' },
                                        { label: '포지션', value: player.position },
                                        { label: '나이', value: `${player.age}세` },
                                        { label: '신장', value: `${player.height}cm` },
                                        { label: '체중', value: `${player.weight}kg` },
                                        { label: '연봉', value: player.salary > 0 ? formatMoneyFull(player.salary) : '-' },
                                        { label: '계약', value: player.contractYears > 0 ? `${player.contractYears}년` : '-' },
                                        { label: '리그 레벨', value: <StarRating ovr={calculatedOvr} size="md" /> },
                                        { label: '포지션 평점', value: positionStars !== null ? <StarRating stars={positionStars} size="md" /> : '-' },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="flex justify-between items-center text-sm">
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
                                                    <span className="text-sm text-slate-500 shrink-0">{label}</span>
                                                    <span className="text-sm font-semibold text-white text-right">{value}</span>
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
                                            <span className="text-sm text-slate-500">아키타입</span>
                                            <span className="text-sm font-semibold text-white">{getArchetypeDisplayInfo(playerArchetypeState.primary).label}</span>
                                        </div>
                                        {playerArchetypeState.secondary && (
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-slate-500">보조 유형</span>
                                                <span className="text-sm font-semibold text-slate-300">{getArchetypeDisplayInfo(playerArchetypeState.secondary).label}</span>
                                            </div>
                                        )}
                                        {playerArchetypeState.tags.slice(0, 4).map((tag, i) => (
                                            <div key={tag} className="flex justify-between items-center">
                                                <span className="text-sm text-slate-500">{i === 0 ? '특성' : ''}</span>
                                                <span className="text-sm text-slate-300">{getTraitTagDisplayInfo(tag).label}</span>
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
                                            <span className="text-sm text-slate-500">{label}</span>
                                            <span className="text-sm text-white font-semibold">{value}</span>
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
                                                    <span className="text-sm text-slate-500">{label}</span>
                                                    <span className={`text-sm font-semibold ${color}`}>{text}</span>
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                )}

                                {/* ─ 스카우팅 리포트 — 장점/단점/특징 구간 라벨 없이, 문장별 +/-/무기호로 표기.
                                    긍정 → 부정 → 중립 순으로 정렬(같은 감정 안에서는 생성 순서 유지, stable sort) ─ */}
                                {scoutReport.length > 0 && (
                                    <div className="px-4 py-3 border-t border-slate-800 space-y-1">
                                        <div className="text-sm font-bold text-white mb-1">스카우팅 리포트</div>
                                        {[...scoutReport].sort((a, b) => {
                                            const order = { positive: 0, negative: 1, neutral: 2 } as const;
                                            return order[a.sentiment] - order[b.sentiment];
                                        }).map((s, i) => (
                                            <div
                                                key={i}
                                                className={`text-sm ${
                                                    s.sentiment === 'positive' ? 'text-emerald-400'
                                                        : s.sentiment === 'negative' ? 'text-rose-400'
                                                        : 'text-white'
                                                }`}
                                            >
                                                {s.sentiment === 'positive' ? '+ ' : s.sentiment === 'negative' ? '- ' : ''}{s.text}
                                            </div>
                                        ))}
                                    </div>
                                )}

                            </div>
                            );
                        })()}

                    </div>{/* end 좌열 */}

                    {/* ══════════════ 중간열 — 계약/수상/부상 등 부가 정보 ══════════════ */}
                    <div className="flex flex-col bg-slate-900 border-r border-slate-800">

                        {/* ── 위젯 6: 계약 정보 ── */}
                        {!hideSections?.includes('contract') && (
                        <div className="px-4 py-3 space-y-1">
                            {player.prevSalary != null ? (
                                // 생성 FA 선수: 직전 계약 전체 연도 표시
                                <>
                                    <div className="text-sm font-bold text-white mb-1.5">직전 계약</div>
                                    {player.prevContract && player.prevContract.years.length > 0 ? (
                                        <>
                                            {player.prevContract.years.map((sal, i) => {
                                                const n = player.prevContract!.years.length;
                                                // career_history는 최신순(index 0 = 가장 최근) → 계약 첫 해 = history[n-1]
                                                const seasonLabel = player.career_history?.[n - 1 - i]?.season;
                                                return (
                                                    <div key={i} className="flex justify-between items-center text-sm">
                                                        <span className="text-slate-500">{seasonLabel ?? `Year ${i + 1}`}</span>
                                                        <span className="text-slate-400">{formatMoneyFull(sal)}</span>
                                                    </div>
                                                );
                                            })}
                                            <div className="flex justify-between items-center text-sm pt-1 border-t border-slate-800">
                                                <span className="text-slate-500">AAV</span>
                                                <span className="text-slate-400">
                                                    {formatMoneyFull(player.prevContract.years.reduce((a, b) => a + b, 0) / player.prevContract.years.length)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-500">유형</span>
                                                <span className="text-slate-400">
                                                    {{ rookie: '루키', veteran: '베테랑', max: '맥스', min: '미니멈', extension: '연장' }[player.prevContract.type] ?? player.prevContract.type}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-500">드래프트</span>
                                                <span className="text-slate-400">
                                                    {player.draftRound === 1
                                                        ? `1라운드 ${player.draftPick}픽`
                                                        : player.draftRound === 2
                                                        ? `2라운드 ${(player.draftPick ?? 0) - 30}픽`
                                                        : player.draftRound === null
                                                        ? '언드래프트'
                                                        : '-'}
                                                </span>
                                            </div>
                                        </>
                                    ) : (
                                        // 폴백: 기존 DB 선수 (prev_contract 없음)
                                        <>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-500">연평균 연봉</span>
                                                <span className="text-slate-400">{formatMoneyFull(player.prevSalary)}</span>
                                            </div>
                                            {player.prevTeamTenure != null && (
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-slate-500">재직 기간</span>
                                                    <span className="text-slate-400">{player.prevTeamTenure}년</span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </>
                            ) : (
                                // 일반 선수: 현재 계약 표시
                                <>
                                    <div className="text-sm font-bold text-white mb-1.5">계약 정보</div>
                                    {!player.contract || player.contract.years.length === 0 ? (
                                        <div className="text-sm text-slate-500">계약 정보가 없습니다</div>
                                    ) : (
                                        <>
                                            {player.contract.years.map((sal, i) => {
                                                const baseYear    = parseInt(seasonShort.split('-')[0]);
                                                const yearStart   = baseYear - player.contract!.currentYear + i;
                                                const seasonLabel = `${yearStart}-${String(yearStart + 1).slice(-2)}`;
                                                const isCurrent   = i === player.contract!.currentYear;
                                                return (
                                                    <div
                                                        key={i}
                                                        className="flex justify-between items-center text-sm -mx-4 px-4 rounded"
                                                    >
                                                        <span className={isCurrent ? 'text-emerald-400' : 'text-slate-500'}>{seasonLabel}</span>
                                                        <span className={isCurrent ? 'text-emerald-400' : 'text-slate-200'}>
                                                            {formatMoneyFull(sal)}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                            <div className="flex justify-between items-center text-sm pt-1 border-t border-slate-800">
                                                <span className="text-slate-500">AAV</span>
                                                <span className="text-slate-300">
                                                    {formatMoneyFull(player.contract.years.slice(player.contract.currentYear).reduce((a, b) => a + b, 0) / (player.contract.years.length - player.contract.currentYear))}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-500">유형</span>
                                                <span className="text-slate-400 flex items-center gap-1">
                                                    {{ rookie: '루키', veteran: '베테랑', max: '맥스', min: '미니멈', extension: '연장' }[player.contract.type] ?? player.contract.type}
                                                    {player.contract.noTrade && <span className="text-amber-400 font-black ml-1">NTC</span>}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                        )}

                        {/* ── 위젯 7: 수상 내역 (allAwards는 헤더 트로피 배지와 공유하는 useMemo) ── */}
                        {!hideSections?.includes('awards') && (() => {
                            return (
                        <div className="px-4 py-3 border-t border-slate-800 space-y-1">
                            <div className="text-sm font-bold text-white mb-1.5">수상 내역</div>
                            {allAwards.length === 0 ? (
                                <div className="text-sm text-slate-500">수상 내역이 없습니다</div>
                            ) : (() => {
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
                                const sortedAwards = [...allAwards].sort((a, b) => {
                                    const sc = (b.season ?? '').localeCompare(a.season ?? '');
                                    if (sc !== 0) return sc;
                                    const orderMap: Record<string, number> = {
                                        CHAMPION: 0, REG_SEASON_CHAMPION: 1, MVP: 2, FINALS_MVP: 3, DPOY: 4,
                                        ALL_NBA_1: 5, ALL_NBA_2: 6, ALL_NBA_3: 7, ALL_DEF_1: 8, ALL_DEF_2: 9,
                                    };
                                    return (orderMap[a.type] ?? 99) - (orderMap[b.type] ?? 99);
                                });
                                return (
                                    <>
                                        {sortedAwards
                                            .map((entry, idx) => {
                                                const ranked = entry.type?.match(/^(.+)-(\d+)$/);
                                                const baseCode = ranked ? ranked[1] : entry.type;
                                                const rankNum  = ranked ? parseInt(ranked[2]) : null;
                                                const displayName = BASE_NAME[baseCode] ?? baseCode;
                                                let detail: string;
                                                if (rankNum !== null) {
                                                    detail = toOrdinal(rankNum);
                                                } else if ((entry.type === 'MVP' || entry.type === 'DPOY') && (entry as any).rank != null) {
                                                    detail = toOrdinal((entry as any).rank);
                                                } else {
                                                    detail = BASE_DETAIL[entry.type] ?? '-';
                                                }
                                                // 정렬이 이미 시즌 내림차순이라 같은 시즌 항목은 항상 연달아 나온다 —
                                                // 바로 앞 항목과 시즌이 같으면 연도를 비워 하나로 묶인 것처럼 보이게 함.
                                                const sameSeasonAsPrev = idx > 0 && sortedAwards[idx - 1].season === entry.season;
                                                return (
                                                    <div key={idx} className={`flex items-center text-sm gap-2 ${!sameSeasonAsPrev && idx > 0 ? 'pt-2' : ''}`}>
                                                        <span className="text-slate-500 w-14 shrink-0">{sameSeasonAsPrev ? '' : entry.season}</span>
                                                        <span className="text-slate-200 flex-1 text-right">{displayName}</span>
                                                        <span className="text-slate-200 text-right shrink-0" style={{ width: 30 }}>{detail}</span>
                                                    </div>
                                                );
                                            })}
                                    </>
                                );
                            })()}
                        </div>
                            );
                        })()}

                        {/* ── 위젯 8: 부상 이력 ── */}
                        {!hideSections?.includes('injuryHistory') && (
                        <div className="px-4 py-3 border-t border-slate-800 space-y-1">
                            <div className="text-sm font-bold text-white mb-1.5">부상 이력</div>
                            {!player.injuryHistory || player.injuryHistory.length === 0 ? (
                                <div className="text-sm text-slate-500">부상 이력이 없습니다</div>
                            ) : (
                                <>
                                    {[...player.injuryHistory]
                                        .sort((a, b) => b.date.localeCompare(a.date))
                                        .map((entry, idx) => {
                                            const dateStr = entry.date.slice(5).replace('-', '/');
                                            const severityColor =
                                                entry.severity === 'Season-Ending' ? 'text-red-400' :
                                                entry.severity === 'Major' ? 'text-amber-400' :
                                                'text-slate-200';
                                            return (
                                                <div key={idx} className="flex justify-between items-center text-sm">
                                                    <span className="text-slate-500">{dateStr} <span className={`${entry.isTraining ? 'text-amber-400' : 'text-sky-400'}`}>{entry.isTraining ? '훈련' : '경기'}</span></span>
                                                    <span className={`font-semibold ${severityColor}`}>{entry.injuryType} <span className="text-slate-500 font-normal">{entry.duration}</span></span>
                                                </div>
                                            );
                                        })}
                                </>
                            )}
                        </div>
                        )}

                    </div>{/* end 중간열 */}

                    {/* ══════════════ 우열 — 능력치 ══════════════ */}
                    <div className="flex flex-col bg-slate-900">

                        {/* ── 위젯 A: 능력치 ── */}
                        <div>
                            <div className="px-4 py-3 text-sm font-bold text-white">능력치</div>
                            {(() => {
                                // 콤보 항목(sourceKeys 2개 이상)의 시즌 증감(▲/▼)은 각 원본 능력치 증감의
                                // 평균, 이벤트 툴팁은 원본 능력치들의 changeLog를 합쳐서 보여준다.
                                const compactLabel = (item: CompactAttrItem) => {
                                    if (item.krLabel) return item.krLabel;
                                    if (item.sourceKeys.length === 1) return ATTR_KR_LABEL[item.sourceKeys[0]] || item.label;
                                    return item.sourceKeys.map(k => ATTR_KR_LABEL[k] || k).join(' / ');
                                };
                                // 이 위젯 전용 3열 배치 — 6개 카테고리(3/4/3/5/2/4개)를 7개씩 균등한
                                // 3묶음(인사이드+아웃사이드, 수비+리바운드, 패스+운동능력)으로 합쳐서 표시.
                                // RosterGrid/리더보드는 여전히 원래 6개 카테고리 구조(COMPACT_ATTR_GROUPS)를 그대로 씀.
                                const byId = (id: string) => COMPACT_ATTR_GROUPS.find(g => g.id === id)!;
                                const MERGED_GROUPS = [
                                    { id: 'INS_OUT', label: '인사이드+아웃사이드', items: [...byId('INS').items, ...byId('OUT').items] },
                                    { id: 'DEF_REB', label: '수비+리바운드', items: [...byId('DEF').items, ...byId('REB').items] },
                                    { id: 'PLM_ATH', label: '패스+운동능력', items: [...byId('PLM').items, ...byId('ATH').items] },
                                ];
                                const maxRows = Math.max(...MERGED_GROUPS.map(g => g.items.length));
                                return (
                                    <div className="grid grid-cols-3">
                                        {MERGED_GROUPS.map((gr) => {
                                            const emptyRows = maxRows - gr.items.length;
                                            return (
                                                <div key={gr.id} className="flex flex-col">
                                                    {gr.items.map((item) => {
                                                        const val = getCompactAttrValue(player, item);
                                                        const seasonDeltas = player.seasonStartAttributes
                                                            ? item.sourceKeys.map(k => {
                                                                const cur = (player as any)[k] || 0;
                                                                return cur - (player.seasonStartAttributes![k] ?? cur);
                                                            })
                                                            : [];
                                                        const seasonDelta = seasonDeltas.length > 0
                                                            ? Math.round(seasonDeltas.reduce((s, d) => s + d, 0) / seasonDeltas.length)
                                                            : 0;
                                                        const attrEvents = (seasonDelta !== 0 && player.changeLog)
                                                            ? player.changeLog.filter(e => item.sourceKeys.includes(e.attribute))
                                                            : [];
                                                        return (
                                                            <div key={item.key} className="flex items-center gap-4 px-4 py-4">
                                                                <div className="flex-1 min-w-0 flex flex-col justify-center gap-2.5">
                                                                    <span className="text-sm font-bold text-white truncate">{compactLabel(item)}</span>
                                                                    <div className="h-[9px] rounded-full bg-slate-800 overflow-hidden">
                                                                        <div className={`h-full rounded-full ${getAttrBarColor(val)}`} style={{ width: `${Math.min(100, Math.max(0, val))}%` }} />
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-3 shrink-0">
                                                                    {seasonDelta !== 0 && (
                                                                        <span className={`relative group font-mono font-black text-sm tabular-nums cursor-default ${seasonDelta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                            {seasonDelta > 0 ? '▲' : '▼'} {Math.abs(seasonDelta)}
                                                                            {attrEvents.length > 0 && (
                                                                                <span className="pointer-events-none absolute bottom-full right-0 mb-1.5 hidden group-hover:flex flex-col gap-0.5 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 shadow-xl z-50 whitespace-nowrap">
                                                                                    {attrEvents.map((evt, i) => (
                                                                                        <span key={i} className="flex items-center gap-2 text-sm font-normal">
                                                                                            <span className="text-slate-500 font-mono">{evt.date.slice(5)}</span>
                                                                                            <span className={evt.delta > 0 ? 'text-emerald-400' : 'text-rose-400'}>{evt.delta > 0 ? '▲' : '▼'}</span>
                                                                                            <span className="text-slate-300 font-mono">{evt.oldValue} → {evt.newValue}</span>
                                                                                        </span>
                                                                                    ))}
                                                                                </span>
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                    <span className={`font-black text-2xl tabular-nums ${getAttrColor(val)}`}>{val}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    {Array.from({ length: emptyRows }).map((_, i) => (
                                                        <div key={`empty-${i}`} className="h-[63px]" />
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>

                    </div>{/* end 우열 */}

                </div>
                )}

                {activeTab === 'ratings' && (
                    <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
                        준비 중입니다
                    </div>
                )}

                {activeTab === 'records' && (
                    <div className="flex flex-col gap-4">
                        {/* ── 커리어 기록(시즌 기록) — 프로필 탭에서 이동 ── */}
                        {(careerRegular.length > 0 || careerPlayoff.length > 0) && (
                            <div>
                                <SectionHeader title="기록" className="bg-slate-800">
                                    <select value={careerMode} onChange={e => setCareerMode(e.target.value as 'regular' | 'playoff')} className="pl-2.5 pr-7 py-1 text-sm font-bold rounded-md border-0 cursor-pointer focus:outline-none bg-black/20 hover:bg-black/40 transition-colors text-white">
                                        <option value="regular">정규시즌</option>
                                        {hasCareerPlayoff && <option value="playoff">플레이오프</option>}
                                    </select>
                                    <select value={careerTab} onChange={e => setCareerTab(e.target.value as 'trad' | 'adv')} className="pl-2.5 pr-7 py-1 text-sm font-bold rounded-md border-0 cursor-pointer focus:outline-none bg-black/20 hover:bg-black/40 transition-colors text-white">
                                        <option value="trad">기본</option>
                                        <option value="adv">어드밴스드</option>
                                    </select>
                                </SectionHeader>
                                <div className="overflow-x-auto custom-scrollbar">
                                    <table className="w-full text-left border-separate border-spacing-0 text-sm">
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
                                                                    <td key={col.key} className={`px-3 py-2 whitespace-nowrap border-b border-slate-800 ${isSticky ? `sticky left-0 z-10 font-bold ${stickyColor}` : ''} ${isSubRow ? 'opacity-60' : ''}`}
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
                                                                <td key={col.key} className={`px-3 py-1.5 whitespace-nowrap border-t ${ci === 0 ? 'sticky left-0 z-10 font-black' : isCareer ? 'font-bold text-white' : 'text-slate-300'}`}
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

                        {/* ── 최근 경기 ── */}
                        {!gameLogLoading && gameLog && gameLog.length > 0 ? <div>
                            <SectionHeader title="최근 경기" className="bg-slate-800" />
                            <div style={{ height: gameLog.length * ROW_HEIGHT + ROW_HEIGHT }} className="relative">
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
                        </div> : (
                            <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
                                최근 경기 기록이 없습니다
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'shotchart' && (
                    <div>
                        {/* ── 메인 샷 차트 — d3-hexbin 밀도 히트맵(빈도=viridis) 아래에 존별
                            성공률 배경(초록, 최대 30% 불투명도)을 깔고, 코트 라인은 완전
                            불투명으로 맨 위에 그려 항상 선명하게 보이도록 함. 예전에 있던
                            "존 10개 고정 구역 성공률 차트"(TeamZoneChartInsight)와 그 옆
                            구역별 테이블은 정보가 중복돼 제거하고 이 차트 하나로 통합함. */}
                        {shotHexbins ? (
                            <>
                                <SectionHeader title="샷 차트" className="bg-slate-800">
                                    <span className="text-xs font-normal text-slate-400">{(externalShotEvents as any[]).length}개</span>
                                </SectionHeader>
                                <div className="p-4 flex justify-center">
                                    <svg viewBox="0 0 435 403" className="w-full max-w-xl">
                                        <rect x="0" y="0" width="435" height="403" fill="#020617" />
                                        {/* 존별 성공률 배경 — getZoneStyle과 동일한 공식(FG% 비례)이지만
                                            hexbin 아래 깔리는 배경이라 상한을 0.50 → 0.30으로 낮춤. */}
                                        <g>
                                            {chartZones.map(z => {
                                                const pct = z.a > 0 ? z.m / z.a : 0;
                                                const opacity = z.a > 0 ? Math.min(0.30, pct * 0.30) : 0.02;
                                                return <path key={z.key} d={ZONE_PATHS[z.pathKey]} fill="#10b981" fillOpacity={opacity} />;
                                            })}
                                        </g>
                                        <g>
                                            {shotHexbins.bins.map((bin, i) => (
                                                <path
                                                    key={i}
                                                    d={shotHexbins.hexagonPath}
                                                    transform={`translate(${bin.x},${bin.y})`}
                                                    fill={shotHexbins.colorScale(bin.length)}
                                                />
                                            ))}
                                        </g>
                                        {/* 코트 라인은 맨 위, 완전 불투명 — 밀집 구역에서도 항상 선명하게 */}
                                        <g fill="rgba(255,255,255,1)" fillRule="evenodd" pointerEvents="none">
                                            {COURT_LINES.map((d, i) => <path key={i} d={d} />)}
                                        </g>
                                    </svg>
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
                                슛 기록이 없습니다
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
};
