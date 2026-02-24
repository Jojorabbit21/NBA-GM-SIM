
import React from 'react';
import { Player } from '../../types';

interface MyRosterProps {
    players: Player[];
    latestPlayerId?: string;
}

const POSITION_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
const RESERVES = 10;

export const MyRoster: React.FC<MyRosterProps> = ({ players, latestPlayerId }) => {
    const grouped: Record<string, Player[]> = { PG: [], SG: [], SF: [], PF: [], C: [] };
    players.forEach(p => {
        if (grouped[p.position]) grouped[p.position].push(p);
        else grouped['SF'].push(p); // fallback
    });

    // Build starter slots (1 per position) and remaining as reserves
    const starters: (Player | null)[] = [];
    const reserves: (Player | null)[] = [];
    const used = new Set<string>();

    POSITION_ORDER.forEach(pos => {
        if (grouped[pos].length > 0) {
            starters.push(grouped[pos][0]);
            used.add(grouped[pos][0].id);
        } else {
            starters.push(null);
        }
    });

    // Remaining players as reserves
    players.forEach(p => {
        if (!used.has(p.id)) reserves.push(p);
    });
    // Fill reserve slots up to 10
    while (reserves.length < RESERVES) reserves.push(null);

    return (
        <div className="flex flex-col h-full bg-slate-950">
            {/* Header — same height as PickHistory */}
            <div className="px-2 py-1.5 border-b border-slate-800 shrink-0 flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">MY ROSTER</span>
                <span className="text-[10px] text-slate-400 font-mono">{players.length}/15</span>
            </div>
            {/* Scroll Area */}
            <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                {/* Starters */}
                <div className="text-[9px] font-bold uppercase text-slate-600 bg-slate-900/50 px-2 py-0.5 border-b border-slate-800/30">
                    STARTERS
                </div>
                {POSITION_ORDER.map((pos, i) => {
                    const player = starters[i];
                    return (
                        <div
                            key={`starter-${pos}`}
                            className={`px-2 py-1 border-b border-slate-800/20 flex items-center gap-1.5 ${
                                player?.id === latestPlayerId ? 'bg-emerald-500/5' : ''
                            }`}
                        >
                            <span className="text-[9px] font-bold text-slate-600 w-5 shrink-0">{pos}</span>
                            {player ? (
                                <>
                                    <span className="text-[10px] font-bold text-indigo-400 w-6 text-right">{player.ovr}</span>
                                    <span className="text-xs font-semibold text-slate-200 truncate">{player.name}</span>
                                </>
                            ) : (
                                <span className="text-[10px] text-slate-700 italic">— empty —</span>
                            )}
                        </div>
                    );
                })}

                {/* Reserves */}
                <div className="text-[9px] font-bold uppercase text-slate-600 bg-slate-900/50 px-2 py-0.5 border-b border-slate-800/30">
                    RESERVES
                </div>
                {reserves.slice(0, RESERVES).map((player, i) => (
                    <div
                        key={`res-${i}`}
                        className={`px-2 py-1 border-b border-slate-800/20 flex items-center gap-1.5 ${
                            player?.id === latestPlayerId ? 'bg-emerald-500/5' : ''
                        }`}
                    >
                        <span className="text-[9px] font-bold text-slate-700 w-5 shrink-0">Res</span>
                        {player ? (
                            <>
                                <span className="text-[10px] font-bold text-indigo-400 w-6 text-right">{player.ovr}</span>
                                <span className="text-xs font-semibold text-slate-200 truncate">{player.name}</span>
                            </>
                        ) : (
                            <span className="text-[10px] text-slate-700 italic">— empty —</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
