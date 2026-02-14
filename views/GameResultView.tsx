
import React, { useState, useEffect } from 'react';
import { Team, PlayerBoxScore, Game, TacticalSnapshot, PbpLog, RotationData, ShotEvent } from '../types';
import { ShieldAlert, Clock, ChevronLeft } from 'lucide-react'; 
import { CpuGameResult } from '../services/simulationService'; // [New] Import Type

// Components
import { ResultHeader } from '../components/game/ResultHeader';
import { GameStatLeaders } from '../components/game/BoxScoreTable';
import { ResultFooter } from '../components/game/ResultFooter';

// Tabs
import { GameBoxScoreTab } from '../components/game/tabs/GameBoxScoreTab';
import { GamePbpTab } from '../components/game/tabs/GamePbpTab';
import { GameRotationTab } from '../components/game/tabs/GameRotationTab';
import { GameTacticsTab } from '../components/game/tabs/GameTacticsTab';
import { GameShotChartTab } from '../components/game/tabs/GameShotChartTab';

type ResultTab = 'BoxScore' | 'ShotChart' | 'PbpLog' | 'Rotation' | 'Tactics';

interface InjuryEvent {
    playerId: string;
    playerName: string;
    teamId: string;
    injuryType: string;
    durationDesc: string;
    quarter: number;
    timeRemaining: string;
}

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
    cpuResults?: CpuGameResult[]; // [New]
    homeTactics?: TacticalSnapshot;
    awayTactics?: TacticalSnapshot;
    userTactics?: any;
    myTeamId: string;
    pbpLogs?: PbpLog[];
    rotationData?: RotationData;
    pbpShotEvents?: ShotEvent[]; 
    injuries?: InjuryEvent[]; 
  };
  myTeamId: string;
  teams: Team[];
  onFinish: () => void;
}> = ({ result: initialResult, myTeamId, teams, onFinish }) => {
  
  // [New] State to manage currently viewed game
  // Default to the user's game passed in props
  const [activeResult, setActiveResult] = useState<any>(initialResult);
  const [activeTab, setActiveTab] = useState<ResultTab>('BoxScore');
  
  // Reset active result when initialResult changes (e.g. new simulation)
  useEffect(() => {
      setActiveResult(initialResult);
  }, [initialResult]);

  const isUserGame = activeResult === initialResult;

  // Handler for switching to other games
  const handleSelectGame = (gameId: string) => {
      if (!initialResult.cpuResults) return;
      const targetGame = initialResult.cpuResults.find(g => g.gameId === gameId);
      if (targetGame) {
          // Map CpuGameResult to the format expected by the view
          const hTeam = teams.find(t => t.id === targetGame.homeTeamId);
          const aTeam = teams.find(t => t.id === targetGame.awayTeamId);
          if (!hTeam || !aTeam) return;

          const mappedResult = {
              ...initialResult, // Inherit base properties (like otherGames list)
              home: hTeam,
              away: aTeam,
              homeScore: targetGame.homeScore,
              awayScore: targetGame.awayScore,
              homeBox: targetGame.boxScore.home,
              awayBox: targetGame.boxScore.away,
              homeTactics: targetGame.tactics.home,
              awayTactics: targetGame.tactics.away,
              rotationData: targetGame.rotationData, // [New] Now available
              pbpShotEvents: targetGame.pbpShotEvents, // [New] Now available
              pbpLogs: [], // CPU games don't have PBP
              injuries: [], // CPU injuries not detailed in this view structure usually
          };
          setActiveResult(mappedResult);
          setActiveTab('BoxScore'); // Reset tab
          // Scroll to top
          const container = document.querySelector('.overflow-y-auto');
          if (container) container.scrollTop = 0;
      }
  };

  const handleBackToMain = () => {
      setActiveResult(initialResult);
      setActiveTab('BoxScore');
  };

  const { home, away, homeScore, awayScore, homeBox, awayBox, homeTactics, awayTactics, pbpLogs, rotationData, otherGames, pbpShotEvents, injuries } = activeResult;
  
  const isHome = myTeamId === home.id;
  const isWin = isHome ? homeScore > awayScore : awayScore > homeScore;
  
  // MVP Calculation
  const allPlayers = [...homeBox, ...awayBox];
  const mvp = allPlayers.length > 0 ? allPlayers.reduce((prev, curr) => (curr.pts > prev.pts ? curr : prev), allPlayers[0]) : null;

  // Leaders Calculation
  const leaders: GameStatLeaders = {
      pts: Math.max(0, ...allPlayers.map(p => p.pts)),
      reb: Math.max(0, ...allPlayers.map(p => p.reb)),
      ast: Math.max(0, ...allPlayers.map(p => p.ast)),
      stl: Math.max(0, ...allPlayers.map(p => p.stl)),
      blk: Math.max(0, ...allPlayers.map(p => p.blk)),
      tov: Math.max(0, ...allPlayers.map(p => p.tov)),
  };

  const tabs: { id: ResultTab; label: string }[] = [
      { id: 'BoxScore', label: '박스스코어' },
      { id: 'ShotChart', label: '샷 차트' },
      { id: 'PbpLog', label: '중계 로그' },
      { id: 'Rotation', label: '로테이션' },
      { id: 'Tactics', label: '전술 분석' },
  ];

  return (
    <div className="fixed inset-0 bg-slate-950 z-[100] overflow-y-auto animate-in fade-in duration-500 ko-normal pretendard pb-24">
       <div className="min-h-screen flex flex-col">
          
          {/* 1. Header (Compact) */}
          <ResultHeader 
            homeTeam={home}
            awayTeam={away}
            homeScore={homeScore}
            awayScore={awayScore}
            isWin={isUserGame ? isWin : (homeScore > awayScore)} // For CPU games, just show result color
            pbpLogs={pbpLogs} // Might be empty for CPU games
          />

          {/* 2. Navigation Tabs (Centered & Reverted Style) */}
          <div className="bg-slate-950 border-b border-slate-800 sticky top-0 z-50">
              <div className="max-w-7xl mx-auto flex items-center justify-center gap-6 px-6 overflow-x-auto">
                  {tabs.map((tab) => {
                      // Hide PBP tab for CPU games if empty
                      if (tab.id === 'PbpLog' && (!pbpLogs || pbpLogs.length === 0)) return null;

                      return (
                          <button
                              key={tab.id}
                              onClick={() => setActiveTab(tab.id)}
                              className={`
                                  flex items-center gap-2 py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2
                                  ${activeTab === tab.id 
                                    ? 'text-indigo-400 border-indigo-400' 
                                    : 'text-slate-500 border-transparent hover:text-slate-300'}
                              `}
                          >
                              <span>{tab.label}</span>
                          </button>
                      );
                  })}
              </div>
          </div>

          {/* 3. Main Content Area */}
          <div className="flex-1 max-w-7xl mx-auto w-full p-0 md:p-8 space-y-6 flex flex-col min-h-[500px]">
              
              {/* Back Button for CPU Games */}
              {!isUserGame && (
                  <button 
                      onClick={handleBackToMain}
                      className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors self-start mb-2 px-2"
                  >
                      <ChevronLeft size={16} />
                      <span className="text-xs font-bold">내 경기 결과로 돌아가기</span>
                  </button>
              )}

              {/* [New] Medical Report Section (Only for User Games usually) */}
              {injuries && injuries.length > 0 && (
                  <div className="w-full bg-red-950/20 border border-red-900/50 rounded-2xl p-6 shadow-lg animate-in slide-in-from-top-2">
                      <div className="flex items-center gap-3 mb-4 border-b border-red-900/30 pb-2">
                          <ShieldAlert className="text-red-500" size={20} />
                          <h3 className="text-sm font-black text-red-100 uppercase tracking-widest">Medical Report (부상자 명단)</h3>
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                          {injuries.map((inj, idx) => {
                              const injTeam = inj.teamId === home.id ? home : away;
                              const teamCode = injTeam.id.toUpperCase();
                              return (
                                  <div key={idx} className="flex items-center justify-between bg-slate-950/50 rounded-xl p-3 border border-red-900/20">
                                      <div className="flex items-center gap-4">
                                          <div className="flex flex-col items-center justify-center bg-slate-900 w-10 h-10 rounded-lg border border-slate-800">
                                              <span className="text-[10px] font-black text-slate-500">{teamCode}</span>
                                          </div>
                                          <div>
                                              <div className="text-sm font-bold text-white flex items-center gap-2">
                                                  {inj.playerName}
                                                  <span className="text-[10px] font-black text-red-400 bg-red-950/50 px-1.5 py-0.5 rounded uppercase tracking-tight">OUT</span>
                                              </div>
                                              <div className="text-xs text-slate-400 mt-0.5">
                                                  {inj.injuryType} <span className="text-slate-600 mx-1">|</span> <span className="text-slate-300 font-bold">예상 결장: {inj.durationDesc}</span>
                                              </div>
                                          </div>
                                      </div>
                                      <div className="text-right">
                                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-900 px-2 py-1 rounded-lg">
                                              <Clock size={12} />
                                              <span>{inj.quarter}Q {inj.timeRemaining}</span>
                                          </div>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  </div>
              )}

              {activeTab === 'BoxScore' && (
                  <GameBoxScoreTab 
                      homeTeam={home}
                      awayTeam={away}
                      homeBox={homeBox}
                      awayBox={awayBox}
                      mvpId={mvp?.playerId || ''}
                      leaders={leaders}
                      otherGames={isUserGame ? otherGames : undefined} // Only show other games on main view
                      teams={teams}
                      onSelectGame={handleSelectGame}
                  />
              )}

              {activeTab === 'ShotChart' && (
                  <GameShotChartTab 
                      homeTeam={home}
                      awayTeam={away}
                      shotEvents={pbpShotEvents || []} 
                  />
              )}

              {activeTab === 'PbpLog' && (
                  <GamePbpTab 
                      logs={pbpLogs} 
                      homeTeam={home} 
                      awayTeam={away} 
                  />
              )}

              {activeTab === 'Rotation' && (
                  <GameRotationTab 
                      homeTeam={home}
                      awayTeam={away}
                      homeBox={homeBox}
                      awayBox={awayBox}
                      rotationData={rotationData}
                  />
              )}

              {activeTab === 'Tactics' && (
                  <GameTacticsTab 
                      homeTeam={home}
                      awayTeam={away}
                      homeTactics={homeTactics}
                      awayTactics={awayTactics}
                      homeBox={homeBox}
                      awayBox={awayBox}
                  />
              )}

          </div>

          {/* Conditional Footer */}
          {isUserGame ? (
              <ResultFooter onFinish={onFinish} />
          ) : (
              <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-950/80 backdrop-blur-md border-t border-slate-800 flex justify-center z-50">
                <button 
                    onClick={handleBackToMain}
                    className="px-12 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-black uppercase text-lg tracking-widest shadow-lg transition-all active:scale-95 flex items-center gap-4"
                >
                    <ChevronLeft /> 내 경기 결과로 돌아가기
                </button>
            </div>
          )}
       </div>
    </div>
  );
};
