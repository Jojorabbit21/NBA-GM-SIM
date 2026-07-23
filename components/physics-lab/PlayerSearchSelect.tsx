
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import type { Player } from '../../types';

// ─────────────────────────────────────────────────────────────
// 검색 가능한 선수 선택 드롭다운. 로스터 풀이 커서(수백 명) 네이티브 <select> 스크롤 탐색이
// 비효율적이라 이름/포지션 텍스트 검색으로 좁혀서 고를 수 있게 함. 순수 UI 컴포넌트 — 로직은
// 부모(MotionSandboxPanel)가 소유하고 이 컴포넌트는 value/onChange만 받는다.
// ─────────────────────────────────────────────────────────────

interface PlayerSearchSelectProps {
    players: Player[];
    value: string;
    onChange: (id: string) => void;
    disabledIds?: Set<string>;
    placeholder: string;
}

export const PlayerSearchSelect: React.FC<PlayerSearchSelectProps> = ({ players, value, onChange, disabledIds, placeholder }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selected = players.find(p => p.id === value);

    useEffect(() => {
        function onOutside(e: MouseEvent) {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
                setQuery('');
            }
        }
        document.addEventListener('mousedown', onOutside);
        return () => document.removeEventListener('mousedown', onOutside);
    }, []);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return players;
        return players.filter(p => p.name.toLowerCase().includes(q) || p.position.toLowerCase().includes(q));
    }, [players, query]);

    const handleSelect = (id: string) => {
        if (disabledIds?.has(id)) return;
        onChange(id);
        setOpen(false);
        setQuery('');
    };

    return (
        <div ref={rootRef} className="relative flex-1 min-w-0">
            <button
                type="button"
                onClick={() => {
                    setOpen(o => !o);
                    if (!open) setTimeout(() => inputRef.current?.focus(), 0);
                }}
                className="w-full flex items-center justify-between gap-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white text-left"
            >
                <span className={selected ? 'text-white truncate' : 'text-slate-500 truncate'}>
                    {selected ? `${selected.name} (${selected.position})` : placeholder}
                </span>
                <ChevronDown size={12} className="shrink-0 text-slate-500" />
            </button>

            {open && (
                <div className="absolute z-20 mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                    <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-700">
                        <Search size={12} className="text-slate-500 shrink-0" />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="이름 또는 포지션 검색"
                            className="w-full bg-transparent text-xs text-white placeholder-slate-500 outline-none"
                        />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                        {filtered.length === 0 && (
                            <div className="px-2 py-2 text-[11px] text-slate-500">검색 결과 없음</div>
                        )}
                        {filtered.map(p => {
                            const disabled = disabledIds?.has(p.id) && p.id !== value;
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => handleSelect(p.id)}
                                    className={`w-full flex items-center justify-between px-2 py-1.5 text-xs text-left transition-colors ${
                                        disabled
                                            ? 'text-slate-600 cursor-not-allowed'
                                            : p.id === value
                                            ? 'bg-indigo-600 text-white'
                                            : 'text-slate-200 hover:bg-slate-700'
                                    }`}
                                >
                                    <span className="truncate">{p.name}</span>
                                    <span className="shrink-0 text-[10px] opacity-70">{p.position}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
