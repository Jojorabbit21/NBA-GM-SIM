
import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Player } from '../../types';
import { OvrBadge } from '../common/OvrBadge';
import { calculatePlayerOvr } from '../../utils/constants';
import { ButtonTheme } from '../../utils/teamTheme';

interface PlayerPoolProps {
    players: Player[];
    onSelectPlayer: (player: Player) => void;
    selectedPlayerId: string | null;
    isUserTurn: boolean;
    onDraft: (player: Player) => void;
    positionColors: Record<string, string>;
    buttonTheme: ButtonTheme;
    teamColor: string;
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
    onSelectPlayer,
    selectedPlayerId,
    isUserTurn,
    onDraft,
    positionColors,
    buttonTheme,
    teamColor,
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

    const SortHeader: React.FC<{ label: string; field: SortKey; className?: string }> = ({ label, field, className }) => (
        <th
            className={`px-1 py-1 text-center cursor-pointer hover:text-indigo-400 transition-colors select-none ${
                sortKey === field ? 'text-indigo-400' : ''
            } ${className || ''}`}
            onClick={() => handleHeaderClick(field)}
        >
            {label}{sortKey === field ? (sortAsc ? '↑' : '↓') : ''}
        </th>
    );

    return (
        <div className="flex flex-col h-full bg-slate-950">
            {/* Toolbar */}
            <div className="shrink-0 px-2 py-1.5 border-b border-slate-800 flex items-center gap-2">
                <div className="relative">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        type="text"
                        placeholder="선수 검색..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="bg-slate-900 border border-slate-800 rounded-md pl-7 pr-2 py-1 text-xs text-slate-200 w-36 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
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
                                className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold transition-colors ${
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
                <span className="ml-auto text-[10px] text-slate-600">{filtered.length}명</span>
            </div>

            {/* Table */}
            <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-950">
                        <tr className="text-[9px] font-black uppercase text-slate-500">
                            <SortHeader label="OVR" field="ovr" className="px-2 text-left w-12" />
                            <th className="px-1 py-1 text-center w-8">POS</th>
                            <th className="px-2 py-1 text-left">NAME</th>
                            <SortHeader label="AGE" field="age" className="w-8" />
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
                            const posColor = positionColors[player.position] || '#64748b';
                            return (
                                <React.Fragment key={player.id}>
                                    <tr
                                        className={`h-7 border-b border-slate-800/20 cursor-pointer transition-colors ${
                                            isSelected
                                                ? ''
                                                : 'hover:bg-white/[0.03]'
                                        }`}
                                        style={isSelected ? { backgroundColor: `${teamColor}0a` } : {}}
                                        onClick={() => onSelectPlayer(player)}
                                    >
                                        <td className="px-2 py-0.5">
                                            <OvrBadge value={calculatePlayerOvr(player)} size="sm" />
                                        </td>
                                        <td className="px-1 py-0.5 text-center text-[10px] font-bold" style={{ color: posColor }}>
                                            {player.position}
                                        </td>
                                        <td className="px-2 py-0.5 font-semibold text-slate-200 truncate max-w-[140px]">{player.name}</td>
                                        <td className="px-1 py-0.5 text-center text-slate-400 font-mono">{player.age}</td>
                                        <td className={`px-1 py-0.5 text-center font-mono ${getStatColor(player.ins)}`}>{player.ins}</td>
                                        <td className={`px-1 py-0.5 text-center font-mono ${getStatColor(player.out)}`}>{player.out}</td>
                                        <td className={`px-1 py-0.5 text-center font-mono ${getStatColor(player.ath)}`}>{player.ath}</td>
                                        <td className={`px-1 py-0.5 text-center font-mono ${getStatColor(player.plm)}`}>{player.plm}</td>
                                        <td className={`px-1 py-0.5 text-center font-mono ${getStatColor(player.def)}`}>{player.def}</td>
                                        <td className={`px-1 py-0.5 text-center font-mono ${getStatColor(player.reb)}`}>{player.reb}</td>
                                    </tr>
                                    {/* Inline Detail Panel */}
                                    {isSelected && selectedPlayer && (
                                        <tr className="border-b" style={{ borderBottomColor: `${posColor}30`, backgroundColor: `${teamColor}06` }}>
                                            <td colSpan={10} className="px-3 py-2">
                                                <div className="flex items-center gap-3" style={{ borderLeft: `3px solid ${posColor}`, paddingLeft: '10px' }}>
                                                    <OvrBadge value={calculatePlayerOvr(selectedPlayer)} size="md" />
                                                    <div>
                                                        <div className="text-xs font-bold text-slate-200">{selectedPlayer.name}</div>
                                                        <div className="text-[10px] text-slate-400">
                                                            <span style={{ color: posColor }} className="font-bold">{selectedPlayer.position}</span>
                                                            {' · '}{selectedPlayer.age}세 · {selectedPlayer.height}cm · {selectedPlayer.weight}kg
                                                        </div>
                                                    </div>
                                                    <div className="flex-1" />
                                                    {/* 6-stat inline */}
                                                    <div className="flex gap-1.5">
                                                        {([
                                                            ['INS', selectedPlayer.ins],
                                                            ['OUT', selectedPlayer.out],
                                                            ['ATH', selectedPlayer.ath],
                                                            ['PLM', selectedPlayer.plm],
                                                            ['DEF', selectedPlayer.def],
                                                            ['REB', selectedPlayer.reb],
                                                        ] as [string, number][]).map(([label, val]) => (
                                                            <span key={label} className="text-[9px] text-slate-500">
                                                                {label}<b className={`${getStatColor(val)} ml-0.5`}>{val}</b>
                                                            </span>
                                                        ))}
                                                    </div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onDraft(selectedPlayer); }}
                                                        disabled={!isUserTurn}
                                                        className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase ml-2 transition-all ${
                                                            !isUserTurn ? 'bg-slate-700 text-slate-500 opacity-40 cursor-not-allowed' : 'hover:brightness-110 active:scale-95'
                                                        }`}
                                                        style={isUserTurn ? {
                                                            backgroundColor: buttonTheme.bg,
                                                            color: buttonTheme.text,
                                                            boxShadow: `0 0 12px ${buttonTheme.glow}50`,
                                                        } : {}}
                                                    >
                                                        DRAFT
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
