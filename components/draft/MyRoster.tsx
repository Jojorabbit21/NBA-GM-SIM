
import React from 'react';
import { Player } from '../../types';
import { OvrBadge } from '../common/OvrBadge';
import { calculatePlayerOvr } from '../../utils/constants';

interface MyRosterProps {
    players: Player[];
    positionColors: Record<string, string>;
}

const POSITION_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

export const MyRoster: React.FC<MyRosterProps> = ({ players, positionColors }) => {
    // Group by position
    const grouped: Record<string, Player[]> = { PG: [], SG: [], SF: [], PF: [], C: [] };
    players.forEach(p => {
        if (grouped[p.position]) grouped[p.position].push(p);
        else grouped['SF'].push(p);
    });

    // Starters: first player of each position
    const starters: (Player | null)[] = [];
    const used = new Set<string>();
    POSITION_ORDER.forEach(pos => {
        if (grouped[pos].length > 0) {
            starters.push(grouped[pos][0]);
            used.add(grouped[pos][0].id);
        } else {
            starters.push(null);
        }
    });

    // Reserves: everyone not used as starter
    const reserves = players.filter(p => !used.has(p.id));

    // Position counts
    const posCounts: Record<string, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
    players.forEach(p => {
        if (posCounts[p.position] !== undefined) posCounts[p.position]++;
        else posCounts['SF']++;
    });

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-3 h-10 border-b border-slate-800/50 shrink-0 flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 shrink-0">내 로스터</span>
                <div className="flex items-center gap-1.5">
                    {POSITION_ORDER.map(pos => (
                        <span key={pos} className="flex items-center gap-0.5">
                            <span className="text-[8px] font-bold" style={{ color: positionColors[pos] }}>{pos}</span>
                            <span className="text-[9px] font-mono text-slate-400">{posCounts[pos]}</span>
                        </span>
                    ))}
                    <span className="text-slate-600 text-[8px]">·</span>
                    <span className="text-[9px] font-mono text-slate-500">총 {players.length}</span>
                </div>
            </div>

            {/* Scroll Area */}
            <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                {/* Starters */}
                <div className="shrink-0 px-3 h-10 flex items-center border-b border-slate-800/50">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">STARTERS</span>
                </div>
                {POSITION_ORDER.map((pos, i) => {
                    const player = starters[i];
                    const posColor = positionColors[pos] || '#64748b';
                    return (
                        <div
                            key={`starter-${pos}`}
                            className="px-2.5 py-2 border-b border-slate-700/50 flex items-center gap-1.5"
                        >
                            <span className="text-[10px] font-bold w-8 shrink-0" style={{ color: posColor }}>
                                {pos}
                            </span>
                            {player ? (
                                <>
                                    <OvrBadge value={calculatePlayerOvr(player)} size="sm" />
                                    <span className="text-[11px] font-semibold text-slate-200 truncate">{player.name}</span>
                                </>
                            ) : (
                                <span className="text-[10px] text-slate-700 italic">— empty —</span>
                            )}
                        </div>
                    );
                })}

                {/* Reserves */}
                <div className="shrink-0 px-3 h-10 flex items-center border-b border-slate-800/50">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">RESERVES</span>
                </div>
                {reserves.length === 0 && (
                    <div className="px-2.5 py-2 text-[10px] text-slate-700 italic text-center">—</div>
                )}
                {reserves.map((player, i) => {
                    const posColor = positionColors[player.position] || '#64748b';
                    return (
                        <div
                            key={`res-${i}`}
                            className="px-2.5 py-2 border-b border-slate-700/50 flex items-center gap-1.5"
                        >
                            <span className="text-[10px] font-bold w-8 shrink-0" style={{ color: posColor }}>
                                {player.position}
                            </span>
                            <OvrBadge value={calculatePlayerOvr(player)} size="sm" />
                            <span className="text-[11px] font-semibold text-slate-200 truncate">{player.name}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
