
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from '../../../components/common/Spinner';
import { RefreshCw, Search, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLeagueContext } from '../league/LeagueLayout';
import { useMultiSearchData } from '../../../hooks/useMultiSearchData';
import { usePlayerShortCodes } from '../../../hooks/usePlayerShortCodes';
import { Table, TableHead, TableBody, TableHeaderCell, TableCell } from '../../../components/common/Table';
import { OvrBadge } from '../../../components/common/OvrBadge';
import { PlayerHoverCard } from '../../../components/common/PlayerHoverCard';
import { calculatePlayerOvr } from '../../../utils/constants';
import { COMPACT_ATTR_GROUPS, ATTR_NAME_MAP, getCompactAttrValue } from '../../../data/attributeConfig';
import { IconButton } from '../../../components/common/IconButton';
import { Pagination } from '../../../components/common/Pagination';
import { CheckboxFilterDropdown } from '../../../components/common/filters/CheckboxFilterDropdown';
import { StatFilterBar, FilterChips, type StatFilterDraft } from '../../../components/common/filters/StatFilterBar';
import { compareOperator, type Operator } from '../../../utils/statFilter';

interface StatFilterItem {
    id: string;
    attrKey: string;
    operator: Operator;
    value: number;
    label: string;
}

// 드래프트 풀 전체 조회 화면 — /pool. [2026-09-11] "드래프트가 끝나기 전엔 로스터가
// 없어서 어떤 선수가 있는지 볼 방법이 없다"는 문제를 해결하기 위해 신설. MultiFreeAgentView.tsx
// (자유 계약 화면)와 동일한 구조/스타일을 그대로 따르되(사용자 요청: "FA 화면처럼"),
// - FA 화면은 rosterMap에 없는(=아직 어느 팀에도 없는) 선수만 걸러서 보여주지만, 이 화면은
// "모든 드래프트 풀 선수"를 그대로 보여준다(드래프트 완료 후에도 조회 가능).
// - FA 전용 기능(계약 서명, 연봉, myTeamRow)은 이 화면과 무관해 전부 제거. 드래프트된 팀을
// 보여주는 "팀" 컬럼도 한 차례 추가했다가 사용자 요청으로 제거(2026-09-11).

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

// [2026-09-03] MultiFreeAgentView.tsx와 동일 — COMPACT_ATTR_GROUPS(36개 raw 능력치를 21개로
// 압축한 표시 전용 뷰, data/attributeConfig.ts)를 평탄화해서 전부 컬럼으로 노출.
const ATTR_ITEMS = COMPACT_ATTR_GROUPS.flatMap(g => g.items);
const ATTR_FILTER_OPTIONS = ATTR_ITEMS.map(i => ({ value: i.key, label: i.label }));

const MultiDraftPoolView: React.FC = () => {
    const { league, leagueTeams, isLoading: leagueLoading } = useLeagueContext();
    const { poolPlayers, refetchPool, isPoolFetching } = useMultiSearchData(league, leagueTeams);
    const { getPlayerUrlId } = usePlayerShortCodes();
    const navigate = useNavigate();
    const { leagueId } = useParams<{ leagueId: string }>();

    const [nameQuery, setNameQuery] = useState('');
    const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
    const [selectedArchetypes, setSelectedArchetypes] = useState<string[]>([]);

    const [statFilters, setStatFilters] = useState<StatFilterItem[]>([]);

    // 드래프트풀 전체(poolPlayers, league.draft_pool 설정 기준) — FA 화면과 달리 로스터
    // 배정 여부와 무관하게 전부 보여준다. OVR 계산은 정렬 비교 함수 안에서 매번 하면 비용이
    // 크므로(MultiFreeAgentView.tsx와 동일한 이유) Schwartzian transform으로 1회만 계산.
    const sortedPlayers = useMemo(() => {
        const withOvr = poolPlayers.map(p => ({ p, ovr: calculatePlayerOvr(p) }));
        withOvr.sort((a, b) => b.ovr - a.ovr || a.p.id.localeCompare(b.p.id));
        return withOvr.map(x => x.p);
    }, [poolPlayers]);

    const archetypeOptions = useMemo(
        () => [...new Set(sortedPlayers.map(p => p.archetype).filter((a): a is string => !!a))].sort(),
        [sortedPlayers],
    );

    const filteredPlayers = useMemo(() => {
        const q = nameQuery.trim();
        return sortedPlayers.filter(p => {
            if (q && !p.name.includes(q)) return false;
            if (selectedPositions.length > 0 && !selectedPositions.includes(p.position)) return false;
            if (selectedArchetypes.length > 0 && (!p.archetype || !selectedArchetypes.includes(p.archetype))) return false;
            for (const f of statFilters) {
                const item = ATTR_ITEMS.find(i => i.key === f.attrKey);
                if (!item) continue;
                if (!compareOperator(getCompactAttrValue(p, item), f.operator, f.value)) return false;
            }
            return true;
        });
    }, [sortedPlayers, nameQuery, selectedPositions, selectedArchetypes, statFilters]);

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);
    useEffect(() => setCurrentPage(1), [nameQuery, selectedPositions, selectedArchetypes, statFilters]);
    const pagedPlayers = filteredPlayers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const handleItemsPerPageChange = (val: number) => {
        setItemsPerPage(val);
        setCurrentPage(1);
    };

    const handleAddStatFilter = (draft: StatFilterDraft) => {
        setStatFilters(prev => [...prev, { id: `${Date.now()}`, attrKey: draft.category, operator: draft.operator, value: draft.value, label: draft.label }]);
    };

    if (leagueLoading) {
        return (
            <Spinner variant="page" />
        );
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex flex-col shrink-0 bg-slate-900 border-b border-slate-800">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <h1 className="text-lg font-black text-white ko-tight truncate shrink-0">드래프트 풀</h1>
                    {/* [2026-10-25] 선수 풀은 브라우저에 캐시돼 있어(어드민 편집이 자동 반영되지 않음) 사용자가 직접 새로 받는다 */}
                    <IconButton label="선수 데이터 새로고침" size="md" tone="subtle" onClick={() => { void refetchPool(); }} disabled={isPoolFetching}>
                        <RefreshCw size={14} className={isPoolFetching ? 'animate-spin' : ''} />
                    </IconButton>

                    <div className="flex flex-wrap items-center gap-3 ml-auto">
                        <div className="relative h-[36px] bg-slate-950 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors shadow-sm shrink-0 w-48">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                                <Search size={14} />
                            </div>
                            <input
                                type="text"
                                placeholder="이름으로 검색"
                                value={nameQuery}
                                onChange={e => setNameQuery(e.target.value)}
                                className="h-full w-full bg-transparent pl-9 pr-3 text-sm font-bold text-white outline-none placeholder:text-slate-600"
                            />
                            {nameQuery && (
                                <IconButton label="검색어 지우기" size="xs" tone="ghost" onClick={() => setNameQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                                    <X size={12} />
                                </IconButton>
                            )}
                        </div>

                        <CheckboxFilterDropdown label="포지션" options={[...POSITIONS]} selected={selectedPositions} onChange={setSelectedPositions} />
                        <CheckboxFilterDropdown label="아키타입" options={archetypeOptions} selected={selectedArchetypes} onChange={setSelectedArchetypes} />

                        <StatFilterBar options={ATTR_FILTER_OPTIONS} onAdd={handleAddStatFilter} />
                    </div>
                </div>

                <FilterChips chips={statFilters} onRemove={id => setStatFilters(prev => prev.filter(f => f.id !== id))} onClear={() => setStatFilters([])} />
            </div>

            <div className="flex-1 min-h-0">
                <Table className="!rounded-none !border-x-0 !border-t-0" fullHeight tableStyle={{ tableLayout: 'auto', width: '100%' }}>
                    <TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm" noRow>
                        <tr className="h-10 text-slate-400 text-sm font-bold">
                            <TableHeaderCell align="left" className="pl-4 bg-slate-950">선수</TableHeaderCell>
                            <TableHeaderCell align="center" className="bg-slate-950">포지션</TableHeaderCell>
                            <TableHeaderCell align="center" className="bg-slate-950">나이</TableHeaderCell>
                            <TableHeaderCell align="center" className="bg-slate-950">키</TableHeaderCell>
                            <TableHeaderCell align="center" className="bg-slate-950">몸무게</TableHeaderCell>
                            <TableHeaderCell align="center" className="bg-slate-950">OVR</TableHeaderCell>
                            {ATTR_ITEMS.map(item => (
                                <TableHeaderCell
                                    key={item.key}
                                    className="bg-slate-950"
                                    title={item.sourceKeys.map(k => ATTR_NAME_MAP[k] || k).join(' + ')}
                                >
                                    {item.label}
                                </TableHeaderCell>
                            ))}
                        </tr>
                    </TableHead>
                    <TableBody>
                        {pagedPlayers.length === 0 ? (
                            <tr>
                                <TableCell colSpan={6 + ATTR_ITEMS.length} className="text-center text-slate-500 text-sm py-10">
                                    조건에 맞는 선수가 없습니다.
                                </TableCell>
                            </tr>
                        ) : pagedPlayers.map(p => {
                            return (
                                <tr key={p.id}>
                                    <TableCell align="left" className="pl-4 py-2">
                                        <PlayerHoverCard player={p}>
                                            <span
                                                onClick={() => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(p.id)}`)}
                                                className="text-slate-200 ko-normal text-sm font-semibold cursor-pointer hover:underline hover:text-indigo-400 whitespace-nowrap"
                                            >
                                                {p.name}
                                            </span>
                                        </PlayerHoverCard>
                                    </TableCell>
                                    <TableCell align="center" className="text-sm text-slate-400">{p.position}</TableCell>
                                    <TableCell align="center" className="text-sm text-slate-400">{p.age}</TableCell>
                                    <TableCell align="center" className="text-sm text-slate-400">{p.height}</TableCell>
                                    <TableCell align="center" className="text-sm text-slate-400">{p.weight}</TableCell>
                                    <TableCell align="center" className="">
                                        <div className="flex justify-center"><OvrBadge value={calculatePlayerOvr(p)} size="sm" className="!shadow-none" /></div>
                                    </TableCell>
                                    {ATTR_ITEMS.map(item => (
                                        <TableCell
                                            key={item.key}
                                            align="center"
                                            className="font-semibold text-sm"
                                            value={getCompactAttrValue(p, item)}
                                            variant="attribute"
                                            colorScale
                                        />
                                    ))}
                                </tr>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            <Pagination
                page={currentPage}
                pageSize={itemsPerPage}
                totalItems={filteredPlayers.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={handleItemsPerPageChange}
            />
        </div>
    );
};

export default MultiDraftPoolView;
