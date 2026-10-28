
import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { Player, PlayerStats, Team, Game } from '../types';
import { calculatePlayerOvr } from '../utils/constants';
import { getPositionStars } from '../utils/positionRating';
import { formatMoney } from '../utils/formatMoney';
import { computeCareerAvg, statsToCareerRow, buildTeamAdvCtx, isMultiTeamLabel, type TeamAdvCtx } from '../utils/careerStats';
import type { PlayerTeamSplits, PlayerTeamSplit } from '../hooks/usePlayerTeamSplits';
import { buildGameLogSplits } from '../utils/gameLogSplits';
import { getContractAav } from '../utils/contract';
import { TEAM_DATA } from '../data/teamData';
import { getTeamTheme } from '../utils/teamTheme';
import { getReadableTextColor } from '../utils/colorContrast';
import { OvrBadge } from '../components/common/OvrBadge';
import { Button } from '../components/common/Button';
import { IconButton } from '../components/common/IconButton';
import { TeamBadge } from '../components/common/TeamBadge';
import { TeamLogo } from '../components/common/TeamLogo';
import { StarRating } from '../components/common/StarRating';
import { Table, TableHead, TableBody, TableFoot, TableRow, TableHeaderCell, TableCell } from '../components/common/Table';
import { TabBar } from '../components/common/TabBar';
import { Dropdown } from '../components/common/Dropdown';
import { KeyValueRow } from '../components/common/KeyValueRow';
import { ConditionBar } from '../components/common/ConditionBar';
import { EmptyState } from '../components/common/EmptyState';
import { Spinner } from '../components/common/Spinner';
import { SegmentedControl } from '../components/common/SegmentedControl';
import { CheckOption, CheckOptionGroup } from '../components/common/filters/CheckOption';
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
import { CONTRACT_TYPE_LABEL } from '../utils/contractLabels';

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
    // [2026-10-26] 멀티 전용 — 시즌 중 이적한 선수의 팀별 누적. 2개 팀 이상이면 기록 탭에 2TM/3TM 요약행 + 팀별 서브행으로 나눠 보여준다.
    externalTeamSplits?: PlayerTeamSplits;
    // [2026-09-02] "수상 내역" 하단 "선수 이동 내역" 위젯 — 지정 시(현재 멀티플레이어만)에만
    // 렌더링되고, 미지정(싱글플레이어)이면 위젯 자체가 생략된다(externalGameLog와 동일한
    // "opt-in by presence" 패턴 — hideSections 방식과 달리 싱글에 아직 없는 데이터 소스라
    // 기본 숨김이 아니라 기본 미표시가 맞음). PlayerTransactionEntry: services/multi/
    // playerHistoryService.ts 참고.
    externalTransactionHistory?: { date: string | null; type: string; fromTeamAbbr: string | null; toTeamAbbr: string; draftRound?: number; draftPick?: number }[];
    // [2026-10-07] "뉴스" 탭 본문 — 지정 시(현재 멀티플레이어만)에만 탭이 노출되는 opt-in 슬롯.
    // 뉴스 데이터(league_events)가 멀티 전용이라 뷰는 렌더만 하고 조회는 호출부가 한다.
    newsSlot?: React.ReactNode;
    /** [2026-10-28] "퍼센타일" 탭 본문 — 지정 시(현재 멀티플레이어만)에만 탭이 노출되는 opt-in 슬롯(newsSlot과 같은 패턴).
     * 리그 전체 선수 스탯이 필요해 계산은 호출부가 한다(views/multi/season/PlayerPercentileTab.tsx). */
    percentileSlot?: React.ReactNode;
    /** [2026-10-17] 멀티 전용 — 선수 정보 "포지션 평점" 아래 "체력" 행. number = 표시, null = 공개 전 경기라 "경기 중",
     * undefined = 행 자체를 그리지 않음(싱글·데이터 로딩 전). */
    condition?: number | null;
}

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
    if (PCT_COLS.has(key)) return (Number(raw) * 100).toFixed(1);
    if (RATE_COLS.has(key)) return Number(raw).toFixed(1);
    if (key === 'season' || key === 'team') return String(raw);
    if (INT_COLS.has(key)) return String(Math.round(Number(raw)));
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
// 게임 로그 보기 방식 — Traditional(기본 박스) / Shooting(슈팅 상세) / Defense(수비 지표). 앞 3열(날짜·상대·결과)은 공통.
type GameLogMode = 'trad' | 'shooting' | 'defense';
const GAME_LOG_COMMON_COLS = [
    { key: 'date', label: 'DATE' }, { key: 'opp', label: 'OPP' }, { key: 'result', label: 'RESULT' },
];
const GAME_LOG_MODE_COLS: Record<GameLogMode, { key: string; label: string }[]> = {
    trad: [
        { key: 'gs', label: 'GS' }, { key: 'min', label: 'MIN' }, { key: 'pts', label: 'PTS' },
        { key: 'oreb', label: 'OREB' }, { key: 'dreb', label: 'DREB' }, { key: 'reb', label: 'TREB' },
        { key: 'ast', label: 'AST' }, { key: 'stl', label: 'STL' }, { key: 'blk', label: 'BLK' },
        { key: 'tov', label: 'TOV' }, { key: 'pf', label: 'PF' },
        { key: 'fgm', label: 'FGM' }, { key: 'fga', label: 'FGA' }, { key: 'fg%', label: 'FG%' },
        { key: '3pm', label: '3PM' }, { key: '3pa', label: '3PA' }, { key: '3p%', label: '3P%' },
        { key: 'ftm', label: 'FTM' }, { key: 'fta', label: 'FTA' }, { key: 'ft%', label: 'FT%' },
        { key: 'tf', label: 'TF' }, { key: 'ff', label: 'FF' },
    ],
    shooting: [
        { key: 'min', label: 'MIN' }, { key: 'pts', label: 'PTS' },
        { key: 'fgm', label: 'FGM' }, { key: 'fga', label: 'FGA' }, { key: 'fg%', label: 'FG%' },
        { key: '2pm', label: '2PM' }, { key: '2pa', label: '2PA' }, { key: '2p%', label: '2P%' },
        { key: '3pm', label: '3PM' }, { key: '3pa', label: '3PA' }, { key: '3p%', label: '3P%' },
        { key: 'ftm', label: 'FTM' }, { key: 'fta', label: 'FTA' }, { key: 'ft%', label: 'FT%' },
        { key: 'efg%', label: 'eFG%' }, { key: 'ts%', label: 'TS%' },
        { key: '3par', label: '3PAr' }, { key: 'ftr', label: 'FTr' },
    ],
    defense: [
        { key: 'min', label: 'MIN' },
        { key: 'stl', label: 'STL' }, { key: 'blk', label: 'BLK' }, { key: 'ftov', label: 'TOVF' },
        { key: 'dreb', label: 'DREB' }, { key: 'pf', label: 'PF' },
        { key: 'cont', label: 'CONT' }, { key: 'dfgm', label: 'DFGM' }, { key: 'dfg%', label: 'DFG%' },
        { key: 'ra', label: 'RA' }, { key: 'itp', label: 'ITP' }, { key: 'mid6', label: 'MID' },
        { key: 'cnr', label: 'CNR' }, { key: 'wing', label: 'WING' }, { key: 'atb', label: 'ATB' },
    ],
};
const gameLogCols = (mode: GameLogMode) => [...GAME_LOG_COMMON_COLS, ...GAME_LOG_MODE_COLS[mode]];

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

// ── Section Header(기록·최근 경기 등 탭 본문 구획 제목 + 우측 컨트롤 슬롯) ──
const SectionHeader: React.FC<{ title: string; className?: string; style?: React.CSSProperties; children?: React.ReactNode }> = ({ title, className, style, children }) => (
    <div className={`px-6 py-3 flex items-center justify-between${className ? ` ${className}` : ''}`} style={style}>
        <span className="text-base font-black text-white">{title}</span>
        {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
);

// ── 프로필 탭 좌/중앙 열의 섹션 블록(제목 + kv 행 묶음). 11개 섹션이 같은 래퍼·제목 클래스를 복붙하던 것. [2026-10-13]
// 열의 첫 섹션은 위 구분선이 없으므로 `first`.
const ProfileSection: React.FC<{ title: string; first?: boolean; children: React.ReactNode }> = ({ title, first = false, children }) => (
    <div className={`px-4 py-3 space-y-1 ${first ? '' : 'border-t border-slate-800'}`}>
        <div className="text-base font-bold text-white mb-1.5">{title}</div>
        {children}
    </div>
);

const toOrdinal = (n: number) => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
/** Set 필터 토글 — 있으면 빼고 없으면 넣은 새 Set */
function toggleInSet<T>(prev: Set<T>, v: T): Set<T> {
    const next = new Set(prev);
    if (next.has(v)) next.delete(v); else next.add(v);
    return next;
}
const fgPctText = (m: number, a: number, pct: number) => (a > 0 ? `${(pct * 100).toFixed(1)}%` : '-');

// ── 샷 차트 우측 "OO별 기록" 테이블 공용 — 구역별(리그평균/+- 열·합계 푸터 포함)/시간대별/슛 타입별/팀별 4곳.
// [2026-10-13] raw <table> → 공용 Table(bare). 구역별 표도 showLeagueAvg/footer 옵션으로 흡수.
type ShotBreakdownRow = { key: string; label: string; m: number; a: number; pct: number; avg?: number };
type ShotBreakdownFooterRow = { label: string; m: number; a: number; pct: number; emphasis?: boolean };
const ShotBreakdownTable: React.FC<{
    title: string;
    headerLabel: string;
    rows: ShotBreakdownRow[];
    /** 리그평균 · +/- 두 열 추가(rows[].avg 필요) */
    showLeagueAvg?: boolean;
    footer?: ShotBreakdownFooterRow[];
}> = ({ title, headerLabel, rows, showLeagueAvg = false, footer }) => (
    <div>
        <div className="text-xs text-slate-500 mb-2">{title}</div>
        <Table variant="bare" dividers={false} className="text-sm">
            <TableHead>
                <TableHeaderCell align="left">{headerLabel}</TableHeaderCell>
                <TableHeaderCell align="right">FGM</TableHeaderCell>
                <TableHeaderCell align="right">FGA</TableHeaderCell>
                <TableHeaderCell align="right">FG%</TableHeaderCell>
                {showLeagueAvg && <TableHeaderCell align="right">리그평균</TableHeaderCell>}
                {showLeagueAvg && <TableHeaderCell align="right">+/-</TableHeaderCell>}
            </TableHead>
            <TableBody>
                {rows.map(r => {
                    const delta = showLeagueAvg && r.a > 0 && r.avg != null ? r.pct - r.avg : null;
                    return (
                        <TableRow key={r.key}>
                            <TableCell align="left" className="text-white font-medium">{r.label}</TableCell>
                            <TableCell align="right" className="text-slate-200 tabular-nums">{r.a > 0 ? r.m : '-'}</TableCell>
                            <TableCell align="right" className="text-slate-200 tabular-nums">{r.a > 0 ? r.a : '-'}</TableCell>
                            <TableCell align="right" className="text-white tabular-nums">{fgPctText(r.m, r.a, r.pct)}</TableCell>
                            {showLeagueAvg && <TableCell align="right" className="text-slate-500 tabular-nums">{((r.avg ?? 0) * 100).toFixed(1)}%</TableCell>}
                            {showLeagueAvg && (
                                <TableCell align="right" className={`tabular-nums ${delta == null ? 'text-slate-600' : delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {delta == null ? '-' : `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%p`}
                                </TableCell>
                            )}
                        </TableRow>
                    );
                })}
            </TableBody>
            {footer && footer.length > 0 && (
                <TableFoot>
                    {footer.map(f => (
                        <tr key={f.label}>
                            <TableCell align="left" className={f.emphasis ? 'text-white' : 'text-slate-400'}>{f.label}</TableCell>
                            <TableCell align="right" className={`tabular-nums ${f.emphasis ? 'text-white' : 'text-slate-200'}`}>{f.m}</TableCell>
                            <TableCell align="right" className={`tabular-nums ${f.emphasis ? 'text-white' : 'text-slate-200'}`}>{f.a}</TableCell>
                            <TableCell align="right" className={`tabular-nums ${f.emphasis ? 'text-white' : 'text-slate-200'}`}>{fgPctText(f.m, f.a, f.pct)}</TableCell>
                            {showLeagueAvg && <TableCell />}
                            {showLeagueAvg && <TableCell />}
                        </tr>
                    ))}
                </TableFoot>
            )}
        </Table>
    </div>
);

// ── Game log cell builder ──
function buildGameLogCells(g: any, mode: GameLogMode, avg = false): { val: string; color?: string }[] {
    const dateStr = g.date ? `${parseInt(g.date.split('-')[1])}/${parseInt(g.date.split('-')[2])}` : '-';
    const oppLabel = g.isHome ? g.opponentId?.toUpperCase() : `@${g.opponentId?.toUpperCase()}`;
    const won = g.teamScore > g.opponentScore;
    const resultStr = `${won ? 'W' : 'L'} ${g.teamScore}-${g.opponentScore}`;
    const common = [
        { val: dateStr },
        { val: oppLabel },
        { val: resultStr, color: won ? 'text-emerald-400' : 'text-red-400' },
    ];
    const n = (k: string) => Number(g[k]) || 0;
    // avg=true는 합계행/평균행용 — 개수형 스탯을 소수 1자리로
    const fv = (v: number) => (avg ? v.toFixed(1) : String(v));
    const f = (k: string) => fv(n(k));
    const has = (k: string) => g[k] != null;
    const pctS = (m: number, a: number) => (a > 0 ? (m / a * 100).toFixed(1) + '%' : '-');
    // 예전 경기엔 없을 수 있는 필드는 비어 있으면 '-'
    const cnt = (k: string) => (has(k) ? f(k) : '-');
    const min = { val: avg ? n('mp').toFixed(1) : String(Math.round(n('mp'))) };

    if (mode === 'shooting') {
        const fg2m = n('fgm') - n('p3m'), fg2a = n('fga') - n('p3a');
        const tsa = n('fga') + 0.44 * n('fta');
        return [...common, min,
            { val: f('pts') },
            { val: f('fgm') }, { val: f('fga') }, { val: pctS(n('fgm'), n('fga')) },
            { val: fv(fg2m) }, { val: fv(fg2a) }, { val: pctS(fg2m, fg2a) },
            { val: f('p3m') }, { val: f('p3a') }, { val: pctS(n('p3m'), n('p3a')) },
            { val: f('ftm') }, { val: f('fta') }, { val: pctS(n('ftm'), n('fta')) },
            { val: n('fga') > 0 ? ((n('fgm') + 0.5 * n('p3m')) / n('fga') * 100).toFixed(1) + '%' : '-' },
            { val: tsa > 0 ? (n('pts') / (2 * tsa) * 100).toFixed(1) + '%' : '-' },
            { val: n('fga') > 0 ? (n('p3a') / n('fga') * 100).toFixed(1) + '%' : '-' },
            { val: n('fga') > 0 ? (n('fta') / n('fga') * 100).toFixed(1) + '%' : '-' },
        ];
    }

    if (mode === 'defense') {
        // 구역 수비: "상대 성공/내가 수비한 시도". 기록이 없는 경기는 '-'
        const zone = (z: string) => (has(`def${z}Attempted`) ? `${f(`def${z}Made`)}/${f(`def${z}Attempted`)}` : '-');
        return [...common, min,
            { val: f('stl') }, { val: f('blk') }, { val: cnt('tovForced') },
            { val: f('defReb') }, { val: f('pf') },
            { val: cnt('contestedAttempted') }, { val: cnt('contestedMade') },
            { val: has('contestedAttempted') ? pctS(n('contestedMade'), n('contestedAttempted')) : '-' },
            { val: zone('RA') }, { val: zone('ITP') }, { val: zone('MID') },
            { val: zone('CNR') }, { val: zone('WING') }, { val: zone('ATB') },
        ];
    }

    return [...common,
        { val: avg ? '-' : has('gs') ? (n('gs') > 0 ? '1' : '0') : '-' },
        min,
        { val: f('pts') },
        { val: f('offReb') }, { val: f('defReb') }, { val: f('reb') },
        { val: f('ast') }, { val: f('stl') }, { val: f('blk') },
        { val: f('tov') }, { val: f('pf') },
        { val: f('fgm') }, { val: f('fga') }, { val: pctS(n('fgm'), n('fga')) },
        { val: f('p3m') }, { val: f('p3a') }, { val: pctS(n('p3m'), n('p3a')) },
        { val: f('ftm') }, { val: f('fta') }, { val: pctS(n('ftm'), n('fta')) },
        { val: f('techFouls') }, { val: f('flagrantFouls') },
    ];
}

const GAME_LOG_SUMMARY_KEYS = ['mp', 'gs', 'pts', 'fgm', 'fga', 'p3m', 'p3a', 'ftm', 'fta', 'offReb', 'defReb', 'reb', 'ast', 'stl', 'blk', 'tov', 'pf',
    'techFouls', 'flagrantFouls', 'tovForced', 'contestedAttempted', 'contestedMade',
    ...['RA', 'ITP', 'MID', 'CNR', 'WING', 'ATB'].flatMap(z => [`def${z}Attempted`, `def${z}Made`])];

/** 게임 로그 하단 합계/평균 행. 개수형은 합(평균은 경기 수로 나눔), 슈팅%는 합계로 다시 계산(경기 평균의 평균이 아님). */
function buildGameLogSummaryCells(gameLog: any[], mode: GameLogMode, kind: 'total' | 'avg'): { val: string; color?: string }[] {
    const gp = gameLog.length;
    const synth: Record<string, any> = { date: null, opponentId: '', teamScore: 0, opponentScore: 0 };
    for (const k of GAME_LOG_SUMMARY_KEYS) {
        if (!gameLog.some(r => r[k] != null)) continue; // 예전 경기에 없던 필드는 '-' 유지
        const sum = gameLog.reduce((t, r) => t + (Number(r[k]) || 0), 0);
        synth[k] = kind === 'avg' ? sum / gp : sum;
    }
    const cells = buildGameLogCells(synth, mode, kind === 'avg');
    const wins = gameLog.filter(r => r.teamScore > r.opponentScore).length;
    // Traditional의 GS 열(공통 3열 바로 뒤)은 합계 행에선 선발 경기 수, 평균 행에선 '-'
    if (mode === 'trad' && synth.gs != null) cells[3] = { val: kind === 'total' ? String(synth.gs) : '-' };
    cells[0] = { val: kind === 'total' ? '합계' : '평균' };
    cells[1] = { val: `${gp}경기` };
    cells[2] = { val: `${wins}승 ${gp - wins}패` };
    return cells;
}

const GAME_LOG_HEADER_HEIGHT = 32; // TableHead(compact) 기본 행 높이 h-8
const GAME_LOG_FOOTER_ROWS = 2; // 합계 + 평균
const ROW_HEIGHT = 36; // text-sm(20px 라인하이트) + py-2(16px) — text-xs(32px)에서 상향
const OVERSCAN = 5;

// 지그재그 행 배경 — 홀수 행만 살짝 밝게
const ZEBRA_ROW_STYLE: React.CSSProperties = { backgroundColor: 'rgba(255,255,255,0.02)' };

// ── 게임 로그 탭의 스플릿 표 — 정규시즌 경기를 홈/원정·승/패·월별·상대팀별·최근 N경기로 나눈 평균 ──
/** 스플릿 한 줄의 셀 — 게임 로그의 평균 행과 같은 계산·열(보기 방식별). GS는 평균이 아니라 선발 수. 경기가 없으면 구분만 채운다. */
function buildSplitCells(line: { label: string; games: any[]; gp: number; w: number; l: number }, mode: GameLogMode): string[] {
    if (line.gp === 0) return [line.label, ...Array(2 + GAME_LOG_MODE_COLS[mode].length).fill('')];
    const cells = buildGameLogSummaryCells(line.games, mode, 'avg').slice(3).map(c => c.val);
    if (mode === 'trad') cells[0] = String(line.games.filter(g => Number(g.gs) > 0).length);
    return [line.label, String(line.gp), `${line.w}-${line.l}`, ...cells];
}

const GameLogSplitsTable: React.FC<{ gameLog: any[] | undefined; opponentIds?: string[] }> = React.memo(({ gameLog, opponentIds }) => {
    const [mode, setMode] = useState<GameLogMode>('trad');
    const groups = useMemo(() => buildGameLogSplits(gameLog, opponentIds), [gameLog, opponentIds]);
    const headers = useMemo(() => ['구분', 'G', 'W-L', ...GAME_LOG_MODE_COLS[mode].map(c => c.label)], [mode]);
    if (groups.length === 0) return <EmptyState title="스플릿을 계산할 정규시즌 경기가 없습니다" />;
    let zebra = -1; // 그룹과 상관없이 데이터 행 전체에 지그재그(커리어 표와 동일 방식)
    return (
        <div className="flex flex-col h-full min-h-0">
            <SectionHeader title="스플릿" className="bg-slate-900">
                <SegmentedControl<GameLogMode>
                    size="sm"
                    aria-label="스플릿 보기"
                    value={mode}
                    onChange={setMode}
                    options={[
                        { value: 'trad', label: 'Traditional' },
                        { value: 'shooting', label: 'Shooting' },
                        { value: 'defense', label: 'Defense' },
                    ]}
                />
            </SectionHeader>
            {/* 표 영역이 스스로 스크롤(남은 높이를 채움) → 헤더 행이 위에 고정된다 */}
            <Table variant="bare" density="compact" className="text-sm flex-1 min-h-0 !overflow-auto custom-scrollbar">
                <TableHead className="sticky top-0 z-40">
                    {headers.map((label, i) => (
                        <TableHeaderCell key={label} align="left" stickyLeft={i === 0 ? 0 : undefined}>{label}</TableHeaderCell>
                    ))}
                </TableHead>
                <TableBody>
                    {groups.map(grp => (
                        <React.Fragment key={grp.title}>
                            {/* 그룹 제목 행 — 커리어 표와 같은 공용 TableRow/TableCell, 배경만 헤더 톤으로 구분 */}
                            <TableRow className="hover:!bg-transparent">
                                <TableCell align="left" colSpan={headers.length} className="font-bold text-slate-400 bg-slate-800/40">{grp.title}</TableCell>
                            </TableRow>
                            {grp.lines.map(line => {
                                zebra++;
                                return (
                                    <TableRow key={line.label} style={zebra % 2 !== 0 ? ZEBRA_ROW_STYLE : undefined}>
                                        {buildSplitCells(line, mode).map((val, ci) => (
                                            <TableCell key={ci} align="left" stickyLeft={ci === 0 ? 0 : undefined}
                                                className={`tabular-nums ${ci === 0 ? 'font-bold text-slate-300' : ''}`}>
                                                {val}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                );
                            })}
                        </React.Fragment>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
});


const VirtualGameLog: React.FC<{ gameLog: any[] | undefined; gameLogLoading: boolean; teamId?: string; mode: GameLogMode; onGameClick?: (gameId: string) => void }> = React.memo(({ gameLog, gameLogLoading, teamId, mode, onGameClick }) => {
    const cols = useMemo(() => gameLogCols(mode), [mode]);
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
        return gameLog.map((g: any) => buildGameLogCells(g, mode));
    }, [gameLog, mode]);

    const totalRows = processedRows.length;
    const headerHeight = GAME_LOG_HEADER_HEIGHT; // thead height (compact 기본 헤더 행 h-8)
    const totalHeight = headerHeight + totalRows * ROW_HEIGHT + GAME_LOG_FOOTER_ROWS * ROW_HEIGHT;
    const footerRows = useMemo(
        () => (gameLog && gameLog.length > 0 ? [buildGameLogSummaryCells(gameLog, mode, 'total'), buildGameLogSummaryCells(gameLog, mode, 'avg')] : []),
        [gameLog, mode],
    );

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
                {gameLogLoading && teamId && <Spinner variant="section" />}
                {!gameLogLoading && (!gameLog || gameLog.length === 0) && (
                    <EmptyState padding="sm" title="경기 기록이 없습니다" />
                )}
                {totalRows > 0 && (
                    <div style={{ height: totalHeight, position: 'relative' }}>
                        {/* compact 밀도 + 행 높이 ROW_HEIGHT 고정(가상 스크롤 오프셋 계산과 일치). 첫 열 헤더만 가로 스크롤 고정.
                            text-sm: 셀이 글자 크기를 지정하지 않아 페이지 기본 16px을 상속하던 것(ROW_HEIGHT 36은 14px/20px 기준). */}
                        <Table variant="bare" density="compact" className="text-sm">
                            {/* 커리어·스플릿 표와 같은 기본 헤더 행(TableHead가 행·글자색·굵기를 제공), 왼쪽 정렬 */}
                            <TableHead className="sticky top-0 z-40">
                                {cols.map((c, i) => (
                                    <TableHeaderCell key={c.key} align="left" stickyLeft={i === 0 ? 0 : undefined}>
                                        {c.label}
                                    </TableHeaderCell>
                                ))}
                            </TableHead>
                            <TableBody>
                                {/* top spacer */}
                                {startIdx > 0 && (
                                    <tr><td colSpan={cols.length} style={{ height: startIdx * ROW_HEIGHT, padding: 0, border: 'none' }} /></tr>
                                )}
                                {processedRows.slice(startIdx, endIdx).map((cells, vi) => {
                                    const rowGameId = gameLog?.[startIdx + vi]?.gameId as string | undefined;
                                    return (
                                    <TableRow key={startIdx + vi} className="transition-colors" style={{ height: ROW_HEIGHT, ...((startIdx + vi) % 2 !== 0 ? ZEBRA_ROW_STYLE : undefined) }}>
                                        {cells.map((cell, ci) => {
                                            const isResultCell = ci === 2;
                                            const clickable = isResultCell && !!onGameClick && !!rowGameId;
                                            return (
                                            <TableCell key={ci} align="left" className="tabular-nums">
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
                                            </TableCell>
                                            );
                                        })}
                                    </TableRow>
                                    );
                                })}
                                {/* bottom spacer */}
                                {endIdx < totalRows && (
                                    <tr><td colSpan={cols.length} style={{ height: (totalRows - endIdx) * ROW_HEIGHT, padding: 0, border: 'none' }} /></tr>
                                )}
                            </TableBody>
                            <TableFoot>
                                {footerRows.map((cells, fi) => (
                                    <tr key={fi} style={{ height: ROW_HEIGHT }}>
                                        {cells.map((cell, ci) => (
                                            <TableCell
                                                key={ci}
                                                align="left"
                                                stickyLeft={ci === 0 ? 0 : undefined}
                                                className={`text-white tabular-nums ${ci === 0 ? 'font-bold' : ''} ${fi === 0 ? 'border-t border-t-slate-700' : ''}`}
                                            >
                                                {cell.val}
                                            </TableCell>
                                        ))}
                                    </tr>
                                ))}
                            </TableFoot>
                        </Table>
                    </div>
                )}
            </div>
        </div>
    );
});

/**
 * [2026-10-26] 이번 시즌(시뮬) 기록 행을 만든다. 팀별 분할이 2개 이상이면 'nTM' 요약행(시즌 전체 합) 뒤에
 * 팀별 서브행을 붙인다 — 커리어 기록의 이적 시즌 표시와 같은 형태라 computeCareerAvg가 서브행만 집계한다.
 * 분할이 1개면 그 팀 약어로 한 줄, 분할 정보가 없으면(싱글·로딩 전) 기존 단일 행 그대로.
 * 요약행/서브행은 팀 맥락(ctx)이 없어 USG%·AST% 등 팀 비중 지표는 비운다(기존 ctx는 현재 소속팀 기준이라 이적 선수에겐 틀림).
 */
function expandTeamSplitRows(
    baseRow: Record<string, any> | null,
    splits: PlayerTeamSplit[] | undefined,
    totalStats: PlayerStats | undefined,
    season: string,
    age: number,
    playoff: boolean,
): Record<string, any>[] {
    if (!baseRow) return [];
    if (!splits || splits.length === 0 || !totalStats) return [baseRow];
    if (splits.length === 1) return [{ ...baseRow, team: splits[0].teamId.toUpperCase() }];
    const summary = statsToCareerRow(totalStats, season, `${splits.length}TM`, age, playoff);
    const subs = splits.map(sp => statsToCareerRow(sp.stats, season, sp.teamId.toUpperCase(), age, playoff));
    return [summary, ...subs];
}

export const PlayerDetailView: React.FC<PlayerDetailViewProps> = ({ player: playerProp, teamName: teamNameProp, teamId: teamIdProp, allTeams, schedule, tendencySeed, seasonShort = '2025-26', myTeamId, onBack, onNegotiate, onExtension, onRelease, onSelectPlayer, hideSections, externalGameLog, externalGameLogLoading, externalShotEvents, externalTeamSplits, externalTransactionHistory, onGameClick, newsSlot, percentileSlot, condition }) => {
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

    const sortedTeams = useMemo(() =>
        [...(allTeams ?? [])].sort((a, b) => (a.id ?? '').localeCompare(b.id ?? '')),
    [allTeams]);

    const currentTeam = useMemo(() => allTeams?.find(t => t.id === teamId), [allTeams, teamId]);

    const currentTeamRoster = useMemo(() => {
        const team = allTeams?.find(t => t.id === teamId);
        if (!team) return [];
        return [...team.roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
    }, [teamId, allTeams]);

    // 멀티플레이어 팀 설정 커스텀 컬러(currentTeam.colorPrimary) 우선 — 없으면 TEAM_DATA 폴백.
    // RosterView.tsx와 동일한 패턴(THEME_OVERRIDES 오적용 방지 위해 커스텀 컬러일 땐 teamId=null).
    const teamColors = currentTeam?.colorPrimary
        ? {
            primary: currentTeam.colorPrimary,
            secondary: currentTeam.colorSecondary || '#64748b',
            text: currentTeam.colorText || getReadableTextColor(currentTeam.colorPrimary),
          }
        : (teamId ? (TEAM_DATA[teamId]?.colors || null) : null);
    const theme = getTeamTheme(currentTeam?.colorPrimary ? null : (teamId || null), teamColors);
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
    // (ALL_NBA_1~3 통합)/올-디펜시브(ALL_DEF_1~2 통합)/ROY/6MOY(SMOY 표기 통합)/올스타 8종,
    // 카테고리당 1개 배지 + count. ROY/6MOY는 runAwardVoting에 아직 없어 시뮬 실시간
    // 스탬프(player.awards)로는 절대 안 나오고, career_history(BRef 임포트, 올타임 레전드용)
    // 원본에 코드가 있을 때만 노출됨.
    // [2026-09-09] 올스타 — 서버가 로스터 확정 시 league_player_awards(award_type='ALL_STAR')에
    // 영구 저장하고, MultiPlayerDetailView.tsx가 usePlayerAllStarAwards()로 조회해
    // player.awards에 합쳐준다(이 컴포넌트는 그 결과를 그대로 소비 — 재계산 없음).
    const headerAwardBadges = useMemo(() => {
        // MVP/DPOY/ROY는 수상자만(rank 1 또는 rank 없음) — 후보(2위 이하)는 헤더에 안 보여줌.
        const winnersOnly = allAwards.filter((a: any) => {
            if (a.type === 'MVP' || a.type === 'DPOY' || a.type === 'ROY') return a.rank === 1 || a.rank == null;
            return true;
        });
        const bySeasons: Record<string, string[]> = { CHAMPION: [], MVP: [], DPOY: [], ALL_LEAGUE: [], ALL_DEF: [], ROY: [], SIXTH_MAN: [], ALL_STAR: [] };
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
            else if (a.type === 'ALL_STAR') bySeasons.ALL_STAR.push(a.season);
        }
        const CATEGORY_META: { key: string; label: string; color: string; bg: string }[] = [
            { key: 'CHAMPION',   label: 'CHAMP',       color: 'text-amber-400',   bg: 'bg-amber-400/15' },
            { key: 'MVP',        label: 'MVP',         color: 'text-yellow-400',  bg: 'bg-yellow-400/15' },
            { key: 'DPOY',       label: 'DPOY',        color: 'text-blue-400',    bg: 'bg-blue-400/15' },
            { key: 'ALL_LEAGUE', label: 'ALL-OFF',     color: 'text-indigo-400',  bg: 'bg-indigo-400/15' },
            { key: 'ALL_DEF',    label: 'ALL-DEF',     color: 'text-emerald-400', bg: 'bg-emerald-400/15' },
            { key: 'ROY',        label: 'ROY',         color: 'text-cyan-400',    bg: 'bg-cyan-400/15' },
            { key: 'SIXTH_MAN',  label: '6MOY',        color: 'text-orange-400',  bg: 'bg-orange-400/15' },
            { key: 'ALL_STAR',   label: 'ALL-STAR',    color: 'text-sky-400',     bg: 'bg-sky-400/15' },
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

    // 포지션 내 백분위 → 별점 (0.5~5.0). [2026-10-14] 로스터 탭 "포지션 레이팅" 열과 같은 헬퍼(utils/ovrUtils getPositionStars).
    const positionStars = useMemo(() => {
        if (!allTeams) return null;
        return getPositionStars(player, allTeams.flatMap(t => t.roster), calculatedOvr);
    }, [player, allTeams, calculatedOvr]);

    const { data: internalGameLog, isLoading: internalGameLogLoading } = usePlayerGameLog(player.id, teamId);
    const gameLog        = externalGameLog !== undefined ? externalGameLog         : internalGameLog;
    const gameLogLoading = externalGameLogLoading !== undefined ? externalGameLogLoading  : internalGameLogLoading;
    // 게임 로그 탭 시즌 선택 — 세션에서 경기를 치른 시즌만 고를 수 있다. 행에 season이 없으면(멀티: 단일 시즌 방) 현재 시즌으로 본다.
    const [gameLogSeason, setGameLogSeason] = useState<string | null>(null);
    const [gameLogMode, setGameLogMode] = useState<GameLogMode>('trad');
    const rowSeason = useCallback((r: any): string => shortenSeasonLabel(r?.season ?? seasonShort), [seasonShort]);
    const gameLogSeasons = useMemo(() => {
        const set = new Set<string>([seasonShort, ...(gameLog ?? []).map(rowSeason)]);
        return [...set].sort((a, b) => b.localeCompare(a));
    }, [gameLog, rowSeason, seasonShort]);
    const selectedGameLogSeason = gameLogSeason && gameLogSeasons.includes(gameLogSeason) ? gameLogSeason : seasonShort;
    const seasonGameLog = useMemo(() => (gameLog ?? []).filter(r => rowSeason(r) === selectedGameLogSeason), [gameLog, rowSeason, selectedGameLogSeason]);
    // 스플릿은 현재 시즌 경기만(과거 시즌이 섞이지 않게)
    const currentSeasonGameLog = useMemo(() => (gameLog ?? []).filter(r => rowSeason(r) === seasonShort), [gameLog, rowSeason, seasonShort]);
    // 스플릿 "상대팀별"에 빈 줄까지 채울 리그 전체 팀(현재 소속팀 제외). allTeams가 없으면 상대한 팀만 나온다.
    const splitOpponentIds = useMemo(
        () => allTeams?.map(t => t.id).filter(id => id.toLowerCase() !== (teamId ?? '').toLowerCase()),
        [allTeams, teamId],
    );

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
    // 'records'는 기록 탭을 커리어/게임 로그로 나누기 전 링크 호환용 — 커리어로 연다.
    const activeTab: 'profile' | 'career' | 'gamelog' | 'splits' | 'shotchart' | 'percentile' | 'news' =
        tabParam === 'records' ? 'career' :
        tabParam === 'career' || tabParam === 'gamelog' || tabParam === 'splits' || tabParam === 'shotchart' || (tabParam === 'percentile' && percentileSlot !== undefined) || (tabParam === 'news' && newsSlot !== undefined) ? tabParam : 'profile';
    const setActiveTab = useCallback((tab: string) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (tab === 'career' || tab === 'gamelog' || tab === 'splits' || tab === 'shotchart' || tab === 'percentile' || tab === 'news') next.set('tab', tab);
            else next.delete('tab');
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    // 현재 시뮬 시즌 팀 약어 (teamId uppercase, 없으면 '—')
    const simTeamAbbr = (teamId ?? '').toUpperCase() || '—';

    // schedule에서 팀 컨텍스트 계산 (advanced rate stats용)
    const teamAdvCtx = useMemo(
        (): TeamAdvCtx | undefined => buildTeamAdvCtx(allTeams, teamId, schedule),
        [allTeams, teamId, schedule],
    );

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
        const simRows = expandTeamSplitRows(simRegularRow, externalTeamSplits?.regular, player.stats, seasonShort, player.age, false);
        return [...simRows, ...historical];
    }, [player.career_history, player.stats, player.age, simRegularRow, seasonShort, externalTeamSplits]);

    // 헤더 "커리어" 스탯 라인 — career_history가 없는 선수(멀티플레이어)는 careerRegular에
    // 이번 시즌 한 행만 있어 "시즌" 줄과 값이 같아짐(멀티는 다중 시즌 이력이 없어 자연스러운 폴백).
    const headerCareerAvg = useMemo(() => {
        const avg = computeCareerAvg(careerRegular, '커리어');
        return avg.gp ? avg : null;
    }, [careerRegular]);

    const careerPlayoff = useMemo(() => {
        const historical = (player.career_history ?? []).filter(r => r.playoff && r.season !== seasonShort);
        const simRows = expandTeamSplitRows(simPlayoffRow, externalTeamSplits?.playoff, player.playoffStats, seasonShort, player.age, true);
        return [...simRows, ...historical];
    }, [player.career_history, player.playoffStats, player.age, simPlayoffRow, seasonShort, externalTeamSplits]);

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
                <IconButton
                    label="뒤로"
                    tone="inherit"
                    shape="md"
                    onClick={onBack}
                    className="bg-black/30 hover:bg-black/50 text-slate-200"
                >
                    <ArrowLeft size={14} />
                </IconButton>

                {/* [2026-09-03] "FA 선수 프로필은 브레드크럼을 숨겨달라" 요청 — teamId가 없으면
                    (FA) 팀/선수 드롭다운 트레일 자체가 의미가 없다("FA ▾"를 눌러도 갈 곳이
                    없는 죽은 드롭다운이 됨). 뒤로가기 버튼은 유지하고, 이름은 프로필 헤더에
                    이미 크게 나오니 브레드크럼 자리에는 굳이 다시 안 보여준다. */}
                {teamId && (
                    <>
                        {/* 팀 드롭다운 — 공용 Dropdown(포탈·바깥 클릭 닫기 내장). 항목을 고르면 그 팀 OVR 1위 선수로 이동. */}
                        {(() => {
                            const teamTrigger = (
                                <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-black/20 hover:bg-black/40 text-white transition-colors">
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
                            );
                            if (!allTeams) return teamTrigger;
                            return (
                                <Dropdown
                                    align="left"
                                    width="w-56"
                                    trigger={teamTrigger}
                                    items={sortedTeams.map(t => ({
                                        id: t.id,
                                        active: t.id === teamId,
                                        label: (
                                            <span className="flex items-center gap-2 min-w-0 text-sm">
                                                <TeamBadge teamId={t.id} abbr={t.abbr} colorPrimary={t.colorPrimary} colorSecondary={t.colorSecondary} size="xs" />
                                                <span className="truncate">{t.name}</span>
                                            </span>
                                        ),
                                        onClick: () => {
                                            const roster = [...(t.roster ?? [])].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
                                            if (roster.length > 0) {
                                                if (onSelectPlayer) onSelectPlayer(roster[0].id);
                                                else { setPlayer(roster[0]); setTeamId(t.id); }
                                            }
                                        },
                                    }))}
                                />
                            );
                        })()}

                        <span className="text-white/30 text-sm mx-1">›</span>

                        {/* 선수 드롭다운 — 같은 팀 로스터(OVR 내림차순) */}
                        {(() => {
                            const hasRoster = currentTeamRoster.length > 1;
                            const playerTrigger = (
                                <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-black/20 hover:bg-black/40 text-white transition-colors max-w-[180px]">
                                    <span className="text-sm font-bold truncate">{player.name}</span>
                                    {hasRoster && <ChevronDown size={11} className="opacity-60 shrink-0" />}
                                </button>
                            );
                            if (!hasRoster) return <div className="min-w-0">{playerTrigger}</div>;
                            return (
                                <Dropdown
                                    align="left"
                                    width="w-60"
                                    className="min-w-0"
                                    trigger={playerTrigger}
                                    items={currentTeamRoster.map(p => ({
                                        id: p.id,
                                        active: p.id === player.id,
                                        label: (
                                            <span className="flex items-center gap-2 min-w-0 text-sm">
                                                <OvrBadge value={calculatePlayerOvr(p)} size="sm" />
                                                <span className="truncate">{p.name}</span>
                                                <span className="text-slate-500 shrink-0">{p.position}</span>
                                            </span>
                                        ),
                                        onClick: () => {
                                            if (onSelectPlayer) onSelectPlayer(p.id);
                                            else setPlayer(p);
                                        },
                                    }))}
                                />
                            );
                        })()}
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
                    // 큰 로고 자리는 TeamLogo 공용(public/logos/teams/, 리그 로고 1회 폴백).
                    <TeamLogo teamId={teamId} teamName={currentTeam?.abbr ?? teamId} size="custom" className="self-stretch !h-auto w-24 shrink-0" />
                )}
                <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <OvrBadge value={calculatedOvr} size="header" className="shrink-0" />
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
                        <span>{player.contract ? formatMoney(player.salary) : '-'}</span>
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
                            <th className="border-r border-slate-800 pr-3 pb-1" />
                            {HEADER_STAT_KEYS.map(sk => (
                                <th key={sk.key} className="text-right font-normal text-slate-400 px-3 pb-1">{sk.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {([
                            { label: `${shortenSeasonLabel(seasonShort)} 시즌`, row: simRegularRow },
                            { label: '커리어', row: headerCareerAvg },
                        ] as { label: string; row: Record<string, any> | null }[]).map(({ label, row }) => (
                            <tr key={label}>
                                <td className="text-left text-slate-500 border-r border-slate-800 pr-3 py-1">{label}</td>
                                {HEADER_STAT_KEYS.map(sk => (
                                    <td key={sk.key} className="text-right text-white px-3 py-1 tabular-nums">{formatHeaderStat(sk.key, row)}</td>
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
                    { id: 'career', label: '커리어' },
                    { id: 'gamelog', label: '게임 로그' },
                    { id: 'splits', label: '스플릿' },
                    { id: 'shotchart', label: '샷 차트' },
                    ...(percentileSlot !== undefined ? [{ id: 'percentile', label: '퍼센타일' }] : []),
                    ...(newsSlot !== undefined ? [{ id: 'news', label: '뉴스' }] : []),
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
                                <ProfileSection title="선수 정보" first>
                                    {[
                                        { label: '팀', value: teamId ? <span className="flex items-center gap-1"><TeamBadge teamId={teamId} abbr={currentTeam?.abbr} colorPrimary={currentTeam?.colorPrimary} colorSecondary={currentTeam?.colorSecondary} size="xs" />{teamName || 'FA'}</span> : 'FA' },
                                        { label: '포지션', value: player.position },
                                        { label: '나이', value: `${player.age}세` },
                                        { label: '신장', value: `${player.height}cm` },
                                        { label: '체중', value: `${player.weight}kg` },
                                        { label: '연봉', value: player.salary > 0 ? formatMoney(player.salary) : '-', numeric: true },
                                        { label: '계약', value: player.contractYears > 0 ? `${player.contractYears}년` : '-' },
                                        { label: '리그 레벨', value: <StarRating ovr={calculatedOvr} size="md" /> },
                                        { label: '포지션 평점', value: positionStars !== null ? <StarRating stars={positionStars} size="md" /> : '-' },
                                        ...(condition !== undefined
                                            ? [{ label: '체력', value: <ConditionBar value={condition} showBars={false} hiddenLabel="경기 중" hiddenTitle="경기가 끝나면 체력이 표시됩니다" /> }]
                                            : []),
                                    ].map(({ label, value, numeric }) => (
                                        <KeyValueRow key={label} label={label} numeric={numeric}>{value}</KeyValueRow>
                                    ))}
                                </ProfileSection>

                                {/* ─ 부상 현황 ─ */}
                                {player.health && player.health !== 'Healthy' && (() => {
                                    const currentInjury = [...(player.injuryHistory ?? [])].sort((a, b) => b.date.localeCompare(a.date))[0];
                                    return (
                                        <ProfileSection title="부상 현황">
                                            <KeyValueRow label="부상명">{player.injuryType ?? '-'}</KeyValueRow>
                                            <KeyValueRow label="기간">{currentInjury?.duration ?? '-'}</KeyValueRow>
                                            <KeyValueRow label="예상 복귀">{player.returnDate ?? '-'}</KeyValueRow>
                                        </ProfileSection>
                                    );
                                })()}

                                {/* ─ 선수 유형 ─ */}
                                {playerArchetypeState && (
                                    <ProfileSection title="선수 유형">
                                        <KeyValueRow label="아키타입">{getArchetypeDisplayInfo(playerArchetypeState.primary).label}</KeyValueRow>
                                        {playerArchetypeState.secondary && (
                                            <KeyValueRow label="보조 유형" tone="muted">{getArchetypeDisplayInfo(playerArchetypeState.secondary).label}</KeyValueRow>
                                        )}
                                        {playerArchetypeState.tags.slice(0, 4).map((tag, i) => (
                                            <KeyValueRow key={tag} label={i === 0 ? '특성' : ''} tone="muted" valueClassName="font-normal">{getTraitTagDisplayInfo(tag).label}</KeyValueRow>
                                        ))}
                                    </ProfileSection>
                                )}

                                {/* ─ 인기도 ─ */}
                                <ProfileSection title="인기도">
                                    <KeyValueRow label="지역적인 인기">{getLocalPopularityLabel(player.popularity?.local ?? 0)}</KeyValueRow>
                                    <KeyValueRow label="전국적인 인기">{getNationalPopularityLabel(player.popularity?.national ?? 0)}</KeyValueRow>
                                </ProfileSection>

                                {/* ─ 성격 & 기분 ─ */}
                                {saveTendencies && (
                                    <ProfileSection title="성격 & 기분">
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
                                                <KeyValueRow key={label} label={label} tone="none" valueClassName={color}>{text}</KeyValueRow>
                                            ));
                                        })()}
                                    </ProfileSection>
                                )}

                                {/* ─ 스카우팅 리포트 — 장점/단점/특징 구간 라벨 없이, 문장별 +/-/무기호로 표기.
                                    긍정 → 부정 → 중립 순으로 정렬(같은 감정 안에서는 생성 순서 유지, stable sort) ─ */}
                                {scoutReport.length > 0 && (
                                    <ProfileSection title="스카우팅 리포트">
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
                                    </ProfileSection>
                                )}

                            </div>
                            );
                        })()}

                    </div>{/* end 좌열 */}

                    {/* ══════════════ 중간열 — 계약/수상/부상 등 부가 정보 ══════════════ */}
                    <div className="flex flex-col bg-slate-900 border-r border-slate-800">

                        {/* ── 위젯 6: 계약 정보 ── */}
                        {!hideSections?.includes('contract') && (
                            player.prevSalary != null ? (
                                // 생성 FA 선수: 직전 계약 전체 연도 표시 — 지난 계약이라 값은 흐린 톤(slate-400)
                                <ProfileSection title="직전 계약" first>
                                    {player.prevContract && player.prevContract.years.length > 0 ? (
                                        <>
                                            {player.prevContract.years.map((sal, i) => {
                                                const n = player.prevContract!.years.length;
                                                // career_history는 최신순(index 0 = 가장 최근) → 계약 첫 해 = history[n-1]
                                                const seasonLabel = player.career_history?.[n - 1 - i]?.season;
                                                return (
                                                    <KeyValueRow key={i} label={seasonLabel ?? `Year ${i + 1}`} tone="muted" numeric valueClassName="font-normal">{formatMoney(sal)}</KeyValueRow>
                                                );
                                            })}
                                            <KeyValueRow label="AAV" tone="muted" numeric valueClassName="font-normal" className="pt-1 border-t border-slate-800">
                                                {formatMoney(getContractAav({ contract: player.prevContract }))}
                                            </KeyValueRow>
                                            <KeyValueRow label="유형" tone="muted" valueClassName="font-normal">
                                                {CONTRACT_TYPE_LABEL[player.prevContract.type] ?? player.prevContract.type}
                                            </KeyValueRow>
                                            <KeyValueRow label="드래프트" tone="muted" valueClassName="font-normal">
                                                {player.draftRound === 1
                                                    ? `1라운드 ${player.draftPick}픽`
                                                    : player.draftRound === 2
                                                    ? `2라운드 ${(player.draftPick ?? 0) - 30}픽`
                                                    : player.draftRound === null
                                                    ? '언드래프트'
                                                    : '-'}
                                            </KeyValueRow>
                                        </>
                                    ) : (
                                        // 폴백: 기존 DB 선수 (prev_contract 없음)
                                        <>
                                            <KeyValueRow label="연평균 연봉" tone="muted" numeric valueClassName="font-normal">{formatMoney(player.prevSalary)}</KeyValueRow>
                                            {player.prevTeamTenure != null && (
                                                <KeyValueRow label="재직 기간" tone="muted" valueClassName="font-normal">{player.prevTeamTenure}년</KeyValueRow>
                                            )}
                                        </>
                                    )}
                                </ProfileSection>
                            ) : (
                                // 일반 선수: 현재 계약 표시 — 현재 연차는 라벨·값 모두 emerald
                                <ProfileSection title="계약 정보" first>
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
                                                    <KeyValueRow
                                                        key={i}
                                                        label={seasonLabel}
                                                        numeric
                                                        tone={isCurrent ? 'none' : 'default'}
                                                        labelClassName={isCurrent ? 'text-emerald-400' : ''}
                                                        valueClassName={isCurrent ? 'text-emerald-400' : ''}
                                                    >
                                                        {formatMoney(sal)}
                                                    </KeyValueRow>
                                                );
                                            })}
                                            <KeyValueRow label="AAV" numeric className="pt-1 border-t border-slate-800">
                                                {formatMoney(getContractAav(player))}
                                            </KeyValueRow>
                                            <KeyValueRow label="유형" tone="muted" valueClassName="font-normal flex items-center gap-1">
                                                {CONTRACT_TYPE_LABEL[player.contract.type] ?? player.contract.type}
                                                {player.contract.noTrade && <span className="text-amber-400 font-black ml-1">NTC</span>}
                                            </KeyValueRow>
                                        </>
                                    )}
                                </ProfileSection>
                            )
                        )}

                        {/* ── 위젯 7: 수상 내역 (allAwards는 헤더 트로피 배지와 공유하는 useMemo) ── */}
                        {!hideSections?.includes('awards') && (() => {
                            return (
                        <ProfileSection title="수상 내역">
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
                                    ALL_STAR: '올스타',
                                };
                                const BASE_DETAIL: Record<string, string> = {
                                    CHAMPION: '우승', REG_SEASON_CHAMPION: '우승', CHM: '우승', RCHM: '우승',
                                    FINALS_MVP: '수상', FMVP: '수상',
                                    ALL_NBA_1: '1st', ALL_NBA_2: '2nd', ALL_NBA_3: '3rd',
                                    ALL_DEF_1: '1st', ALL_DEF_2: '2nd',
                                    NBA1: '1st', NBA2: '2nd', NBA3: '3rd',
                                    DEF1: '1st', DEF2: '2nd',
                                    ALL_STAR: '선정',
                                };
                                const sortedAwards = [...allAwards].sort((a, b) => {
                                    const sc = (b.season ?? '').localeCompare(a.season ?? '');
                                    if (sc !== 0) return sc;
                                    const orderMap: Record<string, number> = {
                                        CHAMPION: 0, REG_SEASON_CHAMPION: 1, MVP: 2, FINALS_MVP: 3, DPOY: 4,
                                        ALL_NBA_1: 5, ALL_NBA_2: 6, ALL_NBA_3: 7, ALL_DEF_1: 8, ALL_DEF_2: 9,
                                        ALL_STAR: 9.5, ROY: 10, SIXTH_MAN: 11,
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
                        </ProfileSection>
                            );
                        })()}

                        {/* ── 위젯 7.5: 선수 이동 내역(현재 멀티플레이어 전용 — externalTransactionHistory가
                            주어졌을 때만 렌더). 날짜|타입|이동 순. 드래프트는 "이전팀→현재팀" 화살표
                            표기 대신(애초에 이전 팀이 없음) "1R 3rd LAL"처럼 라운드/픽 순번/팀만 표기
                            — 트레이드(fromAbbr → toAbbr)와 시각적으로 구분된다. */}
                        {externalTransactionHistory !== undefined && (
                        <ProfileSection title="선수 이동 내역">
                            {externalTransactionHistory.length === 0 ? (
                                <div className="text-sm text-slate-500">이동 내역이 없습니다</div>
                            ) : (() => {
                                const TX_TYPE_LABEL: Record<string, string> = {
                                    draft: '드래프트', trade: '트레이드', fa: '자유 계약', waive: '웨이버',
                                };
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
                                                            : entry.type === 'fa'
                                                            ? entry.toTeamAbbr
                                                            : `${entry.fromTeamAbbr ?? '—'} → ${entry.toTeamAbbr}`}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </>
                                );
                            })()}
                        </ProfileSection>
                        )}

                        {/* ── 위젯 8: 부상 이력 ── */}
                        {!hideSections?.includes('injuryHistory') && (
                        <ProfileSection title="부상 이력">
                            {!player.injuryHistory || player.injuryHistory.length === 0 ? (
                                <div className="text-sm text-slate-500">부상 이력이 없습니다</div>
                            ) : (
                                <>
                                    {[...player.injuryHistory]
                                        .sort((a, b) => b.date.localeCompare(a.date))
                                        .map((entry, idx) => {
                                            const [entryY, entryM, entryD] = entry.date.split('-');
                                            const dateStr = `${entryY.slice(2)}/${entryM}/${entryD}`;
                                            // 가장 최근 항목이면서 지금도 활성 상태면(출장정지 등 게임 수
                                            // 기반) player.activeInjuryDuration이 "지금 기준 남은 경기 수"로
                                            // 재계산된 값 — 과거에 종료된 항목은 발부 당시 기록(entry.duration)
                                            // 그대로 둔다(로그는 변하면 안 됨).
                                            const isCurrentActive = idx === 0 && !!player.activeInjurySeverity;
                                            const duration = isCurrentActive ? (player.activeInjuryDuration ?? entry.duration) : entry.duration;
                                            return (
                                                <KeyValueRow key={idx} label={dateStr} tone="muted" valueClassName="font-normal">
                                                    {entry.injuryType} {duration}{formatReturnDateSuffix(entry.returnDate)}
                                                </KeyValueRow>
                                            );
                                        })}
                                </>
                            )}
                        </ProfileSection>
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
                                                                    <div className="h-[14px] bg-slate-800 overflow-hidden rounded-full">
                                                                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, val))}%`, backgroundImage: getAttrBarGradient(val) }} />
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-3 shrink-0">
                                                                    {seasonDelta !== 0 && (
                                                                        <span className={`relative group font-black text-sm tabular-nums cursor-default ${seasonDelta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                            {seasonDelta > 0 ? '▲' : '▼'} {Math.abs(seasonDelta)}
                                                                            {attrEvents.length > 0 && (
                                                                                <span className="pointer-events-none absolute bottom-full right-0 mb-1.5 hidden group-hover:flex flex-col gap-0.5 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 shadow-xl z-50 whitespace-nowrap">
                                                                                    {attrEvents.map((evt, i) => (
                                                                                        <span key={i} className="flex items-center gap-2 text-sm font-normal">
                                                                                            <span className="text-slate-500">{evt.date.slice(5)}</span>
                                                                                            <span className={evt.delta > 0 ? 'text-emerald-400' : 'text-rose-400'}>{evt.delta > 0 ? '▲' : '▼'}</span>
                                                                                            <span className="text-slate-300">{evt.oldValue} → {evt.newValue}</span>
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

                {activeTab === 'career' && (
                    <div className="flex flex-col gap-4 h-full min-h-0">
                        {/* ── 커리어 기록(시즌 기록) — 프로필 탭에서 이동 ── */}
                        {(careerRegular.length > 0 || careerPlayoff.length > 0) && (
                            <div className="flex flex-col flex-1 min-h-0">
                                <SectionHeader title="기록" className="bg-slate-900">
                                    <SegmentedControl<'regular' | 'playoff'>
                                        size="sm"
                                        aria-label="시즌 구분"
                                        value={careerMode}
                                        onChange={setCareerMode}
                                        options={[
                                            { value: 'regular', label: 'Regular' },
                                            ...(hasCareerPlayoff ? [{ value: 'playoff' as const, label: 'Playoffs' }] : []),
                                        ]}
                                    />
                                    <SegmentedControl<'trad' | 'adv'>
                                        size="sm"
                                        aria-label="기록 종류"
                                        value={careerTab}
                                        onChange={setCareerTab}
                                        options={[{ value: 'trad', label: 'Traditional' }, { value: 'adv', label: 'Advanced' }]}
                                    />
                                </SectionHeader>
                                {(() => {
                                    const cols = careerTab === 'trad' ? CAREER_TRAD_COLS : CAREER_ADV_COLS;
                                    const isPlayoffMode = careerMode === 'playoff';
                                    const rows = isPlayoffMode ? careerPlayoff : careerRegular;
                                    const multiTeamSeasons = new Set(rows.filter(r => isMultiTeamLabel((r as any).team)).map(r => (r as any).season));
                                    const nonTm = rows.filter(r => !isMultiTeamLabel((r as any).team));
                                    const teamOrder: string[] = [];
                                    nonTm.forEach(r => { const t = (r as any).team; if (!teamOrder.includes(t)) teamOrder.push(t); });
                                    const avgRows = [...teamOrder.map(t => computeCareerAvg(nonTm.filter(r => (r as any).team === t), t)), computeCareerAvg(nonTm, '커리어')].filter(r => r.team);
                                    let groupIdx = -1;
                                    return (
                                        // 첫 열(시즌)만 가로 스크롤 고정. 2TM 시즌의 팀별 서브행은 흐리게 + 왼쪽 들여쓰기 선.
                                        <Table variant="bare" density="compact" className="text-sm flex-1 min-h-0 !overflow-auto custom-scrollbar">
                                            <TableHead className="sticky top-0 z-40">
                                                {cols.map((col, i) => (
                                                    <TableHeaderCell key={col.key} align="left" stickyLeft={i === 0 ? 0 : undefined}>
                                                        {col.label}
                                                    </TableHeaderCell>
                                                ))}
                                            </TableHead>
                                            <TableBody>
                                                {rows.map((row, ri) => {
                                                    const isCurrentSeason = String((row as any).season) === seasonShort;
                                                    const team = (row as any).team;
                                                    const season = (row as any).season;
                                                    const isSubRow = multiTeamSeasons.has(season) && !isMultiTeamLabel(team);
                                                    const isSummaryRow = isMultiTeamLabel(team);
                                                    if (!isSubRow) groupIdx++;
                                                    return (
                                                        <TableRow key={ri} style={groupIdx % 2 !== 0 ? ZEBRA_ROW_STYLE : undefined}>
                                                            {cols.map((col, ci) => {
                                                                const raw = (row as any)[col.key];
                                                                const display = (isSubRow && col.key === 'season') ? '' : formatCareerCell(col.key, raw);
                                                                const isSticky = ci === 0;
                                                                const stickyColor = isPlayoffMode ? 'text-amber-300' : isCurrentSeason ? 'text-indigo-300' : 'text-slate-300';
                                                                return (
                                                                    <TableCell
                                                                        key={col.key}
                                                                        align="left"
                                                                        stickyLeft={isSticky ? 0 : undefined}
                                                                        className={`tabular-nums ${isSticky ? `font-bold ${stickyColor}` : ''} ${isSubRow && isSticky ? 'border-l-2 border-l-slate-800 !pl-5' : ''}`}
                                                                    >
                                                                        {isSummaryRow && col.key === 'team' ? <span className="font-black">{display}</span> : display}
                                                                    </TableCell>
                                                                );
                                                            })}
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                            <TableFoot>
                                                {avgRows.map((avgRow, ai) => {
                                                    const isCareer = avgRow.team === '커리어';
                                                    return (
                                                        <tr key={ai}>
                                                            {cols.map((col, ci) => (
                                                                <TableCell
                                                                    key={col.key}
                                                                    align="left"
                                                                    stickyLeft={ci === 0 ? 0 : undefined}
                                                                    className={`text-white tabular-nums ${ci === 0 || isCareer ? 'font-bold' : ''} ${isCareer ? 'border-t border-t-slate-700' : ''}`}
                                                                >
                                                                    {formatCareerCell(col.key, avgRow[col.key])}
                                                                </TableCell>
                                                            ))}
                                                        </tr>
                                                    );
                                                })}
                                            </TableFoot>
                                        </Table>
                                    );
                                })()}
                            </div>
                        )}

                    </div>
                )}

                {activeTab === 'splits' && (
                    <div className="flex flex-col gap-4 h-full min-h-0">
                        {gameLogLoading ? <Spinner /> : <GameLogSplitsTable gameLog={currentSeasonGameLog} opponentIds={splitOpponentIds} />}
                    </div>
                )}

                {activeTab === 'gamelog' && (
                    <div className="flex flex-col gap-4">
                        {/* ── 최근 경기 ── */}
                        {!gameLogLoading && gameLog && gameLog.length > 0 ? <div>
                            {/* 제목 자리를 시즌 선택 드롭다운으로 — 세션에서 경기를 치른 시즌만 나온다 */}
                            <div className="px-6 py-3 flex items-center justify-between bg-slate-900">
                                <Dropdown
                                    align="left"
                                    width="w-40"
                                    trigger={
                                        <button className="flex items-center gap-1.5 text-base font-black text-white hover:text-indigo-300 transition-colors">
                                            <span>{selectedGameLogSeason} 시즌</span>
                                            <ChevronDown size={14} className="opacity-60" />
                                        </button>
                                    }
                                    items={gameLogSeasons.map(sn => ({
                                        id: sn,
                                        active: sn === selectedGameLogSeason,
                                        label: <span className="text-sm">{sn} 시즌</span>,
                                        onClick: () => setGameLogSeason(sn),
                                    }))}
                                />
                                <SegmentedControl<GameLogMode>
                                    size="sm"
                                    aria-label="게임 로그 보기"
                                    value={gameLogMode}
                                    onChange={setGameLogMode}
                                    options={[
                                        { value: 'trad', label: 'Traditional' },
                                        { value: 'shooting', label: 'Shooting' },
                                        { value: 'defense', label: 'Defense' },
                                    ]}
                                />
                            </div>
                            {seasonGameLog.length > 0 ? (
                                <div style={{ height: seasonGameLog.length * ROW_HEIGHT + GAME_LOG_HEADER_HEIGHT + GAME_LOG_FOOTER_ROWS * ROW_HEIGHT }} className="relative">
                                    <VirtualGameLog
                                        key={selectedGameLogSeason}
                                        mode={gameLogMode}
                                        gameLog={seasonGameLog}
                                        gameLogLoading={gameLogLoading}
                                        teamId={teamId}
                                        onGameClick={onGameClick}
                                    />
                                </div>
                            ) : (
                                <EmptyState title="이 시즌의 경기 기록이 없습니다" />
                            )}
                        </div> : (
                            <EmptyState title="경기 기록이 없습니다" />
                        )}
                    </div>
                )}

                {activeTab === 'percentile' && percentileSlot}

                {activeTab === 'news' && newsSlot}

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
                                            <Button
                                                variant="link"
                                                onClick={() => { setShotMakeFilter('all'); setShotQuarterFilter(new Set()); setShotTypeFilter(new Set()); setShotTeamFilter(new Set()); setShotClutchOnly(false); }}
                                                className="ml-2 underline underline-offset-2"
                                            >
                                                초기화
                                            </Button>
                                        )}
                                    </div>

                                    <div className="flex">
                                        {/* ── 1열 ── */}
                                        <div className="w-40 shrink-0 pr-4 flex flex-col divide-y divide-slate-800">
                                            <CheckOptionGroup title="보기 방식" className="first:pt-0">
                                                {([['hexbin', '히트맵'], ['ox', 'O·X']] as const).map(([key, label]) => (
                                                    <CheckOption key={key} type="radio" name="shotViewMode" checked={shotViewMode === key} onChange={() => setShotViewMode(key)} label={label} />
                                                ))}
                                            </CheckOptionGroup>

                                            {shotViewMode === 'hexbin' && (
                                                <CheckOptionGroup
                                                    title="색상 기준"
                                                    footer={shotColorMode === 'fgPct' && (
                                                        <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
                                                            <span className="text-slate-500">평균 이하</span>
                                                            <span className="flex-1 h-1.5 rounded-full" style={{ background: 'linear-gradient(to right, #006106, #00b80c, #00ff11)' }} />
                                                            <span className="text-emerald-400">평균 이상</span>
                                                        </div>
                                                    )}
                                                >
                                                    {([['frequency', '빈도'], ['fgPct', '성공률']] as const).map(([key, label]) => (
                                                        <CheckOption key={key} type="radio" name="shotColorMode" checked={shotColorMode === key} onChange={() => setShotColorMode(key)} label={label} />
                                                    ))}
                                                </CheckOptionGroup>
                                            )}

                                            <CheckOptionGroup title="결과">
                                                {([['all', '전체'], ['make', '성공'], ['miss', '실패']] as const).map(([key, label]) => (
                                                    <CheckOption key={key} type="radio" name="shotMakeFilter" checked={shotMakeFilter === key} onChange={() => setShotMakeFilter(key)} label={label} />
                                                ))}
                                            </CheckOptionGroup>

                                            {availableQuarters.length > 0 && (
                                                <CheckOptionGroup title="시간대">
                                                    {availableQuarters.map(q => (
                                                        <CheckOption key={q} type="checkbox" checked={shotQuarterFilter.has(q)} onChange={() => setShotQuarterFilter(prev => toggleInSet(prev, q))} label={quarterLabel(q)} />
                                                    ))}
                                                    <CheckOption type="checkbox" checked={shotClutchOnly} onChange={() => setShotClutchOnly(v => !v)} label="클러치" />
                                                </CheckOptionGroup>
                                            )}

                                            {availableShotTypes.length > 0 && (
                                                <CheckOptionGroup title="슛 타입" className="last:pb-0">
                                                    {availableShotTypes.map(t => (
                                                        <CheckOption key={t} type="checkbox" checked={shotTypeFilter.has(t)} onChange={() => setShotTypeFilter(prev => toggleInSet(prev, t))} label={SHOT_TYPE_LABEL[t] ?? t} />
                                                    ))}
                                                </CheckOptionGroup>
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
                                                    <div className="text-xs font-bold text-slate-500 mb-2">상대팀</div>
                                                    <div className="flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                                                        {availableOpponentTeams.map(oppId => (
                                                            <CheckOption
                                                                key={oppId}
                                                                type="checkbox"
                                                                checked={shotTeamFilter.has(oppId)}
                                                                onChange={() => setShotTeamFilter(prev => toggleInSet(prev, oppId))}
                                                                label={teamById.get(oppId)?.abbr ?? oppId}
                                                            />
                                                        ))}
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
                                        <EmptyState title="필터 조건에 맞는 슛이 없습니다" className="w-[46rem]" />
                                    )}
                                </div>

                                {/* ── 샷 데이터 테이블 — 차트와 동일하게 filteredShotEvents(현재 활성
                                    필터 반영) 기준 구역별 집계. 필터를 바꾸면 차트와 함께 갱신됨. */}
                                <div className="flex-1 min-w-0 p-4 flex flex-col gap-6">
                                <ShotBreakdownTable
                                    title="구역별 기록"
                                    headerLabel="구역"
                                    rows={filteredZoneBreakdown}
                                    showLeagueAvg
                                    footer={[
                                        { label: '전체', m: filteredShotTotals.m, a: filteredShotTotals.a, pct: filteredShotTotals.pct, emphasis: true },
                                        { label: '3점', m: filteredShotTotals.m3, a: filteredShotTotals.a3, pct: filteredShotTotals.pct3 },
                                    ]}
                                />

                                <ShotBreakdownTable title="시간대별 기록" headerLabel="시간대" rows={filteredQuarterBreakdown} />
                                <ShotBreakdownTable title="슛 타입별 기록" headerLabel="타입" rows={filteredShotTypeBreakdown} />
                                <ShotBreakdownTable title="팀별 기록" headerLabel="팀" rows={filteredTeamBreakdown} />
                                </div>
                            </div>
                        ) : (
                            <EmptyState title="슛 기록이 없습니다" />
                        )}
                    </div>
                )}

            </div>
        </div>
    );
};
