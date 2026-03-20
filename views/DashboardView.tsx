
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Team, Game, Player, GameTactics, DepthChart } from '../types';
import { LeagueCoachingData } from '../types/coaching';
import { calculatePlayerOvr } from '../utils/constants';

// Import sub-components
import { RotationManager } from '../components/dashboard/RotationManager';
import { OpponentScoutPanel } from '../components/dashboard/OpponentScoutPanel';
import { RosterGrid } from '../components/roster/RosterGrid';
import { ScheduleView } from './ScheduleView';

interface DashboardViewProps {
  team: Team;
  teams: Team[];
  schedule: Game[];
  onSim: (tactics: GameTactics) => void;
  tactics: GameTactics;
  onUpdateTactics: (t: GameTactics) => void;
  currentSimDate?: string;
  isSimulating?: boolean;
  depthChart?: DepthChart | null;
  onUpdateDepthChart?: (dc: DepthChart) => void;
  onForceSave?: () => void;
  tendencySeed?: string;
  onViewPlayer: (player: Player, teamId?: string, teamName?: string) => void;
  userId?: string;
  onViewGameResult?: (result: any) => void;
  coachingData?: LeagueCoachingData | null;
  initialTab?: DashboardTab;
  onCoachClick?: (teamId: string) => void;
  seasonStartYear?: number;
}

export type DashboardTab = 'rotation' | 'roster' | 'records' | 'opponent' | 'schedule';

export const DashboardView: React.FC<DashboardViewProps> = ({
  team, teams, schedule, onSim, tactics, onUpdateTactics,
  currentSimDate, isSimulating,
  depthChart, onUpdateDepthChart, onForceSave, tendencySeed, onViewPlayer,
  userId, onViewGameResult, coachingData, initialTab, onCoachClick, seasonStartYear
}) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab || 'rotation');

  useEffect(() => { if (initialTab) setActiveTab(initialTab); }, [initialTab]);

  const nextGameDisplay = useMemo(() => {
      if (!team?.id) return undefined;
      const myGames = schedule.filter(g => g.homeTeamId === team.id || g.awayTeamId === team.id);
      myGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return myGames.find(g => !g.played);
  }, [schedule, team?.id]);

  const effectiveRoster = team?.roster || [];
  const effectiveOppRoster = useMemo(() => {
      if (!nextGameDisplay) return [];
      const isHome = nextGameDisplay.homeTeamId === team?.id;
      const oppId = isHome ? nextGameDisplay.awayTeamId : nextGameDisplay.homeTeamId;
      return teams.find(t => t.id === oppId)?.roster || [];
  }, [nextGameDisplay, team?.id, teams]);

  const healthySorted = useMemo(() => effectiveRoster.filter(p => p.health !== 'Injured').sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)), [effectiveRoster]);
  const oppHealthySorted = useMemo(() => effectiveOppRoster.filter(p => p.health !== 'Injured').sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)), [effectiveOppRoster]);

  useEffect(() => {
    if (healthySorted.length >= 5 && Object.values(tactics.starters).every(v => v === '')) {
      const newStarters = {
        PG: healthySorted.find(p => p.position.includes('PG'))?.id || healthySorted[0]?.id || '',
        SG: healthySorted.find(p => p.position.includes('SG') && !['PG'].includes(p.position))?.id || healthySorted[1]?.id || '',
        SF: healthySorted.find(p => p.position.includes('SF'))?.id || healthySorted[2]?.id || '',
        PF: healthySorted.find(p => p.position.includes('PF'))?.id || healthySorted[3]?.id || '',
        C: healthySorted.find(p => p.position === 'C')?.id || healthySorted[4]?.id || ''
      };
      onUpdateTactics({ ...tactics, starters: newStarters });
    }
  }, [healthySorted, tactics.starters, tactics, onUpdateTactics]);

  if (!team) return null;

  const handlePlayerClick = useCallback((p: Player) => {
    const playerTeam = effectiveRoster.some(rp => rp.id === p.id) ? team : teams.find(t => t.roster.some(rp => rp.id === p.id));
    onViewPlayer(p, playerTeam?.id, playerTeam?.name);
  }, [effectiveRoster, team, teams, onViewPlayer]);

  return (
    <div className="h-full animate-in fade-in duration-700 ko-normal relative text-slate-200 flex flex-col overflow-hidden">

      {/* Main Content Area with Navigation */}
      <div className="w-full flex flex-col flex-1 min-h-0">

          {/* Internal Tab Navigation */}
          <div className="px-8 border-b border-slate-800 bg-slate-950 flex items-center justify-between h-14 flex-shrink-0">
                <div className="flex items-center gap-8 h-full">
                    <button
                        onClick={() => setActiveTab('rotation')}
                        className={`flex items-center gap-2 transition-all h-full border-b-2 font-black tracking-tight uppercase text-sm ${activeTab === 'rotation' ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 hover:text-slate-300 border-transparent'}`}
                    >
                        <span>뎁스차트 & 로테이션</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('roster')}
                        className={`flex items-center gap-2 transition-all h-full border-b-2 font-black tracking-tight uppercase text-sm ${activeTab === 'roster' ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 hover:text-slate-300 border-transparent'}`}
                    >
                        <span>로스터</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('opponent')}
                        className={`flex items-center gap-2 transition-all h-full border-b-2 font-black tracking-tight uppercase text-sm ${activeTab === 'opponent' ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 hover:text-slate-300 border-transparent'}`}
                    >
                        <span>상대 전력 분석</span>
                    </button>
<button
                        onClick={() => setActiveTab('schedule')}
                        className={`flex items-center gap-2 transition-all h-full border-b-2 font-black tracking-tight uppercase text-sm ${activeTab === 'schedule' ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 hover:text-slate-300 border-transparent'}`}
                    >
                        <span>팀 일정</span>
                    </button>
                </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
              {activeTab === 'rotation' && (
                  <RotationManager
                      team={team}
                      tactics={tactics}
                      depthChart={depthChart || null}
                      healthySorted={healthySorted}
                      onUpdateTactics={onUpdateTactics}
                      onViewPlayer={handlePlayerClick}
                      onUpdateDepthChart={onUpdateDepthChart}
                      coachName={coachingData?.[team.id]?.headCoach?.name}
                  />
              )}

              {activeTab === 'roster' && (
                  <div className="animate-in fade-in duration-500 h-full">
                    <RosterGrid team={team} tab="roster" onPlayerClick={handlePlayerClick} />
                  </div>
              )}

              {activeTab === 'records' && (
                  <div className="animate-in fade-in duration-500 h-full flex flex-col">
                    <div className="flex-1 min-h-0">
                      <RosterGrid team={team} tab="stats" onPlayerClick={handlePlayerClick} />
                    </div>
                  </div>
              )}

              {activeTab === 'opponent' && (
                  <OpponentScoutPanel
                      opponent={teams.find(t => t.id !== team.id && t.roster.some(rp => rp.id === oppHealthySorted[0]?.id))}
                      oppHealthySorted={oppHealthySorted}
                      onViewPlayer={handlePlayerClick}
                  />
              )}

{activeTab === 'schedule' && userId && onViewGameResult && (
                  <div className="animate-in fade-in duration-500 h-full">
                    <ScheduleView
                        schedule={schedule}
                        teamId={team.id}
                        teams={teams}
                        currentSimDate={currentSimDate || ''}
                        userId={userId}
                        onViewGameResult={onViewGameResult}
                        calendarOnly
                        seasonStartYear={seasonStartYear}
                    />
                  </div>
              )}
          </div>
      </div>
    </div>
  );
};
