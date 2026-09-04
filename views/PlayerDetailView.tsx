
import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { formatReturnDateSuffix, formatPlayerActiveInjuryLabel } from '../services/multi/activeInjuryStatus';
import { InjuryStatusBadge } from '../components/common/InjuryStatusBadge';
import {
    ZONE_AVG,
    ZONE_CONFIG as CHART_ZONES,
    ZONE_PATHS,
    COURT_LINES,
    getZoneStyle,
} from '../utils/courtZones';
import { hexbin as d3Hexbin } from 'd3-hexbin';
import { scaleSqrt } from 'd3-scale';
import { COMPACT_ATTR_GROUPS, ATTR_KR_LABEL, getCompactAttrValue, type CompactAttrItem } from '../data/attributeConfig';
import { generateScoutReport } from '../utils/scoutReport';
import { usePlayerGameLog } from '../services/queries';
import { assignArchetypes, getArchetypeDisplayInfo, getTraitTagDisplayInfo } from '../services/playerDevelopment/archetypeEvaluator';
import type { PlayerArchetypeState } from '../types/archetype';
import { generateSaveTendencies } from '../utils/hiddenTendencies';
import { getLocalPopularityLabel, getNationalPopularityLabel } from '../services/playerPopularity';
import { getMoraleLabel } from '../services/moraleService';
import { getAttrColor, getAttrBarColor } from '../utils/attrRatingColor';

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
    // "최근 경기" 테이블의 RESULT 점수 클릭 시 호출(gameLog 각 행의 gameId 전달) — 지정 시에만
    // 점수가 클릭 가능하게 표시됨. 해당 경기 박스스코어 라우트가 있는 곳(현재 멀티플레이어)에서만 사용.
    onGameClick?: (gameId: string) => void;
    // 샷 차트 탭 — 이 선수의 개별 슛 이벤트(x/y 좌표, courtCoordinates.ts 기준 풀코트
    // x:0~94ft/y:0~50ft). d3-hexbin 밀도 히트맵(메인 샷 차트)의 원본 데이터.
    externalShotEvents?: any[];
    // [2026-09-02] "수상 내역" 하단 "선수 이동 내역" 위젯 — 지정 시(현재 멀티플레이어만)에만
    // 렌더링되고, 미지정(싱글플레이어)이면 위젯 자체가 생략된다(externalGameLog와 동일한
    // "opt-in by presence" 패턴 — hideSections 방식과 달리 싱글에 아직 없는 데이터 소스라
    // 기본 숨김이 아니라 기본 미표시가 맞음). PlayerTransactionEntry: services/multi/
    // playerHistoryService.ts 참고.
    externalTransactionHistory?: { date: string | null; type: string; fromTeamAbbr: string | null; toTeamAbbr: string; draftRound?: number; draftPick?: number }[];
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


// 능력치 막대 그래프에 단색 대신 그라데이션(등급 고유색 → 살짝 밝아진 톤)을 적용 — 등급
// 구간별 색상 정체성은 시작점에 그대로 유지하면서 입체감을 준다.
const lightenHex = (hex: string, factor: number) => {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) + (255 - ((n >> 16) & 255)) * factor);
    const g = Math.round(((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * factor);
    const b = Math.round((n & 255) + (255 - (n & 255)) * factor);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

// 임의의 두 hex 색상 사이를 선형 보간 — 샷 차트 성공률 색상(fgColorScale)의 3단계
// (낮음→중간→높음) 그라데이션에 씀.
const lerpHex = (a: string, b: string, t: number) => {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * t);
    const g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t);
    const b2 = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * t);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b2).toString(16).slice(1)}`;
};

const getAttrBarGradient = (val: number) => {
    const color = getAttrBarColor(val);
    return `linear-gradient(to right, ${color}, ${lightenHex(color, 0.25)})`;
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
    ROY: 'ROY', '6MOY': 'SIXTH_MAN', SMOY: 'SIXTH_MAN',
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
        <span className="text-base font-black text-white uppercase">{title}</span>
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

// ── 샷 차트 우측 "OO별 기록" 테이블 공용 — 시간대별/슛 타입별/팀별 3곳에서 재사용.
// 구역별 테이블(리그평균/+- 열 포함)은 계산이 달라 별도로 인라인 유지.
const ShotBreakdownTable: React.FC<{ title: string; headerLabel: string; rows: { key: string; label: string; m: number; a: number; pct: number }[] }> = ({ title, headerLabel, rows }) => (
    <div>
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">{title}</div>
        <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-separate border-spacing-0 text-sm">
                <thead>
                    <tr>
                        <th className="px-3 py-2 uppercase whitespace-nowrap border-b border-slate-800 bg-slate-800 text-slate-500">{headerLabel}</th>
                        <th className="px-3 py-2 uppercase whitespace-nowrap border-b border-slate-800 bg-slate-800 text-slate-500 text-right">FGM</th>
                        <th className="px-3 py-2 uppercase whitespace-nowrap border-b border-slate-800 bg-slate-800 text-slate-500 text-right">FGA</th>
                        <th className="px-3 py-2 uppercase whitespace-nowrap border-b border-slate-800 bg-slate-800 text-slate-500 text-right">FG%</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r.key}>
                            <td className="px-3 py-1.5 whitespace-nowrap border-b border-slate-800/60 text-white font-medium">{r.label}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap border-b border-slate-800/60 text-right text-slate-300">{r.a > 0 ? r.m : '-'}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap border-b border-slate-800/60 text-right text-slate-300">{r.a > 0 ? r.a : '-'}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap border-b border-slate-800/60 text-right text-white">{r.a > 0 ? `${(r.pct * 100).toFixed(1)}%` : '-'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
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

const VirtualGameLog: React.FC<{ gameLog: any[] | undefined; gameLogLoading: boolean; teamId?: string; onGameClick?: (gameId: string) => void; subHeaderStyle?: React.CSSProperties; rowAltStyle?: React.CSSProperties; rowBaseStyle?: React.CSSProperties; dividerColor?: string; subHeaderTextStyle?: React.CSSProperties }> = React.memo(({ gameLog, gameLogLoading, teamId, onGameClick, subHeaderStyle, rowAltStyle, rowBaseStyle, dividerColor, subHeaderTextStyle }) => {
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
                                {processedRows.slice(startIdx, endIdx).map((cells, vi) => {
                                    const rowGameId = gameLog?.[startIdx + vi]?.gameId as string | undefined;
                                    return (
                                    <tr key={startIdx + vi} className="transition-colors hover:bg-white/5" style={{ height: ROW_HEIGHT }}>
                                        {cells.map((cell, ci) => {
                                            const isResultCell = ci === 2;
                                            const clickable = isResultCell && !!onGameClick && !!rowGameId;
                                            return (
                                            <td
                                                key={ci}
                                                className={`py-2 px-1.5 text-center whitespace-nowrap ${ci < cells.length - 1 ? 'border-r' : ''}`}
                                                style={{ ...((startIdx + vi) % 2 !== 0 ? rowAltStyle : rowBaseStyle), ...(ci < cells.length - 1 && dividerColor ? { borderRightColor: dividerColor } : undefined) }}
                                            >
                                                {clickable ? (
                                                    <button
                                                        onClick={() => onGameClick!(rowGameId!)}
                                                        className={`font-medium hover:underline cursor-pointer ${cell.color || 'text-white'}`}
                                                    >
                                                        {cell.val}
                                                    </button>
                                                ) : (
                                                    <span className={`font-medium ${cell.color || 'text-white'}`}>
                                                        {cell.val}
                                                    </span>
                                                )}
                                            </td>
                                            );
                                        })}
                                    </tr>
                                    );
                                })}
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

export const PlayerDetailView: React.FC<PlayerDetailViewProps> = ({ player: playerProp, teamName: teamNameProp, teamId: teamIdProp, allTeams, schedule, tendencySeed, seasonShort = '2025-26', myTeamId, onBack, onNegotiate, onExtension, onRelease, onSelectPlayer, hideSections, externalGameLog, externalGameLogLoading, externalShotEvents, externalTransactionHistory, onGameClick }) => {
    // ── 내비게이션 로컬 state (브레드크럼 드롭다운) ──
    // [2026-09-04 버그 수정] 의존성이 playerProp.id뿐이었을 때, 같은 선수의 career_history
    // 등이 나중에(targeted-fetch로) 비동기 도착해 부모가 새 player 객체를 내려줘도 id가
    // 그대로라 이 effect가 재실행되지 않아 내부 player state가 옛 데이터로 굳어버렸다
    // (멀티플레이어 FA 프로필 — 처음 들어갈 때는 커리어 기록이 안 뜨고, 새로고침해야만
    // 뜨던 버그의 원인). playerProp 참조 자체를 의존성으로 둬서, 같은 id라도 부모가 새
    // 객체를 내려주면 재동기화되게 한다(호출부는 데이터가 실제로 바뀔 때만 새 참조를
    // 만들도록 useMemo로 안정화해야 함 — MultiPlayerDetailView.tsx의 faPlayerWithCareer 참고).
    const [player, setPlayer] = useState(playerProp);
    const [teamId, setTeamId] = useState(teamIdProp);
    useEffect(() => { setPlayer(playerProp); setTeamId(teamIdProp); }, [playerProp, teamIdProp]);

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
    // (ALL_NBA_1~3 통합)/올-디펜시브(ALL_DEF_1~2 통합)/ROY/6MOY(SMOY 표기 통합) 7종, 카테고리당
    // 1개 배지 + count. ROY/6MOY는 runAwardVoting에 아직 없어 시뮬 실시간 스탬프(player.awards)로는
    // 절대 안 나오고, career_history(BRef 임포트, 올타임 레전드용) 원본에 코드가 있을 때만 노출됨.
    // 올스타는 아직 어워드 시스템 자체에 없어(runAwardVoting 미구현) 이번엔 제외.
    const headerAwardBadges = useMemo(() => {
        // MVP/DPOY/ROY는 수상자만(rank 1 또는 rank 없음) — 후보(2위 이하)는 헤더에 안 보여줌.
        const winnersOnly = allAwards.filter((a: any) => {
            if (a.type === 'MVP' || a.type === 'DPOY' || a.type === 'ROY') return a.rank === 1 || a.rank == null;
            return true;
        });
        const bySeasons: Record<string, string[]> = { CHAMPION: [], MVP: [], DPOY: [], ALL_LEAGUE: [], ALL_DEF: [], ROY: [], SIXTH_MAN: [] };
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
            else if (a.type === 'ROY') bySeasons.ROY.push(a.season);
            else if (a.type === 'SIXTH_MAN') bySeasons.SIXTH_MAN.push(a.season);
        }
        const CATEGORY_META: { key: string; label: string; color: string; bg: string }[] = [
            { key: 'CHAMPION',   label: 'CHAMP',       color: 'text-amber-400',   bg: 'bg-amber-400/15' },
            { key: 'MVP',        label: 'MVP',         color: 'text-yellow-400',  bg: 'bg-yellow-400/15' },
            { key: 'DPOY',       label: 'DPOY',        color: 'text-blue-400',    bg: 'bg-blue-400/15' },
            { key: 'ALL_LEAGUE', label: 'ALL-OFF',     color: 'text-indigo-400',  bg: 'bg-indigo-400/15' },
            { key: 'ALL_DEF',    label: 'ALL-DEF',     color: 'text-emerald-400', bg: 'bg-emerald-400/15' },
            { key: 'ROY',        label: 'ROY',         color: 'text-cyan-400',    bg: 'bg-cyan-400/15' },
            { key: 'SIXTH_MAN',  label: '6MOY',        color: 'text-orange-400',  bg: 'bg-orange-400/15' },
        ];
        return CATEGORY_META
            .map(c => ({ ...c, count: bySeasons[c.key].length, seasons: [...bySeasons[c.key]].sort((a, b) => b.localeCompare(a)) }))
            .filter(c => c.count > 0);
    }, [allAwards]);

    // [2026-09-03] "프로필 헤더 이름 우측에 부상/출장정지 배지" 요청 — 로스터/전술/트레이드
    // 화면과 동일한 InjuryStatusBadge를 재사용. 멀티플레이어는 player.health가
    // forceHealthy=true로 항상 'Healthy'라 activeInjurySeverity(지금 활성 상태 —
    // MultiPlayerDetailView.tsx가 buildActiveInjurySeverityMap()으로 얹어줌)로 판정하고,
    // 싱글플레이어는 player.health가 진짜 값이라 그걸로 판정한 뒤 injuryHistory 마지막
    // 항목의 severity를 쓴다 — 두 경로가 서로 다른 필드에 의존해 여기서 하나로 합친다.
    const headerInjuryBadge = useMemo(() => {
        if (player.activeInjurySeverity) {
            return { severity: player.activeInjurySeverity, title: formatPlayerActiveInjuryLabel(player) ?? undefined };
        }
        if (player.health && player.health !== 'Healthy') {
            const currentInjury = [...(player.injuryHistory ?? [])].sort((a, b) => b.date.localeCompare(a.date))[0];
            if (!currentInjury?.severity) return null;
            const duration = currentInjury.duration || player.returnDate || '';
            const title = currentInjury.severity === 'Suspension'
                ? `출장정지 · ${duration || '기간 미정'}`
                : `부상 · ${player.injuryType || currentInjury.injuryType || '부상'} · ${duration || '기간 미정'}${formatReturnDateSuffix(player.returnDate)}`;
            return { severity: currentInjury.severity, title };
        }
        return null;
    }, [player.activeInjurySeverity, player.injuryType, player.activeInjuryDuration, player.health, player.injuryHistory, player.returnDate]);

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

    // "샷 차트" 탭 좌측 필터 — 결과(성공/실패)/쿼터/슛 타입/상대팀은 shot_events에 이미
    // 있는 필드(isMake/quarter/shotType/teamId + RPC가 추가로 내려주는 homeTeamId·
    // awayTeamId)로 바로 필터링 가능. 클러치는 스코어 마진 데이터가 없어 "4쿼터/연장전
    // 마지막 5분" 시간 기준만으로 근사(실제 NBA 클러치 정의는 마진 5점 이내도 포함하지만
    // 그 데이터가 shot_events에 없음). 컨테스티드/논컨테스티드는 defenderName이 거의 모든
    // 슛에 항상 채워져 있어(엔진이 거의 매 시도에 수비수를 배정) 의미 있게 구분이 안 돼
    // 이번엔 제외 — 하려면 엔진에 별도 isContested 필드를 새로 기록해야 함. 빈 Set = 전체 표시.
    const [shotMakeFilter, setShotMakeFilter] = useState<'all' | 'make' | 'miss'>('all');
    const [shotQuarterFilter, setShotQuarterFilter] = useState<Set<number>>(() => new Set());
    const [shotTypeFilter, setShotTypeFilter] = useState<Set<string>>(() => new Set());
    const [shotTeamFilter, setShotTeamFilter] = useState<Set<string>>(() => new Set());
    const [shotClutchOnly, setShotClutchOnly] = useState(false);

    const SHOT_TYPE_ORDER = ['Dunk', 'Layup', 'Floater', 'Hook', 'Jumper', 'Pullup', 'Fadeaway', 'CatchShoot'];
    const SHOT_TYPE_LABEL: Record<string, string> = {
        Dunk: '덩크', Layup: '레이업', Floater: '플로터', Hook: '훅슛',
        Jumper: '점프슛', Pullup: '풀업', Fadeaway: '페이드어웨이', CatchShoot: '캐치앤슛',
    };
    const quarterLabel = (q: number) => q <= 4 ? `${q}Q` : `OT${q - 4}`;
    // 4쿼터 또는 연장전, 게임클락 5분(300초) 이하 — gameClock은 쿼터 시작 720초에서 0으로
    // 카운트다운(liveEngine.ts 기준).
    const isClutchShot = (ev: any) => ev.quarter >= 4 && typeof ev.gameClock === 'number' && ev.gameClock <= 300;
    // 슈터 자기 팀 id(teamId)와 그 경기의 홈/원정 id를 비교해 상대팀을 계산.
    const getOpponentTeamId = (ev: any): string | undefined =>
        ev.homeTeamId && ev.awayTeamId ? (ev.teamId === ev.homeTeamId ? ev.awayTeamId : ev.homeTeamId) : undefined;
    const teamById = useMemo(() => {
        const m = new Map<string, Team>();
        for (const t of allTeams ?? []) m.set(t.id, t);
        return m;
    }, [allTeams]);

    // 필터 토글 버튼에 표시할 선택지 — 실제 데이터에 존재하는 값만(필터 상태와 무관하게
    // 원본 externalShotEvents 기준으로 고정) 보여줘서 빈 껍데기 버튼이 안 뜨게 함.
    const availableShotTypes = useMemo(() => {
        if (!externalShotEvents) return [];
        const present = new Set((externalShotEvents as any[]).map(ev => ev.shotType).filter(Boolean));
        return SHOT_TYPE_ORDER.filter(t => present.has(t));
    }, [externalShotEvents]);
    const availableQuarters = useMemo(() => {
        if (!externalShotEvents) return [];
        const present = new Set<number>((externalShotEvents as any[]).map(ev => ev.quarter).filter((q): q is number => q != null));
        return Array.from(present).sort((a, b) => a - b);
    }, [externalShotEvents]);
    const availableOpponentTeams = useMemo(() => {
        if (!externalShotEvents) return [];
        const present = new Set<string>();
        for (const ev of externalShotEvents as any[]) {
            const oppId = getOpponentTeamId(ev);
            if (oppId) present.add(oppId);
        }
        return Array.from(present).sort((a, b) => (teamById.get(a)?.abbr ?? a).localeCompare(teamById.get(b)?.abbr ?? b));
    }, [externalShotEvents, teamById]);

    const filteredShotEvents = useMemo(() => {
        if (!externalShotEvents) return externalShotEvents;
        return (externalShotEvents as any[]).filter(ev => {
            if (shotMakeFilter === 'make' && !ev.isMake) return false;
            if (shotMakeFilter === 'miss' && ev.isMake) return false;
            if (shotQuarterFilter.size > 0 && !shotQuarterFilter.has(ev.quarter)) return false;
            if (shotTypeFilter.size > 0 && !shotTypeFilter.has(ev.shotType)) return false;
            if (shotTeamFilter.size > 0) {
                const oppId = getOpponentTeamId(ev);
                if (!oppId || !shotTeamFilter.has(oppId)) return false;
            }
            if (shotClutchOnly && !isClutchShot(ev)) return false;
            return true;
        });
    }, [externalShotEvents, shotMakeFilter, shotQuarterFilter, shotTypeFilter, shotTeamFilter, shotClutchOnly]);

    // shot_events의 subZone(zone_rim/zone_paint/zone_mid_l 등, statsMappers.ts와 동일 키)을
    // leagueZoneAvg/ZONE_CONFIG의 5대 구역(avgKey: rim/paint/mid/c3/atb3)으로 매핑 — 헥스빈
    // 성공률을 "그 슛이 실제로 나온 구역의 리그 평균" 대비로 비교하기 위함.
    const SUBZONE_AVG_KEY: Record<string, keyof typeof leagueZoneAvg> = {
        zone_rim: 'rim', zone_paint: 'paint',
        zone_mid_l: 'mid', zone_mid_c: 'mid', zone_mid_r: 'mid',
        zone_c3_l: 'c3', zone_c3_r: 'c3',
        zone_atb3_l: 'atb3', zone_atb3_c: 'atb3', zone_atb3_r: 'atb3',
    };
    // 위와 같은 subZone을 이번엔 CHART_ZONES(10개 세부 구역)의 key로 매핑 — 샷 차트 우측
    // 구역별 테이블(filteredZoneBreakdown)에서 씀.
    const SUBZONE_CHART_KEY: Record<string, string> = {
        zone_rim: 'rim', zone_paint: 'paint',
        zone_mid_l: 'midL', zone_mid_c: 'midC', zone_mid_r: 'midR',
        zone_c3_l: 'c3L', zone_c3_r: 'c3R',
        zone_atb3_l: 'atb3L', zone_atb3_c: 'atb3C', zone_atb3_r: 'atb3R',
    };

    // "샷 차트" 탭 — 보기 방식(히트맵/O·X 차트) 공용 좌표 변환. 개별 슛 좌표
    // (courtCoordinates.ts 기준 풀코트 x:0~94ft/y:0~50ft, 홈/원정 섞여 있어 x>47이면
    // 94-x로 하프코트 정규화)를 courtZones.ts의 435×403 캔버스 좌표로 변환(PAINT 사각형에서
    // 역산한 스케일 재사용). isMake/zoneAvg(그 슛이 나온 구역의 리그 평균 FG%, 없으면
    // null)도 같이 들고 있어 O·X 마커 분기와 헥스빈 성공률-리그평균 비교에 씀.
    const shotChartPoints = useMemo(() => {
        if (!filteredShotEvents || filteredShotEvents.length === 0) return [];
        const SCALE_X = 8.525;  // px per ft, 좌우(원본=y)
        const SCALE_Y = 8.616;  // px per ft, 깊이(원본=x, 베이스라인부터)
        const HOOP_CENTER_X = 217.3;
        const BASELINE_Y = 401.6;
        return (filteredShotEvents as any[]).map(ev => {
            const halfX = ev.x > 47 ? 94 - ev.x : ev.x;
            const avgKey = ev.subZone ? SUBZONE_AVG_KEY[ev.subZone] : undefined;
            return {
                x: HOOP_CENTER_X + (ev.y - 25) * SCALE_X,
                y: BASELINE_Y - halfX * SCALE_Y,
                isMake: !!ev.isMake,
                zoneAvg: avgKey ? leagueZoneAvg[avgKey] : null,
            };
        });
    }, [filteredShotEvents, leagueZoneAvg]);

    // 샷 차트 우측 "구역별" 테이블 — 필터 적용 후 남은 슛(filteredShotEvents)을 subZone
    // 기준으로 CHART_ZONES(10개 세부 구역)에 집계. chartZones(위, player.stats 시즌/커리어
    // 합산)와 달리 이건 현재 활성화된 필터(상대팀/시간대/슛 타입 등)를 그대로 반영한
    // 실시간 집계라는 게 차이점 — 필터를 바꾸면 이 테이블도 같이 바뀜.
    const filteredZoneBreakdown = useMemo(() => {
        const counts: Record<string, { m: number; a: number }> = {};
        for (const ev of (filteredShotEvents ?? []) as any[]) {
            const key = ev.subZone ? SUBZONE_CHART_KEY[ev.subZone] : undefined;
            if (!key) continue;
            if (!counts[key]) counts[key] = { m: 0, a: 0 };
            counts[key].a += 1;
            if (ev.isMake) counts[key].m += 1;
        }
        return CHART_ZONES.map(z => {
            const c = counts[z.key] ?? { m: 0, a: 0 };
            return { ...z, m: c.m, a: c.a, pct: c.a > 0 ? c.m / c.a : 0, avg: leagueZoneAvg[z.avgKey] };
        });
    }, [filteredShotEvents, leagueZoneAvg]);

    const filteredShotTotals = useMemo(() => {
        const events = (filteredShotEvents ?? []) as any[];
        const m = events.filter(ev => ev.isMake).length;
        const a = events.length;
        const m3 = events.filter(ev => ev.isMake && ev.points === 3).length;
        const a3 = events.filter(ev => ev.points === 3).length;
        return { m, a, pct: a > 0 ? m / a : 0, m3, a3, pct3: a3 > 0 ? m3 / a3 : 0 };
    }, [filteredShotEvents]);

    // 구역별 아래에 붙는 시간대별/슛 타입별/팀별 기록 테이블용 — 전부 같은 패턴(키별로
    // FGM/FGA/FG% 집계)이라 공용 aggregateByKey로 묶고 ShotBreakdownTable로 렌더.
    const aggregateByKey = (events: any[], keyOf: (ev: any) => string | null | undefined) => {
        const counts: Record<string, { m: number; a: number }> = {};
        for (const ev of events) {
            const key = keyOf(ev);
            if (key == null) continue;
            if (!counts[key]) counts[key] = { m: 0, a: 0 };
            counts[key].a += 1;
            if (ev.isMake) counts[key].m += 1;
        }
        return counts;
    };

    const filteredQuarterBreakdown = useMemo(() => {
        const events = (filteredShotEvents ?? []) as any[];
        const counts = aggregateByKey(events, ev => ev.quarter != null ? String(ev.quarter) : null);
        const rows = availableQuarters.map(q => {
            const c = counts[String(q)] ?? { m: 0, a: 0 };
            return { key: String(q), label: quarterLabel(q), m: c.m, a: c.a, pct: c.a > 0 ? c.m / c.a : 0 };
        });
        const clutch = events.filter(isClutchShot);
        const cm = clutch.filter(ev => ev.isMake).length;
        rows.push({ key: 'clutch', label: '클러치', m: cm, a: clutch.length, pct: clutch.length > 0 ? cm / clutch.length : 0 });
        return rows;
    }, [filteredShotEvents, availableQuarters]);

    const filteredShotTypeBreakdown = useMemo(() => {
        const events = (filteredShotEvents ?? []) as any[];
        const counts = aggregateByKey(events, ev => ev.shotType ?? null);
        return availableShotTypes.map(t => {
            const c = counts[t] ?? { m: 0, a: 0 };
            return { key: t, label: SHOT_TYPE_LABEL[t] ?? t, m: c.m, a: c.a, pct: c.a > 0 ? c.m / c.a : 0 };
        });
    }, [filteredShotEvents, availableShotTypes]);

    const filteredTeamBreakdown = useMemo(() => {
        const events = (filteredShotEvents ?? []) as any[];
        const counts = aggregateByKey(events, ev => getOpponentTeamId(ev) ?? null);
        return availableOpponentTeams.map(teamId => {
            const c = counts[teamId] ?? { m: 0, a: 0 };
            return { key: teamId, label: teamById.get(teamId)?.abbr ?? teamId, m: c.m, a: c.a, pct: c.a > 0 ? c.m / c.a : 0 };
        });
    }, [filteredShotEvents, availableOpponentTeams, teamById]);

    // 히트맵(d3-hexbin 밀도) — shotChartPoints를 육각형으로 비닝. 비닝 반경(9, 근처 슛을
    // 묶는 그리드 간격)과 실제로 "그려지는" 헥사곤 크기는 분리 — 그려지는 크기는 해당
    // 구역 슛 개수에 비례해 커지도록 sqrt 스케일(면적이 개수에 비례하게, 반지름을 그대로
    // 선형 스케일하면 면적 차이가 과장돼 보임)로 매핑. 색상은 아래 shotColorMode에 따라
    // 빈도(viridis 보라→노랑) 또는 성공률(RdYlGn 빨강→초록, 절대 FG%가 아니라 그 bin에
    // 섞인 슛들의 리그 평균 대비 편차) 중 선택.
    const shotHexbins = useMemo(() => {
        if (shotChartPoints.length === 0) return null;
        const hexbinGen = d3Hexbin<{ x: number; y: number; isMake: boolean; zoneAvg: number | null }>()
            .x(d => d.x)
            .y(d => d.y)
            .radius(9)
            .extent([[0, 0], [435, 403]]);
        const rawBins = hexbinGen(shotChartPoints);
        const maxCount = Math.max(1, ...rawBins.map(b => b.length));
        const radiusScale = scaleSqrt().domain([1, maxCount]).range([3, 9]).clamp(true);
        const bins = rawBins.map(b => {
            const makes = b.reduce((s, p) => s + (p.isMake ? 1 : 0), 0);
            const withAvg = b.filter(p => p.zoneAvg != null);
            const expectedAvg = withAvg.length > 0
                ? withAvg.reduce((s, p) => s + (p.zoneAvg as number), 0) / withAvg.length
                : null;
            const fgPct = makes / b.length;
            return {
                x: b.x,
                y: b.y,
                length: b.length,
                fgPct,
                avgDiff: expectedAvg != null ? fgPct - expectedAvg : 0,
                path: hexbinGen.hexagon(radiusScale(b.length)),
            };
        });
        // 빈도 색상 — 낮을수록 어두운 회색(#475569, slate-600), 높을수록 흰색. 코트 배경과
        // 거의 같은 톤(#0f172a 등)을 쓰면 빈도 낮은 헥스가 배경에 묻혀 안 보이는 문제가 있어
        // 배경과 명확히 구분되는 회색을 최솟값으로 사용.
        // lightenHex(어두운 베이스, 0~1)가 정확히 이 보간(원색→흰색)을 하므로 그대로 재사용.
        const FREQ_DARK = '#475569';
        const freqColorScale = (count: number) => {
            const t = maxCount > 1 ? Math.min(1, Math.max(0, (count - 1) / (maxCount - 1))) : 1;
            return lightenHex(FREQ_DARK, t);
        };
        // 성공률(리그 평균 대비 편차) 색상 — 짙은 초록(낮음) → 초록(평균) → 밝은 초록(높음)
        // 3단계, ±17.5%p를 벗어나는 편차는 양 끝 색으로 클램프. (아티팩트에서 확정한 값)
        const FG_COLOR_DOMAIN = 0.175;
        const fgColorScale = (diff: number) => {
            const t = Math.min(1, Math.max(0, (diff + FG_COLOR_DOMAIN) / (FG_COLOR_DOMAIN * 2)));
            return t < 0.5
                ? lerpHex('#006106', '#00b80c', t * 2)
                : lerpHex('#00b80c', '#00ff11', (t - 0.5) * 2);
        };
        return {
            bins,
            freqColorScale,
            fgColorScale,
        };
    }, [shotChartPoints]);

    // 헥스빈 색상 기준 — 빈도(시도 횟수) / 성공률(FG%) 전환.
    const [shotColorMode, setShotColorMode] = useState<'frequency' | 'fgPct'>('frequency');

    // 보기 방식 — 히트맵(hexbin) / O·X 차트(개별 슛 성공=원, 실패=X) 전환.
    const [shotViewMode, setShotViewMode] = useState<'hexbin' | 'ox'>('hexbin');

    const [careerTab, setCareerTab] = useState<'trad' | 'adv'>('trad');
    const [careerMode, setCareerMode] = useState<'regular' | 'playoff'>('regular');

    // 프로필 내 탭 이동에도 URL 라우팅 부여 — ?tab=records 같은 쿼리 파라미터로 저장해
    // 새로고침/뒤로가기/링크 공유 시 보던 탭이 그대로 유지되게 함. 기본 탭(profile)은
    // 파라미터를 아예 지워서 URL을 깔끔하게 유지. 탭 전환은 history를 쌓지 않고 교체(replace)
    // — 안 그러면 뒤로가기를 탭 클릭 횟수만큼 눌러야 이전 화면으로 돌아가는 문제가 생긴다.
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get('tab');
    const activeTab: 'profile' | 'records' | 'shotchart' =
        tabParam === 'records' || tabParam === 'shotchart' ? tabParam : 'profile';
    const setActiveTab = useCallback((tab: string) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (tab === 'records' || tab === 'shotchart') next.set('tab', tab);
            else next.delete('tab');
            return next;
        }, { replace: true });
    }, [setSearchParams]);

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

    // [2026-09-04] "FA 프로필은 뒤로가기 버튼이 포함된 영역 자체를 숨겨달라" 요청 — teamId가
    // 없으면(FA) 팀/선수 드롭다운은 이미 숨겨져 있어(아래 {teamId && (...)}) 뒤로가기 버튼
    // 하나만 덩그러니 남는데, 이 줄까지 통째로 없앤다. 다만 싱글플레이어 FA 시장 진입점
    // (onNegotiate)이나 방출/연장 버튼처럼 teamId 없이도(또는 teamId===myTeamId일 때) 이
    // 바에 실제로 보여줄 액션 버튼이 있는 경우는 그대로 유지 — 멀티플레이어는 이 프롭들을
    // 아예 안 넘기므로 hasActionButtons가 항상 false가 돼 자연히 바가 사라진다. 멀티에서
    // 뒤로가기 버튼이 없어져도 좌측 사이드바(MultiSidebar.tsx)가 항상 떠 있어 다른 화면으로
    // 이동하는 길이 막히지 않는다.
    const hasActionButtons = !!((!teamId && onNegotiate) || (myTeamId && teamId === myTeamId && (onExtension || onRelease)));
    const showBreadcrumbBar = !!teamId || hasActionButtons;

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300 overflow-hidden">
            {/* ═══ 브레드크럼 바 ═══ */}
            {showBreadcrumbBar && (
            <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-800 bg-slate-950 shrink-0">
                {/* 뒤로 버튼 */}
                <button
                    onClick={onBack}
                    className="flex items-center justify-center w-7 h-7 rounded-md bg-black/30 hover:bg-black/50 text-slate-200 transition-colors shrink-0"
                >
                    <ArrowLeft size={14} />
                </button>

                {/* [2026-09-03] "FA 선수 프로필은 브레드크럼을 숨겨달라" 요청 — teamId가 없으면
                    (FA) 팀/선수 드롭다운 트레일 자체가 의미가 없다("FA ▾"를 눌러도 갈 곳이
                    없는 죽은 드롭다운이 됨). 뒤로가기 버튼은 유지하고, 이름은 프로필 헤더에
                    이미 크게 나오니 브레드크럼 자리에는 굳이 다시 안 보여준다. */}
                {teamId && (
                    <>
                        {/* 팀 드롭다운 */}
                        <div ref={teamDropRef} className="relative">
                            <button
                                onClick={() => { setTeamDropOpen(o => !o); setPlayerDropOpen(false); }}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-black/20 hover:bg-black/40 text-white transition-colors"
                            >
                                <TeamBadge
                                    teamId={teamId}
                                    abbr={currentTeam?.abbr}
                                    colorPrimary={currentTeam?.colorPrimary}
                                    colorSecondary={currentTeam?.colorSecondary}
                                    size="xs"
                                />
                                <span className="text-sm font-bold">{teamName ?? 'FA'}</span>
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
                                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-800 transition-colors ${t.id === teamId ? 'text-white font-bold' : 'text-slate-300'}`}
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
                                <span className="text-sm font-bold truncate">{player.name}</span>
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
                                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-800 transition-colors ${p.id === player.id ? 'text-white font-bold' : 'text-slate-300'}`}
                                        >
                                            <span className="font-mono w-6 text-center shrink-0 text-slate-400">{calculatePlayerOvr(p)}</span>
                                            <span className="truncate">{p.name}</span>
                                            <span className="text-slate-500 shrink-0">{p.position}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* 액션 버튼 그룹 — 브레드크럼 우측 끝 */}
                {hasActionButtons && (
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
            )}

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
                        {headerInjuryBadge && (
                            <InjuryStatusBadge
                                severity={headerInjuryBadge.severity}
                                title={headerInjuryBadge.title}
                                size={28}
                                iconSize={22}
                                strokeWidth={3.5}
                                className="shrink-0"
                            />
                        )}
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
                                    <div className="text-base font-bold text-white mb-1.5">선수 정보</div>
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
                                            <div className="text-base font-bold text-white mb-1.5">부상 현황</div>
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
                                        <div className="text-base font-bold text-white mb-1.5">선수 유형</div>
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
                                    <div className="text-base font-bold text-white mb-1.5">인기도</div>
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
                                        <div className="text-base font-bold text-white mb-1.5">성격 & 기분</div>
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
                                        <div className="text-base font-bold text-white mb-1">스카우팅 리포트</div>
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
                                    <div className="text-base font-bold text-white mb-1.5">직전 계약</div>
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
                                    <div className="text-base font-bold text-white mb-1.5">계약 정보</div>
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
                            <div className="text-base font-bold text-white mb-1.5">수상 내역</div>
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
                                    MIP: '최고 발전 선수', '6MOY': '식스맨', SMOY: '식스맨', SIXTH_MAN: '식스맨',
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
                                        ROY: 10, SIXTH_MAN: 11,
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
                                                } else if ((entry.type === 'MVP' || entry.type === 'DPOY' || entry.type === 'ROY') && (entry as any).rank != null) {
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

                        {/* ── 위젯 7.5: 선수 이동 내역(현재 멀티플레이어 전용 — externalTransactionHistory가
                            주어졌을 때만 렌더). 날짜|타입|이동 순. 드래프트는 "이전팀→현재팀" 화살표
                            표기 대신(애초에 이전 팀이 없음) "1R 3rd LAL"처럼 라운드/픽 순번/팀만 표기
                            — 트레이드(fromAbbr → toAbbr)와 시각적으로 구분된다. */}
                        {externalTransactionHistory !== undefined && (
                        <div className="px-4 py-3 border-t border-slate-800 space-y-1">
                            <div className="text-base font-bold text-white mb-1.5">선수 이동 내역</div>
                            {externalTransactionHistory.length === 0 ? (
                                <div className="text-sm text-slate-500">이동 내역이 없습니다</div>
                            ) : (() => {
                                const TX_TYPE_LABEL: Record<string, string> = {
                                    draft: '드래프트', trade: '트레이드', fa: 'FA', waive: '웨이브',
                                };
                                const toOrdinal = (n: number) => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
                                return (
                                    <>
                                        {externalTransactionHistory.map((entry, idx) => {
                                            const dateStr = entry.date ? entry.date.slice(2).replace(/-/g, '/') : '-';
                                            return (
                                                <div key={idx} className="flex items-center text-sm gap-2">
                                                    <span className="text-slate-500 w-16 shrink-0">{dateStr}</span>
                                                    <span className="text-slate-400 w-16 shrink-0">{TX_TYPE_LABEL[entry.type] ?? entry.type}</span>
                                                    <span className="text-slate-200 flex-1 text-right">
                                                        {entry.type === 'draft' && entry.draftRound != null && entry.draftPick != null
                                                            ? `${entry.draftRound}R ${toOrdinal(entry.draftPick)} ${entry.toTeamAbbr}`
                                                            : `${entry.fromTeamAbbr ?? '—'} → ${entry.toTeamAbbr}`}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </>
                                );
                            })()}
                        </div>
                        )}

                        {/* ── 위젯 8: 부상 이력 ── */}
                        {!hideSections?.includes('injuryHistory') && (
                        <div className="px-4 py-3 border-t border-slate-800 space-y-1">
                            <div className="text-base font-bold text-white mb-1.5">부상 이력</div>
                            {!player.injuryHistory || player.injuryHistory.length === 0 ? (
                                <div className="text-sm text-slate-500">부상 이력이 없습니다</div>
                            ) : (
                                <>
                                    {[...player.injuryHistory]
                                        .sort((a, b) => b.date.localeCompare(a.date))
                                        .map((entry, idx) => {
                                            const dateStr = entry.date.slice(5).replace('-', '/');
                                            // 가장 최근 항목이면서 지금도 활성 상태면(출장정지 등 게임 수
                                            // 기반) player.activeInjuryDuration이 "지금 기준 남은 경기 수"로
                                            // 재계산된 값 — 과거에 종료된 항목은 발부 당시 기록(entry.duration)
                                            // 그대로 둔다(로그는 변하면 안 됨).
                                            const isCurrentActive = idx === 0 && !!player.activeInjurySeverity;
                                            const duration = isCurrentActive ? (player.activeInjuryDuration ?? entry.duration) : entry.duration;
                                            return (
                                                <div key={idx} className="flex justify-between items-center text-sm">
                                                    <span className="text-slate-500">{dateStr}</span>
                                                    <span className="text-slate-200">
                                                        {entry.injuryType} {duration}{formatReturnDateSuffix(entry.returnDate)}
                                                    </span>
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
                            <div className="px-4 py-3 text-base font-bold text-white">능력치</div>
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
                                                                    <div className="h-[14px] bg-slate-800 overflow-hidden">
                                                                        <div className="h-full" style={{ width: `${Math.min(100, Math.max(0, val))}%`, backgroundImage: getAttrBarGradient(val) }} />
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
                                                                    <span className={`schibsted-grotesk font-black text-2xl tabular-nums ${getAttrColor(val)}`}>{val}</span>
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

                {activeTab === 'records' && (
                    <div className="flex flex-col gap-4">
                        {/* ── 커리어 기록(시즌 기록) — 프로필 탭에서 이동 ── */}
                        {(careerRegular.length > 0 || careerPlayoff.length > 0) && (
                            <div>
                                <SectionHeader title="기록" className="bg-slate-900">
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
                                                        <tr key={ai} style={{ backgroundColor: '#0f172a' }}>
                                                            {cols.map((col, ci) => (
                                                                <td key={col.key} className={`px-3 py-1.5 whitespace-nowrap border-t text-white ${ci === 0 ? 'sticky left-0 z-10 font-black' : isCareer ? 'font-bold' : ''}`}
                                                                    style={{ backgroundColor: '#0f172a', borderTopColor: isCareer ? '#334155' : '#0f172a', color: 'white' }}>
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
                            <SectionHeader title="최근 경기" className="bg-slate-900" />
                            <div style={{ height: gameLog.length * ROW_HEIGHT + ROW_HEIGHT }} className="relative">
                                <VirtualGameLog
                                    gameLog={gameLog}
                                    gameLogLoading={gameLogLoading}
                                    teamId={teamId}
                                    onGameClick={onGameClick}
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
                            구역별 테이블은 정보가 중복돼 제거하고 이 차트 하나로 통합함.
                            왼쪽에 결과/시간대(쿼터+클러치)/슛 타입/상대팀 필터 패널. 상대팀은
                            RPC가 추가로 내려주는 homeTeamId/awayTeamId로 계산, 클러치는 스코어
                            마진 데이터가 없어 "4쿼터·연장 마지막 5분" 시간 기준 근사.
                            컨테스티드/논컨테스티드는 defenderName이 거의 항상 채워져 있어
                            의미 있게 구분이 안 돼 제외(엔진에 별도 필드 필요). */}
                        {externalShotEvents && externalShotEvents.length > 0 ? (
                            <div className="flex">
                                {/* ── 필터 패널 — 다른 탭(기록 등)처럼 카드 컨테이너 없이 바디 좌상단에
                                    바로 밀착. 두 열: 1열(보기 방식/색상 기준/결과/시간대[쿼터+클러치]/
                                    슛 타입)은 라디오(단일 선택)+체크박스(다중 선택) 리스트, 2열(상대팀)은
                                    체크박스. 각 그룹은 divide-y로 구분선, 두 열 사이는 border-l로 구분. */}
                                <div className="shrink-0 self-start bg-slate-900 p-4 flex flex-col gap-3">
                                    <div className="text-sm text-slate-500 pb-3 border-b border-slate-800">
                                        {filteredShotEvents?.length ?? 0}개 표시 중
                                        {(shotMakeFilter !== 'all' || shotQuarterFilter.size > 0 || shotTypeFilter.size > 0 || shotTeamFilter.size > 0 || shotClutchOnly) && (
                                            <button
                                                onClick={() => { setShotMakeFilter('all'); setShotQuarterFilter(new Set()); setShotTypeFilter(new Set()); setShotTeamFilter(new Set()); setShotClutchOnly(false); }}
                                                className="ml-2 text-slate-400 hover:text-white underline underline-offset-2"
                                            >
                                                초기화
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex">
                                        {/* ── 1열 ── */}
                                        <div className="w-40 shrink-0 pr-4 flex flex-col divide-y divide-slate-800">
                                            <div className="py-3 first:pt-0">
                                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">보기 방식</div>
                                                <div className="flex flex-col gap-1">
                                                    {([['hexbin', '히트맵'], ['ox', 'O·X']] as const).map(([key, label]) => {
                                                        const active = shotViewMode === key;
                                                        return (
                                                            <label key={key} className="flex items-center gap-2.5 py-1 cursor-pointer group">
                                                                <input
                                                                    type="radio"
                                                                    name="shotViewMode"
                                                                    checked={active}
                                                                    onChange={() => setShotViewMode(key)}
                                                                    className="w-4 h-4 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-slate-600 bg-slate-950 checked:border-indigo-500 checked:bg-indigo-500 checked:shadow-[inset_0_0_0_2.5px_rgb(2,6,23)] transition-colors"
                                                                />
                                                                <span className={`text-sm transition-colors ${active ? 'text-white font-bold' : 'text-slate-400 group-hover:text-slate-300'}`}>{label}</span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {shotViewMode === 'hexbin' && (
                                                <div className="py-3">
                                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">색상 기준</div>
                                                    <div className="flex flex-col gap-1">
                                                        {([['frequency', '빈도'], ['fgPct', '성공률']] as const).map(([key, label]) => {
                                                            const active = shotColorMode === key;
                                                            return (
                                                                <label key={key} className="flex items-center gap-2.5 py-1 cursor-pointer group">
                                                                    <input
                                                                        type="radio"
                                                                        name="shotColorMode"
                                                                        checked={active}
                                                                        onChange={() => setShotColorMode(key)}
                                                                        className="w-4 h-4 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-slate-600 bg-slate-950 checked:border-indigo-500 checked:bg-indigo-500 checked:shadow-[inset_0_0_0_2.5px_rgb(2,6,23)] transition-colors"
                                                                    />
                                                                    <span className={`text-sm transition-colors ${active ? 'text-white font-bold' : 'text-slate-400 group-hover:text-slate-300'}`}>{label}</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                    {shotColorMode === 'fgPct' && (
                                                        <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
                                                            <span className="text-slate-500">평균 이하</span>
                                                            <span className="flex-1 h-1.5 rounded-full" style={{ background: 'linear-gradient(to right, #006106, #00b80c, #00ff11)' }} />
                                                            <span className="text-emerald-400">평균 이상</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div className="py-3">
                                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">결과</div>
                                                <div className="flex flex-col gap-1">
                                                    {([['all', '전체'], ['make', '성공'], ['miss', '실패']] as const).map(([key, label]) => {
                                                        const active = shotMakeFilter === key;
                                                        return (
                                                            <label key={key} className="flex items-center gap-2.5 py-1 cursor-pointer group">
                                                                <input
                                                                    type="radio"
                                                                    name="shotMakeFilter"
                                                                    checked={active}
                                                                    onChange={() => setShotMakeFilter(key)}
                                                                    className="w-4 h-4 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-slate-600 bg-slate-950 checked:border-indigo-500 checked:bg-indigo-500 checked:shadow-[inset_0_0_0_2.5px_rgb(2,6,23)] transition-colors"
                                                                />
                                                                <span className={`text-sm transition-colors ${active ? 'text-white font-bold' : 'text-slate-400 group-hover:text-slate-300'}`}>{label}</span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {availableQuarters.length > 0 && (
                                                <div className="py-3">
                                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">시간대</div>
                                                    <div className="flex flex-col gap-1">
                                                        {availableQuarters.map(q => {
                                                            const active = shotQuarterFilter.has(q);
                                                            return (
                                                                <label key={q} className="flex items-center gap-2.5 py-1 cursor-pointer group">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={active}
                                                                        onChange={() => setShotQuarterFilter(prev => {
                                                                            const next = new Set(prev);
                                                                            if (next.has(q)) next.delete(q); else next.add(q);
                                                                            return next;
                                                                        })}
                                                                        className="w-4 h-4 shrink-0 cursor-pointer appearance-none rounded border-2 border-slate-600 bg-slate-950 checked:border-indigo-500 checked:bg-indigo-500 transition-colors"
                                                                    />
                                                                    <span className={`text-sm transition-colors ${active ? 'text-white font-bold' : 'text-slate-400 group-hover:text-slate-300'}`}>{quarterLabel(q)}</span>
                                                                </label>
                                                            );
                                                        })}
                                                        <label className="flex items-center gap-2.5 py-1 cursor-pointer group">
                                                            <input
                                                                type="checkbox"
                                                                checked={shotClutchOnly}
                                                                onChange={() => setShotClutchOnly(v => !v)}
                                                                className="w-4 h-4 shrink-0 cursor-pointer appearance-none rounded border-2 border-slate-600 bg-slate-950 checked:border-indigo-500 checked:bg-indigo-500 transition-colors"
                                                            />
                                                            <span className={`text-sm transition-colors ${shotClutchOnly ? 'text-white font-bold' : 'text-slate-400 group-hover:text-slate-300'}`}>클러치</span>
                                                        </label>
                                                    </div>
                                                </div>
                                            )}

                                            {availableShotTypes.length > 0 && (
                                                <div className="py-3 last:pb-0">
                                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">슛 타입</div>
                                                    <div className="flex flex-col gap-1">
                                                        {availableShotTypes.map(t => {
                                                            const active = shotTypeFilter.has(t);
                                                            return (
                                                                <label key={t} className="flex items-center gap-2.5 py-1 cursor-pointer group">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={active}
                                                                        onChange={() => setShotTypeFilter(prev => {
                                                                            const next = new Set(prev);
                                                                            if (next.has(t)) next.delete(t); else next.add(t);
                                                                            return next;
                                                                        })}
                                                                        className="w-4 h-4 shrink-0 cursor-pointer appearance-none rounded border-2 border-slate-600 bg-slate-950 checked:border-indigo-500 checked:bg-indigo-500 transition-colors"
                                                                    />
                                                                    <span className={`text-sm transition-colors ${active ? 'text-white font-bold' : 'text-slate-400 group-hover:text-slate-300'}`}>{SHOT_TYPE_LABEL[t] ?? t}</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* ── 2열: 상대팀 — 1열(결과/시간대/슛 타입 등)과 같은 flex row의
                                            형제라 기본 align-items:stretch로 1열 높이만큼 늘어난다. 예전엔
                                            체크박스 목록에 고정 max-h(26rem)를 줘서 팀 수가 적을 때 그 늘어난
                                            높이만큼 하단에 빈 공간이 남았음 — flex-1로 바꿔 목록 자체가 남는
                                            공간을 그대로 채우고, 넘칠 때만(팀이 많을 때) 스크롤되도록 함. */}
                                        <div className="w-40 shrink-0 pl-4 border-l border-slate-800 flex flex-col">
                                            {availableOpponentTeams.length > 0 && (
                                                <div className="flex-1 min-h-0 flex flex-col">
                                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">상대팀</div>
                                                    <div className="flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                                                        {availableOpponentTeams.map(teamId => {
                                                            const team = teamById.get(teamId);
                                                            const active = shotTeamFilter.has(teamId);
                                                            return (
                                                                <label key={teamId} className="flex items-center gap-2.5 py-1 cursor-pointer group">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={active}
                                                                        onChange={() => setShotTeamFilter(prev => {
                                                                            const next = new Set(prev);
                                                                            if (next.has(teamId)) next.delete(teamId); else next.add(teamId);
                                                                            return next;
                                                                        })}
                                                                        className="w-4 h-4 shrink-0 cursor-pointer appearance-none rounded border-2 border-slate-600 bg-slate-950 checked:border-indigo-500 checked:bg-indigo-500 transition-colors"
                                                                    />
                                                                    <span className={`text-sm transition-colors ${active ? 'text-white font-bold' : 'text-slate-400 group-hover:text-slate-300'}`}>{team?.abbr ?? teamId}</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* ── 차트 — 히트맵(hexbin)과 O·X(개별 슛) 두 보기 방식 공용 캔버스.
                                    존별 성공률 배경 + 코트 라인은 두 모드 다 동일하게 깔고, 가운데
                                    레이어만 shotViewMode에 따라 hexbin/O·X 마커로 바뀐다. */}
                                <div className="shrink-0 p-4 flex justify-start">
                                    {shotChartPoints.length > 0 ? (
                                        <svg viewBox="0 0 435 403" className="w-[46rem] aspect-[435/403] self-start">
                                            <defs>
                                                {/* 헥스빈/O·X 마커는 슛 좌표를 중심으로 반경이 있는 도형이라, 베이스라인
                                                    근처 슛은 중심점은 코트 안이어도 도형 자체가 구분선(바운딩 박스) 밖으로
                                                    삐져나올 수 있다 — 두 레이어에 이 클립을 적용해 잘라낸다. */}
                                                <clipPath id="shotChartClip">
                                                    <rect x="0.8" y="0.6" width="433" height="401" />
                                                </clipPath>
                                            </defs>
                                            <rect x="0" y="0" width="435" height="403" fill="#020617" />
                                            {/* 존별 성공률 배경 — getZoneStyle과 동일한 공식(FG% 비례)이지만
                                                차트 아래 깔리는 배경이라 상한을 0.50 → 0.30으로 낮춤. */}
                                            <g>
                                                {chartZones.map(z => {
                                                    const pct = z.a > 0 ? z.m / z.a : 0;
                                                    const opacity = z.a > 0 ? Math.min(0.30, pct * 0.30) : 0.02;
                                                    return <path key={z.key} d={ZONE_PATHS[z.pathKey]} fill="#10b981" fillOpacity={opacity} />;
                                                })}
                                            </g>
                                            {/* 코트 라인 — 헥스빈/O·X 레이어보다 먼저 그려서 그 아래에 깔리게 함
                                                (참고한 StatMuse류 샷차트처럼 밀집 구역에서는 마커가 라인을 덮어도 됨). */}
                                            <g fill="rgba(255,255,255,1)" fillRule="evenodd" pointerEvents="none">
                                                {COURT_LINES.map((d, i) => <path key={i} d={d} />)}
                                            </g>
                                            {shotViewMode === 'hexbin' && shotHexbins && (
                                                <g clipPath="url(#shotChartClip)">
                                                    {shotHexbins.bins.map((bin, i) => (
                                                        <path
                                                            key={i}
                                                            d={bin.path}
                                                            transform={`translate(${bin.x},${bin.y})`}
                                                            fill={shotColorMode === 'fgPct' ? shotHexbins.fgColorScale(bin.avgDiff) : shotHexbins.freqColorScale(bin.length)}
                                                        />
                                                    ))}
                                                </g>
                                            )}
                                            {shotViewMode === 'ox' && (
                                                <g clipPath="url(#shotChartClip)">
                                                    {shotChartPoints.map((p, i) => p.isMake ? (
                                                        <circle
                                                            key={i}
                                                            cx={p.x}
                                                            cy={p.y}
                                                            r={3.5}
                                                            fill="none"
                                                            stroke="#34d399"
                                                            strokeWidth={1.4}
                                                            opacity={0.85}
                                                        />
                                                    ) : (
                                                        <g key={i} transform={`translate(${p.x},${p.y})`} stroke="#f87171" strokeWidth={1.4} strokeLinecap="round" opacity={0.85}>
                                                            <line x1={-3} y1={-3} x2={3} y2={3} />
                                                            <line x1={-3} y1={3} x2={3} y2={-3} />
                                                        </g>
                                                    ))}
                                                </g>
                                            )}
                                            {/* 외곽 구분선 — CSS border 대신 실제 코트/존 콘텐츠의 바운딩 박스(x:0.8~433.8,
                                                y:0.6~401.6, courtZones.ts 좌표 기준)에 정확히 맞춰 그림. viewBox 전체(0~435,
                                                0~403) 기준 CSS border를 쓰면 존 패스들이 캔버스 가장자리에서 ~1px 안쪽에서
                                                시작해 border와 실제 콘텐츠 사이에 얇은 빈 틈이 보였던 문제 수정. */}
                                            <rect x="0.8" y="0.6" width="433" height="401" fill="none" stroke="#1e293b" strokeWidth="1.4" pointerEvents="none" />
                                        </svg>
                                    ) : (
                                        <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
                                            필터 조건에 맞는 슛이 없습니다
                                        </div>
                                    )}
                                </div>

                                {/* ── 샷 데이터 테이블 — 차트와 동일하게 filteredShotEvents(현재 활성
                                    필터 반영) 기준 구역별 집계. 필터를 바꾸면 차트와 함께 갱신됨. */}
                                <div className="flex-1 min-w-0 p-4 flex flex-col gap-6">
                                <div>
                                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">구역별 기록</div>
                                    <div className="overflow-x-auto custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 text-sm">
                                            <thead>
                                                <tr>
                                                    <th className="px-3 py-2 uppercase whitespace-nowrap border-b border-slate-800 bg-slate-800 text-slate-500">구역</th>
                                                    <th className="px-3 py-2 uppercase whitespace-nowrap border-b border-slate-800 bg-slate-800 text-slate-500 text-right">FGM</th>
                                                    <th className="px-3 py-2 uppercase whitespace-nowrap border-b border-slate-800 bg-slate-800 text-slate-500 text-right">FGA</th>
                                                    <th className="px-3 py-2 uppercase whitespace-nowrap border-b border-slate-800 bg-slate-800 text-slate-500 text-right">FG%</th>
                                                    <th className="px-3 py-2 uppercase whitespace-nowrap border-b border-slate-800 bg-slate-800 text-slate-500 text-right">리그평균</th>
                                                    <th className="px-3 py-2 uppercase whitespace-nowrap border-b border-slate-800 bg-slate-800 text-slate-500 text-right">+/-</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredZoneBreakdown.map(z => {
                                                    const delta = z.a > 0 ? z.pct - z.avg : null;
                                                    return (
                                                        <tr key={z.key}>
                                                            <td className="px-3 py-1.5 whitespace-nowrap border-b border-slate-800/60 text-white font-medium">{z.label}</td>
                                                            <td className="px-3 py-1.5 whitespace-nowrap border-b border-slate-800/60 text-right text-slate-300">{z.a > 0 ? z.m : '-'}</td>
                                                            <td className="px-3 py-1.5 whitespace-nowrap border-b border-slate-800/60 text-right text-slate-300">{z.a > 0 ? z.a : '-'}</td>
                                                            <td className="px-3 py-1.5 whitespace-nowrap border-b border-slate-800/60 text-right text-white">{z.a > 0 ? `${(z.pct * 100).toFixed(1)}%` : '-'}</td>
                                                            <td className="px-3 py-1.5 whitespace-nowrap border-b border-slate-800/60 text-right text-slate-500">{(z.avg * 100).toFixed(1)}%</td>
                                                            <td className={`px-3 py-1.5 whitespace-nowrap border-b border-slate-800/60 text-right ${delta == null ? 'text-slate-600' : delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                {delta == null ? '-' : `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%p`}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot>
                                                <tr>
                                                    <td className="px-3 py-2 whitespace-nowrap border-t border-slate-700 text-white" style={{ backgroundColor: '#0f172a' }}>전체</td>
                                                    <td className="px-3 py-2 whitespace-nowrap border-t border-slate-700 text-right text-white" style={{ backgroundColor: '#0f172a' }}>{filteredShotTotals.m}</td>
                                                    <td className="px-3 py-2 whitespace-nowrap border-t border-slate-700 text-right text-white" style={{ backgroundColor: '#0f172a' }}>{filteredShotTotals.a}</td>
                                                    <td className="px-3 py-2 whitespace-nowrap border-t border-slate-700 text-right text-white" style={{ backgroundColor: '#0f172a' }}>{filteredShotTotals.a > 0 ? `${(filteredShotTotals.pct * 100).toFixed(1)}%` : '-'}</td>
                                                    <td className="border-t border-slate-700" style={{ backgroundColor: '#0f172a' }} />
                                                    <td className="border-t border-slate-700" style={{ backgroundColor: '#0f172a' }} />
                                                </tr>
                                                <tr>
                                                    <td className="px-3 py-1.5 whitespace-nowrap text-slate-400" style={{ backgroundColor: '#0f172a' }}>3점</td>
                                                    <td className="px-3 py-1.5 whitespace-nowrap text-right text-slate-300" style={{ backgroundColor: '#0f172a' }}>{filteredShotTotals.m3}</td>
                                                    <td className="px-3 py-1.5 whitespace-nowrap text-right text-slate-300" style={{ backgroundColor: '#0f172a' }}>{filteredShotTotals.a3}</td>
                                                    <td className="px-3 py-1.5 whitespace-nowrap text-right text-slate-300" style={{ backgroundColor: '#0f172a' }}>{filteredShotTotals.a3 > 0 ? `${(filteredShotTotals.pct3 * 100).toFixed(1)}%` : '-'}</td>
                                                    <td style={{ backgroundColor: '#0f172a' }} />
                                                    <td style={{ backgroundColor: '#0f172a' }} />
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>

                                <ShotBreakdownTable title="시간대별 기록" headerLabel="시간대" rows={filteredQuarterBreakdown} />
                                <ShotBreakdownTable title="슛 타입별 기록" headerLabel="타입" rows={filteredShotTypeBreakdown} />
                                <ShotBreakdownTable title="팀별 기록" headerLabel="팀" rows={filteredTeamBreakdown} />
                                </div>
                            </div>
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
