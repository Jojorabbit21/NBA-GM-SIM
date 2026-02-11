
import React, { useState, useMemo } from 'react';
import { Team, ShotEvent } from '../../../types';
import { TEAM_DATA } from '../../../data/teamData';
import { X, Check } from 'lucide-react';
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
    
    // Filter and Transform Shots to Half Court (Left Hoop Perspective)
    const displayShots = useMemo(() => {
        return shotEvents
            .filter(shot => shot.teamId === selectedTeamId)
            .map(shot => {
                // Normalize to Left Half Court (0-47ft)
                // If shot is on Right side (> 47ft), mirror it.
                // Standard Mirror: x' = WIDTH - x, y' = HEIGHT - y
                // This preserves "Left/Right" relative to the hoop perspective.
                
                let x = shot.x;
                let y = shot.y;

                if (x > COURT_WIDTH / 2) {
                    x = COURT_WIDTH - x;
                    y = COURT_HEIGHT - y;
                }

                return { ...shot, x, y };
            });
    }, [shotEvents, selectedTeamId]);

    // Calculate Efficiency Stats
    const stats = useMemo(() => {
        const total = displayShots.length;
        const made = displayShots.filter(s => s.isMake).length;
        const pts = displayShots.reduce((acc, s) => acc + (s.isMake ? (s.zone === '3PT' ? 3 : 2) : 0), 0);
        
        const threeA = displayShots.filter(s => s.zone === '3PT').length;
        const threeM = displayShots.filter(s => s.zone === '3PT' && s.isMake).length;
        
        const paintA = displayShots.filter(s => s.zone === 'Rim' || s.zone === 'Paint').length;
        const paintM = displayShots.filter(s => (s.zone === 'Rim' || s.zone === 'Paint') && s.isMake).length;
        
        const midA = displayShots.filter(s => s.zone === 'Mid').length;
        const midM = displayShots.filter(s => s.zone === 'Mid' && s.isMake).length;

        return {
            fg: total > 0 ? Math.round((made / total) * 100) : 0,
            fgm: made, fga: total,
            p3: threeA > 0 ? Math.round((threeM / threeA) * 100) : 0,
            p3m: threeM, p3a: threeA,
            paint: paintA > 0 ? Math.round((paintM / paintA) * 100) : 0,
            mid: midA > 0 ? Math.round((midM / midA) * 100) : 0,
            pts
        };
    }, [displayShots]);

    const activeTeam = selectedTeamId === homeTeam.id ? homeTeam : awayTeam;
    const teamColor = TEAM_DATA[activeTeam.id]?.colors.primary || '#6366f1';

    return (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
            
            {/* Control Bar */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-900/50 p-2 rounded-2xl border border-slate-800">
                <div className="flex p-1 bg-slate-950 rounded-xl border border-slate-800">
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

                <div className="flex gap-6 px-4">
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">FG%</span>
                        <span className="text-xl font-black text-white font-mono">{stats.fg}%</span>
                        <span className="text-[10px] text-slate-400">{stats.fgm}/{stats.fga}</span>
                    </div>
                    <div className="w-px h-8 bg-slate-800 self-center"></div>
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">3PT%</span>
                        <span className="text-xl font-black text-white font-mono">{stats.p3}%</span>
                        <span className="text-[10px] text-slate-400">{stats.p3m}/{stats.p3a}</span>
                    </div>
                    <div className="w-px h-8 bg-slate-800 self-center"></div>
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">PAINT</span>
                        <span className="text-xl font-black text-white font-mono">{stats.paint}%</span>
                    </div>
                </div>
            </div>

            {/* Half Court Visualization */}
            <div className="relative w-full max-w-3xl mx-auto aspect-[50/47] bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
                 <svg viewBox={`0 0 ${COURT_WIDTH/2} ${COURT_HEIGHT}`} className="w-full h-full">
                    {/* Court Background */}
                    <rect x="0" y="0" width={COURT_WIDTH/2} height={COURT_HEIGHT} fill="#0f172a" />
                    
                    {/* Markings */}
                    <g fill="none" stroke="#334155" strokeWidth="0.5">
                        {/* Key (19x16) */}
                        <rect x="0" y={(COURT_HEIGHT-16)/2} width="19" height="16" />
                        
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
                    {displayShots.map((shot) => (
                        <g key={shot.id} className="animate-in fade-in zoom-in duration-300">
                             {shot.isMake ? (
                                <circle 
                                    cx={shot.x} 
                                    cy={shot.y} 
                                    r={0.8} 
                                    fill={teamColor} 
                                    stroke="white" 
                                    strokeWidth="0.1" 
                                    opacity="0.9"
                                />
                            ) : (
                                <g transform={`translate(${shot.x}, ${shot.y})`} opacity="0.4">
                                    <line x1="-0.6" y1="-0.6" x2="0.6" y2="0.6" stroke={teamColor} strokeWidth="0.2" />
                                    <line x1="-0.6" y1="0.6" x2="0.6" y2="-0.6" stroke={teamColor} strokeWidth="0.2" />
                                </g>
                            )}
                        </g>
                    ))}
                 </svg>

                 {/* Legend */}
                 <div className="absolute bottom-4 right-4 bg-slate-900/90 p-3 rounded-xl border border-slate-700/50 backdrop-blur flex gap-4 shadow-lg">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full border border-white" style={{ backgroundColor: teamColor }}></div>
                        <span className="text-[10px] font-bold text-slate-300 uppercase">Make</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <X size={10} style={{ color: teamColor }} />
                        <span className="text-[10px] font-bold text-slate-300 uppercase">Miss</span>
                    </div>
                 </div>
            </div>

        </div>
    );
};
