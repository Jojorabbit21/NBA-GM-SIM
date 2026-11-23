import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { DepthChart, Player } from '../../types';
import { Table, TableHead, TableBody, TableHeaderCell, TableCell } from '../../components/common/Table';
import { OvrBadge } from '../../components/common/OvrBadge';
import { PlayerHoverCard } from '../../components/common/PlayerHoverCard';
import { TeamLogo } from '../../components/common/TeamLogo';
import { Button } from '../../components/common/Button';
import { IconButton } from '../../components/common/IconButton';
import { Pagination } from '../../components/common/Pagination';
import { Spinner } from '../../components/common/Spinner';
import { InlineNotice } from '../../components/common/InlineNotice';
import { CheckboxFilterDropdown } from '../../components/common/filters/CheckboxFilterDropdown';
import { TogglePill } from '../../components/mobile/TogglePill';
import { CloseX } from '../../components/home/homeIcons';
import { COMPACT_ATTR_GROUPS, ATTR_NAME_MAP, getCompactAttrValue } from '../../data/attributeConfig';
import { TEAM_DATA } from '../../data/teamData';
import { calculatePlayerOvr } from '../../utils/constants';
import { getTeamTheme } from '../../utils/teamTheme';
import { QUICK_ROSTER_MAX } from '../../utils/quickPlay';
import { useQuickPlayerPool, usePrefetchQuickPool } from './useQuickPlayerPool';
import { QuickDepthChart } from './QuickDepthChart';
import { QuickTeamPicker } from './QuickTeamPicker';
import { QUICK_SIDES, QUICK_SIDE_LABEL, slottedIds, type QuickSide, type QuickSideState } from './quickGameTypes';

// [2026-11-23] Quick Game 1단계.
// 왼쪽(풀 블리드 패널): 원정/홈 전환 → 큰 팀 드롭다운 → 뎁스 차트(15슬롯, 드래그 교체·선수 드롭다운). 슬롯에 든 선수가 경기 로스터.
// 오른쪽: 선수 풀 표(드래프트 풀 화면과 같은 표·검색·포지션 필터·능력치 열 + 올타임 토글). "추가" = 지금 보이는 진영의 빈 슬롯으로.
// 같은 선수는 두 팀에 동시에 넣을 수 없다(엔진이 선수 id로 양 팀을 구분).

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
const ATTR_ITEMS = COMPACT_ATTR_GROUPS.flatMap(g => g.items);
const PAGE_SIZE_DEFAULT = 50;

type SortKey = 'name' | 'position' | 'age' | 'ovr' | string;
type SortState = { key: SortKey; dir: 'asc' | 'desc' };

const SearchGlyph: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.75" />
        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
);

// ── 선수 풀 행(메모) ──────────────────────────────────────────────────────────────
// [2026-11-23] 성능 — 팀 선택·추가·빼기마다 진영 상태가 바뀌어 표 50행×27열이 통째로 다시 그려지던 것(트레이스 분석: 클릭당 ~125ms 중
// TableCell 재렌더 + 그에 비례한 개발 모드 검사)을 행 단위로 끊는다. 능력치 칸(PoolStaticCells)은 선수가 바뀔 때만,
// 행(PoolRow)은 동작 버튼 상태(아이콘·비활성·하이라이트)가 바뀔 때만 다시 그린다. 클릭은 안정 콜백(onAct) → 부모 ref의 최신 로직.
type RowActionState = { icon: 'add' | 'remove'; disabled: boolean; label: string };

const PoolStaticCells = React.memo(function PoolStaticCells({ player: p, team, isPhone }: { player: Player; team: string | undefined; isPhone: boolean }) {
    return (
        <>
            <TableCell align="left" className="py-2">
                <PlayerHoverCard player={p}>
                    <span className="text-slate-200 ko-normal text-sm font-semibold whitespace-nowrap">{p.name}</span>
                </PlayerHoverCard>
            </TableCell>
            <TableCell align="center">
                {team && TEAM_DATA[team]
                    ? <div className="flex justify-center"><TeamLogo teamId={team} size="sm" className="shrink-0" /></div>
                    : <span className="text-sm text-slate-600">—</span>}
            </TableCell>
            <TableCell align="center" className="text-sm text-slate-400 whitespace-nowrap">{p.position}</TableCell>
            {!isPhone && <TableCell align="center" className="text-sm text-slate-400">{p.age}</TableCell>}
            <TableCell align="center">
                <div className="flex justify-center"><OvrBadge value={calculatePlayerOvr(p)} size="sm" className="!shadow-none" /></div>
            </TableCell>
            {!isPhone && ATTR_ITEMS.map(item => (
                <TableCell key={item.key} align="center" className="font-semibold text-sm" value={getCompactAttrValue(p, item)} variant="attribute" colorScale />
            ))}
        </>
    );
});

const PoolRow = React.memo(function PoolRow({ player, team, isPhone, icon, disabled, label, taken, onAct }: RowActionState & {
    player: Player; team: string | undefined; isPhone: boolean; taken: boolean; onAct: (p: Player) => void;
}) {
    const Icon = icon === 'remove' ? Minus : Plus;
    return (
        <tr
            onClick={disabled ? undefined : () => onAct(player)}
            className={`${taken ? 'bg-slate-800/40' : ''} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        >
            <TableCell align="center" className="pl-4 py-2">
                <IconButton
                    label={label}
                    size="xs"
                    tone="inherit"
                    shape="full"
                    onClick={e => { e.stopPropagation(); if (!disabled) onAct(player); }}
                    disabled={disabled}
                    className={`mx-auto text-white ${disabled ? 'bg-slate-700 text-slate-500' : icon === 'remove' ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                >
                    <Icon size={12} />
                </IconButton>
            </TableCell>
            <PoolStaticCells player={player} team={team} isPhone={isPhone} />
        </tr>
    );
});

interface QuickTeamSetupProps {
    sides: Record<QuickSide, QuickSideState>;
    activeSide: QuickSide;
    onActiveSideChange: (side: QuickSide) => void;
    onTeamChange: (side: QuickSide, teamId: string) => void;
    onDepthChange: (side: QuickSide, dc: DepthChart) => void;
    onAddPlayer: (side: QuickSide, player: Player) => void;
    onRemovePlayer: (side: QuickSide, playerId: string) => void;
    onClearRoster: (side: QuickSide) => void;
    /** 현역 풀(팀 실제 로스터 원천)을 아직 받는 중 — 팀 드롭다운 비활성 */
    teamsLoading: boolean;
    isPhone: boolean;
}

export const QuickTeamSetup: React.FC<QuickTeamSetupProps> = ({
    sides, activeSide, onActiveSideChange, onTeamChange, onDepthChange, onAddPlayer, onRemovePlayer, onClearRoster, teamsLoading, isPhone,
}) => {
    const [alltime, setAlltime] = useState(false);
    const { players: pool, teamOf, isLoading, isError, isSwitching, refetch } = useQuickPlayerPool(alltime ? 'alltime' : 'current');
    usePrefetchQuickPool('alltime');
    const [nameQuery, setNameQuery] = useState('');
    const [positions, setPositions] = useState<string[]>([]);
    const [sort, setSort] = useState<SortState>({ key: 'ovr', dir: 'desc' });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);

    // 선수 id → 어느 진영 슬롯에 들어가 있는지
    const sideOf = useMemo(() => {
        const m = new Map<string, QuickSide>();
        for (const s of QUICK_SIDES) for (const id of slottedIds(sides[s].depthChart)) m.set(id, s);
        return m;
    }, [sides]);
    const slotCount = (s: QuickSide) => slottedIds(sides[s].depthChart).length;

    const filtered = useMemo(() => {
        const q = nameQuery.trim().toLowerCase();
        return pool.filter(p => {
            if (q && !p.name.toLowerCase().includes(q)) return false;
            if (positions.length > 0 && !p.position.split('/').some(pos => positions.includes(pos.trim()))) return false;
            return true;
        });
    }, [pool, nameQuery, positions]);

    const sorted = useMemo(() => {
        const item = ATTR_ITEMS.find(i => i.key === sort.key);
        const val = (p: Player): number | string => {
            if (sort.key === 'name') return p.name;
            if (sort.key === 'position') return p.position;
            if (sort.key === 'age') return p.age;
            if (sort.key === 'ovr') return calculatePlayerOvr(p);
            return item ? getCompactAttrValue(p, item) : 0;
        };
        const dir = sort.dir === 'asc' ? 1 : -1;
        return [...filtered].sort((a, b) => {
            const va = val(a), vb = val(b);
            const c = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
            return c !== 0 ? c * dir : a.id.localeCompare(b.id);
        });
    }, [filtered, sort]);

    const maxPage = Math.max(1, Math.ceil(sorted.length / pageSize));
    const curPage = Math.min(page, maxPage);
    const paged = sorted.slice((curPage - 1) * pageSize, curPage * pageSize);

    const handleSort = (key: SortKey) => {
        const firstDir = key === 'name' || key === 'position' ? 'asc' : 'desc';
        if (sort.key !== key) setSort({ key, dir: firstDir });
        else setSort({ key, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    };
    const sortProps = (key: SortKey) => ({ sortable: true, sortDirection: sort.key === key ? sort.dir : null, onSort: () => handleSort(key) });

    const active = sides[activeSide];
    const activeFull = slotCount(activeSide) >= QUICK_ROSTER_MAX;
    const otherSide: QuickSide = activeSide === 'away' ? 'home' : 'away';

    // 추가·제거 버튼 — 멀티 트레이드 선수 이동 표(MultiFrontOfficeView PlayerChip)와 같은 원형 아이콘 버튼(초록 + / 빨강 −).
    // 상대 진영 선수(지금 보이는 진영이 아닌 쪽에 들어간 선수)·정원 초과·팀 미선택은 회색 비활성.
    const rowAction = (p: Player): RowActionState => {
        const where = sideOf.get(p.id);
        if (where === activeSide) return { icon: 'remove', disabled: false, label: '빼기' };
        if (where) return { icon: 'remove', disabled: true, label: `${QUICK_SIDE_LABEL[where]} 로스터 선수` };
        return { icon: 'add', disabled: !active.teamId || activeFull, label: '추가' };
    };
    // 행 클릭/버튼 — 안정 콜백(메모 행이 다시 그려지지 않게), 실행 시점의 최신 상태로 판정
    const actRef = useRef({ sideOf, activeSide, onAddPlayer, onRemovePlayer });
    actRef.current = { sideOf, activeSide, onAddPlayer, onRemovePlayer };
    const handleAct = useCallback((p: Player) => {
        const { sideOf: so, activeSide: side, onAddPlayer: add, onRemovePlayer: remove } = actRef.current;
        const where = so.get(p.id);
        if (where === side) remove(side, p.id);
        else if (!where) add(side, p);
    }, []);

    // ── 왼쪽: 팀 패널 ────────────────────────────────────────────────────────────
    const activeTeam = active.teamId ? TEAM_DATA[active.teamId] : null;
    // 팀 영역(진영 탭·팀 드롭다운·로스터 줄) 배경 = 팀 테마(공용 TabBar theme 모드와 같은 bg/text/accent). 팀 미선택은 기본 slate.
    const theme = activeTeam ? getTeamTheme(active.teamId, activeTeam.colors) : null;
    const otherSlotted = useMemo(() => new Set(slottedIds(sides[otherSide].depthChart)), [sides, otherSide]);
    const dropdownCandidates = useMemo(() => active.candidates.filter(p => !otherSlotted.has(p.id)), [active.candidates, otherSlotted]);

    const teamPanel = (
        <aside className={`${isPhone ? 'shrink-0 h-[46vh] min-h-[300px] border-b' : 'w-[400px] shrink-0 border-r'} border-slate-800 bg-slate-950 flex flex-col min-h-0`}>
            {/* 원정/홈 — 패널 폭을 꽉 채우는 탭 그룹. 탭마다 그 진영 팀의 테마 배경(팀 미선택 = 배경 없음), 선택된 탭은 밑줄로 표시 */}
            <div role="tablist" aria-label="진영" className="shrink-0 grid grid-cols-2 h-12 border-b border-slate-800">
                {QUICK_SIDES.map(s => {
                    const on = s === activeSide;
                    const tid = sides[s].teamId;
                    const t = tid ? TEAM_DATA[tid] : null;
                    const th = t ? getTeamTheme(tid, t.colors) : null;
                    return (
                        <button
                            key={s}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            onClick={() => onActiveSideChange(s)}
                            className={`h-full flex items-center justify-center border-b-2 font-bold text-base ko-normal transition-colors duration-100 ${
                                th ? '' : on ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 hover:text-slate-300 border-transparent'
                            }`}
                            style={th ? { backgroundColor: th.bg, color: th.text, borderColor: on ? th.accent : 'transparent' } : undefined}
                        >
                            {s === 'home' ? '홈(내 팀)' : QUICK_SIDE_LABEL[s]}
                        </button>
                    );
                })}
            </div>
            <div
                className={`shrink-0 flex flex-col transition-colors duration-100 ${theme ? '' : 'bg-slate-900'}`}
                style={theme ? { backgroundColor: theme.bg, color: theme.text } : undefined}
            >
            <QuickTeamPicker
                teamId={active.teamId}
                takenTeamId={sides[otherSide].teamId}
                takenLabel={QUICK_SIDE_LABEL[otherSide]}
                loading={teamsLoading}
                themed={!!theme}
                isPhone={isPhone}
                onSelect={teamId => onTeamChange(activeSide, teamId)}
            />
            <div className={`shrink-0 h-11 px-4 flex items-center gap-3 border-b ${theme ? 'border-black/20' : 'border-slate-800'}`}>
                <span className={`text-sm font-bold ${theme ? 'opacity-70' : 'text-slate-400'}`}>로스터</span>
                <span className={`text-sm font-bold tabular-nums ${theme ? '' : 'text-white'}`}>
                    {slotCount(activeSide)}/{QUICK_ROSTER_MAX}
                </span>
                <Button variant="secondary" size="sm" className="ml-auto" onClick={() => onClearRoster(activeSide)} disabled={slotCount(activeSide) === 0}>
                    비우기
                </Button>
            </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                {active.teamId && (
                    <QuickDepthChart
                        key={activeSide}
                        depthChart={active.depthChart}
                        candidates={dropdownCandidates}
                        onChange={dc => onDepthChange(activeSide, dc)}
                    />
                )}
            </div>
        </aside>
    );

    // ── 오른쪽: 선수 풀 ──────────────────────────────────────────────────────────
    const poolToolbar = (
        <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800">
            <div className={`relative h-9 bg-slate-950 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors shrink-0 ${isPhone ? 'flex-1 min-w-0' : 'w-56'}`}>
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"><SearchGlyph /></span>
                <input
                    type="text"
                    placeholder="이름으로 검색"
                    value={nameQuery}
                    onChange={e => { setNameQuery(e.target.value); setPage(1); }}
                    className="h-full w-full bg-transparent pl-9 pr-8 text-sm font-bold text-white outline-none placeholder:text-slate-600"
                />
                {nameQuery && (
                    <IconButton label="검색어 지우기" size="xs" tone="ghost" onClick={() => { setNameQuery(''); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2">
                        <CloseX size={12} />
                    </IconButton>
                )}
            </div>
            <CheckboxFilterDropdown label="포지션" options={[...POSITIONS]} selected={positions} onChange={v => { setPositions(v); setPage(1); }} />
            <div className="ml-auto flex items-center gap-2">
                {isSwitching && <Spinner variant="inline" />}
                <TogglePill left="올타임" on={alltime} onClick={() => { setAlltime(a => !a); setPage(1); }} />
            </div>
        </div>
    );

    const poolBody = isLoading ? (
        <Spinner variant="section" />
    ) : isError ? (
        <div className="p-6 flex items-center gap-3">
            <InlineNotice tone="danger">선수 목록을 불러오지 못했습니다.</InlineNotice>
            <Button variant="secondary" onClick={() => { void refetch(); }}>다시 시도</Button>
        </div>
    ) : (
        <Table className="!rounded-none !border-x-0 !border-t-0" fullHeight tableStyle={{ tableLayout: 'auto', width: '100%' }}>
            <TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm" noRow>
                <tr className="h-10 text-slate-400 text-sm font-bold">
                    <TableHeaderCell align="center" className="pl-4 bg-slate-950" width={52}><span className="sr-only">동작</span></TableHeaderCell>
                    <TableHeaderCell align="left" className="bg-slate-950" {...sortProps('name')}>선수</TableHeaderCell>
                    <TableHeaderCell align="center" className="bg-slate-950">팀</TableHeaderCell>
                    <TableHeaderCell align="center" className="bg-slate-950" {...sortProps('position')}>포지션</TableHeaderCell>
                    {!isPhone && <TableHeaderCell align="center" className="bg-slate-950" {...sortProps('age')}>나이</TableHeaderCell>}
                    <TableHeaderCell align="center" className="bg-slate-950" {...sortProps('ovr')}>OVR</TableHeaderCell>
                    {!isPhone && ATTR_ITEMS.map(item => (
                        <TableHeaderCell key={item.key} className="bg-slate-950" {...sortProps(item.key)} title={item.sourceKeys.map(k => ATTR_NAME_MAP[k] || k).join(' + ')}>
                            {item.label}
                        </TableHeaderCell>
                    ))}
                </tr>
            </TableHead>
            <TableBody>
                {paged.length === 0 ? (
                    <tr>
                        <TableCell colSpan={isPhone ? 5 : 6 + ATTR_ITEMS.length} className="text-center text-slate-500 text-sm py-10">
                            조건에 맞는 선수가 없습니다.
                        </TableCell>
                    </tr>
                ) : paged.map(p => {
                    const a = rowAction(p);
                    return (
                        <PoolRow
                            key={p.id}
                            player={p}
                            team={teamOf[p.id]}
                            isPhone={isPhone}
                            icon={a.icon}
                            disabled={a.disabled}
                            label={a.label}
                            taken={sideOf.has(p.id)}
                            onAct={handleAct}
                        />
                    );
                })}
            </TableBody>
        </Table>
    );

    const poolSection = (
        <section aria-label="선수 풀" className="flex-1 min-w-0 min-h-0 flex flex-col">
            {poolToolbar}
            <div className="flex-1 min-h-0">{poolBody}</div>
            <Pagination
                page={curPage}
                pageSize={pageSize}
                totalItems={sorted.length}
                onPageChange={setPage}
                onPageSizeChange={isPhone ? undefined : v => { setPageSize(v); setPage(1); }}
                compact={isPhone}
            />
        </section>
    );

    return (
        <div className={`flex-1 min-h-0 flex ${isPhone ? 'flex-col' : ''}`}>
            {teamPanel}
            {poolSection}
        </div>
    );
};
