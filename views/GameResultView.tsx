
import React, { useState } from 'react';
import { List, RotateCw, Shield, LayoutList, Target } from 'lucide-react';
import { Team, PlayerBoxScore, Game, TacticalSnapshot, PbpLog, RotationData, ShotEvent } from '../types';

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
    pbpShotEvents?: ShotEvent[]; // [New]
  };
  myTeamId: string;
  teams: Team[];
  onFinish: () => void;
}> = ({ result, myTeamId, teams, onFinish }) => {
  const { home, away, homeScore, awayScore, homeBox, awayBox, homeTactics, awayTactics, pbpLogs, rotationData, otherGames, pbpShotEvents } = result;
  
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

  const tabs: { id: ResultTab; label: string; icon: React.ReactNode }[] = [
      { id: 'BoxScore', label: '박스스코어', icon: <List size={16} /> },
      { id: 'ShotChart', label: '샷 차트', icon: <Target size={16} /> },
      { id: 'PbpLog', label: '중계 로그', icon: <LayoutList size={16} /> },
      { id: 'Rotation', label: '로테이션', icon: <RotateCw size={16} /> },
      { id: 'Tactics', label: '전술 분석', icon: <Shield size={16} /> },
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

          {/* 2. Navigation Tabs (Full Width) */}
          <div className="sticky top-0 z-50 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
              <div className="max-w-7xl mx-auto flex items-center justify-center gap-1 p-2 overflow-x-auto">
                  {tabs.map((tab) => (
                      <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={`
                              relative px-5 py-3 text-xs font-bold transition-all duration-300 rounded-xl flex items-center gap-2 whitespace-nowrap
                              ${activeTab === tab.id 
                                ? 'bg-slate-800 text-white shadow-md ring-1 ring-slate-700' 
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'}
                          `}
                      >
                          {tab.icon}
                          {tab.label}
                      </button>
                  ))}
              </div>
          </div>

          {/* 3. Main Content Area */}
          <div className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8 space-y-6 flex flex-col min-h-[500px]">
              
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
                      shotEvents={pbpShotEvents}
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
