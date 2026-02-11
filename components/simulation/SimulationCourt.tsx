
import React from 'react';
import { X } from 'lucide-react';
import { ShotEvent } from '../../types';
import { COURT_WIDTH, COURT_HEIGHT } from '../../utils/courtCoordinates';

interface SimulationCourtProps {
    shots: ShotEvent[];
    homeTeamId: string;
    awayTeamId: string;
    homeColor: string;
    awayColor: string;
}

export const SimulationCourt: React.FC<SimulationCourtProps> = ({ 
    shots, homeTeamId, awayTeamId, homeColor, awayColor 
}) => {
    
    // NBA Court Dimensions (Feet) - Mapped 1:1 to SVG ViewBox
    // Court: 94 x 50
    // Rim Centers: (5.25, 25) and (88.75, 25)
    // Key: 19ft length, 16ft width
    // 3PT: 22ft corner dist, 23.75ft arc radius

    return (
        <div className="relative w-full aspect-[94/50] bg-slate-950 border-t border-slate-800">
            <svg viewBox={`0 0 ${COURT_WIDTH} ${COURT_HEIGHT}`} className="absolute inset-0 w-full h-full">
                {/* Court Floor */}
                <rect width={COURT_WIDTH} height={COURT_HEIGHT} fill="#0f172a" />
                
                <g fill="none" stroke="#334155" strokeWidth="0.5">
                    {/* Main Border */}
                    <rect x="0" y="0" width={COURT_WIDTH} height={COURT_HEIGHT} strokeWidth="1" />
                    
                    {/* Half Court Line */}
                    <line x1={COURT_WIDTH/2} y1="0" x2={COURT_WIDTH/2} y2={COURT_HEIGHT} />
                    
                    {/* Center Circle */}
                    <circle cx={COURT_WIDTH/2} cy={COURT_HEIGHT/2} r="2" />
                    <circle cx={COURT_WIDTH/2} cy={COURT_HEIGHT/2} r="6" />

                    {/* --- Left Side --- */}
                    {/* Key (16ft wide, 19ft long) - Border Removed per request */}
                    <rect x="0" y={(COURT_HEIGHT-16)/2} width="19" height="16" stroke="none" />
                    {/* Free Throw Circle (Top half) */}
                    <path d={`M 19,${17} A 6 6 0 0 1 19,${33}`} />
                    <path d={`M 19,${17} A 6 6 0 0 0 19,${33}`} strokeDasharray="1,1" />
                    
                    {/* 3-Point Line */}
                    {/* Corner Lines (0 to 14ft x, 3ft from sides) */}
                    <line x1="0" y1="3" x2="14" y2="3" />
                    <line x1="0" y1="47" x2="14" y2="47" />
                    {/* Arc (Radius 23.75 from Hoop Center 5.25, 25) */}
                    {/* M 14,3 A 23.75 23.75 0 0 1 14,47 */}
                    <path d="M 14,3 A 23.75 23.75 0 0 1 14,47" />

                    {/* Hoop & Backboard */}
                    <line x1="4" y1="22" x2="4" y2="28" stroke="white" strokeWidth="0.5" />
                    <circle cx="5.25" cy="25" r="0.75" stroke="white" />
                    
                    {/* Restricted Area (4ft radius from hoop center) */}
                    <path d="M 5.25,21 A 4 4 0 0 1 5.25,29" />


                    {/* --- Right Side (Mirror) --- */}
                    {/* Key - Border Removed per request */}
                    <rect x={COURT_WIDTH-19} y={(COURT_HEIGHT-16)/2} width="19" height="16" stroke="none" />
                    {/* Free Throw Circle */}
                    <path d={`M ${COURT_WIDTH-19},${17} A 6 6 0 0 0 ${COURT_WIDTH-19},${33}`} />
                    <path d={`M ${COURT_WIDTH-19},${17} A 6 6 0 0 1 ${COURT_WIDTH-19},${33}`} strokeDasharray="1,1" />

                    {/* 3-Point Line */}
                    <line x1={COURT_WIDTH} y1="3" x2={COURT_WIDTH-14} y2="3" />
                    <line x1={COURT_WIDTH} y1="47" x2={COURT_WIDTH-14} y2="47" />
                    <path d={`M ${COURT_WIDTH-14},3 A 23.75 23.75 0 0 0 ${COURT_WIDTH-14},47`} />

                    {/* Hoop & Backboard */}
                    <line x1={COURT_WIDTH-4} y1="22" x2={COURT_WIDTH-4} y2="28" stroke="white" strokeWidth="0.5" />
                    <circle cx={COURT_WIDTH-5.25} cy="25" r="0.75" stroke="white" />
                    
                    {/* Restricted Area */}
                    <path d={`M ${COURT_WIDTH-5.25},21 A 4 4 0 0 0 ${COURT_WIDTH-5.25},29`} />

                </g>

                {/* Shot Markers */}
                {shots.map((shot) => {
                    const isHome = shot.teamId === homeTeamId;
                    const color = isHome ? homeColor : awayColor;
                    
                    // Simple fade-in effect via key
                    return (
                        <g key={shot.id} className="animate-in fade-in zoom-in duration-300">
                            {shot.isMake ? (
                                <circle 
                                    cx={shot.x} 
                                    cy={shot.y} 
                                    r={0.55} // Reduced size
                                    fill={color} 
                                    stroke="white" 
                                    strokeWidth="0.1" 
                                    opacity="0.9"
                                />
                            ) : (
                                <g transform={`translate(${shot.x}, ${shot.y})`} opacity="1.0"> 
                                    <line x1="-0.4" y1="-0.4" x2="0.4" y2="0.4" stroke={color} strokeWidth="0.2" />
                                    <line x1="-0.4" y1="0.4" x2="0.4" y2="-0.4" stroke={color} strokeWidth="0.2" />
                                </g>
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};
