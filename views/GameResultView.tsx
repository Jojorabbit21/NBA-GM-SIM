
import React, { useState } from 'react';
import { Team, PlayerBoxScore, Game, TacticalSnapshot, PbpLog, RotationData, ShotEvent } from '../types';
import { ShieldAlert, Clock } from 'lucide-react'; // Import Icon

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

// Define InjuryEvent locally or import if exposed in types
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
    homeTactics?: TacticalSnapshot;
    awayTactics?: TacticalSnapshot;
    userTactics?: any;
    myTeamId: string;
    pbpLogs?: PbpLog[];
    rotationData?: RotationData;
    pbpShotEvents?: ShotEvent[]; 
    injuries?: InjuryEvent[]; // [New]
  };
  myTeamId: string;
  teams: Team[];
  onFinish: () => void;
}> = ({ result, myTeamId, teams, onFinish }) => {
  const { home, away, homeScore, awayScore, homeBox, awayBox, homeTactics, awayTactics, pbpLogs, rotationData, otherGames, pbpShotEvents, injuries } = result;
  
  const isHome = myTeamId === home.id;
  const isWin = isHome ? homeScore > awayScore : awayScore > homeScore;
  const [activeTab, setActiveTab] = useState<ResultTab>('BoxScore');

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
            isWin={isWin}
            pbpLogs={pbpLogs}
          />

          {/* 2. Navigation Tabs (Centered & Reverted Style) */}
          <div className="bg-slate-950 border-b border-slate-800">
              <div className="max-w-7xl mx-auto flex items-center justify-center gap-6 px-6 overflow-x-auto">
                  {tabs.map((tab) => (
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
                  ))}
              </div>
          </div>

          {/* 3. Main Content Area */}
          <div className="flex-1 max-w-7xl mx-auto w-full p-0 md:p-8 space-y-6 flex flex-col min-h-[500px]">
              
              {/* [New] Medical Report Section */}
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
                      mvpId={mvp.playerId}
                      leaders={leaders}
                      otherGames={otherGames}
                      teams={teams}
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

          <ResultFooter onFinish={onFinish} />
       </div>
    </div>
  );
};
