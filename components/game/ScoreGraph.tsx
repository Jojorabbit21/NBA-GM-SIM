
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

export const ScoreGraph: React.FC<ScoreGraphProps> = ({ 
    history, progress, homeColor, awayColor, homeLogo, awayLogo, homeTeamCode, awayTeamCode 
}) => {
    const VIEW_WIDTH = 100;
    const VIEW_HEIGHT = 60;
    const MID_Y = 30; // 50% line (Center - Tie Game)

    const dataIndex = Math.floor((progress / 100) * (history.length - 1));
    const dataSlice = history.slice(0, dataIndex + 1);

    // Build points for the line
    let points = "";
    dataSlice.forEach((data, i) => {
        const x = (i / (history.length - 1)) * VIEW_WIDTH;
        
        // [Logic Change] 
        // Before: y = VIEW_HEIGHT - (wp / 100 * VIEW_HEIGHT) => 100% Home was Top (0)
        // Now: y = (wp / 100) * VIEW_HEIGHT => 100% Home is Bottom (60), 0% Home (100% Away) is Top (0)
        // This ensures the graph fills towards the bottom when Home is winning.
        const y = (data.wp / 100) * VIEW_HEIGHT;
        points += `${x},${y} `;
    });

    const currentData = dataSlice[dataSlice.length - 1] || { wp: 50 };
    const currentWP = currentData.wp;
    const endX = (dataIndex / (history.length - 1)) * VIEW_WIDTH;
    const endY = (currentWP / 100) * VIEW_HEIGHT;

    // Create the closed path for filling
    // Start at (0, MID_Y) -> Follow points -> (endX, MID_Y) -> Close
    const fillPath = `M 0,${MID_Y} L ${points} L ${endX},${MID_Y} Z`;

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
            <div className="w-full h-40 bg-slate-950 border border-slate-800 rounded-lg relative overflow-hidden">
                <svg 
                    viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} 
                    className="w-full h-full"
                    preserveAspectRatio="none"
                >
                    <defs>
                        {/* 
                            Gradient Logic:
                            Top half (0 - 50%): Away Color (Away Dominance)
                            Bottom half (50% - 100%): Home Color (Home Dominance)
                        */}
                        <linearGradient id="wpGradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={VIEW_HEIGHT}>
                            <stop offset="0" stopColor={awayColor} stopOpacity="0.4" />
                            <stop offset="0.5" stopColor={awayColor} stopOpacity="0.4" />
                            <stop offset="0.5" stopColor={homeColor} stopOpacity="0.4" />
                            <stop offset="1" stopColor={homeColor} stopOpacity="0.4" />
                        </linearGradient>
                    </defs>

                    {/* Background & Quarters Separators */}
                    <rect width="100%" height="100%" fill="#0f172a" opacity="0.5" />
                    
                    {/* Quarter Lines (Solid, as requested) */}
                    <line x1="25" y1="0" x2="25" y2={VIEW_HEIGHT} stroke="#1e293b" strokeWidth="0.3" />
                    <line x1="50" y1="0" x2="50" y2={VIEW_HEIGHT} stroke="#334155" strokeWidth="0.4" /> {/* Halftime - slightly thicker */}
                    <line x1="75" y1="0" x2="75" y2={VIEW_HEIGHT} stroke="#1e293b" strokeWidth="0.3" />

                    {/* 0 Baseline (The Tie Line) */}
                    <line x1="0" y1={MID_Y} x2="100" y2={MID_Y} stroke="#475569" strokeWidth="0.2" strokeDasharray="2 2" />

                    {/* The Fill Area */}
                    <path 
                        d={fillPath} 
                        fill="url(#wpGradient)" 
                        stroke="none"
                    />

                    {/* The Curve Line */}
                    <polyline 
                        points={points} 
                        fill="none" 
                        stroke="#e2e8f0" 
                        strokeWidth="0.8" 
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                    />

                    {/* End Dot */}
                    {dataSlice.length > 0 && (
                        <circle cx={endX} cy={endY} r="1" fill="white" className="animate-pulse" />
                    )}
                </svg>
            </div>

            {/* X-Axis Labels (Q1 ~ Q4) */}
            <div className="flex px-1 mt-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider relative h-4">
                <span className="absolute left-[12.5%] -translate-x-1/2">1Q</span>
                <span className="absolute left-[37.5%] -translate-x-1/2">2Q</span>
                <span className="absolute left-[62.5%] -translate-x-1/2">3Q</span>
                <span className="absolute left-[87.5%] -translate-x-1/2">4Q</span>
            </div>
        </div>
    );
};
