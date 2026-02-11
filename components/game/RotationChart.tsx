
import React from 'react';
import { Team, PlayerBoxScore, RotationData } from '../../types';
import { TEAM_DATA } from '../../data/teamData';
import { Table, TableHead, TableHeaderCell } from '../common/Table';

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
    teamColor: string 
}> = ({ player, segments, teamColor }) => {
    // Only render if player played at least 1 second
    if (!segments || segments.length === 0) return null;

    return (
        <div className="grid grid-cols-[140px_1fr] h-10 border-b border-slate-700/50 relative z-10 hover:bg-white/5 transition-colors group">
            {/* Name Column */}
            <div className="flex items-center justify-between px-3 text-xs font-bold text-slate-300 border-r border-slate-700/50 bg-slate-900/20 truncate group-hover:text-white transition-colors">
                <span className="truncate mr-2">{player.playerName}</span>
                <span className="text-[10px] text-slate-500 font-mono group-hover:text-indigo-400">{Math.round(player.mp)}m</span>
            </div>
            
            {/* Timeline Column */}
            <div className="relative h-full w-full">
                {/* Horizontal Guide Line */}
                <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-800/40"></div>
                
                {segments.map((seg, i) => {
                    const startPct = (seg.in / GAME_DURATION_SECONDS) * 100;
                    const durationPct = ((seg.out - seg.in) / GAME_DURATION_SECONDS) * 100;
                    
                    // Cap at 100% (in case of OT)
                    const cappedWidth = Math.min(durationPct, 100 - startPct);
                    
                    // Prevent tiny invisible bars
                    if (cappedWidth < 0.1) return null;

                    return (
                        <div
                            key={i}
                            className={`absolute top-2 bottom-2 rounded-sm shadow-sm transition-all hover:scale-y-110`}
                            style={{ 
                                left: `${startPct}%`, 
                                width: `${cappedWidth}%`,
                                minWidth: '2px',
                                backgroundColor: teamColor,
                                opacity: 0.9
                            }}
                            title={`${Math.floor(seg.in/60)}' - ${Math.floor(seg.out/60)}'`}
                        />
                    );
                })}
            </div>
        </div>
    );
};

// Reusable Background Grid Component
const BackgroundGrid = () => (
    <div className="absolute inset-0 grid grid-cols-[140px_1fr] pointer-events-none z-0">
        <div className="bg-slate-950/30 border-r border-slate-700/50"></div>
        <div className="grid grid-cols-4 h-full">
            {/* Q1 */}
            <div className="border-l border-slate-700/50 h-full bg-black/20"></div>
            {/* Q2 */}
            <div className="border-l border-slate-700/50 h-full"></div>
            {/* Q3 */}
            <div className="border-l border-slate-700/50 h-full bg-black/20"></div>
            {/* Q4 */}
            <div className="border-l border-slate-700/50 h-full"></div>
        </div>
    </div>
);

// Reusable Header Component with TableHead styles
const StandardizedHeader = () => (
    <div className="grid grid-cols-[140px_1fr] mb-0 bg-slate-950 border-b border-slate-800">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center px-4 h-10 border-r border-slate-800">PLAYER</div>
        <div className="grid grid-cols-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center h-10">
            <div className="border-r border-slate-800 flex items-center justify-center">1Q</div>
            <div className="border-r border-slate-800 flex items-center justify-center">2Q</div>
            <div className="border-r border-slate-800 flex items-center justify-center">3Q</div>
            <div className="flex items-center justify-center">4Q</div>
        </div>
    </div>
);

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

    const homeColor = TEAM_DATA[homeTeam.id]?.colors.primary || '#6366f1';
    const awayColor = TEAM_DATA[awayTeam.id]?.colors.primary || '#94a3b8';

    return (
        <div className="w-full bg-slate-950 border border-slate-800 rounded-3xl p-6 mb-8 shadow-2xl relative overflow-hidden">
            
            <div className="relative z-10 w-full">
                
                {/* Away Team Section */}
                <div className="mb-10 relative">
                    <div className="flex items-center gap-2 mb-3 px-2 border-b border-slate-800/50 pb-2">
                        <img src={awayTeam.logo} className="w-6 h-6 object-contain" alt="" />
                        <span className="text-sm font-black text-slate-300 uppercase tracking-wider">{awayTeam.name}</span>
                    </div>

                    <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40 backdrop-blur-sm relative">
                        <StandardizedHeader />
                        <div className="relative">
                            <BackgroundGrid />
                            {sortedAway.map(p => (
                                <PlayerRow 
                                    key={p.playerId} 
                                    player={p} 
                                    segments={rotationData[p.playerId]} 
                                    teamColor={awayColor}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Home Team Section */}
                <div className="relative">
                    <div className="flex items-center gap-2 mb-3 px-2 border-b border-slate-800/50 pb-2">
                        <img src={homeTeam.logo} className="w-6 h-6 object-contain" alt="" />
                        <span className="text-sm font-black text-slate-300 uppercase tracking-wider">{homeTeam.name}</span>
                    </div>

                    <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40 backdrop-blur-sm relative">
                        <StandardizedHeader />
                        <div className="relative">
                             <BackgroundGrid />
                            {sortedHome.map(p => (
                                <PlayerRow 
                                    key={p.playerId} 
                                    player={p} 
                                    segments={rotationData[p.playerId]} 
                                    teamColor={homeColor}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
