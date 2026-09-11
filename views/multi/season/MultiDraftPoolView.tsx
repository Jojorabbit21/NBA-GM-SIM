
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, X, ChevronDown, Check, Filter, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLeagueContext } from '../league/LeagueLayout';
import { useMultiSearchData } from '../../../hooks/useMultiSearchData';
import { usePlayerShortCodes } from '../../../hooks/usePlayerShortCodes';
import { Table, TableHead, TableBody, TableHeaderCell, TableCell } from '../../../components/common/Table';
import { Dropdown } from '../../../components/common/Dropdown';
import { OvrBadge } from '../../../components/common/OvrBadge';
import { PlayerHoverCard } from '../../../components/common/PlayerHoverCard';
import { calculatePlayerOvr } from '../../../utils/constants';
import { COMPACT_ATTR_GROUPS, ATTR_NAME_MAP, getCompactAttrValue } from '../../../data/attributeConfig';

type Operator = '>' | '<' | '>=' | '<=' | '=';
const OPERATORS: Operator[] = ['>=', '<=', '>', '<', '='];

function compareOperator(value: number, operator: Operator, target: number): boolean {
    switch (operator) {
        case '>=': return value >= target;
        case '<=': return value <= target;
        case '>':  return value > target;
        case '<':  return value < target;
        case '=':  return value === target;
    }
}

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
//   "모든 드래프트 풀 선수"를 그대로 보여준다(드래프트 완료 후에도 조회 가능).
// - FA 전용 기능(계약 서명, 연봉, myTeamRow)은 이 화면과 무관해 전부 제거. 드래프트된 팀을
//   보여주는 "팀" 컬럼도 한 차례 추가했다가 사용자 요청으로 제거(2026-09-11).

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

// [2026-09-03] MultiFreeAgentView.tsx와 동일 — COMPACT_ATTR_GROUPS(36개 raw 능력치를 21개로
// 압축한 표시 전용 뷰, data/attributeConfig.ts)를 평탄화해서 전부 컬럼으로 노출.
const ATTR_ITEMS = COMPACT_ATTR_GROUPS.flatMap(g => g.items);

// [2026-09-03] MultiFreeAgentView.tsx의 CheckboxFilterDropdown과 동일(리더보드 필터 시각
// 언어 복사본) — 재사용 가능한 공용 컴포넌트로 분리돼 있지 않아 그대로 복제.
const CheckboxFilterDropdown: React.FC<{
    label: string;
    options: string[];
    selected: string[];
    onToggle: (value: string) => void;
    onToggleAll: () => void;
}> = ({ label, options, selected, onToggle, onToggleAll }) => {
    const [isOpen, setIsOpen] = useState(false);
    const btnRef = useRef<HTMLButtonElement>(null);
    const [pos, setPos] = useState({ top: 0, right: 0 });
    const allSelected = options.length > 0 && selected.length === options.length;

    const handleToggleOpen = () => {
        if (!isOpen && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
        }
        setIsOpen(v => !v);
    };

    return (
        <div className="relative">
            <button
                ref={btnRef}
                onClick={handleToggleOpen}
                className={`flex items-center gap-2 h-[36px] px-3 bg-slate-950 rounded-lg border shadow-sm text-sm font-bold transition-colors ${
                    selected.length > 0
                        ? 'border-indigo-500/50 text-indigo-400'
                        : 'border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white'
                }`}
            >
                <span>{label}</span>
                {selected.length > 0 && (
                    <span className="bg-indigo-600 text-white text-xs px-1.5 py-0.5 rounded-full">{selected.length}</span>
                )}
                <ChevronDown size={12} />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-[100]" onClick={() => setIsOpen(false)} />
                    <div
                        className="fixed w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-[101] animate-in fade-in zoom-in-95 duration-150"
                        style={{ top: pos.top, right: pos.right }}
                    >
                        <div className="p-2 max-h-80 overflow-y-auto custom-scrollbar space-y-1">
                            <div
                                onClick={onToggleAll}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
                            >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                    allSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-slate-950'
                                }`}>
                                    {allSelected && <Check size={10} className="text-white" />}
                                </div>
                                <span className={`text-sm font-bold ${allSelected ? 'text-white' : 'text-slate-400'}`}>모두 선택</span>
                            </div>
                            <div className="h-px bg-slate-800 mx-2 my-1" />
                            {options.map(opt => (
                                <div
                                    key={opt}
                                    onClick={() => onToggle(opt)}
                                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
                                >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                        selected.includes(opt) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-slate-950'
                                    }`}>
                                        {selected.includes(opt) && <Check size={10} className="text-white" />}
                                    </div>
                                    <span className={`text-sm font-bold truncate ${selected.includes(opt) ? 'text-white' : 'text-slate-400'}`}>{opt}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

const MultiDraftPoolView: React.FC = () => {
    const { league, leagueTeams, isLoading: leagueLoading } = useLeagueContext();
    const { poolPlayers } = useMultiSearchData(league, leagueTeams);
    const { getPlayerUrlId } = usePlayerShortCodes();
    const navigate = useNavigate();
    const { leagueId } = useParams<{ leagueId: string }>();

    const [nameQuery, setNameQuery] = useState('');
    const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
    const [selectedArchetypes, setSelectedArchetypes] = useState<string[]>([]);

    const [filterAttrKey, setFilterAttrKey] = useState(ATTR_ITEMS[0]?.key ?? '');
    const [filterOp, setFilterOp] = useState<Operator>('>=');
    const [filterVal, setFilterVal] = useState('');
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
    const totalPages = Math.ceil(filteredPlayers.length / itemsPerPage);
    const pagedPlayers = filteredPlayers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const handleItemsPerPageChange = (val: number) => {
        setItemsPerPage(val);
        setCurrentPage(1);
    };
    const getPageNumbers = (): (number | '...')[] => {
        if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
        const left = Math.max(2, currentPage - 2);
        const right = Math.min(totalPages - 1, currentPage + 2);
        const pages: (number | '...')[] = [1];
        if (left > 2) pages.push('...');
        for (let i = left; i <= right; i++) pages.push(i);
        if (right < totalPages - 1) pages.push('...');
        pages.push(totalPages);
        return pages;
    };

    const togglePosition = (pos: string) => setSelectedPositions(prev => prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos]);
    const toggleArchetype = (a: string) => setSelectedArchetypes(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
    const togglePositionAll = () => setSelectedPositions(prev => prev.length === POSITIONS.length ? [] : [...POSITIONS]);
    const toggleArchetypeAll = () => setSelectedArchetypes(prev => prev.length === archetypeOptions.length ? [] : [...archetypeOptions]);

    const handleAddStatFilter = () => {
        if (!filterVal) return;
        const item = ATTR_ITEMS.find(i => i.key === filterAttrKey);
        if (!item) return;
        setStatFilters(prev => [...prev, {
            id: `${Date.now()}`,
            attrKey: filterAttrKey,
            operator: filterOp,
            value: parseFloat(filterVal),
            label: `${item.label} ${filterOp} ${filterVal}`,
        }]);
        setFilterVal('');
    };
    const removeStatFilter = (id: string) => setStatFilters(prev => prev.filter(f => f.id !== id));
    const clearStatFilters = () => setStatFilters([]);

    if (leagueLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex flex-col shrink-0 bg-slate-900 border-b border-slate-800">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <h1 className="text-lg font-black text-white ko-tight truncate shrink-0">드래프트 풀</h1>

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
                                <button
                                    onClick={() => setNameQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>

                        <CheckboxFilterDropdown
                            label="포지션"
                            options={[...POSITIONS]}
                            selected={selectedPositions}
                            onToggle={togglePosition}
                            onToggleAll={togglePositionAll}
                        />
                        <CheckboxFilterDropdown
                            label="아키타입"
                            options={archetypeOptions}
                            selected={selectedArchetypes}
                            onToggle={toggleArchetype}
                            onToggleAll={toggleArchetypeAll}
                        />

                        <div className="flex items-center h-[36px] bg-slate-950 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors shadow-sm shrink-0">
                            <div className="px-3 flex items-center justify-center border-r border-slate-800 h-full text-slate-500">
                                <Filter size={14} />
                            </div>
                            <div className="border-r border-slate-800">
                                <Dropdown
                                    trigger={
                                        <button className="h-[36px] px-3 flex items-center gap-1.5 text-sm font-bold text-white transition-colors whitespace-nowrap">
                                            <span className="max-w-[96px] truncate">{ATTR_ITEMS.find(i => i.key === filterAttrKey)?.label ?? filterAttrKey}</span>
                                            <ChevronDown size={12} className="text-slate-600 shrink-0" />
                                        </button>
                                    }
                                    items={ATTR_ITEMS.map(item => ({
                                        id: item.key,
                                        label: <span className="text-sm">{item.label}</span>,
                                        onClick: () => setFilterAttrKey(item.key),
                                        active: filterAttrKey === item.key,
                                    }))}
                                    width="w-48"
                                    align="left"
                                />
                            </div>
                            <div className="border-r border-slate-800">
                                <Dropdown
                                    trigger={
                                        <button className="h-[36px] px-3 flex items-center text-sm font-bold text-indigo-400 transition-colors whitespace-nowrap">
                                            {filterOp}
                                        </button>
                                    }
                                    items={OPERATORS.map(op => ({
                                        id: op,
                                        label: <span className="text-sm">{op}</span>,
                                        onClick: () => setFilterOp(op),
                                        active: filterOp === op,
                                    }))}
                                    width="w-16"
                                    align="left"
                                />
                            </div>
                            <input
                                type="number"
                                placeholder="값"
                                className="h-full bg-transparent px-3 w-16 text-sm font-bold text-white outline-none placeholder:text-slate-700 [&::-webkit-inner-spin-button]:appearance-none"
                                value={filterVal}
                                onChange={e => setFilterVal(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddStatFilter()}
                            />
                            <button onClick={handleAddStatFilter} className="h-full px-3 flex items-center justify-center border-l border-slate-800 text-slate-500 hover:text-white hover:bg-indigo-600/20 transition-all rounded-r-lg">
                                <Plus size={14} />
                            </button>
                        </div>
                    </div>
                </div>

                {statFilters.length > 0 && (
                    <>
                        <div className="h-px bg-slate-800/60 mx-4 mb-3" />
                        <div className="px-4 pb-3 flex flex-wrap gap-2 animate-in slide-in-from-top-2">
                            {statFilters.map(f => (
                                <div key={f.id} className="flex items-center gap-2 px-3 py-1 bg-indigo-900/30 border border-indigo-500/30 rounded-full text-sm font-bold text-indigo-300">
                                    <span>{f.label}</span>
                                    <button onClick={() => removeStatFilter(f.id)} className="hover:text-white transition-colors"><X size={12} /></button>
                                </div>
                            ))}
                            <button onClick={clearStatFilters} className="text-sm font-bold text-slate-500 hover:text-red-400 underline decoration-slate-700 underline-offset-2 transition-colors ml-2">모두 제거</button>
                        </div>
                    </>
                )}
            </div>

            <div className="flex-1 min-h-0">
                <Table className="!rounded-none !border-x-0 !border-t-0" fullHeight tableStyle={{ tableLayout: 'auto', width: '100%' }}>
                    <TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm" noRow>
                        <tr className="h-10 text-slate-500 text-sm font-black uppercase">
                            <TableHeaderCell align="left" className="pl-4 border-r border-slate-800 bg-slate-950">선수</TableHeaderCell>
                            <TableHeaderCell align="center" className="border-r border-slate-800 bg-slate-950">포지션</TableHeaderCell>
                            <TableHeaderCell align="center" className="border-r border-slate-800 bg-slate-950">나이</TableHeaderCell>
                            <TableHeaderCell align="center" className="border-r border-slate-800 bg-slate-950">키</TableHeaderCell>
                            <TableHeaderCell align="center" className="border-r border-slate-800 bg-slate-950">몸무게</TableHeaderCell>
                            <TableHeaderCell align="center" className="border-r border-slate-800 bg-slate-950">OVR</TableHeaderCell>
                            {ATTR_ITEMS.map(item => (
                                <TableHeaderCell
                                    key={item.key}
                                    className="border-r border-slate-800 bg-slate-950"
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
                                    <TableCell align="left" className="border-r border-slate-800/30 pl-4 py-2">
                                        <PlayerHoverCard player={p}>
                                            <span
                                                onClick={() => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(p.id)}`)}
                                                className="text-slate-200 ko-normal text-sm font-semibold cursor-pointer hover:underline hover:text-indigo-400 whitespace-nowrap"
                                            >
                                                {p.name}
                                            </span>
                                        </PlayerHoverCard>
                                    </TableCell>
                                    <TableCell align="center" className="border-r border-slate-800/30 text-sm text-slate-400">{p.position}</TableCell>
                                    <TableCell align="center" className="border-r border-slate-800/30 text-sm text-slate-400">{p.age}</TableCell>
                                    <TableCell align="center" className="border-r border-slate-800/30 text-sm text-slate-400">{p.height}</TableCell>
                                    <TableCell align="center" className="border-r border-slate-800/30 text-sm text-slate-400">{p.weight}</TableCell>
                                    <TableCell align="center" className="border-r border-slate-800/30">
                                        <div className="flex justify-center"><OvrBadge value={calculatePlayerOvr(p)} size="sm" className="!w-7 !h-7 !text-xs !shadow-none" /></div>
                                    </TableCell>
                                    {ATTR_ITEMS.map(item => (
                                        <TableCell
                                            key={item.key}
                                            align="center"
                                            className="font-semibold border-r border-slate-800/30 text-sm"
                                            value={getCompactAttrValue(p, item)}
                                            variant="attribute"
                                            colorScale
                                            mono={false}
                                        />
                                    ))}
                                </tr>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination Footer — MultiFreeAgentView.tsx/LeaderboardView.tsx와 동일 구조 */}
            <div className="relative flex items-center px-6 py-3 bg-slate-950 border-t border-slate-800 flex-shrink-0 z-50">
                <div className="text-sm font-bold text-slate-500 w-48">
                    총 {filteredPlayers.length}명 중 {filteredPlayers.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredPlayers.length)}
                </div>

                <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 text-indigo-400 hover:bg-slate-800 hover:text-indigo-300 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft size={14} />
                    </button>

                    {getPageNumbers().map((page, idx) =>
                        page === '...'
                            ? <span key={`ellipsis-${idx}`} className="w-7 text-center text-sm text-slate-600 font-bold select-none">··</span>
                            : <button
                                key={page}
                                onClick={() => setCurrentPage(page)}
                                className={`w-7 h-7 text-sm font-bold rounded-lg transition-all ${
                                    currentPage === page
                                        ? 'bg-indigo-600 text-white'
                                        : 'text-indigo-400 hover:bg-slate-800 hover:text-indigo-300'
                                }`}
                            >
                                {page}
                            </button>
                    )}

                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages || totalPages === 0}
                        className="p-1.5 text-indigo-400 hover:bg-slate-800 hover:text-indigo-300 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>

                <div className="ml-auto flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-500">페이지 당</span>
                    <select
                        value={itemsPerPage}
                        onChange={e => handleItemsPerPageChange(Number(e.target.value))}
                        className="bg-slate-800 border border-slate-700 text-slate-300 text-sm font-bold rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                        {[25, 50, 75, 100].map(n => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
};

export default MultiDraftPoolView;
