
import React from 'react';
import { Player } from '../../types';

interface MyRosterProps {
    players: Player[];
    latestPlayerId?: string;
}

const POSITION_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

export const MyRoster: React.FC<MyRosterProps> = ({ players, latestPlayerId }) => {
    const grouped: Record<string, Player[]> = { PG: [], SG: [], SF: [], PF: [], C: [] };
    players.forEach(p => {
        if (grouped[p.position]) grouped[p.position].push(p);
        else grouped['SF'].push(p); // fallback
    });

    const avgOvr = players.length > 0
        ? Math.round(players.reduce((sum, p) => sum + p.ovr, 0) / players.length)
        : 0;

    return (
        <div className="flex flex-col h-full bg-slate-950">
            {/* Header */}
            <div className="px-2 py-1.5 border-b border-slate-800 shrink-0 flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">MY ROSTER</span>
                <span className="text-[10px] text-slate-400 font-mono">{players.length}/15</span>
            </div>
            {/* Scroll Area */}
            <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                {POSITION_ORDER.map(pos => (
                    <React.Fragment key={pos}>
                        <div className="text-[9px] font-bold uppercase text-slate-600 bg-slate-900/50 px-2 py-0.5 border-b border-slate-800/30">
                            {pos}
                        </div>
                        {grouped[pos].length > 0 ? (
                            grouped[pos].map(player => (
                                <div
                                    key={player.id}
                                    className={`px-2 py-1 border-b border-slate-800/20 flex items-center gap-1.5 ${
                                        player.id === latestPlayerId ? 'bg-emerald-500/5' : ''
                                    }`}
                                >
                                    <span className="text-[10px] font-bold text-indigo-400 w-6 text-right">{player.ovr}</span>
                                    <span className="text-xs font-semibold text-slate-200 truncate">{player.name}</span>
                                </div>
                            ))
                        ) : (
                            <div className="px-2 py-1 border-b border-slate-800/20 text-[10px] text-slate-700 italic">
                                — empty —
                            </div>
                        )}
                    </React.Fragment>
                ))}
            </div>
            {/* Footer */}
            <div className="px-2 py-1 border-t border-slate-800 shrink-0 text-[10px] text-slate-500">
                Avg OVR <b className="text-slate-300">{avgOvr || '—'}</b>
            </div>
        </div>
    );
};
