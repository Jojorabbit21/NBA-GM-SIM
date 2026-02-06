
import React from 'react';
import { Team, PlayerBoxScore, RotationData } from '../../types';

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
        <div className="grid grid-cols-[140px_1fr] h-8 border-b border-slate-800/30 relative z-10 hover:bg-white/5 transition-colors">
            {/* Name Column */}
            <div className="flex items-center justify-between px-3 text-xs font-bold text-slate-300 border-r border-slate-800/50 bg-slate-900/20 truncate">
                <span className="truncate mr-2">{player.playerName}</span>
                <span className="text-[10px] text-slate-500 font-mono">{Math.round(player.mp)}m</span>
            </div>
            
            {/* Timeline Column */}
            <div className="relative h-full">
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
        <div className="w-full bg-slate-950 border border-slate-800 rounded-3xl p-6 mb-8 shadow-2xl relative overflow-hidden">
            
            <div className="relative z-10 w-full">
                {/* Header Grid */}
                <div className="grid grid-cols-[140px_1fr] mb-2">
                    <div></div> {/* Spacer for Name Column */}
                    <div className="grid grid-cols-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">
                        <div className="border-l border-slate-800/40">Q1</div>
                        <div className="border-l border-slate-800/40">Q2</div>
                        <div className="border-l border-slate-800/40">Q3</div>
                        <div className="border-l border-slate-800/40 border-r border-slate-800/40">Q4</div>
                    </div>
                </div>

                {/* Away Team Section */}
                <div className="mb-6 relative">
                    <div className="flex items-center gap-2 mb-2 px-2">
                        <img src={awayTeam.logo} className="w-5 h-5 object-contain" alt="" />
                        <span className="text-xs font-black text-slate-400 uppercase tracking-wider">{awayTeam.name}</span>
                    </div>
                    
                    <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60 backdrop-blur-sm relative">
                        {/* Background Grid Lines Layer */}
                        <div className="absolute inset-0 grid grid-cols-[140px_1fr] pointer-events-none z-0">
                            <div></div>
                            <div className="grid grid-cols-4 h-full border-r border-slate-800/30">
                                <div className="border-l border-slate-800/30 h-full"></div>
                                <div className="border-l border-slate-800/30 h-full"></div>
                                <div className="border-l border-slate-800/30 h-full"></div>
                                <div className="border-l border-slate-800/30 h-full"></div>
                            </div>
                        </div>
                        
                        {/* Player Rows */}
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
                <div className="relative">
                    <div className="flex items-center gap-2 mb-2 px-2">
                        <img src={homeTeam.logo} className="w-5 h-5 object-contain" alt="" />
                        <span className="text-xs font-black text-slate-400 uppercase tracking-wider">{homeTeam.name}</span>
                    </div>
                    
                    <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60 backdrop-blur-sm relative">
                         {/* Background Grid Lines Layer */}
                         <div className="absolute inset-0 grid grid-cols-[140px_1fr] pointer-events-none z-0">
                            <div></div>
                            <div className="grid grid-cols-4 h-full border-r border-slate-800/30">
                                <div className="border-l border-slate-800/30 h-full"></div>
                                <div className="border-l border-slate-800/30 h-full"></div>
                                <div className="border-l border-slate-800/30 h-full"></div>
                                <div className="border-l border-slate-800/30 h-full"></div>
                            </div>
                        </div>

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
