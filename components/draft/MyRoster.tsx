
import React from 'react';
import { Player } from '../../types';
import { OvrBadge } from '../common/OvrBadge';
import { calculatePlayerOvr } from '../../utils/constants';

interface MyRosterProps {
    players: Player[];
    existingRoster?: Player[];  // 루키 드래프트용: 기존 로스터 선수 표시
}

const POSITION_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
const RESERVES = 10;

export const MyRoster: React.FC<MyRosterProps> = ({ players, existingRoster }) => {
    // 루키 드래프트 모드: 기존 로스터 + 새 드래프트 픽 합산
    const allPlayers = existingRoster ? [...existingRoster, ...players] : players;
    const newPickIds = existingRoster ? new Set(players.map(p => p.id)) : null;

    const grouped: Record<string, Player[]> = { PG: [], SG: [], SF: [], PF: [], C: [] };
    allPlayers.forEach(p => {
        if (grouped[p.position]) grouped[p.position].push(p);
        else grouped['SF'].push(p);
    });

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

    const reserves: (Player | null)[] = allPlayers.filter(p => !used.has(p.id));
    while (reserves.length < RESERVES) reserves.push(null);

    const posCounts: Record<string, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
    allPlayers.forEach(p => {
        if (posCounts[p.position] !== undefined) posCounts[p.position]++;
        else posCounts['SF']++;
    });

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-3 h-10 border-b border-slate-800/50 shrink-0 flex items-center justify-between bg-slate-800/30">
                <span className="text-xs font-black uppercase tracking-wider text-indigo-400 shrink-0">내 로스터</span>
                <div className="flex items-center gap-1.5">
                    {POSITION_ORDER.map(pos => (
                        <span key={pos} className="flex items-center gap-0.5">
                            <span className="text-xs font-bold text-slate-400">{pos}</span>
                            <span className="text-xs font-mono text-slate-400">{posCounts[pos]}</span>
                        </span>
                    ))}
                    <span className="text-slate-600 text-xs">·</span>
                    <span className="text-xs font-mono text-slate-500">총 {allPlayers.length}</span>
                </div>
            </div>

            {/* Scroll Area */}
            <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                {/* Starters */}
                <div className="shrink-0 px-3 h-10 flex items-center border-b border-slate-800/50 bg-slate-800/15">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-500">선발</span>
                </div>
                {POSITION_ORDER.map((pos, i) => {
                    const player = starters[i];
                    const isNewPick = player && newPickIds?.has(player.id);
                    return (
                        <div
                            key={`starter-${pos}`}
                            className={`h-8 min-h-8 max-h-8 px-2.5 border-b border-slate-700/50 flex items-center gap-1.5 ${isNewPick ? 'bg-emerald-500/10' : ''}`}
                        >
                            <span className="text-xs font-bold w-8 shrink-0 text-slate-400">
                                {pos}
                            </span>
                            {player ? (
                                <>
                                    <OvrBadge value={calculatePlayerOvr(player)} size="sm" />
                                    <span className={`text-xs font-semibold truncate ${isNewPick ? 'text-emerald-300' : newPickIds ? 'text-slate-500' : 'text-slate-200'}`}>{player.name}</span>
                                </>
                            ) : (
                                <span className="text-xs text-slate-700 italic">비어있음</span>
                            )}
                        </div>
                    );
                })}

                {/* Reserves */}
                <div className="shrink-0 px-3 h-10 flex items-center border-b border-slate-800/50 bg-slate-800/15">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-500">벤치</span>
                </div>
                {reserves.map((player, i) => {
                    const isNewPick = player && newPickIds?.has(player.id);
                    return (
                        <div
                            key={`res-${i}`}
                            className={`h-8 min-h-8 max-h-8 px-2.5 border-b border-slate-700/50 flex items-center gap-1.5 ${isNewPick ? 'bg-emerald-500/10' : ''}`}
                        >
                            {player ? (
                                <>
                                    <span className="text-xs font-bold w-8 shrink-0 text-slate-400">
                                        {player.position}
                                    </span>
                                    <OvrBadge value={calculatePlayerOvr(player)} size="sm" />
                                    <span className={`text-xs font-semibold truncate ${isNewPick ? 'text-emerald-300' : newPickIds ? 'text-slate-500' : 'text-slate-200'}`}>{player.name}</span>
                                </>
                            ) : (
                                <>
                                    <span className="text-xs font-bold w-8 shrink-0 text-slate-700">—</span>
                                    <span className="text-xs text-slate-700 italic">비어있음</span>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
