
import React from 'react';
import { Activity } from 'lucide-react';
import { Team, PlayerBoxScore, Game, TacticalSnapshot } from '../types';

// Components
import { ResultHeader } from '../components/game/ResultHeader';
import { TacticsAnalysis } from '../components/game/TacticsAnalysis';
import { BoxScoreTable, GameStatLeaders } from '../components/game/BoxScoreTable';
import { ResultFooter } from '../components/game/ResultFooter';

export const GameResultView: React.FC<{
  result: {
    home: Team;
    away: Team;
    homeScore: number;
    awayScore: number;
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
    recap: string[];
    otherGames: Game[];
    homeTactics?: TacticalSnapshot;
    awayTactics?: TacticalSnapshot;
    userTactics?: any;
    myTeamId: string;
  };
  myTeamId: string;
  teams: Team[];
  onFinish: () => void;
}> = ({ result, myTeamId, teams, onFinish }) => {
  const { home, away, homeScore, awayScore, homeBox, awayBox, recap, otherGames, homeTactics, awayTactics } = result;
  
  const isHome = myTeamId === home.id;
  const isWin = isHome ? homeScore > awayScore : awayScore > homeScore;
  
  const headline = recap && recap.length > 0 ? recap[0] : "경기 종료";

  const getTeamInfo = (id: string) => teams.find(t => t.id === id);

  // MVP Calculation
  const allPlayers = [...homeBox, ...awayBox];
  const mvp = allPlayers.reduce((prev, curr) => (curr.pts > prev.pts ? curr : prev), allPlayers[0]);

  // Leaders Calculation
  const leaders: GameStatLeaders = {
      pts: Math.max(...allPlayers.map(p => p.pts)),
      reb: Math.max(...allPlayers.map(p => p.reb)),
      ast: Math.max(...allPlayers.map(p => p.ast)),
      stl: Math.max(...allPlayers.map(p => p.stl)),
      blk: Math.max(...allPlayers.map(p => p.blk)),
      tov: Math.max(...allPlayers.map(p => p.tov)),
  };

  return (
    <div className="fixed inset-0 bg-slate-950 z-[100] overflow-y-auto animate-in fade-in duration-500 ko-normal pretendard pb-24">
       <div className="min-h-screen flex flex-col">
          
          <ResultHeader 
            homeTeam={home}
            awayTeam={away}
            homeScore={homeScore}
            awayScore={awayScore}
            isWin={isWin}
            headline={headline}
          />

          <div className="flex-1 max-w-6xl mx-auto w-full p-6 space-y-8">
              
              <TacticsAnalysis 
                  homeTeam={home} 
                  awayTeam={away} 
                  homeTactics={homeTactics} 
                  awayTactics={awayTactics} 
                  homeBox={homeBox}
                  awayBox={awayBox}
              />

              <BoxScoreTable 
                team={away} 
                box={awayBox} 
                isFirst 
                mvpId={mvp.playerId} 
                leaders={leaders} 
              />
              
              <BoxScoreTable 
                team={home} 
                box={homeBox} 
                mvpId={mvp.playerId} 
                leaders={leaders} 
              />
              
              {/* Around the League Section (Kept within main view as it's minor) */}
              {otherGames && otherGames.length > 0 && (
                 <div className="mt-12 pt-8 border-t border-slate-800">
                     <h3 className="text-lg font-black uppercase text-slate-500 tracking-widest mb-6 flex items-center gap-2">
                        <Activity size={20} /> Around the League
                     </h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                         {otherGames.map(g => {
                             const h = getTeamInfo(g.homeTeamId);
                             const a = getTeamInfo(g.awayTeamId);
                             if (!h || !a) return null;
                             const hWin = (g.homeScore || 0) > (g.awayScore || 0);
                             return (
                                 <div key={g.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-2">
                                     <div className="flex justify-between items-center">
                                         <div className="flex items-center gap-3">
                                             <img src={a.logo} className="w-6 h-6 object-contain opacity-80" alt="" />
                                             <span className={`text-sm font-bold uppercase ${!hWin ? 'text-white' : 'text-slate-500'}`}>{a.name}</span>
                                         </div>
                                         <span className={`text-lg font-black oswald ${!hWin ? 'text-emerald-400' : 'text-slate-600'}`}>{g.awayScore}</span>
                                     </div>
                                     <div className="flex justify-between items-center">
                                         <div className="flex items-center gap-3">
                                             <img src={h.logo} className="w-6 h-6 object-contain opacity-80" alt="" />
                                             <span className={`text-sm font-bold uppercase ${hWin ? 'text-white' : 'text-slate-500'}`}>{h.name}</span>
                                         </div>
                                         <span className={`text-lg font-black oswald ${hWin ? 'text-emerald-400' : 'text-slate-600'}`}>{g.homeScore}</span>
                                     </div>
                                 </div>
                             );
                         })}
                     </div>
                 </div>
              )}
          </div>

          <ResultFooter onFinish={onFinish} />
       </div>
    </div>
  );
};
