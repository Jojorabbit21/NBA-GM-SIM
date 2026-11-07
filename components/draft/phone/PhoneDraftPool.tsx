// PhoneDraftPool.tsx — 드래프트 룸 폰 "선수 풀" 탭. [2026-11-08]
// docs/ui/mobile-design-system.md §9-0-4 "선수 풀": 툴바 48(검색 pill 36 + "필터" 32 → 바텀 시트: 포지션·정렬 라디오, 즉시 반영) +
// 공용 Table density="phone"(sticky 선수 184 = 라디오 14 · OvrBadge table 28 · 이름 14/500 + "POS | 나이 | 키 | 몸무게" / 스크롤 INS·OUT·ATH·PLM·DEF·REB 48).
// 행 탭 = 선택(라디오 + amber 틴트), 이름 블록 탭 = 선수 팝업. 행 안 큐 ± 버튼·결과 수 줄은 없다(사용자 결정).
import React, { useMemo, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import type { Player } from '../../../types';
import { OvrBadge } from '../../common/OvrBadge';
import { Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell } from '../../common/Table';
import { BottomSheet, SheetOptionRow, SheetGroupTitle } from '../../mobile/BottomSheet';
import { getAttrColor } from '../../../utils/attrRatingColor';

type PosFilter = 'All' | 'PG' | 'SG' | 'SF' | 'PF' | 'C';
type SortKey = 'ovr' | 'pot' | 'age' | 'ins' | 'out' | 'ath' | 'plm' | 'def' | 'reb';
const POSITIONS: PosFilter[] = ['All', 'PG', 'SG', 'SF', 'PF', 'C'];
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'ovr', label: 'OVR' }, { key: 'pot', label: 'POT' }, { key: 'age', label: 'AGE' },
    { key: 'ins', label: 'INS' }, { key: 'out', label: 'OUT' }, { key: 'ath', label: 'ATH' },
    { key: 'plm', label: 'PLM' }, { key: 'def', label: 'DEF' }, { key: 'reb', label: 'REB' },
];
const ATTR_COLS: { key: 'ins' | 'out' | 'ath' | 'plm' | 'def' | 'reb'; label: string }[] = [
    { key: 'ins', label: 'INS' }, { key: 'out', label: 'OUT' }, { key: 'ath', label: 'ATH' },
    { key: 'plm', label: 'PLM' }, { key: 'def', label: 'DEF' }, { key: 'reb', label: 'REB' },
];
export const PHONE_POOL_STICKY_W = 184;
const ATTR_W = 48;

const sortValue = (p: Player, k: SortKey): number => (k === 'ovr' ? p.ovr : k === 'pot' ? p.potential : ((p as any)[k] ?? 0));

interface PhoneDraftPoolProps {
    players: Player[];
    selectedPlayerId: string | null;
    onSelectPlayer: (p: Player) => void;
    onOpenPlayer: (p: Player) => void;
    showPotential?: boolean;
}

/** 폰 풀·큐·로스터 행이 공유하는 라디오 모양(PlayerPool.tsx 라디오 클래스 그대로) */
export const PhoneRowRadio: React.FC<{ checked: boolean }> = ({ checked }) => (
    <span
        role="radio"
        aria-checked={checked}
        className={`block w-3.5 h-3.5 shrink-0 rounded-full border-2 box-border ${checked ? 'border-blue-500 bg-blue-500 shadow-[inset_0_0_0_2.5px_rgb(2,6,23)]' : 'border-slate-600 bg-slate-950'}`}
    />
);

/** sticky 선수 칸 2줄째 — "POS | 나이 | 키 | 몸무게"(세로선 1×9 slate-700) */
export const PhoneBioCaption: React.FC<{ player: Player; posColor?: string }> = ({ player, posColor }) => {
    const sep = <span aria-hidden="true" className="w-px h-[9px] bg-slate-700" />;
    return (
        <span className="flex items-center gap-[5px] text-xs leading-4 text-slate-400 tabular-nums whitespace-nowrap">
            <span className="font-bold" style={posColor ? { color: posColor } : undefined}>{player.position}</span>
            {sep}<span>{player.age}세</span>
            {sep}<span>{player.height}cm</span>
            {sep}<span>{player.weight}kg</span>
        </span>
    );
};

export const PhoneDraftPool: React.FC<PhoneDraftPoolProps & { positionColors: Record<string, string> }> = ({
    players, selectedPlayerId, onSelectPlayer, onOpenPlayer, showPotential = false, positionColors,
}) => {
    const [search, setSearch] = useState('');
    const [posFilter, setPosFilter] = useState<PosFilter>('All');
    const [sortKey, setSortKey] = useState<SortKey>('ovr');
    const [filterOpen, setFilterOpen] = useState(false);
    const filterActive = posFilter !== 'All' || sortKey !== 'ovr';

    const filtered = useMemo(() => {
        let result = players;
        if (posFilter !== 'All') result = result.filter(p => p.position === posFilter);
        const q = search.trim().toLowerCase();
        if (q) result = result.filter(p => p.name.toLowerCase().includes(q));
        // 데스크톱 PlayerPool과 같은 기본: 선택한 키 내림차순
        return [...result].sort((a, b) => sortValue(b, sortKey) - sortValue(a, sortKey));
    }, [players, posFilter, search, sortKey]);

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="shrink-0 h-12 px-4 flex items-center gap-2 border-b border-slate-800">
                <div className="relative flex-1 min-w-0 h-9 bg-slate-950 rounded-lg border border-slate-800 focus-within:border-indigo-500">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        type="text"
                        inputMode="search"
                        enterKeyHint="search"
                        placeholder="이름으로 검색"
                        aria-label="이름으로 검색"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="h-full w-full bg-transparent pl-9 pr-3 text-base font-bold text-white outline-none placeholder:text-slate-600"
                    />
                </div>
                <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-expanded={filterOpen}
                    onClick={() => setFilterOpen(true)}
                    className="relative h-8 pl-2.5 pr-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300 active:bg-slate-700 shrink-0"
                >
                    <SlidersHorizontal size={14} />필터
                    {filterActive && <span aria-hidden="true" className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-slate-950" />}
                </button>
            </div>

            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                <Table variant="flush" density="phone" scroll="parent" dividers={false}>
                    <TableHead>
                        <TableHeaderCell stickyLeft={0} width={PHONE_POOL_STICKY_W} align="left" className="pl-4" sortable sortDirection={sortKey === 'ovr' ? 'desc' : null}>선수</TableHeaderCell>
                        {showPotential && <TableHeaderCell width={ATTR_W} sortable sortDirection={sortKey === 'pot' ? 'desc' : null}>POT</TableHeaderCell>}
                        {ATTR_COLS.map(c => (
                            <TableHeaderCell key={c.key} width={ATTR_W} sortable sortDirection={sortKey === c.key ? 'desc' : null}>{c.label}</TableHeaderCell>
                        ))}
                    </TableHead>
                    <TableBody>
                        {filtered.map(p => {
                            const sel = p.id === selectedPlayerId;
                            const tint = sel ? 'bg-amber-500/[0.06]' : '';
                            return (
                                <TableRow key={p.id} onClick={() => onSelectPlayer(p)} className={tint}>
                                    <TableCell stickyLeft={0} width={PHONE_POOL_STICKY_W} align="left" className="pl-4">
                                        <span className="flex items-center gap-2 min-w-0">
                                            <PhoneRowRadio checked={sel} />
                                            <OvrBadge value={p.ovr} size="table" className="shrink-0" />
                                            {/* 이름 블록 탭 = 선수 팝업(행 선택으로 번지지 않게) */}
                                            <button
                                                type="button"
                                                onClick={e => { e.stopPropagation(); onOpenPlayer(p); }}
                                                className="flex flex-col min-w-0 text-left -my-1 py-1"
                                                aria-label={`${p.name} 정보`}
                                            >
                                                <span className={`text-sm leading-5 font-medium truncate ${sel ? 'text-amber-200' : 'text-slate-200'}`}>{p.name}</span>
                                                <PhoneBioCaption player={p} posColor={positionColors[p.position]} />
                                            </button>
                                        </span>
                                    </TableCell>
                                    {showPotential && <TableCell align="center" className={`text-sm tabular-nums ${tint} ${getAttrColor(p.potential)}`}>{p.potential}</TableCell>}
                                    {ATTR_COLS.map(c => {
                                        const v = (p as any)[c.key] as number;
                                        return <TableCell key={c.key} align="center" className={`text-sm tabular-nums ${tint} ${getAttrColor(v)}`}>{v}</TableCell>;
                                    })}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
                {filtered.length === 0 && (
                    <div className="px-4 py-6 text-sm text-slate-500 text-center ko-normal">조건에 맞는 선수가 없습니다</div>
                )}
            </div>

            <BottomSheet open={filterOpen} title="선수 풀 필터" onClose={() => setFilterOpen(false)}>
                <SheetGroupTitle first>포지션</SheetGroupTitle>
                <div className="grid grid-cols-2 gap-x-4">
                    {POSITIONS.map(pos => (
                        <SheetOptionRow key={pos} type="radio" label={pos === 'All' ? '전체' : pos} checked={posFilter === pos} onChange={() => setPosFilter(pos)} />
                    ))}
                </div>
                <SheetGroupTitle>정렬</SheetGroupTitle>
                <div className="grid grid-cols-3 gap-x-4">
                    {SORT_OPTIONS.filter(o => showPotential || o.key !== 'pot').map(o => (
                        <SheetOptionRow key={o.key} type="radio" label={o.label} checked={sortKey === o.key} onChange={() => setSortKey(o.key)} />
                    ))}
                </div>
            </BottomSheet>
        </div>
    );
};
