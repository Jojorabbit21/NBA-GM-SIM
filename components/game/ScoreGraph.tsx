
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
}

// Function to generate a smooth Bezier curve path from points
const getSmoothPath = (points: {x: number, y: number}[]) => {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x},${points[0].y}`;

    let d = `M ${points[0].x},${points[0].y}`;
    
    // Smoothing factor (0.2 is essentially a 20% smoothing, similar to a radius)
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
    history, progress, homeColor, awayColor, homeLogo, awayLogo, homeTeamCode, awayTeamCode 
}) => {
    const VIEW_WIDTH = 100;
    const VIEW_HEIGHT = 60;
    const MID_Y = 30; // 50% line (Center - Tie Game)

    const dataIndex = Math.floor((progress / 100) * (history.length - 1));
    const dataSlice = history.slice(0, dataIndex + 1);

    // Prepare points for smooth path generation
    const points = dataSlice.map((data, i) => ({
        x: (i / (history.length - 1)) * VIEW_WIDTH,
        // Y Calculation:
        // WP 50 -> 30 (Mid)
        // WP 100 -> 60 (Bottom - Home Wins)
        // WP 0 -> 0 (Top - Away Wins)
        y: (data.wp / 100) * VIEW_HEIGHT
    }));

    if (points.length === 0) return null;

    const pathData = getSmoothPath(points);

    const currentData = dataSlice[dataSlice.length - 1] || { wp: 50 };
    const currentWP = currentData.wp;
    const startX = points[0].x;
    const startY = points[0].y;
    const endX = points[points.length - 1].x;
    const endY = points[points.length - 1].y;

    // Fix: Extract curve commands safely without malformed 'L C' syntax
    // If path contains Curves ('C'), extract from the first 'C'. Otherwise it's just M x,y (single point)
    let curveCommands = "";
    const firstCIndex = pathData.indexOf('C');
    if (firstCIndex !== -1) {
        curveCommands = pathData.substring(firstCIndex);
    }

    // Create the closed path for filling
    // 1. Move to Start Baseline (0, 30)
    // 2. Line to First Data Point
    // 3. Curve through Data Points
    // 4. Line to End Data Point (redundant if curve includes it, but safe)
    // 5. Line to End Baseline (endX, 30)
    // 6. Close (Z)
    const fillPath = `M 0,${MID_Y} L ${startX},${startY} ${curveCommands} L ${endX},${MID_Y} Z`;

    const homeProb = currentWP.toFixed(0);
    const awayProb = (100 - currentWP).toFixed(0);

    return (
        <div className="w-full relative flex flex-col mt-6 mb-2">
            {/* Header: Logos & Percentages */}
            <div className="flex justify-between items-end px-1 mb-2">
                {/* Left Side: Away Team (Top of Graph) */}
                <div className="flex items-center gap-2">
                    <img src={awayLogo} className="w-8 h-8 object-contain" alt="Away" />
                    <div>
                        <div className="text-2xl font-black oswald leading-none text-white">{awayProb}%</div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{awayTeamCode}</div>
                    </div>
                </div>

                {/* Right Side: Home Team (Bottom of Graph) */}
                <div className="flex items-center gap-2 text-right">
                    <div>
                        <div className="text-2xl font-black oswald leading-none text-white">{homeProb}%</div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{homeTeamCode}</div>
                    </div>
                    <img src={homeLogo} className="w-8 h-8 object-contain" alt="Home" />
                </div>
            </div>

            {/* Graph Container */}
            <div className="w-full h-40 bg-slate-900 border border-slate-800 rounded-2xl relative overflow-hidden shadow-inner">
                <svg 
                    viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} 
                    className="w-full h-full"
                    preserveAspectRatio="none"
                >
                    <defs>
                        {/* 
                            Gradient Logic:
                            - Y=0 (Top): Away Win Territory -> Away Color
                            - Y=30 (Mid): Tie Game -> Transparent
                            - Y=60 (Bottom): Home Win Territory -> Home Color
                        */}
                        <linearGradient id="wpGradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={VIEW_HEIGHT}>
                            {/* Away Territory (Top half) */}
                            <stop offset="0" stopColor={awayColor} stopOpacity="0.5" />
                            <stop offset="0.4" stopColor={awayColor} stopOpacity="0.15" />
                            <stop offset="0.5" stopColor={awayColor} stopOpacity="0" />
                            
                            {/* Home Territory (Bottom half) */}
                            <stop offset="0.5" stopColor={homeColor} stopOpacity="0" />
                            <stop offset="0.6" stopColor={homeColor} stopOpacity="0.15" />
                            <stop offset="1" stopColor={homeColor} stopOpacity="0.5" />
                        </linearGradient>
                    </defs>

                    {/* Background & Quarters Separators */}
                    <rect width="100%" height="100%" fill="#0f172a" opacity="0.8" />
                    
                    {/* Quarter Lines */}
                    <line x1="25" y1="0" x2="25" y2={VIEW_HEIGHT} stroke="#1e293b" strokeWidth="0.3" strokeDasharray="2 2" />
                    <line x1="50" y1="0" x2="50" y2={VIEW_HEIGHT} stroke="#334155" strokeWidth="0.5" /> {/* Halftime */}
                    <line x1="75" y1="0" x2="75" y2={VIEW_HEIGHT} stroke="#1e293b" strokeWidth="0.3" strokeDasharray="2 2" />

                    {/* 50% Baseline (The Tie Line) */}
                    <line x1="0" y1={MID_Y} x2="100" y2={MID_Y} stroke="#475569" strokeWidth="0.4" strokeDasharray="3 3" />

                    {/* The Fill Area */}
                    <path 
                        d={fillPath} 
                        fill="url(#wpGradient)" 
                        stroke="none"
                        className="transition-all duration-300"
                    />

                    {/* The Curve Line (Smoothed) */}
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

                    {/* End Dot */}
                    {points.length > 0 && (
                        <circle cx={endX} cy={endY} r="1.2" fill="white" className="animate-pulse shadow-lg" />
                    )}
                </svg>
            </div>

            {/* X-Axis Labels (Q1 ~ Q4) */}
            <div className="flex px-1 mt-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-wider relative h-4">
                <span className="absolute left-[12.5%] -translate-x-1/2">1Q</span>
                <span className="absolute left-[37.5%] -translate-x-1/2">2Q</span>
                <span className="absolute left-[62.5%] -translate-x-1/2">3Q</span>
                <span className="absolute left-[87.5%] -translate-x-1/2">4Q</span>
            </div>
        </div>
    );
};
