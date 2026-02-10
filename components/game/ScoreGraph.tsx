
import React from 'react';

interface ScoreGraphProps {
    history: { h: number, a: number, wp: number }[];
    progress: number;
    homeColor: string;
    awayColor: string;
    homeLogo: string;
    awayLogo: string;
    homeTeamCode: string;
    awayTeamCode: string;
    quarter?: number; // [New]
    timeRemaining?: string; // [New]
}

// Function to generate a smooth Bezier curve path from points
const getSmoothPath = (points: {x: number, y: number}[]) => {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x},${points[0].y}`;

    let d = `M ${points[0].x},${points[0].y}`;
    
    // Smoothing factor
    const smoothing = 0.2;

    const line = (p0: any, p1: any) => {
        const lengthX = p1.x - p0.x;
        const lengthY = p1.y - p0.y;
        return {
            length: Math.sqrt(Math.pow(lengthX, 2) + Math.pow(lengthY, 2)),
            angle: Math.atan2(lengthY, lengthX)
        };
    };

    const controlPoint = (current: any, previous: any, next: any, reverse: boolean) => {
        const p = previous || current;
        const n = next || current;
        const o = line(p, n);
        const angle = o.angle + (reverse ? Math.PI : 0);
        const length = o.length * smoothing;
        const x = current.x + Math.cos(angle) * length;
        const y = current.y + Math.sin(angle) * length;
        return { x, y };
    };

    for (let i = 0; i < points.length - 1; i++) {
        const cp1 = controlPoint(points[i], points[i - 1], points[i + 1], false);
        const cp2 = controlPoint(points[i + 1], points[i], points[i + 2], true);
        d += ` C ${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${points[i + 1].x},${points[i + 1].y}`;
    }

    return d;
};

export const ScoreGraph: React.FC<ScoreGraphProps> = ({ 
    history, progress, homeColor, awayColor, homeLogo, awayLogo, homeTeamCode, awayTeamCode,
    quarter, timeRemaining
}) => {
    const VIEW_WIDTH = 100;
    const VIEW_HEIGHT = 60;
    const MID_Y = 30; // 50% line (Center - Tie Game)
    const TOTAL_MINUTES = 48; // Fixed X-Axis Domain

    // Prepare points with FIXED X-axis scaling (0 to 48 minutes)
    // History contains 1-minute snapshots. i=0 is 0min, i=48 is 48min.
    const points = history.map((data, i) => ({
        x: (i / TOTAL_MINUTES) * VIEW_WIDTH,
        // Y Calculation:
        // WP 50 -> 30 (Mid)
        // WP 100 -> 60 (Bottom - Home Wins)
        // WP 0 -> 0 (Top - Away Wins)
        y: (data.wp / 100) * VIEW_HEIGHT
    }));

    if (points.length === 0) return null;

    const pathData = getSmoothPath(points);

    const currentData = history[history.length - 1] || { wp: 50 };
    const currentWP = currentData.wp;
    const startX = points[0].x;
    const startY = points[0].y;
    const endX = points[points.length - 1].x;
    const endY = points[points.length - 1].y;

    let curveCommands = "";
    const firstCIndex = pathData.indexOf('C');
    if (firstCIndex !== -1) {
        curveCommands = pathData.substring(firstCIndex);
    }

    // Fill area under curve
    // Start at Mid-Left (0,30) -> Go to first point -> Curve -> Go to last point -> Go to Mid-Right (endX, 30) -> Close
    const fillPath = `M 0,${MID_Y} L ${startX},${startY} ${curveCommands} L ${endX},${MID_Y} Z`;

    const homeProb = currentWP.toFixed(0);
    const awayProb = (100 - currentWP).toFixed(0);

    // Head Dot Position
    const headLeft = `${endX}%`;
    const headTop = `${(endY / VIEW_HEIGHT) * 100}%`;

    return (
        <div className="w-full relative flex flex-col mt-10 mb-2">
            {/* Header: Logos & Percentages & GAME CLOCK */}
            <div className="flex justify-between items-end px-1 mb-2 relative h-24">
                {/* Left Side: Away Team (Top of Graph) */}
                <div className="flex items-center gap-2 mb-2">
                    <img src={awayLogo} className="w-8 h-8 object-contain" alt="Away" />
                    <div>
                        <div className="text-2xl font-black oswald leading-none text-white">{awayProb}%</div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{awayTeamCode}</div>
                    </div>
                </div>

                {/* Center: Game Clock (Digital LED Style) */}
                {quarter && timeRemaining && (
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-0 flex flex-col items-center">
                        <div className="bg-black border-4 border-slate-800 rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.6)] flex items-stretch overflow-hidden relative">
                             {/* Gloss effect */}
                             <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none z-20"></div>
                             
                             {/* Quarter Section */}
                             <div className="flex flex-col items-center justify-center px-4 py-2 bg-black border-r-2 border-slate-800/50 min-w-[60px]">
                                 <span className="text-3xl font-digital led-amber leading-none transform translate-y-[2px]">{quarter}Q</span>
                             </div>

                             {/* Time Section - Fixed Width for Stability */}
                             <div className="flex flex-col items-center justify-center px-2 py-2 bg-black w-[140px]">
                                 <span className="text-5xl font-digital led-red leading-none tracking-wider tabular-nums transform translate-y-[3px]">
                                     {timeRemaining}
                                 </span>
                             </div>
                        </div>
                    </div>
                )}

                {/* Right Side: Home Team (Bottom of Graph) */}
                <div className="flex items-center gap-2 text-right mb-2">
                    <div>
                        <div className="text-2xl font-black oswald leading-none text-white">{homeProb}%</div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{homeTeamCode}</div>
                    </div>
                    <img src={homeLogo} className="w-8 h-8 object-contain" alt="Home" />
                </div>
            </div>

            {/* Graph Container */}
            <div className="w-full h-40 bg-slate-900 border border-slate-800 rounded-2xl relative overflow-hidden shadow-inner group">
                <svg 
                    viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} 
                    className="w-full h-full"
                    preserveAspectRatio="none"
                >
                    <defs>
                        <linearGradient id="wpGradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={VIEW_HEIGHT}>
                            <stop offset="0" stopColor={awayColor} stopOpacity="0.5" />
                            <stop offset="0.5" stopColor={awayColor} stopOpacity="0" />
                            <stop offset="0.5" stopColor={homeColor} stopOpacity="0" />
                            <stop offset="1" stopColor={homeColor} stopOpacity="0.5" />
                        </linearGradient>
                    </defs>

                    <rect width="100%" height="100%" fill="#0f172a" opacity="0.8" />
                    
                    {/* Grid Lines - Fixed at 12min (25%), 24min (50%), 36min (75%) */}
                    <line x1="25" y1="0" x2="25" y2={VIEW_HEIGHT} stroke="#1e293b" strokeWidth="0.3" strokeDasharray="2 2" />
                    <line x1="50" y1="0" x2="50" y2={VIEW_HEIGHT} stroke="#334155" strokeWidth="0.5" />
                    <line x1="75" y1="0" x2="75" y2={VIEW_HEIGHT} stroke="#1e293b" strokeWidth="0.3" strokeDasharray="2 2" />

                    <line x1="0" y1={MID_Y} x2="100" y2={MID_Y} stroke="#475569" strokeWidth="0.4" strokeDasharray="3 3" />

                    <path 
                        d={fillPath} 
                        fill="url(#wpGradient)" 
                        stroke="none"
                        className="transition-all duration-300"
                    />

                    <path 
                        d={pathData} 
                        fill="none" 
                        stroke="#e2e8f0" 
                        strokeWidth="0.8" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                        className="drop-shadow-md"
                    />
                </svg>

                {points.length > 0 && (
                    <div 
                        className="absolute w-2 h-2 bg-white rounded-full shadow-[0_0_10px_white] z-20 transform -translate-x-1/2 -translate-y-1/2 transition-all duration-100 ease-linear"
                        style={{ left: headLeft, top: headTop }}
                    >
                        <div className="absolute inset-0 bg-white/50 rounded-full animate-ping"></div>
                    </div>
                )}
            </div>

            {/* X-Axis Labels */}
            <div className="flex px-1 mt-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-wider relative h-4">
                <span className="absolute left-[12.5%] -translate-x-1/2">1Q</span>
                <span className="absolute left-[37.5%] -translate-x-1/2">2Q</span>
                <span className="absolute left-[62.5%] -translate-x-1/2">3Q</span>
                <span className="absolute left-[87.5%] -translate-x-1/2">4Q</span>
            </div>
        </div>
    );
};
