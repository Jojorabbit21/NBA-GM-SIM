
import React, { useState, useMemo, useEffect } from 'react';
import { Team, ShotEvent } from '../../../types';
import { TEAM_DATA } from '../../../data/teamData';
import { Check } from 'lucide-react';
import { COURT_WIDTH, COURT_HEIGHT, HOOP_X_LEFT, HOOP_Y_CENTER } from '../../../utils/courtCoordinates';

interface GameShotChartTabProps {
    homeTeam: Team;
    awayTeam: Team;
    shotEvents?: ShotEvent[];
}

export const GameShotChartTab: React.FC<GameShotChartTabProps> = ({
    homeTeam,
    awayTeam,
    shotEvents = []
}) => {
    const [selectedTeamId, setSelectedTeamId] = useState<string>(homeTeam.id);
    const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());

    const activeTeam = selectedTeamId === homeTeam.id ? homeTeam : awayTeam;
    const teamColor = TEAM_DATA[activeTeam.id]?.colors.primary || '#6366f1';

    // Reset player selection when team changes
    useEffect(() => {
        const allIds = new Set(activeTeam.roster.map(p => p.id));
        setSelectedPlayerIds(allIds);
    }, [selectedTeamId, activeTeam]);

    const togglePlayer = (playerId: string) => {
        const newSet = new Set(selectedPlayerIds);
        if (newSet.has(playerId)) {
            newSet.delete(playerId);
        } else {
            newSet.add(playerId);
        }
        setSelectedPlayerIds(newSet);
    };

    const toggleAllPlayers = () => {
        if (selectedPlayerIds.size === activeTeam.roster.length) {
            setSelectedPlayerIds(new Set());
        } else {
            setSelectedPlayerIds(new Set(activeTeam.roster.map(p => p.id)));
        }
    };
    
    // Filter and Transform Shots to Half Court (Left Hoop Perspective)
    const displayShots = useMemo(() => {
        return shotEvents
            .filter(shot => shot.teamId === selectedTeamId && selectedPlayerIds.has(shot.playerId))
            .map(shot => {
                // Normalize to Left Half Court (0-47ft)
                let x = shot.x;
                let y = shot.y;

                if (x > COURT_WIDTH / 2) {
                    x = COURT_WIDTH - x;
                    y = COURT_HEIGHT - y;
                }

                return { ...shot, x, y };
            });
    }, [shotEvents, selectedTeamId, selectedPlayerIds]);

    // Calculate Efficiency Stats
    const stats = useMemo(() => {
        const calculateStat = (filterFn: (s: ShotEvent) => boolean) => {
            const subset = displayShots.filter(filterFn);
            const total = subset.length;
            const made = subset.filter(s => s.isMake).length;
            return {
                m: made,
                a: total,
                pct: total > 0 ? Math.round((made / total) * 100) : 0
            };
        };

        return {
            fg: calculateStat(() => true),
            ra: calculateStat(s => s.zone === 'Rim'),
            itp: calculateStat(s => s.zone === 'Paint'), // In The Paint (Non-RA)
            mid: calculateStat(s => s.zone === 'Mid'),
            p3: calculateStat(s => s.zone === '3PT'),
        };
    }, [displayShots]);

    // Helper for Stat Box
    const StatBox = ({ label, stat }: { label: string, stat: { m: number, a: number, pct: number } }) => (
        <div className="flex flex-col items-center min-w-[60px]">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{label}</span>
            <span className="text-base font-semibold text-white font-mono leading-none">{stat.pct}%</span>
            <span className="text-[10px] text-slate-400 font-medium">{stat.m}/{stat.a}</span>
        </div>
    );

    return (
        <div className="w-full animate-in fade-in slide-in-from-right-4 duration-300">
            
            {/* Unified Container */}
            <div className="bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
                
                {/* Header Section: Team Toggle & Stats */}
                <div className="px-6 py-6 border-b border-slate-800/50 bg-slate-900/30">
                    <div className="flex flex-col xl:flex-row justify-between items-center gap-6">
                        {/* Team Toggle */}
                        <div className="flex p-1 bg-slate-900 rounded-xl border border-slate-800 shadow-sm">
                            <button
                                onClick={() => setSelectedTeamId(homeTeam.id)}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-black uppercase transition-all ${selectedTeamId === homeTeam.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <img src={homeTeam.logo} className="w-5 h-5 object-contain" alt="" />
                                <span>{homeTeam.name}</span>
                            </button>
                            <button
                                onClick={() => setSelectedTeamId(awayTeam.id)}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-black uppercase transition-all ${selectedTeamId === awayTeam.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <img src={awayTeam.logo} className="w-5 h-5 object-contain" alt="" />
                                <span>{awayTeam.name}</span>
                            </button>
                        </div>

                        {/* Zone Stats */}
                        <div className="flex gap-4 px-4 overflow-x-auto w-full xl:w-auto justify-center xl:justify-end no-scrollbar">
                            <StatBox label="FG%" stat={stats.fg} />
                            <div className="w-px h-8 bg-slate-800 self-center"></div>
                            <StatBox label="RA%" stat={stats.ra} />
                            <div className="w-px h-8 bg-slate-800 self-center"></div>
                            <StatBox label="ITP%" stat={stats.itp} />
                            <div className="w-px h-8 bg-slate-800 self-center"></div>
                            <StatBox label="MID%" stat={stats.mid} />
                            <div className="w-px h-8 bg-slate-800 self-center"></div>
                            <StatBox label="3P%" stat={stats.p3} />
                        </div>
                    </div>
                </div>

                {/* Body Section: Chart & List */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 min-h-[600px] bg-slate-950">
                    
                    {/* Left: Shot Chart (8 Cols) */}
                    <div className="lg:col-span-8 flex items-center justify-center relative p-6 border-b lg:border-b-0 lg:border-r border-slate-800">
                        <div className="relative w-full aspect-[50/47] max-h-full max-w-[700px]">
                             <svg viewBox={`0 0 ${COURT_WIDTH/2} ${COURT_HEIGHT}`} className="w-full h-full drop-shadow-xl">
                                {/* Court Background */}
                                <rect x="0" y="0" width={COURT_WIDTH/2} height={COURT_HEIGHT} fill="#0f172a" />
                                
                                {/* Markings */}
                                <g fill="none" stroke="#334155" strokeWidth="0.5">
                                    {/* Key (19x16) */}
                                    <rect x="0" y={(COURT_HEIGHT-16)/2} width="19" height="16" stroke="none" />
                                    {/* Free Throw Circle */}
                                    <path d={`M 19,${17} A 6 6 0 0 1 19,${33}`} />
                                    {/* 3-Point Line */}
                                    <line x1="0" y1="3" x2="14" y2="3" />
                                    <line x1="0" y1="47" x2="14" y2="47" />
                                    <path d="M 14,3 A 23.75 23.75 0 0 1 14,47" />
                                    {/* Hoop & Backboard */}
                                    <line x1="4" y1="22" x2="4" y2="28" stroke="white" strokeWidth="0.5" />
                                    <circle cx={HOOP_X_LEFT} cy={HOOP_Y_CENTER} r={0.75} stroke="white" />
                                    {/* Restricted Area */}
                                    <path d={`M ${HOOP_X_LEFT},21 A 4 4 0 0 1 ${HOOP_X_LEFT},29`} />
                                </g>

                                {/* Shots */}
                                {displayShots.map((shot) => {
                                    // [Updated] Missed shots use a fixed bright slate color
                                    const missColor = "#cbd5e1"; // Slate-300
                                    
                                    return (
                                        <g key={shot.id} className="animate-in fade-in zoom-in duration-300">
                                            {shot.isMake ? (
                                                <circle 
                                                    cx={shot.x} 
                                                    cy={shot.y} 
                                                    r={0.6} // Slight bump for visibility
                                                    fill={teamColor} 
                                                    stroke="white" 
                                                    strokeWidth="0.1" 
                                                    opacity="1"
                                                />
                                            ) : (
                                                <g transform={`translate(${shot.x}, ${shot.y})`} opacity="0.8">
                                                    <line x1="-0.45" y1="-0.45" x2="0.45" y2="0.45" stroke={missColor} strokeWidth="0.25" />
                                                    <line x1="-0.45" y1="0.45" x2="0.45" y2="-0.45" stroke={missColor} strokeWidth="0.25" />
                                                </g>
                                            )}
                                        </g>
                                    );
                                })}
                             </svg>
                        </div>
                        
                        {/* Legend */}
                        <div className="absolute bottom-4 right-4 flex gap-4 text-[10px] font-bold bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800 backdrop-blur-sm">
                            <div className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full border border-white" style={{ backgroundColor: teamColor }}></div>
                                <span className="text-white">MADE</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <XIcon size={10} className="text-slate-300" strokeWidth={3} />
                                <span className="text-slate-400">MISS</span>
                            </div>
                        </div>
                    </div>

                    {/* Right: Player Filter (4 Cols) */}
                    <div className="lg:col-span-4 flex flex-col h-full bg-slate-900/20">
                        <div className="p-5 border-b border-slate-800 bg-slate-900/40 flex justify-between items-center">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Player Filter</span>
                            <button 
                                onClick={toggleAllPlayers}
                                className="text-[10px] font-bold text-indigo-400 hover:text-white uppercase tracking-wider transition-colors bg-indigo-500/10 hover:bg-indigo-500/20 px-2 py-1 rounded"
                            >
                                {selectedPlayerIds.size === activeTeam.roster.length ? '전체 해제' : '전체 선택'}
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                            {activeTeam.roster
                                .sort((a, b) => b.ovr - a.ovr)
                                .map(player => {
                                    const isSelected = selectedPlayerIds.has(player.id);
                                    
                                    // Count shots for this player
                                    const playerShots = shotEvents.filter(s => s.teamId === activeTeam.id && s.playerId === player.id);
                                    const made = playerShots.filter(s => s.isMake).length;
                                    const total = playerShots.length;
                                    
                                    if (total === 0) return null; // Hide players with 0 shots

                                    return (
                                        <button
                                            key={player.id}
                                            onClick={() => togglePlayer(player.id)}
                                            className={`w-full flex items-center justify-between p-3 rounded-xl transition-all border ${isSelected ? 'bg-slate-800/80 border-slate-700' : 'hover:bg-slate-900 border-transparent hover:border-slate-800 text-slate-500'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${isSelected ? 'bg-indigo-600 border-indigo-500' : 'bg-transparent border-slate-600'}`}>
                                                    {isSelected && <Check size={12} className="text-white" />}
                                                </div>
                                                <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-500'}`}>{player.name}</span>
                                            </div>
                                            <span className="text-[10px] font-mono text-slate-400">{made}/{total}</span>
                                        </button>
                                    );
                                })
                            }
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Helper component for Legend
const XIcon = ({ size = 12, className = "", strokeWidth = 2 }: { size?: number, className?: string, strokeWidth?: number }) => (
    <svg 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth={strokeWidth} 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className={className}
    >
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
    </svg>
);
