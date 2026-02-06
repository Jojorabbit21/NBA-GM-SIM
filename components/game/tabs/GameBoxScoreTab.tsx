
import React from 'react';
import { Activity } from 'lucide-react';
import { Team, PlayerBoxScore, Game } from '../../../types';
import { BoxScoreTable, GameStatLeaders } from '../BoxScoreTable';

interface GameBoxScoreTabProps {
    homeTeam: Team;
    awayTeam: Team;
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
    mvpId: string;
    leaders: GameStatLeaders;
    otherGames?: Game[];
    teams: Team[]; // For looking up other games' team logos
}

export const GameBoxScoreTab: React.FC<GameBoxScoreTabProps> = ({
    homeTeam, awayTeam, homeBox, awayBox, mvpId, leaders, otherGames, teams
}) => {
    
    const getTeamInfo = (id: string) => teams.find(t => t.id === id);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Away Team Box Score */}
            <BoxScoreTable 
                team={awayTeam} 
                box={awayBox} 
                isFirst 
                mvpId={mvpId} 
                leaders={leaders} 
            />
            
            {/* Home Team Box Score */}
            <BoxScoreTable 
                team={homeTeam} 
                box={homeBox} 
                mvpId={mvpId} 
                leaders={leaders} 
            />
            
            {/* Around the League */}
            {otherGames && otherGames.length > 0 && (
                <div className="mt-8 pt-8 border-t border-slate-800/50">
                    <h3 className="text-sm font-black uppercase text-slate-500 tracking-widest mb-4 flex items-center gap-2">
                        <Activity size={16} /> 타구장 경기 결과
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {otherGames.map(g => {
                            const h = getTeamInfo(g.homeTeamId);
                            const a = getTeamInfo(g.awayTeamId);
                            if (!h || !a) return null;
                            
                            const hScore = g.homeScore || 0;
                            const aScore = g.awayScore || 0;
                            const hWin = hScore > aScore;
                            
                            return (
                                <div key={g.id} className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <img src={a.logo} className="w-5 h-5 object-contain opacity-80" alt="" />
                                            <span className={`text-xs font-bold uppercase ${!hWin ? 'text-white' : 'text-slate-500'}`}>{a.name}</span>
                                        </div>
                                        <span className={`text-sm font-black oswald ${!hWin ? 'text-emerald-400' : 'text-slate-600'}`}>{aScore}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <img src={h.logo} className="w-5 h-5 object-contain opacity-80" alt="" />
                                            <span className={`text-xs font-bold uppercase ${hWin ? 'text-white' : 'text-slate-500'}`}>{h.name}</span>
                                        </div>
                                        <span className={`text-sm font-black oswald ${hWin ? 'text-emerald-400' : 'text-slate-600'}`}>{hScore}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
