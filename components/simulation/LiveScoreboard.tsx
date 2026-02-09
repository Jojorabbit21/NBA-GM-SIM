
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
}

export const LiveScoreboard: React.FC<LiveScoreboardProps> = ({
    homeTeam, awayTeam, displayScore, currentMessage, messageClass, scoreTimeline, progress
}) => {
    const homeData = TEAM_DATA[homeTeam.id];
    const awayData = TEAM_DATA[awayTeam.id];
    const homeColor = homeData ? homeData.colors.primary : '#ffffff';
    const awayColor = awayData ? awayData.colors.primary : '#94a3b8';

    return (
        <div className="flex items-center justify-between px-6 py-6 md:px-10 bg-slate-950/30">
            {/* CSS Animation Styles */}
            <style>{`
                @keyframes shake-intense {
                    0% { transform: translate(1px, 1px) rotate(0deg); }
                    10% { transform: translate(-1px, -2px) rotate(-1deg); }
                    20% { transform: translate(-3px, 0px) rotate(1deg); }
                    30% { transform: translate(3px, 2px) rotate(0deg); }
                    40% { transform: translate(1px, -1px) rotate(1deg); }
                    50% { transform: translate(-1px, 2px) rotate(-1deg); }
                    60% { transform: translate(-3px, 1px) rotate(0deg); }
                    70% { transform: translate(3px, 1px) rotate(-1deg); }
                    80% { transform: translate(-1px, -1px) rotate(1deg); }
                    90% { transform: translate(1px, 2px) rotate(0deg); }
                    100% { transform: translate(1px, -2px) rotate(-1deg); }
                }
                .animate-shake-intense {
                    animation: shake-intense 0.5s infinite;
                }
                @keyframes pulse-fast {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.05); opacity: 0.8; }
                }
                .animate-pulse-fast {
                    animation: pulse-fast 1s infinite;
                }
                @keyframes flash-text {
                    0%, 100% { color: #ef4444; text-shadow: 0 0 10px #ef4444; }
                    50% { color: #ffffff; text-shadow: 0 0 20px #ffffff; }
                }
                .animate-buzzer-beater {
                    animation: shake-intense 0.5s infinite, flash-text 0.15s infinite;
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
                 <div className={`text-sm md:text-base font-black text-center min-h-[3rem] flex items-center justify-center break-keep leading-tight transition-all duration-300 ${messageClass}`}>
                    {currentMessage}
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
