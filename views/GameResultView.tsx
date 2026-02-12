
import React, { useState } from 'react';
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
                      shotEvents={pbpShotEvents || []} // [Fix] Ensure array
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
