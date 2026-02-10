
import React from 'react';
import { Team } from '../../types';
import { ScoreGraph } from '../game/ScoreGraph';
import { TEAM_DATA } from '../../data/teamData';

interface LiveScoreboardProps {
    homeTeam: Team;
    awayTeam: Team;
    displayScore: { h: number; a: number };
    currentMessage: string;
    messageClass: string;
    scoreTimeline: { h: number; a: number; wp: number }[];
    progress: number;
    quarter?: number;
    timeRemaining?: string;
    finalMessage?: string | null;
}

export const LiveScoreboard: React.FC<LiveScoreboardProps> = ({
    homeTeam, awayTeam, displayScore, currentMessage, messageClass, scoreTimeline, progress, quarter, timeRemaining, finalMessage
}) => {
    const homeData = TEAM_DATA[homeTeam.id];
    const awayData = TEAM_DATA[awayTeam.id];
    const homeColor = homeData ? homeData.colors.primary : '#ffffff';
    const awayColor = awayData ? awayData.colors.primary : '#94a3b8';

    return (
        <div className="flex items-center justify-between px-6 py-6 md:px-10 bg-slate-950/30">
            {/* CSS Animation Styles - Updated for Readability */}
            <style>{`
                @keyframes shake-gentle {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-2px); }
                }
                @keyframes shake-intense {
                    0% { transform: translate(0, 0); }
                    25% { transform: translate(-1px, 1px); }
                    50% { transform: translate(1px, -1px); }
                    75% { transform: translate(-1px, -1px); }
                    100% { transform: translate(0, 0); }
                }
                @keyframes flash-text {
                    0%, 100% { color: #ef4444; text-shadow: 0 0 10px rgba(239, 68, 68, 0.6); }
                    50% { color: #ffffff; text-shadow: 0 0 20px rgba(255, 255, 255, 0.9); }
                }
                @keyframes pulse-scale {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
                
                /* Class Mappings */
                .animate-shake-gentle {
                    animation: shake-gentle 2.0s ease-in-out infinite;
                }
                .animate-shake-intense {
                    animation: shake-intense 0.4s linear infinite;
                }
                .animate-buzzer-beater {
                    animation: pulse-scale 0.8s ease-in-out infinite, flash-text 0.8s ease-in-out infinite;
                }
            `}</style>

            {/* Left: Away Team */}
            <div className="flex flex-col items-center gap-3 w-32 md:w-40">
                <img src={awayTeam.logo} className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-2xl animate-in zoom-in duration-500" alt="" />
                <div className="text-center w-full">
                    <div className="text-lg md:text-xl font-black text-white oswald uppercase tracking-tight text-shadow-lg truncate w-full">{awayTeam.name}</div>
                    <div className="text-4xl md:text-5xl font-black text-slate-200 oswald tabular-nums mt-1 drop-shadow-xl">{displayScore.a}</div>
                </div>
            </div>

            {/* Center: Graph & Message */}
            <div className="flex-1 px-2 flex flex-col items-center justify-center">
                 {/* Message Box */}
                 <div className={`text-sm md:text-lg font-black text-center min-h-[4rem] flex items-center justify-center break-keep leading-tight transition-all duration-300 ${finalMessage ? 'scale-110 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]' : messageClass}`}>
                    {finalMessage || currentMessage}
                 </div>

                 {/* Score Graph Component */}
                 <ScoreGraph 
                    history={scoreTimeline} 
                    progress={progress} 
                    homeColor={homeColor} 
                    awayColor={awayColor} 
                    homeLogo={homeTeam.logo}
                    awayLogo={awayTeam.logo}
                    homeTeamCode={homeTeam.id.toUpperCase()}
                    awayTeamCode={awayTeam.id.toUpperCase()}
                    quarter={quarter}
                    timeRemaining={timeRemaining}
                 />
            </div>

            {/* Right: Home Team */}
            <div className="flex flex-col items-center gap-3 w-32 md:w-40">
                <img src={homeTeam.logo} className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-2xl animate-in zoom-in duration-500" alt="" />
                <div className="text-center w-full">
                    <div className="text-lg md:text-xl font-black text-white oswald uppercase tracking-tight text-shadow-lg truncate w-full">{homeTeam.name}</div>
                    <div className="text-4xl md:text-5xl font-black text-slate-200 oswald tabular-nums mt-1 drop-shadow-xl">{displayScore.h}</div>
                </div>
            </div>
        </div>
    );
};
