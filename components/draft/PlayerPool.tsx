
import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Player } from '../../types';
import { OvrBadge } from '../common/OvrBadge';
import { calculatePlayerOvr } from '../../utils/constants';
interface PlayerPoolProps {
    players: Player[];
    selectedPlayerId: string | null;
    onSelectPlayer: (player: Player) => void;
    isUserTurn: boolean;
    onDraft: (player: Player) => void;
    positionColors: Record<string, string>;
}

const POSITIONS = ['All', 'PG', 'SG', 'SF', 'PF', 'C'] as const;

type SortKey = 'ovr' | 'age' | 'ins' | 'out' | 'ath' | 'plm' | 'def' | 'reb';

const getStatColor = (val: number): string => {
    if (val >= 90) return 'text-fuchsia-400';
    if (val >= 80) return 'text-emerald-400';
    if (val >= 70) return 'text-amber-400';
    return 'text-slate-500';
};

export const PlayerPool: React.FC<PlayerPoolProps> = ({
    players,
    selectedPlayerId,
    onSelectPlayer,
    isUserTurn,
    onDraft,
    positionColors,
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
            const av = sortKey === 'ovr' ? calculatePlayerOvr(a) : (a as any)[sortKey] ?? 0;
            const bv = sortKey === 'ovr' ? calculatePlayerOvr(b) : (b as any)[sortKey] ?? 0;
            return sortAsc ? av - bv : bv - av;
        });
        return result;
    }, [players, posFilter, search, sortKey, sortAsc]);

    const selectedPlayer = selectedPlayerId ? players.find(p => p.id === selectedPlayerId) : null;

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
                <span className="text-xs font-black uppercase tracking-wider text-slate-500 shrink-0">선수 풀</span>
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
            <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-800/15 backdrop-blur-sm">
                        <tr className="text-xs font-black uppercase text-slate-500">
                            <th className="w-6 px-1 py-1.5"></th>
                            <SortHeader label="OVR" field="ovr" className="px-2 text-left w-12" />
                            <th className="px-1 py-1.5 text-center w-8">POS</th>
                            <th className="px-2 py-1.5 text-left">NAME</th>
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
                        {filtered.map(player => {
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
                                    <td className="px-2 py-0.5">
                                        <OvrBadge value={calculatePlayerOvr(player)} size="sm" />
                                    </td>
                                    <td className="px-1 py-0.5 text-center font-bold text-slate-400">
                                        {player.position}
                                    </td>
                                    <td className="px-2 py-0.5 font-semibold text-slate-200 truncate max-w-[140px]">{player.name}</td>
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
                    </tbody>
                </table>
            </div>
        </div>
    );
};
