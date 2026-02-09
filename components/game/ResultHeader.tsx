
import React, { useMemo } from 'react';
import { Team, PbpLog } from '../../types';
import { TEAM_DATA } from '../../data/teamData';

interface ResultHeaderProps {
    homeTeam: Team;
    awayTeam: Team;
    homeScore: number;
    awayScore: number;
    isWin: boolean;
    pbpLogs?: PbpLog[];
}

export const ResultHeader: React.FC<ResultHeaderProps> = ({ 
    homeTeam, awayTeam, homeScore, awayScore, isWin, pbpLogs 
}) => {
    
    // Calculate Quarter Scores from PbpLogs
    const quarterScores = useMemo(() => {
        const scores = {
            home: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 },
            away: { 1: 0, 2: 0, 3: 0, 4: 0, total: 0 }
        };

        if (!pbpLogs) return scores;

        pbpLogs.forEach(log => {
            if (log.type === 'score' || log.type === 'freethrow') {
                let points = 2;
                if (log.text.includes('3점')) points = 3;
                else if (log.type === 'freethrow') {
                    if (log.text.includes('앤드원')) points = 1;
                    else points = 1;
                }
                
                // Handle And-1 logic if text implies it (simplified)
                if (log.text.includes('앤드원')) points = 1; // Usually logged separately

                const q = Math.min(4, log.quarter) as 1|2|3|4;
                const isHome = log.teamId === homeTeam.id;

                if (isHome) {
                    scores.home[q] += points;
                    scores.home.total += points;
                } else {
                    scores.away[q] += points;
                    scores.away.total += points;
                }
            }
        });
        
        // Sync total with actual final score (in case of parsing diffs)
        // We distribute the difference to Q4 to ensure totals match visual
        const homeDiff = homeScore - scores.home.total;
        const awayDiff = awayScore - scores.away.total;
        scores.home[4] += homeDiff;
        scores.away[4] += awayDiff;

        return scores;
    }, [pbpLogs, homeTeam.id, homeScore, awayScore]);
    
    const homeColor = TEAM_DATA[homeTeam.id]?.colors.primary || '#ffffff';
    const awayColor = TEAM_DATA[awayTeam.id]?.colors.primary || '#ffffff';

    return (
        <div className="bg-slate-950 border-b border-slate-800 flex flex-col items-center justify-center relative overflow-hidden shadow-2xl z-20">
            {/* Dynamic Background Gradient using Team Colors + Win/Loss Tint */}
            <div className="absolute inset-0 pointer-events-none opacity-20" style={{
                background: isWin 
                    ? `linear-gradient(to right, ${awayColor}00, ${homeColor}66)` // Fade to Home Color
                    : `linear-gradient(to right, ${awayColor}66, ${homeColor}00)` // Fade to Away Color
            }}></div>
            
            {/* Win/Loss Status Overlay */}
             <div className={`absolute inset-0 opacity-10 pointer-events-none bg-gradient-to-b ${isWin ? 'from-emerald-900 to-slate-900' : 'from-red-900 to-slate-900'}`}></div>
            
            <div className="relative z-10 flex flex-col w-full max-w-7xl px-6 py-6">
                
                {/* Main Matchup Row */}
                <div className="flex items-center justify-between w-full gap-4 md:gap-12">
                    
                    {/* Away Team (Left) */}
                    <div className="flex items-center gap-4 flex-1 justify-end group">
                        <div className="text-right">
                            <div 
                                className="text-xl md:text-3xl font-black text-slate-300 oswald uppercase tracking-tight leading-none group-hover:brightness-125 transition-all"
                                style={{ color: awayColor !== '#000000' ? awayColor : '#ffffff' }}
                            >
                                {awayTeam.name}
                            </div>
                            <div className={`text-4xl md:text-5xl font-black oswald mt-1 leading-none ${awayScore > homeScore ? 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'text-slate-500'}`}>{Math.round(awayScore)}</div>
                        </div>
                        <img src={awayTeam.logo} className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-2xl group-hover:scale-105 transition-transform" alt={awayTeam.name} />
                    </div>

                    {/* Center Info */}
                    <div className="flex flex-col items-center justify-center min-w-[140px]">
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">FINAL SCORE</div>
                        {isWin ? (
                            <div className="px-5 py-1 bg-emerald-600 text-white rounded-full font-black uppercase text-xs tracking-widest shadow-[0_0_15px_rgba(16,185,129,0.4)] mb-3">Victory</div>
                        ) : (
                            <div className="px-5 py-1 bg-red-600 text-white rounded-full font-black uppercase text-xs tracking-widest shadow-[0_0_15px_rgba(239,68,68,0.4)] mb-3">Defeat</div>
                        )}
                        
                        {/* Quarter Score Table */}
                        <div className="bg-slate-900/80 border border-slate-700/50 rounded-lg overflow-hidden backdrop-blur-sm shadow-lg">
                            <table className="text-[10px] md:text-xs font-mono tabular-nums">
                                <thead>
                                    <tr className="bg-slate-800/50 text-slate-400">
                                        <th className="px-2 py-1 border-r border-slate-700/50 w-8"></th>
                                        <th className="px-2 py-1 text-center border-r border-slate-700/50">1</th>
                                        <th className="px-2 py-1 text-center border-r border-slate-700/50">2</th>
                                        <th className="px-2 py-1 text-center border-r border-slate-700/50">3</th>
                                        <th className="px-2 py-1 text-center">4</th>
                                    </tr>
                                </thead>
                                <tbody className="text-slate-300">
                                    <tr className="border-b border-slate-700/30">
                                        <td className="px-2 py-1 font-bold text-slate-500 border-r border-slate-700/50 text-center">{awayTeam.id.toUpperCase()}</td>
                                        <td className="px-2 py-1 text-center border-r border-slate-700/50">{quarterScores.away[1]}</td>
                                        <td className="px-2 py-1 text-center border-r border-slate-700/50">{quarterScores.away[2]}</td>
                                        <td className="px-2 py-1 text-center border-r border-slate-700/50">{quarterScores.away[3]}</td>
                                        <td className="px-2 py-1 text-center">{quarterScores.away[4]}</td>
                                    </tr>
                                    <tr>
                                        <td className="px-2 py-1 font-bold text-slate-500 border-r border-slate-700/50 text-center">{homeTeam.id.toUpperCase()}</td>
                                        <td className="px-2 py-1 text-center border-r border-slate-700/50">{quarterScores.home[1]}</td>
                                        <td className="px-2 py-1 text-center border-r border-slate-700/50">{quarterScores.home[2]}</td>
                                        <td className="px-2 py-1 text-center border-r border-slate-700/50">{quarterScores.home[3]}</td>
                                        <td className="px-2 py-1 text-center">{quarterScores.home[4]}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Home Team (Right) */}
                    <div className="flex items-center gap-4 flex-1 justify-start group">
                        <img src={homeTeam.logo} className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-2xl group-hover:scale-105 transition-transform" alt={homeTeam.name} />
                        <div className="text-left">
                            <div 
                                className="text-xl md:text-3xl font-black text-slate-300 oswald uppercase tracking-tight leading-none group-hover:brightness-125 transition-all"
                                style={{ color: homeColor !== '#000000' ? homeColor : '#ffffff' }}
                            >
                                {homeTeam.name}
                            </div>
                            <div className={`text-4xl md:text-5xl font-black oswald mt-1 leading-none ${homeScore > awayScore ? 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'text-slate-600'}`}>{Math.round(homeScore)}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
