import React, { useRef, useEffect } from 'react';
import { Activity, List, Clock } from 'lucide-react';
import { Team, PlayerBoxScore, Game, TacticalSnapshot, PbpLog } from '../types';

// Components
import { ResultHeader } from '../components/game/ResultHeader';
import { TacticsAnalysis } from '../components/game/TacticsAnalysis';
import { BoxScoreTable, GameStatLeaders } from '../components/game/BoxScoreTable';
import { ResultFooter } from '../components/game/ResultFooter';

// PBP Viewer Component
const PbpViewer: React.FC<{ logs: PbpLog[], homeTeamId: string, awayTeamId: string }> = ({ logs, homeTeamId, awayTeamId }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on load not necessary for result view, but good for UX if list is long
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, []);

    if (!logs || logs.length === 0) return null;

    return (
        <div className="w-full bg-slate-950 border border-slate-800 rounded-3xl p-6 mb-8 shadow-2xl">
            <div className="flex items-center gap-3 mb-4 pb-2 border-b border-slate-800">
                <List className="text-slate-400" size={20} />
                <h3 className="text-lg font-black uppercase text-slate-200 tracking-widest ko-tight">Play-by-Play Log</h3>
            </div>
            <div 
                ref={scrollRef}
                className="h-64 overflow-y-auto custom-scrollbar bg-slate-900/50 rounded-xl p-4 font-mono text-xs md:text-sm space-y-1.5 border border-white/5"
            >
                {logs.map((log, idx) => {
                    const isHome = log.teamId === homeTeamId;
                    const isScore = log.type === 'score';
                    const isImportant = log.type === 'info';
                    const isFT = log.type === 'freethrow';
                    
                    let textColor = 'text-slate-400';
                    if (isImportant) textColor = 'text-yellow-400 font-bold';
                    else if (isScore) textColor = isHome ? 'text-indigo-300 font-bold' : 'text-emerald-300 font-bold';
                    else if (isFT) textColor = 'text-cyan-400';
                    else if (log.type === 'turnover' || log.type === 'foul') textColor = 'text-red-400';

                    return (
                        <div key={idx} className={`flex gap-3 ${isImportant ? 'py-2 border-y border-white/10 my-2 bg-white/5 justify-center' : ''}`}>
                            {!isImportant && (
                                <div className="flex-shrink-0 w-16 text-slate-600 flex items-center gap-1">
                                    <Clock size={10} />
                                    <span>{log.quarter}Q {log.timeRemaining}</span>
                                </div>
                            )}
                            <div className={`flex-1 break-words ${textColor}`}>
                                {log.text}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

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
    pbpLogs?: PbpLog[];
  };
  myTeamId: string;
  teams: Team[];
  onFinish: () => void;
}> = ({ result, myTeamId, teams, onFinish }) => {
  const { home, away, homeScore, awayScore, homeBox, awayBox, recap, otherGames, homeTactics, awayTactics, pbpLogs } = result;
  
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
              
              {/* Play-by-Play Logs (Inserted Here) */}
              {pbpLogs && <PbpViewer logs={pbpLogs} homeTeamId={home.id} awayTeamId={away.id} />}

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