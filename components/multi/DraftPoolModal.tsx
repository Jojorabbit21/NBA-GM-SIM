
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { mapRawPlayerToRuntimePlayer } from '../../services/dataMapper';
import { applyMetaPlayerPoolFilter } from '../../services/multi/draftPoolQuery';
import { OvrBadge } from '../common/OvrBadge';
import type { Player } from '../../types';

interface Props {
    ovrMin:             number;
    ovrMax:             number;
    draftYearMin:       number;
    draftYearMax:       number;
    useCustomOverrides: boolean;
    onClose:            () => void;
}

type SortKey = 'ovr' | 'age';
type SortDir = 'asc' | 'desc';

const POSITIONS = ['All', 'PG', 'SG', 'SF', 'PF', 'C'] as const;

const POS_COLORS: Record<string, string> = {
    PG: '#6366f1', SG: '#8b5cf6', SF: '#10b981', PF: '#f59e0b', C: '#ef4444',
};

const getStatColor = (val: number) => {
    if (val >= 90) return 'text-fuchsia-400';
    if (val >= 80) return 'text-emerald-400';
    if (val >= 70) return 'text-amber-400';
    return 'text-slate-500';
};

export const DraftPoolModal: React.FC<Props> = ({ ovrMin, ovrMax, draftYearMin, draftYearMax, useCustomOverrides, onClose }) => {
    const [players,   setPlayers]   = useState<Player[]>([]);
    const [loading,   setLoading]   = useState(true);
    const [search,    setSearch]    = useState('');
    const [posFilter, setPosFilter] = useState<string>('All');
    const [sortKey,   setSortKey]   = useState<SortKey>('ovr');
    const [sortDir,   setSortDir]   = useState<SortDir>('desc');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    useEffect(() => {
        let cancelled = false;

        const fetch = async () => {
            setLoading(true);
            let q = supabase.from('meta_players').select('id, position, base_attributes, tendencies');
            q = applyMetaPlayerPoolFilter(q as any, draftYearMin, draftYearMax);

            const { data, error } = await (q as any);
            if (error) console.error('[DraftPoolModal] query error:', error.message);
            if (cancelled) return;

            const raw = (data as any[] ?? []).map(r => mapRawPlayerToRuntimePlayer(r, useCustomOverrides, true));
            setPlayers(raw.filter(p => p.ovr >= ovrMin && p.ovr <= ovrMax));
            setLoading(false);
        };

        fetch();
        return () => { cancelled = true; };
    }, [ovrMin, ovrMax, draftYearMin, draftYearMax, useCustomOverrides]);

    const sorted = useMemo(() => {
        let list = players;
        if (posFilter !== 'All') {
            list = list.filter(p => p.position.split('/').some(pos => pos.trim() === posFilter));
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q));
        }
        return [...list].sort((a, b) => {
            const av = a[sortKey] ?? 0;
            const bv = b[sortKey] ?? 0;
            return sortDir === 'desc' ? (bv as number) - (av as number) : (av as number) - (bv as number);
        });
    }, [players, posFilter, search, sortKey, sortDir]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
        else { setSortKey(key); setSortDir('desc'); }
    };

    const SortIcon = ({ field }: { field: SortKey }) => {
        if (sortKey !== field) return null;
        return sortDir === 'desc'
            ? <ChevronDown size={11} className="inline ml-0.5" />
            : <ChevronUp   size={11} className="inline ml-0.5" />;
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl flex flex-col max-h-[85vh]">

                {/* 헤더 */}
                <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                        <h2 className="text-sm font-black text-white ko-tight">드래프트 풀 선수 목록</h2>
                        {!loading && (
                            <span className="text-xs text-slate-500 ko-normal">총 {players.length}명</span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-500 hover:text-white transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* 필터 바 */}
                <div className="shrink-0 px-4 py-3 flex items-center gap-3 border-b border-slate-800/60 flex-wrap">
                    {/* 검색 */}
                    <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="선수 검색…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 w-40 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
                        />
                    </div>

                    {/* 포지션 필터 */}
                    <div className="flex gap-1">
                        {POSITIONS.map(pos => (
                            <button
                                key={pos}
                                onClick={() => setPosFilter(pos)}
                                className={`px-2 py-1 rounded-md text-xs font-bold transition-colors ${
                                    posFilter === pos
                                        ? 'text-white'
                                        : 'bg-slate-800 text-slate-500 hover:text-slate-300'
                                }`}
                                style={posFilter === pos && pos !== 'All' ? { backgroundColor: POS_COLORS[pos] } : posFilter === pos ? { backgroundColor: '#4f46e5' } : {}}
                            >
                                {pos}
                            </button>
                        ))}
                    </div>

                    {search.trim() || posFilter !== 'All' ? (
                        <span className="text-xs text-slate-500 ko-normal ml-auto">{sorted.length}명</span>
                    ) : null}
                </div>

                {/* 리스트 헤더 */}
                <div className="shrink-0 px-4 py-1.5 grid grid-cols-[2.75rem_2rem_0.6fr_1fr_2rem_2.75rem_2.75rem_2rem_2rem_2rem_2rem_2rem_2rem] gap-2 text-[10px] font-bold text-slate-500 border-b border-slate-800/60">
                    <span>포지션</span>
                    <span>OVR</span>
                    <span>선수</span>
                    <span>아키타입</span>
                    <button onClick={() => handleSort('age')} className="text-center hover:text-indigo-400 transition-colors">
                        나이<SortIcon field="age" />
                    </button>
                    <span className="text-center">키</span>
                    <span className="text-center">몸무게</span>
                    <span className="text-center">INS</span>
                    <span className="text-center">OUT</span>
                    <span className="text-center">ATH</span>
                    <span className="text-center">PLM</span>
                    <span className="text-center">DEF</span>
                    <span className="text-center">REB</span>
                </div>

                {/* 리스트 */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 size={20} className="animate-spin text-indigo-400" />
                        </div>
                    ) : sorted.length === 0 ? (
                        <div className="flex items-center justify-center py-16">
                            <p className="text-sm text-slate-500 ko-normal">조건에 맞는 선수가 없습니다</p>
                        </div>
                    ) : (
                        sorted.map(p => {
                            const archetypeLabel = p.secondaryArchetype ? `${p.archetype} / ${p.secondaryArchetype}` : p.archetype;
                            return (
                                <div
                                    key={p.id}
                                    className="px-4 py-2 grid grid-cols-[2.75rem_2rem_0.6fr_1fr_2rem_2.75rem_2.75rem_2rem_2rem_2rem_2rem_2rem_2rem] gap-2 items-center border-b border-slate-800/30 hover:bg-slate-800/40 transition-colors"
                                >
                                    <span className="text-xs font-bold text-slate-300">{p.position}</span>
                                    <OvrBadge value={p.ovr} size="sm" />
                                    <span className="text-xs text-white font-bold truncate">{p.name}</span>
                                    <span className="text-xs text-white leading-snug break-words">
                                        {archetypeLabel || '—'}
                                    </span>
                                    <span className="text-xs text-white text-center">{p.age}</span>
                                    <span className="text-xs text-white text-center">{p.height}cm</span>
                                    <span className="text-xs text-white text-center">{p.weight}kg</span>
                                    <span className={`text-xs font-bold text-center ${getStatColor(p.ins)}`}>{p.ins}</span>
                                    <span className={`text-xs font-bold text-center ${getStatColor(p.out)}`}>{p.out}</span>
                                    <span className={`text-xs font-bold text-center ${getStatColor(p.ath)}`}>{p.ath}</span>
                                    <span className={`text-xs font-bold text-center ${getStatColor(p.plm)}`}>{p.plm}</span>
                                    <span className={`text-xs font-bold text-center ${getStatColor(p.def)}`}>{p.def}</span>
                                    <span className={`text-xs font-bold text-center ${getStatColor(p.reb)}`}>{p.reb}</span>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};
