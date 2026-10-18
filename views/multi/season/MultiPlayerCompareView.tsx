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
import { getAttrBarColor } from '../../../utils/attrRatingColor';
import { computeCareerAvg, statsToCareerRow } from '../../../utils/careerStats';
import { COMPACT_ATTR_GROUPS, ATTR_KR_LABEL, getCompactAttrValue, type CompactAttrItem } from '../../../data/attributeConfig';
import type { Team } from '../../../types/team';
import type { Player, PlayerStats, CareerSeasonStat } from '../../../types/player';

// [2026-10-18] 멀티 "도구 › 선수 비교" 화면(/multi/leagues/:leagueId/season/compare).
// 좌/우 패널에서 선수를 고르면(검색 또는 팀→선수 드롭다운) 패널 하단에 선수 정보·시즌 기록,
// 가운데에 체격(텍스트)과 능력치 21개(COMPACT_ATTR_GROUPS) 양방향 막대를 그린다.
// 선택 상태는 URL(?p1=&p2=, 선수 short code)에 둬서 새로고침/뒤로가기/링크 공유가 유지되게 한다.

type Side = 0 | 1;
const PARAM: Record<Side, string> = { 0: 'p1', 1: 'p2' };
const FA_KEY = 'FA';

interface Entry { player: Player; team: Team | null }

// cmp: 'high' = 높을수록 우위, 'low' = 낮을수록 우위(턴오버·파울), 'none' = 우열 비교 안 함(출전 수·시도 수·비율)
const STAT_ITEMS: { key: string; label: string; pct?: boolean; int?: boolean; cmp: 'high' | 'low' | 'none' }[] = [
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

const formatStat = (item: typeof STAT_ITEMS[number], v: number | null | undefined) => {
    if (v == null) return '-';
    if (item.pct) return `${(v * 100).toFixed(1)}%`;
    if (item.int) return String(Math.round(v));
    return v.toFixed(1);
};

const attrLabel = (item: CompactAttrItem) =>
    item.krLabel ?? (item.sourceKeys.length === 1 ? ATTR_KR_LABEL[item.sourceKeys[0]] ?? item.label : item.label);

const MultiPlayerCompareView: React.FC = () => {
    const { league, leagueTeams, room, isLoading: leagueLoading } = useLeagueContext();
    const useCustomOverrides = shouldUseCustomOverrides(league);
    const { isLoading: gameLoading } = useSeasonContext();
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
    const statLines = selected.map((e, i) => {
        if (!e) return null;
        const p = e.player;
        const seasonRow = p.stats && (p.stats.g ?? 0) > 0
            ? statsToCareerRow(p.stats, seasonShort, e.team?.abbr ?? FA_KEY, p.age, false)
            : null;
        if (statMode === 'season') return seasonRow;
        const history = ((careers[i] as CareerSeasonStat[] | undefined) ?? []).filter(r => !r.playoff && r.season !== seasonShort);
        const avg = computeCareerAvg(seasonRow ? [seasonRow, ...history] : history, '커리어');
        return avg.gp ? avg : null;
    });

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
                    otherStatLine={statLines[1 - side]}
                    statMode={statMode}
                    seasonShort={seasonShort}
                    onStatMode={setStatMode}
                    onPickTeam={key => pickTeam(side, key)}
                    onPickPlayer={id => setPlayer(side, id)}
                />
            ))}
            <CompareChart left={selected[0]?.player ?? null} right={selected[1]?.player ?? null} />
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
    otherStatLine: Record<string, any> | null;
    statMode: 'season' | 'career';
    seasonShort: string;
    onStatMode: (m: 'season' | 'career') => void;
    onPickTeam: (key: string | null) => void;
    onPickPlayer: (id: string | null) => void;
}

// 드롭다운 트리거는 서비스 공용 FilterTrigger(36px), 값이 정해지면 active(인디고) — 팀/선수 칸 폭을 채우도록 늘린다.
const triggerFill = 'w-full justify-between overflow-hidden';

const ComparePane: React.FC<PaneProps> = ({
    side, entry, teamKey, teams, entryById, statLine, otherStatLine, statMode, seasonShort, onStatMode, onPickTeam, onPickPlayer,
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
                            rows={STAT_ITEMS.map(item => {
                                const v = statLine[item.key];
                                const o = otherStatLine?.[item.key];
                                const better = item.cmp !== 'none' && v != null && o != null && v !== o
                                    && (item.cmp === 'high' ? v > o : v < o);
                                const tone = better ? 'better' as const : undefined;
                                return { label: item.label, value: formatStat(item, v), tone };
                            })}
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

const InfoGrid: React.FC<{ rows: { label: string; value: React.ReactNode; tone?: 'better' }[] }> = ({ rows }) => {
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
                            <dd className={`m-0 tabular-nums truncate text-white ${r.tone === 'better' ? 'font-extrabold' : 'font-semibold'}`}>
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
const ROW = 'grid grid-cols-[1fr_56px_52px_128px_52px_56px_1fr] items-center';
// 라벨 칸 — 좌우 구분선이 행 높이 전체에 이어지도록 self-stretch
const LABEL_CELL = 'self-stretch flex items-center justify-center border-x border-slate-800 text-base font-semibold text-slate-300 whitespace-nowrap';

// 체격–능력치 사이 여백 행(14px) — 라벨 칸 구분선만 그린다
const GroupSpacer: React.FC = () => (
    <div className={`${ROW} h-3.5`} aria-hidden="true">
        <div /><div /><div /><div className={LABEL_CELL} /><div /><div /><div />
    </div>
);

// 우위 쪽 값과 라벨 사이에 붙는 차이(+n) 배지 — 빨강 100%, 아래로 갈수록 어두워지는 그라디언트. 우위가 아니면 빈 칸
// 배지는 값 쪽 정렬(왼쪽 선수 = 칸 왼쪽, 오른쪽 선수 = 칸 오른쪽). 칸 폭 52px라 두 자리 배지(~36px)도
// 라벨 구분선과 14px 이상 떨어진다.
const DeltaCell: React.FC<{ delta: number | null; side: 'left' | 'right' }> = ({ delta, side }) => (
    <div className={`flex ${side === 'left' ? 'justify-start' : 'justify-end'}`}>
        {delta != null && delta > 0 && (
            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-gradient-to-b from-red-500 to-red-700 text-[12px] leading-none font-bold text-white tabular-nums">
                +{delta}
            </span>
        )}
    </div>
);

const CompareChart: React.FC<{ left: Player | null; right: Player | null }> = ({ left, right }) => {
    const both = !!left && !!right;
    const nameCell = (p: Player | null, r: boolean) => (
        <div className={`min-w-0 truncate ${r ? 'text-left pl-2.5' : 'text-right pr-2.5'} ${p ? 'text-[15px] font-bold text-white' : 'text-[13px] font-medium text-slate-600'}`}>
            {p ? p.name : `${r ? '두 번째' : '첫 번째'} 선수를 선택하세요`}
        </div>
    );
    const physRow = (label: string, key: 'height' | 'weight', unit: string) => (
        <div className={`${ROW} h-8`}>
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
            {/* 그룹 사이 여백을 flex gap 대신 GroupSpacer 행으로 둔다 — 라벨 칸 좌우 구분선이 신장부터 마지막 능력치까지 끊김 없이 이어지게. */}
            {/* 헤더(선수 이름) — 배경을 영역 전체 폭으로 깔고(slate-900), 이름 격자만 차트와 같은 760px 폭에 맞춘다 */}
            <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-700 shrink-0">
                <div className="w-full max-w-[760px] mx-auto px-6 py-3 grid grid-cols-[1fr_128px_1fr] items-center">
                    {nameCell(left, false)}
                    <div />
                    {nameCell(right, true)}
                </div>
            </div>
            <div className="w-full max-w-[760px] mx-auto px-6 pt-1.5 pb-6 flex flex-col">
                {physRow('신장', 'height', 'cm')}
                {physRow('체중', 'weight', 'kg')}
                {/* 체격과 능력치 사이에만 여백 — 능력치 그룹끼리는 붙여서 이어 표시 */}
                <GroupSpacer />
                {COMPACT_ATTR_GROUPS.map(g => (
                    <React.Fragment key={g.id}>
                        {g.items.map(item => {
                            const a = left ? getCompactAttrValue(left, item) : null;
                            const b = right ? getCompactAttrValue(right, item) : null;
                            const lTone = both ? (a! > b! ? 'win' : a! < b! ? 'lose' : '') : '';
                            const rTone = both ? (b! > a! ? 'win' : b! < a! ? 'lose' : '') : '';
                            return (
                                <div key={item.key} className={`${ROW} h-8 hover:bg-slate-400/5`}>
                                    <Bar value={a} dir="left" />
                                    <div
                                        className={`text-center text-base tabular-nums ${lTone === 'win' ? 'font-extrabold' : 'font-semibold'}`}
                                        style={a != null ? { color: getAttrBarColor(a) } : undefined}
                                    >
                                        {a ?? <span className="text-slate-500">–</span>}
                                    </div>
                                    <DeltaCell side="left" delta={lTone === 'win' ? a! - b! : null} />
                                    <div className={LABEL_CELL}>{attrLabel(item)}</div>
                                    <DeltaCell side="right" delta={rTone === 'win' ? b! - a! : null} />
                                    <div
                                        className={`text-center text-base tabular-nums ${rTone === 'win' ? 'font-extrabold' : 'font-semibold'}`}
                                        style={b != null ? { color: getAttrBarColor(b) } : undefined}
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
        </section>
    );
};

const Bar: React.FC<{ value: number | null; dir: 'left' | 'right' }> = ({ value, dir }) => (
    // 트랙(배경) = slate-800 둥근 바, 그 위에 값만큼 등급 색 막대
    <div className="h-4 relative rounded-full bg-slate-800">
        {value != null && (
            <div
                className={`absolute inset-y-0 rounded-full ${dir === 'left' ? 'right-0' : 'left-0'} transition-[width] duration-300 ease-out motion-reduce:transition-none`}
                style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: getAttrBarColor(value) }}
            />
        )}
    </div>
);

export default MultiPlayerCompareView;
