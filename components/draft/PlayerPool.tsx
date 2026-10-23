
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Search, Plus, Minus } from 'lucide-react';
import { Player } from '../../types';
import { OvrBadge } from '../common/OvrBadge';
import { Button } from '../common/Button';
import { IconButton } from '../common/IconButton';
import { SegmentedControl } from '../common/SegmentedControl';
import { getAttrColor } from '../../utils/attrRatingColor';

// 가상 스크롤 — 올타임 풀 기준 800명 이상이 한 번에 DOM에 마운트되던 걸,
// 실제로 화면에 보이는 행 근처만 렌더링하도록 줄인다(행 높이 고정 h-8=32px 전제).
const ROW_HEIGHT = 32;
const OVERSCAN = 8; // 스크롤 시 빈 화면 방지용 위아래 여분 행 수

interface PlayerPoolProps {
    players: Player[];
    selectedPlayerId: string | null;
    onSelectPlayer: (player: Player) => void;
    isUserTurn: boolean;
    onDraft: (player: Player) => void;
    positionColors: Record<string, string>;
    showPotential?: boolean;
    /** [2026-10-13] 드래프트 버튼 왼쪽 슬롯 — 지명 실패/연결 끊김 InlineNotice sm(에러 표시 정책 0-7) */
    toolbarNotice?: React.ReactNode;
    /** [2026-10-23] 드래프트 큐 — 큐에 든 playerId 집합. 둘 다 넘길 때만 POS 왼쪽에 + / − 버튼 열 렌더링(멀티 전용, 순번 표시 없음) */
    queuedIds?: Set<string>;
    onToggleQueue?: (player: Player) => void;
}

const POSITIONS = ['All', 'PG', 'SG', 'SF', 'PF', 'C'] as const;

type SortKey = 'ovr' | 'pot' | 'age' | 'ins' | 'out' | 'ath' | 'plm' | 'def' | 'reb';

const PlayerPoolComponent: React.FC<PlayerPoolProps> = ({
    players,
    selectedPlayerId,
    onSelectPlayer,
    isUserTurn,
    onDraft,
    showPotential = false,
    toolbarNotice,
    queuedIds,
    onToggleQueue,
}) => {
    const showQueue = !!(queuedIds && onToggleQueue);
    const [search, setSearch] = useState('');
    const [posFilter, setPosFilter] = useState<string>('All');
    const [sortKey, setSortKey] = useState<SortKey>('ovr');
    const [sortAsc, setSortAsc] = useState(false);

    const filtered = useMemo(() => {
        let result = players;
        if (posFilter !== 'All') {
            result = result.filter(p => p.position === posFilter);
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(p => p.name.toLowerCase().includes(q));
        }
        result = [...result].sort((a, b) => {
            const av = sortKey === 'ovr' ? a.ovr : sortKey === 'pot' ? a.potential : (a as any)[sortKey] ?? 0;
            const bv = sortKey === 'ovr' ? b.ovr : sortKey === 'pot' ? b.potential : (b as any)[sortKey] ?? 0;
            return sortAsc ? av - bv : bv - av;
        });
        return result;
    }, [players, posFilter, search, sortKey, sortAsc]);

    const selectedPlayer = selectedPlayerId ? players.find(p => p.id === selectedPlayerId) : null;

    // ── 가상 스크롤 ──────────────────────────────────────────────────────────
    const scrollRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(0);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        setViewportHeight(el.clientHeight);
        const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    }, []);

    // 필터/정렬이 바뀌면 목록 길이가 달라지므로 스크롤을 맨 위로 되돌린다
    // (안 그러면 짧아진 목록에서 스크롤 위치만 남아 빈 화면이 보일 수 있음)
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        setScrollTop(0);
    }, [posFilter, search, sortKey, sortAsc]);

    const startIndex   = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
    const endIndex      = Math.min(filtered.length, startIndex + visibleCount);
    const visibleRows   = filtered.slice(startIndex, endIndex);
    const topSpacerPx    = startIndex * ROW_HEIGHT;
    const bottomSpacerPx = (filtered.length - endIndex) * ROW_HEIGHT;
    const colSpan = (showPotential ? 15 : 14) + (showQueue ? 1 : 0);

    const handleHeaderClick = (key: SortKey) => {
        if (sortKey === key) setSortAsc(!sortAsc);
        else { setSortKey(key); setSortAsc(false); }
    };

    const handleDraftClick = () => {
        if (selectedPlayer && isUserTurn) onDraft(selectedPlayer);
    };

    const SortHeader: React.FC<{ label: string; field: SortKey; className?: string }> = ({ label, field, className }) => (
        <th
            className={`px-1 py-1.5 text-center cursor-pointer hover:text-indigo-400 transition-colors select-none ${
                sortKey === field ? 'text-indigo-400' : ''
            } ${className || ''}`}
            onClick={() => handleHeaderClick(field)}
        >
            {label}{sortKey === field ? (sortAsc ? '↑' : '↓') : ''}
        </th>
    );

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="shrink-0 px-3 h-10 flex items-center gap-2 border-b border-slate-800/50 bg-slate-800/30">
                <span className="text-sm font-black text-indigo-400 shrink-0">선수 풀</span>
                <div className="relative">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        type="text"
                        placeholder="선수 검색..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="bg-slate-900 border border-slate-800 rounded-md pl-7 pr-2 py-1 text-sm text-slate-200 w-32 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
                    />
                </div>
                <SegmentedControl
                    size="sm"
                    value={posFilter}
                    onChange={setPosFilter}
                    options={POSITIONS.map(pos => ({ value: pos as string, label: pos }))}
                />
                <span className="text-sm text-slate-500 ml-1">{filtered.length}명</span>
                {/* Draft button (+ 왼쪽 알림 슬롯) */}
                <div className="ml-auto flex items-center gap-3 min-w-0">
                    {toolbarNotice}
                    <Button
                        variant="success"
                        size="lg"
                        onClick={handleDraftClick}
                        disabled={!isUserTurn || !selectedPlayer}
                        style={isUserTurn && selectedPlayer ? { boxShadow: '0 0 12px rgba(16,185,129,0.5)' } : undefined}
                    >
                        드래프트
                    </Button>
                </div>
            </div>

            {/* Table */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 min-h-0 overflow-y-auto"
                style={{ scrollbarWidth: 'none' } as React.CSSProperties}
            >
                <table className="w-full border-collapse text-sm table-fixed">
                    <thead className="sticky top-0 z-10 bg-slate-900">
                        <tr className="text-sm font-bold text-slate-400 border-b border-slate-800">
                            <th className="w-6 px-1 py-1.5"></th>
                            {showQueue && <th className="px-1 py-1.5 text-center w-8 text-slate-400">큐</th>}
                            <th className="px-1 py-1.5 text-center w-8">POS</th>
                            <th className="px-2 py-1.5 text-left w-36">NAME</th>
                            <th className="px-1 py-1.5 text-left text-slate-400">TYPE</th>
                            <SortHeader label="OVR" field="ovr" className="w-12" />
                            {showPotential && <SortHeader label="POT" field="pot" className="w-8" />}
                            <SortHeader label="AGE" field="age" className="w-10" />
                            <th className="px-1 py-1.5 text-center w-12 text-slate-400">HT</th>
                            <th className="px-1 py-1.5 text-center w-12 text-slate-400">WT</th>
                            <SortHeader label="INS" field="ins" className="w-10" />
                            <SortHeader label="OUT" field="out" className="w-10" />
                            <SortHeader label="ATH" field="ath" className="w-10" />
                            <SortHeader label="PLM" field="plm" className="w-10" />
                            <SortHeader label="DEF" field="def" className="w-10" />
                            <SortHeader label="REB" field="reb" className="w-10" />
                        </tr>
                    </thead>
                    <tbody>
                        {topSpacerPx > 0 && (
                            <tr aria-hidden="true" style={{ height: topSpacerPx }}>
                                <td colSpan={colSpan} style={{ padding: 0, border: 'none' }} />
                            </tr>
                        )}
                        {visibleRows.map(player => {
                            const isSelected = player.id === selectedPlayerId;
                            const isQueued   = showQueue && queuedIds!.has(player.id);
                            return (
                                <tr
                                    key={player.id}
                                    className={`h-8 border-b border-slate-800/20 cursor-pointer transition-colors ${
                                        isSelected
                                            ? 'bg-amber-500/[0.06]'
                                            : 'hover:bg-white/[0.03]'
                                    }`}
                                    onClick={() => onSelectPlayer(player)}
                                >
                                    {/* Radio */}
                                    <td className="px-1 py-0.5 text-center align-middle">
                                        <input
                                            type="radio"
                                            name="draft-player"
                                            checked={isSelected}
                                            onChange={() => onSelectPlayer(player)}
                                            onClick={(e) => e.stopPropagation()}
                                            // [2026-10-23] inline + align-middle 은 글꼴 베이스라인에 걸려 행 중앙보다 위로 떠 보였음 → block 으로 셀 세로 중앙에 맞춤
                                            className="block mx-auto w-3.5 h-3.5 cursor-pointer appearance-none rounded-full border-2 border-slate-600 bg-slate-950 checked:border-blue-500 checked:bg-blue-500 checked:shadow-[inset_0_0_0_2.5px_rgb(2,6,23)] transition-colors"
                                        />
                                    </td>
                                    {/* [2026-10-23] 큐 + / − (POS 왼쪽, 항상 표시, 순번 없음) */}
                                    {showQueue && (
                                        <td className="px-1 py-0.5 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                                            {isQueued ? (
                                                <IconButton label="큐에서 제거" size="xs" tone="danger" shape="md" onClick={() => onToggleQueue!(player)}>
                                                    <Minus size={13} />
                                                </IconButton>
                                            ) : (
                                                <IconButton label="큐에 추가" size="xs" tone="success" shape="md" onClick={() => onToggleQueue!(player)}>
                                                    <Plus size={13} />
                                                </IconButton>
                                            )}
                                        </td>
                                    )}
                                    <td className="px-1 py-0.5 text-center font-bold text-slate-400">
                                        {player.position}
                                    </td>
                                    <td className="px-2 py-0.5 font-semibold text-slate-200 truncate">{player.name}</td>
                                    <td
                                        className="px-1 py-0.5 text-left text-slate-400 truncate"
                                        title={player.secondaryArchetype ? `${player.archetype} / ${player.secondaryArchetype}` : player.archetype}
                                    >
                                        {player.archetype ?? '—'}{player.secondaryArchetype ? ` / ${player.secondaryArchetype}` : ''}
                                    </td>
                                    <td className="px-2 py-0.5">
                                        <OvrBadge value={player.ovr} size="sm" />
                                    </td>
                                    {showPotential && (
                                        <td className={`px-1 py-0.5 text-center ${getAttrColor(player.potential)}`}>
                                            {player.potential}
                                        </td>
                                    )}
                                    <td className="px-1 py-0.5 text-center text-slate-400">{player.age}</td>
                                    <td className="px-1 py-0.5 text-center text-slate-500">{player.height}</td>
                                    <td className="px-1 py-0.5 text-center text-slate-500">{player.weight}</td>
                                    <td className={`px-1 py-0.5 text-center ${getAttrColor(player.ins)}`}>{player.ins}</td>
                                    <td className={`px-1 py-0.5 text-center ${getAttrColor(player.out)}`}>{player.out}</td>
                                    <td className={`px-1 py-0.5 text-center ${getAttrColor(player.ath)}`}>{player.ath}</td>
                                    <td className={`px-1 py-0.5 text-center ${getAttrColor(player.plm)}`}>{player.plm}</td>
                                    <td className={`px-1 py-0.5 text-center ${getAttrColor(player.def)}`}>{player.def}</td>
                                    <td className={`px-1 py-0.5 text-center ${getAttrColor(player.reb)}`}>{player.reb}</td>
                                </tr>
                            );
                        })}
                        {bottomSpacerPx > 0 && (
                            <tr aria-hidden="true" style={{ height: bottomSpacerPx }}>
                                <td colSpan={colSpan} style={{ padding: 0, border: 'none' }} />
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// 부모(드래프트 타이머 등)가 리렌더돼도 props가 실제로 바뀌지 않으면 이 리스트는 다시 안 그림 —
// 선수 풀이 수백 명 규모라 매 렌더마다 테이블 전체를 재조정하는 비용이 컸다.
export const PlayerPool = React.memo(PlayerPoolComponent);
