
import React, { useState } from 'react';
import { List, RotateCw, Shield, LayoutList } from 'lucide-react';
import { Team, PlayerBoxScore, Game, TacticalSnapshot, PbpLog, RotationData } from '../types';

// Components
import { ResultHeader } from '../components/game/ResultHeader';
import { GameStatLeaders } from '../components/game/BoxScoreTable';
import { ResultFooter } from '../components/game/ResultFooter';

// Tabs
import { GameBoxScoreTab } from '../components/game/tabs/GameBoxScoreTab';
import { GamePbpTab } from '../components/game/tabs/GamePbpTab';
import { GameRotationTab } from '../components/game/tabs/GameRotationTab';
import { GameTacticsTab } from '../components/game/tabs/GameTacticsTab';

type ResultTab = 'BoxScore' | 'PbpLog' | 'Rotation' | 'Tactics';

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
  };
  myTeamId: string;
  teams: Team[];
  onFinish: () => void;
}> = ({ result, myTeamId, teams, onFinish }) => {
  const { home, away, homeScore, awayScore, homeBox, awayBox, homeTactics, awayTactics, pbpLogs, rotationData, otherGames } = result;
  
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

  const NavButton = ({ tab, label, icon: Icon }: { tab: ResultTab, label: string, icon: any }) => (
      <button 
        onClick={() => setActiveTab(tab)}
        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
      >
          <Icon size={16} /> {label}
      </button>
  );

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

          <div className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8 space-y-6 flex flex-col">
              
              {/* 2. Navigation Tabs (Carousel Style) */}
              <div className="flex justify-center">
                  <div className="flex p-1 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
                      <NavButton tab="BoxScore" label="Box Score" icon={LayoutList} />
                      <NavButton tab="PbpLog" label="Play-by-Play" icon={List} />
                      <NavButton tab="Rotation" label="Rotation" icon={RotateCw} />
                      <NavButton tab="Tactics" label="Tactics" icon={Shield} />
                  </div>
              </div>

              {/* 3. Main Content Area */}
              <div className="flex-1 min-h-[500px]">
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

                  {activeTab === 'PbpLog' && (
                      <GamePbpTab 
                          logs={pbpLogs} 
                          homeTeamId={home.id} 
                          awayTeamId={away.id} 
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

          </div>

          <ResultFooter onFinish={onFinish} />
       </div>
    </div>
  );
};
