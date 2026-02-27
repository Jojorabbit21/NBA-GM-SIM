
import React from 'react';
import { Player } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';

interface MyRosterProps {
    players: Player[];
    latestPlayerId?: string;
    positionColors: Record<string, string>;
    teamColor: string;
}

const POSITION_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
const RESERVES = 10;

// OVR tier color (inline text)
const getOvrColor = (ovr: number): string => {
    if (ovr >= 90) return '#f0abfc';
    if (ovr >= 85) return '#93c5fd';
    if (ovr >= 80) return '#6ee7b7';
    if (ovr >= 75) return '#fcd34d';
    if (ovr >= 70) return '#94a3b8';
    return '#78716c';
};

export const MyRoster: React.FC<MyRosterProps> = ({ players, latestPlayerId, positionColors, teamColor }) => {
    const grouped: Record<string, Player[]> = { PG: [], SG: [], SF: [], PF: [], C: [] };
    players.forEach(p => {
        if (grouped[p.position]) grouped[p.position].push(p);
        else grouped['SF'].push(p);
    });

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

    players.forEach(p => {
        if (!used.has(p.id)) reserves.push(p);
    });
    while (reserves.length < RESERVES) reserves.push(null);

    const progressPct = Math.min((players.length / 15) * 100, 100);

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-3 h-10 border-b border-slate-800/50 shrink-0 flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">내 로스터</span>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-mono">{players.length}/15</span>
                    <div className="w-16 h-[3px] bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${progressPct}%`, backgroundColor: teamColor }}
                        />
                    </div>
                </div>
            </div>
            {/* Scroll Area */}
            <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                {/* Starters */}
                <div className="text-[9px] font-bold uppercase text-slate-600 bg-slate-800/20 px-3 py-0.5 border-b border-slate-800/30">
                    STARTERS
                </div>
                {POSITION_ORDER.map((pos, i) => {
                    const player = starters[i];
                    const posColor = positionColors[pos] || '#64748b';
                    const isLatest = player?.id === latestPlayerId;
                    const ovr = player ? calculatePlayerOvr(player) : 0;

                    return (
                        <div
                            key={`starter-${pos}`}
                            className={`px-2 py-1 border-b border-slate-800/20 flex items-center gap-1.5 transition-colors`}
                            style={isLatest ? {
                                backgroundColor: 'rgba(16,185,129,0.06)',
                                borderLeft: '2px solid #10b981',
                            } : {}}
                        >
                            {/* Position color dot */}
                            <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: posColor }}
                            />
                            {/* Position label */}
                            <span
                                className="text-[9px] font-bold w-5 shrink-0"
                                style={{ color: posColor }}
                            >
                                {pos}
                            </span>
                            {player ? (
                                <>
                                    <span
                                        className="text-[10px] font-bold w-6 text-right shrink-0"
                                        style={{ color: getOvrColor(ovr) }}
                                    >
                                        {ovr}
                                    </span>
                                    <span className="text-xs font-semibold text-slate-200 truncate">{player.name}</span>
                                </>
                            ) : (
                                <span className="text-[10px] text-slate-700 italic" style={{ borderLeft: '1px dashed rgba(100,116,139,0.3)', paddingLeft: '6px' }}>
                                    — empty —
                                </span>
                            )}
                        </div>
                    );
                })}

                {/* Reserves */}
                <div className="text-[9px] font-bold uppercase text-slate-600 bg-slate-800/20 px-3 py-0.5 border-b border-slate-800/30">
                    RESERVES
                </div>
                {reserves.slice(0, RESERVES).map((player, i) => {
                    const isLatest = player?.id === latestPlayerId;
                    const ovr = player ? calculatePlayerOvr(player) : 0;
                    const posColor = player ? positionColors[player.position] || '#64748b' : '#334155';

                    return (
                        <div
                            key={`res-${i}`}
                            className={`px-2 py-1 border-b border-slate-800/20 flex items-center gap-1.5 transition-colors`}
                            style={isLatest ? {
                                backgroundColor: 'rgba(16,185,129,0.06)',
                                borderLeft: '2px solid #10b981',
                            } : {}}
                        >
                            {player ? (
                                <>
                                    <span
                                        className="w-1.5 h-1.5 rounded-full shrink-0"
                                        style={{ backgroundColor: posColor }}
                                    />
                                    <span
                                        className="text-[9px] font-bold w-5 shrink-0"
                                        style={{ color: posColor }}
                                    >
                                        {player.position}
                                    </span>
                                    <span
                                        className="text-[10px] font-bold w-6 text-right shrink-0"
                                        style={{ color: getOvrColor(ovr) }}
                                    >
                                        {ovr}
                                    </span>
                                    <span className="text-xs font-semibold text-slate-200 truncate">{player.name}</span>
                                </>
                            ) : (
                                <>
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-slate-800" />
                                    <span className="text-[9px] font-bold text-slate-800 w-5 shrink-0">Res</span>
                                    <span className="text-[10px] text-slate-800 italic">— empty —</span>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
