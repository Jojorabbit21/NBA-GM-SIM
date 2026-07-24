
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';
import { Player } from '../../types';
import { OvrBadge } from '../common/OvrBadge';

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
}

const POSITIONS = ['All', 'PG', 'SG', 'SF', 'PF', 'C'] as const;

type SortKey = 'ovr' | 'pot' | 'age' | 'ins' | 'out' | 'ath' | 'plm' | 'def' | 'reb';

const getStatColor = (val: number): string => {
    if (val >= 90) return 'text-fuchsia-400';
    if (val >= 80) return 'text-emerald-400';
    if (val >= 70) return 'text-amber-400';
    return 'text-slate-500';
};

const PlayerPoolComponent: React.FC<PlayerPoolProps> = ({
    players,
    selectedPlayerId,
    onSelectPlayer,
    isUserTurn,
    onDraft,
    positionColors,
    showPotential = false,
}) => {
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
    const colSpan = showPotential ? 15 : 14;

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
                <span className="text-xs font-black uppercase tracking-wider text-indigo-400 shrink-0">선수 풀</span>
                <div className="relative">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        type="text"
                        placeholder="선수 검색..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="bg-slate-900 border border-slate-800 rounded-md pl-7 pr-2 py-1 text-xs text-slate-200 w-32 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
                    />
                </div>
                <div className="flex gap-0.5">
                    {POSITIONS.map(pos => {
                        const isActive = posFilter === pos;
                        const posColor = pos !== 'All' ? positionColors[pos] : undefined;
                        return (
                            <button
                                key={pos}
                                onClick={() => setPosFilter(pos)}
                                className={`text-xs px-1.5 py-0.5 rounded-md font-bold transition-colors ${
                                    isActive
                                        ? 'text-white'
                                        : 'bg-transparent text-slate-500 hover:text-slate-300'
                                }`}
                                style={isActive ? {
                                    backgroundColor: posColor || '#6366f1',
                                    color: '#fff',
                                } : {}}
                            >
                                {pos}
                            </button>
                        );
                    })}
                </div>
                <span className="text-xs text-slate-500 ml-1">{filtered.length}명</span>
                {/* Draft button */}
                <div className="ml-auto">
                    <button
                        onClick={handleDraftClick}
                        disabled={!isUserTurn || !selectedPlayer}
                        className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${
                            !isUserTurn || !selectedPlayer
                                ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                                : 'hover:brightness-110 active:scale-95'
                        }`}
                        style={isUserTurn && selectedPlayer ? {
                            backgroundColor: '#10b981',
                            color: '#fff',
                            boxShadow: '0 0 12px rgba(16,185,129,0.5)',
                        } : {}}
                    >
                        드래프트
                    </button>
                </div>
            </div>

            {/* Table */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 min-h-0 overflow-y-auto"
                style={{ scrollbarWidth: 'none' } as React.CSSProperties}
            >
                <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-900">
                        <tr className="text-xs font-black uppercase text-slate-500 border-b border-slate-700/50">
                            <th className="w-6 px-1 py-1.5"></th>
                            <th className="px-2 py-1.5 text-left">NAME</th>
                            <th className="px-1 py-1.5 text-center w-8">POS</th>
                            <th className="px-1 py-1.5 text-left w-24 text-slate-500">ARCH</th>
                            <SortHeader label="OVR" field="ovr" className="w-12" />
                            {showPotential && <SortHeader label="POT" field="pot" className="w-8" />}
                            <SortHeader label="AGE" field="age" className="w-8" />
                            <th className="px-1 py-1.5 text-center w-10 text-slate-500">HT</th>
                            <th className="px-1 py-1.5 text-center w-10 text-slate-500">WT</th>
                            <SortHeader label="INS" field="ins" className="w-8" />
                            <SortHeader label="OUT" field="out" className="w-8" />
                            <SortHeader label="ATH" field="ath" className="w-8" />
                            <SortHeader label="PLM" field="plm" className="w-8" />
                            <SortHeader label="DEF" field="def" className="w-8" />
                            <SortHeader label="REB" field="reb" className="w-8" />
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
                                            className="w-3.5 h-3.5 cursor-pointer align-middle appearance-none rounded-full border-2 border-slate-600 bg-slate-950 checked:border-blue-500 checked:bg-blue-500 checked:shadow-[inset_0_0_0_2.5px_rgb(2,6,23)] transition-colors"
                                        />
                                    </td>
                                    <td className="px-2 py-0.5 font-semibold text-slate-200 truncate max-w-[140px]">{player.name}</td>
                                    <td className="px-1 py-0.5 text-center font-bold text-slate-400">
                                        {player.position}
                                    </td>
                                    <td className="px-1 py-0.5 text-left text-slate-400 truncate max-w-[96px]" title={player.archetype}>
                                        {player.archetype ?? '—'}
                                    </td>
                                    <td className="px-2 py-0.5">
                                        <OvrBadge value={player.ovr} size="sm" />
                                    </td>
                                    {showPotential && (
                                        <td className={`px-1 py-0.5 text-center font-mono ${getStatColor(player.potential)}`}>
                                            {player.potential}
                                        </td>
                                    )}
                                    <td className="px-1 py-0.5 text-center text-slate-400 font-mono">{player.age}</td>
                                    <td className="px-1 py-0.5 text-center text-slate-500">{player.height}</td>
                                    <td className="px-1 py-0.5 text-center text-slate-500">{player.weight}</td>
                                    <td className={`px-1 py-0.5 text-center font-mono ${getStatColor(player.ins)}`}>{player.ins}</td>
                                    <td className={`px-1 py-0.5 text-center font-mono ${getStatColor(player.out)}`}>{player.out}</td>
                                    <td className={`px-1 py-0.5 text-center font-mono ${getStatColor(player.ath)}`}>{player.ath}</td>
                                    <td className={`px-1 py-0.5 text-center font-mono ${getStatColor(player.plm)}`}>{player.plm}</td>
                                    <td className={`px-1 py-0.5 text-center font-mono ${getStatColor(player.def)}`}>{player.def}</td>
                                    <td className={`px-1 py-0.5 text-center font-mono ${getStatColor(player.reb)}`}>{player.reb}</td>
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
