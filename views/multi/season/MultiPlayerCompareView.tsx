import React, { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { Spinner } from '../../../components/common/Spinner';
import { Dropdown } from '../../../components/common/Dropdown';
import { OvrBadge } from '../../../components/common/OvrBadge';
import { TeamLogo } from '../../../components/common/TeamLogo';
import { IconButton } from '../../../components/common/IconButton';
import { FilterTrigger } from '../../../components/common/filters/FilterTrigger';
import { useLeagueContext } from '../league/LeagueLayout';
import { useSeasonContext } from './seasonContext';
import { useLeagueRawStats, type LeagueRawStatsData } from '../../../hooks/useLeagueRawStats';
import { usePlayerSeasonStatsLeague } from '../../../hooks/usePlayerSeasonStatsLeague';
import { useMultiSearchData } from '../../../hooks/useMultiSearchData';
import { usePlayerShortCodes } from '../../../hooks/usePlayerShortCodes';
import { usePlayerCareerHistory } from '../../../hooks/usePlayerCareerHistory';
import { buildLeagueTeams } from '../../../services/multi/buildLeagueTeams';
import { shouldUseCustomOverrides } from '../../../utils/leagueOverrides';
import { calculatePlayerOvr, INITIAL_STATS } from '../../../utils/constants';
import { formatMoney } from '../../../utils/formatMoney';
import { getAttrBarColor, getAttrColor } from '../../../utils/attrRatingColor';
import { isImeComposing } from '../../../utils/ime';
import { computeCareerAvg, statsToCareerRow, buildTeamAdvCtx } from '../../../utils/careerStats';
import { COMPACT_ATTR_GROUPS, ATTR_KR_LABEL, getCompactAttrValue, type CompactAttrItem } from '../../../data/attributeConfig';
import type { Team } from '../../../types/team';
import type { Game } from '../../../types';
import type { Player, PlayerStats, CareerSeasonStat } from '../../../types/player';

// [2026-10-18] 멀티 "도구 › 선수 비교" 화면(/multi/leagues/:leagueId/season/compare).
// 좌/우 패널에서 선수를 고르면(검색 또는 팀→선수 드롭다운) 패널 하단에 선수 정보·시즌 기록,
// 가운데에 체격(텍스트)과 능력치 21개(COMPACT_ATTR_GROUPS) 양방향 막대를 그린다.
// 선택 상태는 URL(?p1=&p2=, 선수 short code)에 둬서 새로고침/뒤로가기/링크 공유가 유지되게 한다.

type Side = 0 | 1;
const PARAM: Record<Side, string> = { 0: 'p1', 1: 'p2' };
const FA_KEY = 'FA';
const CAREER_KEY = 'career';

interface Entry { player: Player; team: Team | null }

// cmp: 'high' = 높을수록 우위, 'low' = 낮을수록 우위(턴오버·파울), 'none' = 우열 비교 안 함(출전 수·시도 수·비율)
// pct = 0~1 비율(×100 해서 % 표기), rate = 이미 0~100 단위인 팀 기준 지표(USG%·AST% 등)
interface StatItem { key: string; label: string; pct?: boolean; rate?: boolean; int?: boolean; cmp: 'high' | 'low' | 'none' }
const STAT_ITEMS: StatItem[] = [
    { key: 'gp', label: '경기', int: true, cmp: 'none' },
    { key: 'gs', label: '선발', int: true, cmp: 'none' },
    { key: 'min', label: '출전 시간', cmp: 'none' },
    { key: 'pts', label: '득점', cmp: 'high' },
    { key: 'reb', label: '리바운드', cmp: 'high' },
    { key: 'oreb', label: '공격 리바운드', cmp: 'high' },
    { key: 'dreb', label: '수비 리바운드', cmp: 'high' },
    { key: 'ast', label: '어시스트', cmp: 'high' },
    { key: 'stl', label: '스틸', cmp: 'high' },
    { key: 'blk', label: '블록', cmp: 'high' },
    { key: 'tov', label: '턴오버', cmp: 'low' },
    { key: 'pf', label: '파울', cmp: 'low' },
    { key: 'fgm', label: '야투 성공', cmp: 'high' },
    { key: 'fga', label: '야투 시도', cmp: 'none' },
    { key: 'fg_pct', label: '야투율', pct: true, cmp: 'high' },
    { key: 'fg3m', label: '3점 성공', cmp: 'high' },
    { key: 'fg3a', label: '3점 시도', cmp: 'none' },
    { key: 'fg3_pct', label: '3점 성공률', pct: true, cmp: 'high' },
    { key: 'ftm', label: '자유투 성공', cmp: 'high' },
    { key: 'fta', label: '자유투 시도', cmp: 'none' },
    { key: 'ft_pct', label: '자유투 성공률', pct: true, cmp: 'high' },
    { key: 'efg_pct', label: 'eFG%', pct: true, cmp: 'high' },
    { key: 'ts_pct', label: 'TS%', pct: true, cmp: 'high' },
    { key: 'fg3a_rate', label: '3점 시도 비율', pct: true, cmp: 'none' },
];

// ── 가운데 "기록" 비교의 4개 카테고리(리더보드 Traditional/Advanced/Shooting/Defense와 같은 구분) ──
// Shooting·Defense는 시뮬 누적 기록(player.stats)에만 있는 값 — 다른 시즌·커리어에서는 표가 비어(–) 보인다.
type StatCat = 'traditional' | 'advanced' | 'shooting' | 'defense';
const SHOT_ZONES: [string, string][] = [
    ['zone_rim', '림'], ['zone_paint', '페인트'], ['zone_mid_l', '좌 미드'], ['zone_mid_c', '중 미드'], ['zone_mid_r', '우 미드'],
    ['zone_c3_l', '좌 코너'], ['zone_c3_r', '우 코너'], ['zone_atb3_l', '좌 45도'], ['zone_atb3_c', '정면'], ['zone_atb3_r', '우 45도'],
];
const DEF_ZONES: [string, string][] = [['RA', '림'], ['ITP', '페인트'], ['MID', '미드'], ['CNR', '코너'], ['WING', '윙'], ['ATB', '정면']];
const CHART_CATS: Record<StatCat, { label: string; items: StatItem[] }> = {
    traditional: { label: 'Traditional', items: STAT_ITEMS.filter(i => !['efg_pct', 'ts_pct', 'fg3a_rate'].includes(i.key)) },
    advanced: { label: 'Advanced', items: [
        { key: 'gp', label: '경기', int: true, cmp: 'none' },
        { key: 'ts_pct', label: 'TS%', pct: true, cmp: 'high' },
        { key: 'efg_pct', label: 'eFG%', pct: true, cmp: 'high' },
        { key: 'tov_pct', label: 'TOV%', rate: true, cmp: 'low' },
        { key: 'usg_pct', label: 'USG%', rate: true, cmp: 'none' },
        { key: 'ast_pct', label: 'AST%', rate: true, cmp: 'high' },
        { key: 'orb_pct', label: 'ORB%', rate: true, cmp: 'high' },
        { key: 'drb_pct', label: 'DRB%', rate: true, cmp: 'high' },
        { key: 'trb_pct', label: 'TRB%', rate: true, cmp: 'high' },
        { key: 'stl_pct', label: 'STL%', rate: true, cmp: 'high' },
        { key: 'blk_pct', label: 'BLK%', rate: true, cmp: 'high' },
        { key: 'fg3a_rate', label: '3PAr', pct: true, cmp: 'none' },
        { key: 'fta_rate', label: 'FTr', pct: true, cmp: 'none' },
    ] },
    shooting: { label: 'Shooting', items: [
        { key: 'gp', label: '경기', int: true, cmp: 'none' },
        ...SHOT_ZONES.flatMap(([k, l]): StatItem[] => [
            { key: `${k}_m`, label: `${l} 성공`, cmp: 'high' },
            { key: `${k}_a`, label: `${l} 시도`, cmp: 'none' },
            { key: `${k}_pct`, label: `${l} %`, pct: true, cmp: 'high' },
        ]),
    ] },
    defense: { label: 'Defense', items: [
        { key: 'gp', label: '경기', int: true, cmp: 'none' },
        { key: 'stl', label: '스틸', cmp: 'high' },
        { key: 'blk', label: '블록', cmp: 'high' },
        { key: 'tovf', label: '유도 턴오버', cmp: 'high' },
        { key: 'dreb', label: '수비 리바운드', cmp: 'high' },
        { key: 'cont_pg', label: '슛 견제', cmp: 'high' },
        { key: 'dfg_pct', label: '상대 야투율', pct: true, cmp: 'low' },
        ...DEF_ZONES.flatMap(([z, l]): StatItem[] => [
            { key: `dfg${z}_m`, label: `${l} 상대 성공`, cmp: 'low' },
            { key: `dfg${z}_a`, label: `${l} 상대 시도`, cmp: 'none' },
            { key: `dfg${z}_pct`, label: `${l} 상대 %`, pct: true, cmp: 'low' },
        ]),
    ] },
};

/** 이번 시즌 행에만 붙는 Shooting·Defense 값(경기당). 과거 시즌 이력(career_history)에는 없는 항목들. */
function seasonOnlyKeys(st: PlayerStats): Record<string, number | null> {
    const g = st.g || 0;
    const per = (v: number | undefined) => (g > 0 ? (v || 0) / g : null);
    const pct = (m: number | undefined, a: number | undefined) => ((a || 0) > 0 ? (m || 0) / (a || 0) : null);
    const out: Record<string, number | null> = { tovf: per(st.tovForced) };
    for (const [k] of SHOT_ZONES) {
        out[`${k}_m`] = per(st[`${k}_m`]);
        out[`${k}_a`] = per(st[`${k}_a`]);
        out[`${k}_pct`] = pct(st[`${k}_m`], st[`${k}_a`]);
    }
    for (const [z] of DEF_ZONES) {
        const m = (st as any)[`def${z}Made`], a = (st as any)[`def${z}Attempted`];
        out[`dfg${z}_m`] = per(m);
        out[`dfg${z}_a`] = per(a);
        out[`dfg${z}_pct`] = pct(m, a);
    }
    return out;
}

const formatStat = (item: StatItem, v: number | null | undefined) => {
    if (v == null) return '-';
    if (item.pct) return `${(v * 100).toFixed(1)}%`;
    if (item.rate) return `${v.toFixed(1)}%`;
    if (item.int) return String(Math.round(v));
    return v.toFixed(1);
};

const attrLabel = (item: CompactAttrItem) =>
    item.krLabel ?? (item.sourceKeys.length === 1 ? ATTR_KR_LABEL[item.sourceKeys[0]] ?? item.label : item.label);

const MultiPlayerCompareView: React.FC = () => {
    const { league, leagueTeams, room, isLoading: leagueLoading } = useLeagueContext();
    const useCustomOverrides = shouldUseCustomOverrides(league);
    const { isLoading: gameLoading, schedule } = useSeasonContext();
    const [searchParams, setSearchParams] = useSearchParams();
    const { getPlayerUrlId, resolvePlayerId, isLoading: shortCodesLoading } = usePlayerShortCodes();
    const seasonShort = room?.season ?? '2025-26';

    // 로스터 선수 — 리더보드/선수 상세와 같은 조회(queryKey 공유 → 캐시 재사용)
    const allRosterIds = useMemo(
        () => [...new Set(leagueTeams.flatMap(t => t.roster ?? []))],
        [leagueTeams],
    );
    const { data: statsByPlayer, isPending: statsLoading } = usePlayerSeasonStatsLeague(room?.id, allRosterIds);
    const selectTeams = useCallback(
        (raw: LeagueRawStatsData): Team[] => buildLeagueTeams(raw, leagueTeams, useCustomOverrides, statsByPlayer),
        [leagueTeams, useCustomOverrides, statsByPlayer],
    );
    const { data: teams = [], isPending: teamsLoading } = useLeagueRawStats(room?.id, allRosterIds, selectTeams, { includePbp: false });

    // FA — 드래프트풀 중 어느 로스터에도 없는 선수(MultiFreeAgentView와 같은 기준)
    const { poolPlayers, rosterMap } = useMultiSearchData(league, leagueTeams);

    const entryById = useMemo(() => {
        const m = new Map<string, Entry>();
        for (const t of teams) for (const p of t.roster) m.set(p.id, { player: p, team: t });
        for (const p of poolPlayers) if (!rosterMap.has(p.id) && !m.has(p.id)) m.set(p.id, { player: p, team: null });
        return m;
    }, [teams, poolPlayers, rosterMap]);

    // 팀 드롭다운은 약어(abbr)로 표시하므로 약어 알파벳순으로 정렬
    const sortedTeams = useMemo(() => [...teams].sort((a, b) => (a.abbr ?? a.id).localeCompare(b.abbr ?? b.id)), [teams]);

    // 선택 선수(URL short code → UUID)
    const selectedIds: [string | null, string | null] = useMemo(() => {
        if (shortCodesLoading) return [null, null];
        return ([0, 1] as Side[]).map(s => {
            const code = searchParams.get(PARAM[s]);
            const id = code ? resolvePlayerId(code) : null;
            return id && entryById.has(id) ? id : null;
        }) as [string | null, string | null];
    }, [searchParams, resolvePlayerId, shortCodesLoading, entryById]);

    // FA로 선택된 선수는 로스터 스탯 조회에 안 들어가 있어(시즌 중 방출 등) 따로 이번 시즌 스탯을 받는다.
    const faSelectedIds = useMemo(
        () => selectedIds.filter((id): id is string => !!id && !entryById.get(id)?.team),
        [selectedIds, entryById],
    );
    const { data: faStats } = usePlayerSeasonStatsLeague(room?.id, faSelectedIds);

    const selected = useMemo(() => selectedIds.map(id => {
        if (!id) return null;
        const e = entryById.get(id)!;
        if (e.team || !faStats?.[id]) return e;
        return { ...e, player: { ...e.player, stats: { ...INITIAL_STATS(), ...faStats[id] } as PlayerStats } };
    }) as [Entry | null, Entry | null], [selectedIds, entryById, faStats]);

    const { data: career0 } = usePlayerCareerHistory(selectedIds[0] ?? undefined, true);
    const { data: career1 } = usePlayerCareerHistory(selectedIds[1] ?? undefined, true);

    // 팀만 고르고 선수는 아직 안 고른 상태 — 선수가 정해지면 그 선수의 팀이 기준
    const [teamPick, setTeamPick] = useState<[string | null, string | null]>([null, null]);
    const teamKeyOf = (side: Side): string | null => {
        if (teamPick[side]) return teamPick[side];
        const e = selected[side];
        return e ? (e.team?.id ?? FA_KEY) : null;
    };

    const setPlayer = useCallback((side: Side, playerId: string | null) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (playerId) next.set(PARAM[side], getPlayerUrlId(playerId));
            else next.delete(PARAM[side]);
            return next;
        }, { replace: true });
        setTeamPick(prev => { const n = [...prev] as [string | null, string | null]; n[side] = null; return n; });
    }, [setSearchParams, getPlayerUrlId]);

    const pickTeam = useCallback((side: Side, key: string | null) => {
        setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete(PARAM[side]); return next; }, { replace: true });
        setTeamPick(prev => { const n = [...prev] as [string | null, string | null]; n[side] = key; return n; });
    }, [setSearchParams]);

    // 시즌/커리어 스탯 라인
    const [statMode, setStatMode] = useState<'season' | 'career'>('season');
    const careers = [career0, career1];
    // 정규시즌 과거 이력(현재 시즌과 같은 라벨의 행은 시뮬 기록으로 대체되므로 제외)
    // TOV%는 0~100 단위로 통일 — 신인 생성기(services/draft/rookieGenerator.ts)가 만든 가상 이력은 0~1 비율로 저장돼 있어 1 이하 값은 ×100
    const historyOf = (i: number) =>
        ((careers[i] as CareerSeasonStat[] | undefined) ?? [])
            .filter(r => !r.playoff && r.season !== seasonShort)
            .map(r => (r.tov_pct != null && r.tov_pct > 0 && r.tov_pct <= 1 ? { ...r, tov_pct: r.tov_pct * 100 } : r));
    // seasonKey: 시즌 라벨("2023-24") 또는 CAREER_KEY. 시즌 중 이적한 해는 합산 행(2TM/3TM/TOT)을 우선 쓰고,
    // 없으면 팀별 행을 경기 수 가중 평균(computeCareerAvg)으로 합친다.
    const lineFor = (i: number, seasonKey: string): Record<string, any> | null => {
        const e = selected[i];
        if (!e) return null;
        const p = e.player;
        // 팀 기준 Advanced(USG%·AST% 등)는 소속 팀 합계가 있어야 계산됨 — FA는 ctx 없음(해당 항목 –)
        const ctx = e.team ? buildTeamAdvCtx(teams, e.team.id, schedule as Game[]) : undefined;
        const seasonRow = p.stats && (p.stats.g ?? 0) > 0
            ? { ...statsToCareerRow(p.stats, seasonShort, e.team?.abbr ?? FA_KEY, p.age, false, ctx), ...seasonOnlyKeys(p.stats) }
            : null;
        if (seasonKey === seasonShort) return seasonRow;
        const history = historyOf(i);
        if (seasonKey === CAREER_KEY) {
            const avg = computeCareerAvg(seasonRow ? [seasonRow, ...history] : history, '커리어');
            return avg.gp ? avg : null;
        }
        const rows = history.filter(r => r.season === seasonKey);
        if (rows.length === 0) return null;
        const total = rows.find(r => /^(\d+TM|TOT)$/.test(r.team));
        if (total) return total;
        if (rows.length === 1) return rows[0];
        const avg = computeCareerAvg(rows, seasonKey);
        return avg.gp ? avg : null;
    };
    const statLines = [0, 1].map(i => lineFor(i, statMode === 'season' ? seasonShort : CAREER_KEY));

    // 가운데 "기록" 표의 시즌 선택 — 두 선수 중 한 명이라도 기록이 있는 시즌 + 이번 시즌 + 커리어
    // null = 이번 시즌(room 로드 전 초기 렌더에서 기본값이 잘못 고정되지 않도록 선택 전엔 값을 두지 않는다)
    const [chartSeasonPick, setChartSeason] = useState<string | null>(null);
    const chartSeason = chartSeasonPick ?? seasonShort;
    const chartSeasonOptions = [...new Set([seasonShort, ...historyOf(0).map(r => r.season), ...historyOf(1).map(r => r.season)])]
        .sort((a, b) => b.localeCompare(a));
    const chartLines: [Record<string, any> | null, Record<string, any> | null] = [lineFor(0, chartSeason), lineFor(1, chartSeason)];

    const isLoading = leagueLoading || gameLoading || teamsLoading || statsLoading || shortCodesLoading;
    if (isLoading) return <Spinner variant="page" />;

    return (
        <div className="h-full grid grid-cols-[400px_minmax(0,1fr)_400px] min-h-0">
            {([0, 1] as Side[]).map(side => (
                <ComparePane
                    key={side}
                    side={side}
                    entry={selected[side]}
                    teamKey={teamKeyOf(side)}
                    teams={sortedTeams}
                    entryById={entryById}
                    statLine={statLines[side]}
                    statMode={statMode}
                    seasonShort={seasonShort}
                    onStatMode={setStatMode}
                    onPickTeam={key => pickTeam(side, key)}
                    onPickPlayer={id => setPlayer(side, id)}
                />
            ))}
            <CompareChart left={selected[0]?.player ?? null} right={selected[1]?.player ?? null} statLines={chartLines} seasonKey={chartSeason} seasonOptions={chartSeasonOptions} onSeason={setChartSeason} />
        </div>
    );
};

// ── 좌/우 패널 ──────────────────────────────────────────────

interface PaneProps {
    side: Side;
    entry: Entry | null;
    teamKey: string | null;
    teams: Team[];
    entryById: Map<string, Entry>;
    statLine: Record<string, any> | null;
    statMode: 'season' | 'career';
    seasonShort: string;
    onStatMode: (m: 'season' | 'career') => void;
    onPickTeam: (key: string | null) => void;
    onPickPlayer: (id: string | null) => void;
}

// 드롭다운 트리거는 서비스 공용 FilterTrigger(36px), 값이 정해지면 active(인디고) — 팀/선수 칸 폭을 채우도록 늘린다.
const triggerFill = 'w-full justify-between overflow-hidden';

const ComparePane: React.FC<PaneProps> = ({
    side, entry, teamKey, teams, entryById, statLine, statMode, seasonShort, onStatMode, onPickTeam, onPickPlayer,
}) => {
    const [query, setQuery] = useState('');
    const [hl, setHl] = useState(0);
    const [resultsOpen, setResultsOpen] = useState(false);

    const results = useMemo(() => {
        const q = query.replace(/\s/g, '').toLowerCase();
        if (!q) return [];
        const out: Entry[] = [];
        for (const e of entryById.values()) {
            if (e.player.name.replace(/\s/g, '').toLowerCase().includes(q)) out.push(e);
        }
        return out
            .map(e => ({ e, ovr: calculatePlayerOvr(e.player) }))
            .sort((a, b) => b.ovr - a.ovr || a.e.player.id.localeCompare(b.e.player.id))
            .slice(0, 8);
    }, [query, entryById]);

    // 팀 드롭다운에서 고른 팀의 선수(OVR 내림차순, 동점 ID 오름차순)
    const roster = useMemo(() => {
        if (!teamKey) return [];
        const list = teamKey === FA_KEY
            ? [...entryById.values()].filter(e => !e.team).map(e => e.player)
            : teams.find(t => t.id === teamKey)?.roster ?? [];
        return list
            .map(p => ({ p, ovr: calculatePlayerOvr(p) }))
            .sort((a, b) => b.ovr - a.ovr || a.p.id.localeCompare(b.p.id));
    }, [teamKey, teams, entryById]);

    const pick = (id: string) => { onPickPlayer(id); setQuery(''); setResultsOpen(false); };
    const onKeyDown = (ev: React.KeyboardEvent<HTMLInputElement>) => {
        // 한글 IME 조합 중 Enter는 keydown이 두 번 온다(조합 중 1회 + 조합 종료 후 1회). 조합 중 것을 처리하면
        // 선택 후 검색창을 비운 자리에 조합 끝 글자가 다시 들어가 두 번째 Enter가 그 한 글자로 엉뚱한 선수를 고른다.
        if (isImeComposing(ev)) return;
        if (!results.length) return;
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
            ev.preventDefault();
            setHl(h => (h + (ev.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length);
        } else if (ev.key === 'Enter') {
            ev.preventDefault();
            pick(results[Math.min(hl, results.length - 1)].e.player.id);
        } else if (ev.key === 'Escape') {
            setResultsOpen(false);
        }
    };

    const team = teamKey && teamKey !== FA_KEY ? teams.find(t => t.id === teamKey) ?? null : null;
    const teamLabel = !teamKey ? '팀 선택' : teamKey === FA_KEY ? 'FA' : team?.abbr ?? team?.name ?? '팀 선택';
    const player = entry?.player ?? null;
    const ovr = player ? calculatePlayerOvr(player) : null;

    return (
        <section className={`flex flex-col min-h-0 overflow-y-auto custom-scrollbar bg-slate-900 ${side === 0 ? 'border-r order-1' : 'border-l order-3'} border-slate-700`}>
            <div className="px-4 pt-3.5 pb-3 flex flex-col gap-2 border-b border-slate-700">
                <div className="text-xs font-bold text-slate-400">{side === 0 ? '첫 번째 선수' : '두 번째 선수'}</div>

                {/* 이름 검색 — FA/드래프트 풀 화면과 같은 검색 인풋 */}
                <div className="relative h-[36px] bg-slate-950 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors shadow-sm">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                        <Search size={14} />
                    </div>
                    <input
                        id={`compare-search-${side}`}
                        type="text"
                        value={query}
                        onChange={e => { setQuery(e.target.value); setHl(0); setResultsOpen(true); }}
                        onFocus={() => setResultsOpen(true)}
                        onBlur={() => setResultsOpen(false)}
                        onKeyDown={onKeyDown}
                        placeholder="이름으로 검색"
                        autoComplete="off"
                        className="h-full w-full bg-transparent pl-9 pr-8 text-sm font-bold text-white outline-none placeholder:text-slate-600"
                    />
                    {query && (
                        <IconButton label="검색어 지우기" size="xs" tone="ghost" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                            <X size={12} />
                        </IconButton>
                    )}
                    {resultsOpen && query.trim() && (
                        <div className="absolute top-full mt-2 left-0 right-0 z-popover bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1 max-h-80 overflow-y-auto custom-scrollbar">
                            {results.length === 0 ? (
                                <div className="px-3 py-2.5 text-sm text-slate-500">"{query.trim()}"와 일치하는 선수가 없습니다</div>
                            ) : results.map(({ e, ovr: o }, i) => (
                                <button
                                    key={e.player.id}
                                    onMouseDown={ev => { ev.preventDefault(); pick(e.player.id); }}
                                    onMouseEnter={() => setHl(i)}
                                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-left transition-colors ${i === hl ? 'bg-slate-800 text-slate-200' : 'text-slate-400'}`}
                                >
                                    <OvrBadge value={o} size="sm" />
                                    <span className="truncate">{e.player.name}</span>
                                    <span className="ml-auto flex items-center gap-1.5 text-slate-500 shrink-0">
                                        {e.player.position}
                                        {e.team
                                            ? <TeamLogo teamId={e.team.id} teamName={e.team.abbr} size="custom" className="w-5 h-5" shadow={false} />
                                            : <span className="text-xs font-bold">FA</span>}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* 팀 → 선수 드롭다운 */}
                <div className="grid grid-cols-[1fr_1.3fr] gap-1.5">
                    <Dropdown
                        align="left"
                        width="w-56"
                        trigger={
                            <FilterTrigger
                                className={triggerFill}
                                active={!!teamKey}
                                label={
                                    <span className="flex items-center gap-1.5 min-w-0">
                                        {team && <TeamLogo teamId={team.id} teamName={team.abbr} size="custom" className="w-5 h-5 shrink-0" shadow={false} />}
                                        <span className="truncate">{teamLabel}</span>
                                    </span>
                                }
                            />
                        }
                        items={[
                            ...teams.map(t => ({
                                id: t.id,
                                active: t.id === teamKey,
                                label: (
                                    <span className="flex items-center gap-2 min-w-0 text-sm">
                                        <TeamLogo teamId={t.id} teamName={t.abbr} size="custom" className="w-5 h-5 shrink-0" shadow={false} />
                                        <span className="truncate">{t.abbr ?? t.name}</span>
                                    </span>
                                ),
                                onClick: () => onPickTeam(t.id),
                            })),
                            {
                                id: FA_KEY,
                                active: teamKey === FA_KEY,
                                dividerBefore: true,
                                label: <span className="text-sm">FA</span>,
                                onClick: () => onPickTeam(FA_KEY),
                            },
                        ]}
                    />
                    {teamKey ? (
                        <Dropdown
                            align="left"
                            width="w-64"
                            trigger={
                                <FilterTrigger
                                    className={triggerFill}
                                    active={!!player}
                                    label={<span className="block truncate">{player?.name ?? '선수 선택'}</span>}
                                />
                            }
                            items={roster.map(({ p, ovr: o }) => ({
                                id: p.id,
                                active: p.id === player?.id,
                                label: (
                                    <span className="flex items-center gap-2 min-w-0 text-sm">
                                        <OvrBadge value={o} size="sm" />
                                        <span className="truncate">{p.name}</span>
                                        <span className="text-slate-500 shrink-0">{p.position}</span>
                                    </span>
                                ),
                                onClick: () => onPickPlayer(p.id),
                            }))}
                        />
                    ) : (
                        <FilterTrigger className={`${triggerFill} opacity-50 cursor-not-allowed`} label="팀을 먼저 선택" disabled />
                    )}
                </div>
            </div>

            {!player ? (
                <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center text-sm text-slate-500">
                    <div>검색하거나 팀을 고르면<br />선수 정보와 시즌 기록이 여기에 표시됩니다</div>
                </div>
            ) : (
                <div className="p-4 flex flex-col gap-3.5">
                    <div className="flex items-center gap-3">
                        <OvrBadge value={ovr!} size="header" />
                        <div className="min-w-0">
                            <div className="text-xl font-extrabold text-white leading-tight truncate">{player.name}</div>
                            <div className="flex items-center gap-1.5 mt-0.5 text-sm text-slate-400">
                                {entry!.team && <TeamLogo teamId={entry!.team.id} teamName={entry!.team.abbr} size="custom" className="w-4 h-4" shadow={false} />}
                                {player.position} · {player.age}세
                            </div>
                        </div>
                        <IconButton label="선택 해제" size="md" tone="subtle" onClick={() => onPickPlayer(null)} className="ml-auto self-start">
                            <X size={14} />
                        </IconButton>
                    </div>

                    <InfoGrid
                        rows={[
                            ['팀', entry!.team?.name ?? '자유 계약'],
                            ['포지션', player.position],
                            ['나이', `${player.age}세`],
                            ['신장', `${player.height}cm`],
                            ['체중', `${player.weight}kg`],
                            ['연봉', player.salary > 0 ? formatMoney(player.salary) : '-'],
                            ['계약', player.contractYears > 0 ? `${player.contractYears}년` : '-'],
                            ['OVR', String(ovr)],
                        ].map(([label, value]) => ({ label, value }))}
                    />

                    <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-white">시즌 기록</span>
                        <Dropdown
                            align="right"
                            width="w-36"
                            trigger={
                                <FilterTrigger label={statMode === 'season' ? `${seasonShort} 시즌` : '커리어'} />
                            }
                            items={[
                                { id: 'season', active: statMode === 'season', label: <span className="text-sm">{seasonShort} 시즌</span>, onClick: () => onStatMode('season') },
                                { id: 'career', active: statMode === 'career', label: <span className="text-sm">커리어</span>, onClick: () => onStatMode('career') },
                            ]}
                        />
                    </div>
                    {statLine ? (
                        <InfoGrid
                            rows={STAT_ITEMS.map(item => ({ label: item.label, value: formatStat(item, statLine[item.key]) }))}
                        />
                    ) : (
                        <div className="py-3.5 text-center text-sm text-slate-500 border-y border-slate-800">
                            {statMode === 'season' ? '이번 시즌 출전 기록이 없습니다' : '커리어 기록이 없습니다'}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};

const InfoGrid: React.FC<{ rows: { label: string; value: React.ReactNode }[] }> = ({ rows }) => {
    // 홀수 개면 빈 칸 하나로 2열 격자를 채운다
    const cells = rows.length % 2 ? [...rows, null] : rows;
    return (
        <dl className="grid grid-cols-2 border-t border-slate-800 m-0">
            {cells.map((r, i) => (
                <div
                    key={r?.label ?? `empty-${i}`}
                    className={`flex justify-between gap-2 py-2 text-sm border-b border-slate-800 ${i % 2 ? 'pl-3 border-l' : 'pr-3'}`}
                >
                    {r && (
                        <>
                            <dt className="text-slate-500 shrink-0">{r.label}</dt>
                            <dd className="m-0 tabular-nums truncate text-white font-semibold">
                                {r.value}
                            </dd>
                        </>
                    )}
                </div>
            ))}
        </dl>
    );
};

// ── 가운데 비교 차트 ─────────────────────────────────────────

// [막대][값][델타 배지 칸][라벨][델타 배지 칸][값][막대] — 값 칸은 가운데 정렬로 막대와 여백을 둔다
const ROW = 'grid grid-cols-[1fr_56px_52px_144px_52px_56px_1fr] items-center';
// 라벨 칸 — 좌우 구분선이 행 높이 전체에 이어지도록 self-stretch
const LABEL_CELL = 'self-stretch flex items-center justify-center border-x border-slate-800 text-base font-semibold text-slate-300 whitespace-nowrap';

// 우위 쪽 값과 라벨 사이에 붙는 차이(+n) 배지 — 빨강 100%, 아래로 갈수록 어두워지는 그라디언트. 우위가 아니면 빈 칸
// 배지는 값 쪽 정렬(왼쪽 선수 = 칸 왼쪽, 오른쪽 선수 = 칸 오른쪽). 칸 폭 52px라 두 자리 배지(~36px)도
// 라벨 구분선과 14px 이상 떨어진다.
const DeltaCell: React.FC<{ delta: string | null; side: 'left' | 'right' }> = ({ delta, side }) => (
    <div className={`flex ${side === 'left' ? 'justify-start' : 'justify-end'}`}>
        {delta && (
            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-gradient-to-b from-red-500 to-red-700 text-[12px] leading-none font-bold text-white tabular-nums">
                +{delta}
            </span>
        )}
    </div>
);

// 기록 비교의 차이 표기 — 비율 항목은 %p 단위 숫자(소수 1자리), 정수 항목은 정수, 나머지는 소수 1자리
const formatStatDelta = (item: StatItem, d: number) =>
    item.pct ? (d * 100).toFixed(1) : item.int ? String(Math.round(d)) : d.toFixed(1);

type ChartView = 'attr' | 'stats';
const CHART_VIEW_LABEL: Record<ChartView, string> = { attr: '능력치', stats: '기록' };

const CompareChart: React.FC<{
    left: Player | null;
    right: Player | null;
    /** 기록 모드에서 보여줄 좌/우 기록 라인(아래 seasonKey 기준) — 없으면 null */
    statLines: [Record<string, any> | null, Record<string, any> | null];
    /** 기록 모드 시즌 선택: 시즌 라벨 또는 CAREER_KEY */
    seasonKey: string;
    seasonOptions: string[];
    onSeason: (key: string) => void;
}> = ({ left, right, statLines, seasonKey, seasonOptions, onSeason }) => {
    const both = !!left && !!right;
    const [view, setView] = useState<ChartView>('attr');
    const [cat, setCat] = useState<StatCat>('traditional');
    const nameCell = (p: Player | null, r: boolean) => (
        <div className={`min-w-0 truncate ${r ? 'text-left pl-2.5' : 'text-right pr-2.5'} ${p ? 'text-[15px] font-bold text-white' : 'text-[13px] font-medium text-slate-600'}`}>
            {p ? p.name : `${r ? '두 번째' : '첫 번째'} 선수를 선택하세요`}
        </div>
    );
    const physRow = (label: string, key: 'height' | 'weight', unit: string) => (
        <div className={`${ROW} h-8 border-b border-slate-800`}>
            <div />
            <div className="text-center text-base font-semibold text-slate-300 tabular-nums whitespace-nowrap">{left ? `${left[key]}${unit}` : '–'}</div>
            <div />
            <div className={LABEL_CELL}>{label}</div>
            <div />
            <div className="text-center text-base font-semibold text-slate-300 tabular-nums whitespace-nowrap">{right ? `${right[key]}${unit}` : '–'}</div>
            <div />
        </div>
    );

    return (
        <section className="order-2 flex flex-col min-h-0 overflow-y-auto custom-scrollbar bg-slate-950">
            {/* 체격·능력치 행을 여백 없이 한 열로 이어 붙인다 — 라벨 칸 좌우 구분선이 신장부터 마지막 능력치까지 끊김 없이 이어지게. */}
            {/* 헤더(선수 이름) — 배경을 영역 전체 폭으로 깔고(slate-900), 이름 격자는 아래 표와 같은 열 폭 */}
            <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-700 shrink-0">
                <div className="w-full py-2 grid grid-cols-[1fr_144px_1fr] items-center">
                    {nameCell(left, false)}
                    <Dropdown
                        align="left"
                        width="w-32"
                        trigger={<FilterTrigger className="w-full justify-between" label={CHART_VIEW_LABEL[view]} />}
                        items={(['attr', 'stats'] as ChartView[]).map(v => ({
                            id: v,
                            active: v === view,
                            label: <span className="text-sm">{CHART_VIEW_LABEL[v]}</span>,
                            onClick: () => setView(v),
                        }))}
                    />
                    {nameCell(right, true)}
                </div>
                {/* 기록 모드 전용 두 번째 줄 — 시즌 + 카테고리 선택 */}
                {view === 'stats' && (
                    <div className="w-full py-2 flex items-center justify-center gap-2 border-t border-slate-800">
                        <Dropdown
                            align="left"
                            width="w-36"
                            trigger={<FilterTrigger className="min-w-[112px] justify-between" label={seasonKey === CAREER_KEY ? '커리어' : seasonKey} />}
                            items={[
                                { id: CAREER_KEY, active: seasonKey === CAREER_KEY, label: <span className="text-sm">커리어</span>, onClick: () => onSeason(CAREER_KEY) },
                                ...seasonOptions.map((sk, idx) => ({
                                    id: sk,
                                    active: sk === seasonKey,
                                    dividerBefore: idx === 0,
                                    label: <span className="text-sm tabular-nums">{sk}</span>,
                                    onClick: () => onSeason(sk),
                                })),
                            ]}
                        />
                        <Dropdown
                            align="left"
                            width="w-40"
                            trigger={<FilterTrigger className="min-w-[128px] justify-between" label={CHART_CATS[cat].label} />}
                            items={(Object.keys(CHART_CATS) as StatCat[]).map(c => ({
                                id: c,
                                active: c === cat,
                                label: <span className="text-sm">{CHART_CATS[c].label}</span>,
                                onClick: () => setCat(c),
                            }))}
                        />
                    </div>
                )}
            </div>
            {view === 'stats' ? (
                <div className="w-full flex flex-col">
                    {CHART_CATS[cat].items.map(item => {
                        const [la, lb] = statLines;
                        const a: number | null = left && la?.[item.key] != null ? la[item.key] : null;
                        const b: number | null = right && lb?.[item.key] != null ? lb[item.key] : null;
                        const comparable = item.cmp !== 'none' && a != null && b != null && a !== b;
                        const aBetter = comparable && (item.cmp === 'high' ? a! > b! : a! < b!);
                        const bBetter = comparable && !aBetter;
                        return (
                            <div key={item.key} className={`${ROW} h-8 border-b border-slate-800 hover:bg-slate-400/5`}>
                                {/* 기록 비교는 막대 없이 숫자만 */}
                                <div />
                                <div className="text-center text-base font-semibold tabular-nums text-white whitespace-nowrap">
                                    {a != null ? formatStat(item, a) : <span className="text-slate-500">–</span>}
                                </div>
                                <DeltaCell side="left" delta={aBetter ? formatStatDelta(item, Math.abs(a! - b!)) : null} />
                                <div className={LABEL_CELL}>{item.label}</div>
                                <DeltaCell side="right" delta={bBetter ? formatStatDelta(item, Math.abs(b! - a!)) : null} />
                                <div className="text-center text-base font-semibold tabular-nums text-white whitespace-nowrap">
                                    {b != null ? formatStat(item, b) : <span className="text-slate-500">–</span>}
                                </div>
                                <div />
                            </div>
                        );
                    })}
                </div>
            ) : (
            <div className="w-full flex flex-col">
                {physRow('신장', 'height', 'cm')}
                {physRow('체중', 'weight', 'kg')}
                {COMPACT_ATTR_GROUPS.map(g => (
                    <React.Fragment key={g.id}>
                        {g.items.map(item => {
                            const a = left ? getCompactAttrValue(left, item) : null;
                            const b = right ? getCompactAttrValue(right, item) : null;
                            const lTone = both ? (a! > b! ? 'win' : a! < b! ? 'lose' : '') : '';
                            const rTone = both ? (b! > a! ? 'win' : b! < a! ? 'lose' : '') : '';
                            return (
                                <div key={item.key} className={`${ROW} h-8 border-b border-slate-800 hover:bg-slate-400/5`}>
                                    <Bar value={a} dir="left" />
                                    <div
                                        className={`text-center text-base tabular-nums ${lTone === 'win' ? 'font-extrabold' : 'font-semibold'} ${a != null ? getAttrColor(a) : ''}`}
                                    >
                                        {a ?? <span className="text-slate-500">–</span>}
                                    </div>
                                    <DeltaCell side="left" delta={lTone === 'win' ? String(a! - b!) : null} />
                                    <div className={LABEL_CELL}>{attrLabel(item)}</div>
                                    <DeltaCell side="right" delta={rTone === 'win' ? String(b! - a!) : null} />
                                    <div
                                        className={`text-center text-base tabular-nums ${rTone === 'win' ? 'font-extrabold' : 'font-semibold'} ${b != null ? getAttrColor(b) : ''}`}
                                    >
                                        {b ?? <span className="text-slate-500">–</span>}
                                    </div>
                                    <Bar value={b} dir="right" />
                                </div>
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
            )}
        </section>
    );
};

const Bar: React.FC<{ value: number | null; dir: 'left' | 'right' }> = ({ value, dir }) => (
    // 바깥쪽(영역 가장자리) 24px 여백 — 트랙(배경) = slate-800 둥근 바, 그 위에 값만큼 등급 색 막대
    <div className={dir === 'left' ? 'pl-6' : 'pr-6'}>
        <div className="h-4 relative rounded-full bg-slate-800">
            {value != null && (
                <div
                    className={`absolute inset-y-0 rounded-full ${dir === 'left' ? 'right-0' : 'left-0'} transition-[width] duration-300 ease-out motion-reduce:transition-none`}
                    style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: getAttrBarColor(value) }}
                />
            )}
        </div>
    </div>
);

export default MultiPlayerCompareView;
