
import React, { useMemo, useRef, useState } from 'react';
import { Loader2, Search, X, ChevronDown, Check, Filter, Plus, ShieldAlert } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLeagueContext } from '../league/LeagueLayout';
import { useGame } from '../../../hooks/useGameContext';
import { useMultiSearchData } from '../../../hooks/useMultiSearchData';
import { usePlayerShortCodes } from '../../../hooks/usePlayerShortCodes';
import { usePrefetchFreeAgentCareerHistory } from '../../../hooks/usePrefetchFreeAgentCareerHistory';
import { signFreeAgent } from '../../../services/multi/faService';
import { Table, TableHead, TableBody, TableHeaderCell, TableCell } from '../../../components/common/Table';
import { Dropdown } from '../../../components/common/Dropdown';
import { OvrBadge } from '../../../components/common/OvrBadge';
import { PlayerHoverCard } from '../../../components/common/PlayerHoverCard';
import { calculatePlayerOvr } from '../../../utils/constants';
import { formatMoney } from '../../../utils/formatMoney';
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

// 자유 계약(FA) 화면 — 독립 메뉴. [2026-09-03] 처음엔 트레이드 화면(MultiFrontOfficeView.tsx)
// 하단 탭으로 넣었다가, "트레이드 산하가 아니라 독립된 메뉴"라는 사용자 정정으로 별도
// 라우트/사이드바 메뉴로 분리했다(components/MultiSidebar.tsx, App.tsx 라우트 참고).
//
// 1단계: 드래프트에서 뽑히지 않고 드래프트풀에 남아있는 선수 목록만 테이블로 표시.
// 영입/방출(세션 샐러리캡 룰 적용)은 후속 작업.

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

// [2026-09-03] "능력치 컬럼은 전부 표시" 요청 — RosterGrid.tsx "능력치" 탭/리더보드
// Attributes 카테고리와 동일하게 COMPACT_ATTR_GROUPS(36개 raw 능력치를 21개로 압축한
// 표시 전용 뷰, data/attributeConfig.ts)를 평탄화해서 전부 컬럼으로 노출.
const ATTR_ITEMS = COMPACT_ATTR_GROUPS.flatMap(g => g.items);

// [2026-09-03] "헤더 필터는 리더보드 화면과 동일하게" 요청 — components/leaderboard/
// LeaderboardToolbar.tsx의 팀/포지션 필터 드롭다운(버튼 스타일, fixed 패널, "모두 선택"
// 토글, right 앵커 위치 계산)을 그대로 재현. LeaderboardToolbar 자체는 export된 하위
// 컴포넌트가 없는 442줄짜리 단일 컴포넌트라(팀/시즌타입 등 리더보드 전용 상태에 강결합)
// import해서 재사용할 수 없어, 시각 언어만 동일하게 복사(MultiNewsFeedView.tsx가 팀
// 필터에 대해 이미 같은 방식을 씀 — 그 주석 참고).
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

const MultiFreeAgentView: React.FC = () => {
    const { league, leagueTeams, isLoading: leagueLoading, reload } = useLeagueContext();
    const { poolPlayers, rosterMap } = useMultiSearchData(league, leagueTeams);
    const { getPlayerUrlId } = usePlayerShortCodes();
    const { session } = useGame();
    const navigate = useNavigate();
    const { leagueId } = useParams<{ leagueId: string }>();

    // 로그인 유저가 관리하는 팀 — 트레이드 화면(MultiFrontOfficeView.tsx)의 myTeamRow와
    // 동일한 방식(leagueTeams.user_id === 세션 유저 id)으로 찾는다.
    const myTeamRow = useMemo(
        () => leagueTeams.find(t => t.user_id === session?.user?.id) ?? null,
        [leagueTeams, session],
    );

    const [signingId, setSigningId] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    // 1단계: 협상 없이 즉시 계약(캡 체크 없음 — 후속 작업). 성공 시 reload()로
    // leagueTeams를 갱신해 rosterMap이 업데이트되고 해당 선수가 FA 목록에서 즉시 사라진다.
    const handleSign = async (playerId: string) => {
        if (!myTeamRow || signingId) return;
        setSigningId(playerId);
        setActionError(null);
        const { error } = await signFreeAgent(myTeamRow.id, playerId);
        setSigningId(null);
        if (error) { setActionError(error); return; }
        reload();
    };

    const [nameQuery, setNameQuery] = useState('');
    const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
    const [selectedArchetypes, setSelectedArchetypes] = useState<string[]>([]);

    // [2026-09-03] "리더보드의 부등호 필터 추가 기능처럼" 요청 — LeaderboardToolbar.tsx의
    // Stat Filter(카테고리+연산자+값 입력 후 칩으로 누적)를 능력치 21개 컬럼(ATTR_ITEMS)
    // 대상으로 재현.
    const [filterAttrKey, setFilterAttrKey] = useState(ATTR_ITEMS[0]?.key ?? '');
    const [filterOp, setFilterOp] = useState<Operator>('>=');
    const [filterVal, setFilterVal] = useState('');
    const [statFilters, setStatFilters] = useState<StatFilterItem[]>([]);

    // 드래프트풀 전체(poolPlayers, league.draft_pool 설정 기준)에서 어느 팀 로스터에도
    // 없는(rosterMap에 없는) 선수만 추려 OVR 내림차순+ID 오름차순(결정론적)으로 정렬.
    const undraftedPlayers = useMemo(
        () => poolPlayers
            .filter(p => !rosterMap.has(p.id))
            .sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a) || a.id.localeCompare(b.id)),
        [poolPlayers, rosterMap],
    );

    // [2026-09-04] "FA 프로필 커리어 기록 로딩이 느리다" 후속 — 화면을 막지 않고 백그라운드로
    // undraftedPlayers 전체의 career_history를 미리 받아 usePlayerCareerHistory.ts가 쓰는
    // 캐시에 시딩해둔다. 실제로 특정 선수 프로필을 열 때는 이미 캐시가 있어 즉시 표시됨
    // (MultiPlayerDetailView.tsx는 수정 불필요 — 같은 쿼리키를 그대로 재사용).
    usePrefetchFreeAgentCareerHistory(useMemo(() => undraftedPlayers.map(p => p.id), [undraftedPlayers]));

    // 아키타입 드롭다운 옵션 — 고정된 전체 목록이 아니라 실제 FA풀에 존재하는 주 아키타입
    // (player.archetype, dataMapper.ts가 OVR 계산 시 같이 산출해둔 라벨)만 노출 — 팀 필터가
    // "리그에 실제로 있는 팀만" 보여주는 것과 동일한 관례.
    const archetypeOptions = useMemo(
        () => [...new Set(undraftedPlayers.map(p => p.archetype).filter((a): a is string => !!a))].sort(),
        [undraftedPlayers],
    );

    const filteredPlayers = useMemo(() => {
        const q = nameQuery.trim();
        return undraftedPlayers.filter(p => {
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
    }, [undraftedPlayers, nameQuery, selectedPositions, selectedArchetypes, statFilters]);

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
                    <h1 className="text-lg font-black text-white ko-tight truncate shrink-0">자유 계약</h1>

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

                        {/* [2026-09-03] "리더보드의 부등호 필터 추가 기능처럼" — 능력치(ATTR_ITEMS)
                            카테고리+연산자+값을 골라 추가하면 아래 칩 목록에 누적된다. */}
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

                {actionError && (
                    <div className="flex items-center gap-2 mx-4 mb-3 px-3 py-2.5 rounded-lg bg-red-950/40 border border-red-900/40 text-sm text-red-400 ko-normal">
                        <ShieldAlert size={15} className="shrink-0" /> {actionError}
                    </div>
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
                            <TableHeaderCell align="center" className="border-r border-slate-800 bg-slate-950">연봉</TableHeaderCell>
                            <TableHeaderCell align="center" width="1%" className="pr-4 bg-slate-950">계약</TableHeaderCell>
                        </tr>
                    </TableHead>
                    <TableBody>
                        {filteredPlayers.length === 0 ? (
                            <tr>
                                <TableCell colSpan={6 + ATTR_ITEMS.length + 2} className="text-center text-slate-500 text-sm py-10">
                                    조건에 맞는 자유 계약 선수가 없습니다.
                                </TableCell>
                            </tr>
                        ) : filteredPlayers.map(p => (
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
                                <TableCell align="center" className="border-r border-slate-800/30 text-sm text-slate-300 whitespace-nowrap">{formatMoney(p.salary)}</TableCell>
                                <TableCell align="center" className="pr-4">
                                    <button
                                        onClick={() => handleSign(p.id)}
                                        disabled={!myTeamRow || signingId !== null}
                                        title={!myTeamRow ? '소속 팀이 있어야 계약할 수 있습니다' : undefined}
                                        className="px-2.5 py-1 rounded-md text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
                                    >
                                        계약
                                    </button>
                                </TableCell>
                            </tr>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};

export default MultiFreeAgentView;
