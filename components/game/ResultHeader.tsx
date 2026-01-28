
import React from 'react';
import { Newspaper } from 'lucide-react';
import { Team } from '../../types';

interface ResultHeaderProps {
    homeTeam: Team;
    awayTeam: Team;
    homeScore: number;
    awayScore: number;
    isWin: boolean;
    headline: string;
}

export const ResultHeader: React.FC<ResultHeaderProps> = ({ 
    homeTeam, awayTeam, homeScore, awayScore, isWin, headline 
}) => {
    return (
        <div className="bg-slate-900 border-b border-slate-800 pt-10 pb-8 px-8 flex flex-col items-center justify-center relative overflow-hidden shadow-2xl z-20">
            <div className={`absolute inset-0 opacity-20 pointer-events-none bg-gradient-to-b ${isWin ? 'from-emerald-900 to-slate-900' : 'from-red-900 to-slate-900'}`}></div>
            
            <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-5xl">
                {/* Scoreboard Row: Away (Left) vs Home (Right) */}
                <div className="flex items-center justify-between w-full">
                    <div className="flex flex-col items-center gap-4 flex-1">
                        <img src={awayTeam.logo} className="w-20 h-20 md:w-28 md:h-28 object-contain drop-shadow-2xl" alt={awayTeam.name} />
                        <div className="text-center">
                            <div className="text-2xl md:text-4xl font-black text-white oswald uppercase tracking-tight">{awayTeam.name}</div>
                            <div className={`text-5xl md:text-7xl font-black oswald mt-2 ${awayScore > homeScore ? 'text-white' : 'text-slate-600'}`}>{Math.round(awayScore)}</div>
                        </div>
                    </div>

                    <div className="flex flex-col items-center justify-center px-4 md:px-12">
                        <div className="text-xl md:text-2xl font-black text-slate-700 oswald tracking-widest mb-4">FINAL</div>
                        {isWin ? (
                            <div className="px-4 py-1.5 md:px-6 md:py-2 bg-emerald-600 text-white rounded-xl font-black uppercase text-xs md:text-sm tracking-widest shadow-[0_0_20px_rgba(16,185,129,0.4)]">Victory</div>
                        ) : (
                            <div className="px-4 py-1.5 md:px-6 md:py-2 bg-red-600 text-white rounded-xl font-black uppercase text-xs md:text-sm tracking-widest shadow-[0_0_20px_rgba(239,68,68,0.4)]">Defeat</div>
                        )}
                    </div>

                    <div className="flex flex-col items-center gap-4 flex-1">
                        <img src={homeTeam.logo} className="w-20 h-20 md:w-28 md:h-28 object-contain drop-shadow-2xl" alt={homeTeam.name} />
                        <div className="text-center">
                            <div className="text-2xl md:text-4xl font-black text-white oswald uppercase tracking-tight">{homeTeam.name}</div>
                            <div className={`text-5xl md:text-7xl font-black oswald mt-2 ${homeScore > awayScore ? 'text-white' : 'text-slate-600'}`}>{Math.round(homeScore)}</div>
                        </div>
                    </div>
                </div>

                {/* Headline in Header */}
                <div className="w-full bg-slate-950/50 border border-white/5 rounded-2xl p-4 text-center backdrop-blur-md">
                    <p className="text-sm md:text-base font-bold text-slate-200 leading-relaxed break-keep">
                        <Newspaper className="inline-block mr-2 text-indigo-400 mb-0.5" size={16} />
                        {headline}
                    </p>
                </div>
            </div>
        </div>
    );
};
