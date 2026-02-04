
import React from 'react';
import { Team, PlayerBoxScore, RotationData } from '../../types';
import { Clock } from 'lucide-react';

interface RotationChartProps {
    homeTeam: Team;
    awayTeam: Team;
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
    rotationData?: RotationData;
}

const GAME_DURATION_SECONDS = 48 * 60; // 2880

const PlayerRow: React.FC<{ 
    player: PlayerBoxScore, 
    segments: { in: number, out: number }[],
    teamColorClass: string 
}> = ({ player, segments, teamColorClass }) => {
    // Only render if player played at least 1 second
    if (!segments || segments.length === 0) return null;

    return (
        <div className="flex items-center h-8 hover:bg-white/5 transition-colors border-b border-slate-800/30">
            <div className="w-32 md:w-40 flex-shrink-0 px-3 truncate text-xs font-bold text-slate-300 border-r border-slate-800/50 flex items-center justify-between">
                <span className="truncate">{player.playerName}</span>
                <span className="text-[10px] text-slate-500 font-mono">{Math.round(player.mp)}m</span>
            </div>
            <div className="flex-1 relative h-full">
                {segments.map((seg, i) => {
                    const startPct = (seg.in / GAME_DURATION_SECONDS) * 100;
                    const widthPct = ((seg.out - seg.in) / GAME_DURATION_SECONDS) * 100;
                    
                    // Cap at 100% (in case of OT)
                    const cappedWidth = Math.min(widthPct, 100 - startPct);

                    return (
                        <div
                            key={i}
                            className={`absolute top-2 bottom-2 rounded-sm ${teamColorClass} opacity-80 hover:opacity-100 transition-opacity`}
                            style={{ 
                                left: `${startPct}%`, 
                                width: `${cappedWidth}%`,
                                minWidth: '2px' 
                            }}
                            title={`${Math.floor(seg.in/60)}' - ${Math.floor(seg.out/60)}'`}
                        />
                    );
                })}
            </div>
        </div>
    );
};

export const RotationChart: React.FC<RotationChartProps> = ({ 
    homeTeam, awayTeam, homeBox, awayBox, rotationData 
}) => {
    if (!rotationData) return null;

    // Sorting Helper: Starters (GS=1) first, then by Minutes Played
    const sortPlayers = (a: PlayerBoxScore, b: PlayerBoxScore) => {
        if (a.gs !== b.gs) return b.gs - a.gs;
        return b.mp - a.mp;
    };

    const sortedHome = [...homeBox].sort(sortPlayers);
    const sortedAway = [...awayBox].sort(sortPlayers);

    return (
        <div className="w-full bg-slate-950 border border-slate-800 rounded-3xl p-6 mb-8 shadow-2xl">
            <div className="flex items-center gap-3 mb-6 pb-2 border-b border-slate-800">
                <Clock className="text-slate-400" size={20} />
                <h3 className="text-lg font-black uppercase text-slate-200 tracking-widest ko-tight">Rotation Analysis</h3>
            </div>

            <div className="relative">
                {/* Quarter Markers */}
                <div className="absolute top-0 bottom-0 left-32 md:left-40 right-0 flex pointer-events-none z-0">
                    <div className="flex-1 border-l border-slate-800/50"></div>
                    <div className="flex-1 border-l border-slate-800/50"></div>
                    <div className="flex-1 border-l border-slate-800/50"></div>
                    <div className="flex-1 border-l border-slate-800/50 border-r"></div>
                </div>

                {/* Quarter Labels Header */}
                <div className="flex pl-32 md:pl-40 mb-2 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">
                    <div className="flex-1">Q1</div>
                    <div className="flex-1">Q2</div>
                    <div className="flex-1">Q3</div>
                    <div className="flex-1">Q4</div>
                </div>

                {/* Away Team Section */}
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-2 px-2">
                        <img src={awayTeam.logo} className="w-5 h-5 object-contain" alt="" />
                        <span className="text-xs font-black text-slate-400 uppercase tracking-wider">{awayTeam.name}</span>
                    </div>
                    <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/30">
                        {sortedAway.map(p => (
                            <PlayerRow 
                                key={p.playerId} 
                                player={p} 
                                segments={rotationData[p.playerId]} 
                                teamColorClass="bg-slate-400"
                            />
                        ))}
                    </div>
                </div>

                {/* Home Team Section */}
                <div>
                    <div className="flex items-center gap-2 mb-2 px-2">
                        <img src={homeTeam.logo} className="w-5 h-5 object-contain" alt="" />
                        <span className="text-xs font-black text-slate-400 uppercase tracking-wider">{homeTeam.name}</span>
                    </div>
                    <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/30">
                        {sortedHome.map(p => (
                            <PlayerRow 
                                key={p.playerId} 
                                player={p} 
                                segments={rotationData[p.playerId]} 
                                teamColorClass="bg-indigo-500"
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
