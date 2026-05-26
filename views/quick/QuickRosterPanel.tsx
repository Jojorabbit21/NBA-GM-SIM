import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Player } from '../../types';
import { OvrBadge } from '../../components/common/OvrBadge';

const POSITIONS = ['전체', 'PG', 'SG', 'SF', 'PF', 'C'] as const;
const MAX_ROSTER = 10;

interface QuickRosterPanelProps {
    pool: Player[];
    selected: Player[];
    onSelect: (players: Player[]) => void;
}

export const QuickRosterPanel: React.FC<QuickRosterPanelProps> = ({
    pool, selected, onSelect,
}) => {
    const [search, setSearch]     = useState('');
    const [posFilter, setPosFilter] = useState<string>('전체');

    const selectedIds = useMemo(() => new Set(selected.map(p => p.id)), [selected]);

    const filtered = useMemo(() => {
        let list = pool;
        if (posFilter !== '전체') {
            list = list.filter(p => p.position.split('/').some(pos => pos.trim() === posFilter));
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q));
        }
        return [...list].sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0));
    }, [pool, posFilter, search]);

    const toggle = (player: Player) => {
        if (selectedIds.has(player.id)) {
            onSelect(selected.filter(p => p.id !== player.id));
        } else if (selected.length < MAX_ROSTER) {
            onSelect([...selected, player]);
        }
    };

    return (
        <div className="flex gap-3 h-full min-h-0">
            {/* 좌: 후보 풀 */}
            <div className="flex-1 flex flex-col min-h-0">
                <div className="relative mb-2">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="이름 검색"
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                </div>
                {/* 포지션 필터 */}
                <div className="flex gap-1 mb-2">
                    {POSITIONS.map(pos => (
                        <button
                            key={pos}
                            onClick={() => setPosFilter(pos)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                                posFilter === pos
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-800 text-slate-400 hover:text-white'
                            }`}
                        >
                            {pos}
                        </button>
                    ))}
                </div>
                {/* 선수 목록 */}
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0.5 pr-1">
                    {filtered.map(p => {
                        const isSelected  = selectedIds.has(p.id);
                        const isFull      = selected.length >= MAX_ROSTER && !isSelected;
                        return (
                            <button
                                key={p.id}
                                onClick={() => toggle(p)}
                                disabled={isFull}
                                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors text-xs ${
                                    isSelected
                                        ? 'bg-indigo-600/30 border border-indigo-500/50 text-white'
                                        : isFull
                                        ? 'opacity-30 cursor-not-allowed bg-slate-800/50 text-slate-400'
                                        : 'bg-slate-800/50 hover:bg-slate-700/60 text-slate-300'
                                }`}
                            >
                                <OvrBadge value={p.ovr ?? 0} size="sm" />
                                <span className="font-bold text-slate-400 w-10 shrink-0">{p.position}</span>
                                <span className="flex-1 truncate font-semibold">{p.name}</span>
                                {isSelected && <X size={11} className="text-indigo-300 shrink-0" />}
                            </button>
                        );
                    })}
                    {filtered.length === 0 && (
                        <p className="text-center text-slate-600 text-xs py-6">검색 결과 없음</p>
                    )}
                </div>
            </div>

            {/* 우: 선택된 10인 슬롯 */}
            <div className="w-44 shrink-0 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400">선택된 선수</span>
                    <span className={`text-xs font-black tabular-nums ${
                        selected.length === MAX_ROSTER ? 'text-status-success-text' : 'text-slate-500'
                    }`}>
                        {selected.length} / {MAX_ROSTER}
                    </span>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
                    {selected.map((p, idx) => (
                        <div
                            key={p.id}
                            className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-800 rounded-lg text-xs"
                        >
                            <span className="text-slate-600 w-4 shrink-0 font-mono">{idx + 1}</span>
                            <OvrBadge value={p.ovr ?? 0} size="sm" />
                            <span className="flex-1 truncate text-slate-200 font-semibold">{p.name}</span>
                            <button
                                onClick={() => toggle(p)}
                                className="text-slate-600 hover:text-red-400 transition-colors shrink-0"
                            >
                                <X size={11} />
                            </button>
                        </div>
                    ))}
                    {Array.from({ length: MAX_ROSTER - selected.length }).map((_, i) => (
                        <div key={`empty-${i}`} className="h-8 border border-dashed border-slate-800 rounded-lg" />
                    ))}
                </div>
            </div>
        </div>
    );
};
