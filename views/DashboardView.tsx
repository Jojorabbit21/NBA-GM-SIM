
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Team, Game, Player, PlayoffSeries, GameTactics, DepthChart } from '../types';
import { generateAutoTactics } from '../services/gameEngine';
import { PlayerDetailModal } from '../components/PlayerDetailModal';
import { calculatePlayerOvr } from '../utils/constants';
import { computeDefensiveStats } from '../utils/defensiveStats';

// Import sub-components
import { DashboardReviewBanners } from '../components/dashboard/DashboardHeader';
import { RotationManager } from '../components/dashboard/RotationManager';
import { OpponentScoutPanel } from '../components/dashboard/OpponentScoutPanel';
import { TacticsBoard } from '../components/dashboard/TacticsBoard';

interface DashboardViewProps {
  team: Team;
  teams: Team[];
  schedule: Game[];
  onSim: (tactics: GameTactics) => void;
  tactics: GameTactics;
  onUpdateTactics: (t: GameTactics) => void;
  currentSimDate?: string;
  isSimulating?: boolean;
  onShowSeasonReview: () => void;
  onShowPlayoffReview: () => void;
  hasPlayoffHistory?: boolean;
  playoffSeries?: PlayoffSeries[];
  depthChart?: DepthChart | null;
  onUpdateDepthChart?: (dc: DepthChart) => void;
  onForceSave?: () => void;
}

type DashboardTab = 'rotation' | 'tactics' | 'opponent';

export const DashboardView: React.FC<DashboardViewProps> = ({
  team, teams, schedule, onSim, tactics, onUpdateTactics,
  currentSimDate, isSimulating, onShowSeasonReview, onShowPlayoffReview, hasPlayoffHistory = false,
  playoffSeries = [], depthChart, onUpdateDepthChart, onForceSave
}) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('rotation');
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);

  const nextGameDisplay = useMemo(() => {
      if (!team?.id) return undefined;
      const myGames = schedule.filter(g => g.homeTeamId === team.id || g.awayTeamId === team.id);
      myGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return myGames.find(g => !g.played) || myGames[myGames.length - 1];
  }, [schedule, team?.id]);

  const isRegularSeasonFinished = useMemo(() => {
      if (!team?.id) return false;
      const myRegularGames = schedule.filter(g => !g.isPlayoff && (g.homeTeamId === team.id || g.awayTeamId === team.id));
      return myRegularGames.length > 0 && myRegularGames.every(g => g.played);
  }, [schedule, team?.id]);

  const isPostseasonOver = useMemo(() => {
      if (!team?.id || !playoffSeries || playoffSeries.length === 0) return false;
      const myPlayoffSeries = playoffSeries.filter(s => s.higherSeedId === team.id || s.lowerSeedId === team.id);
      if (myPlayoffSeries.length === 0) return false;

      const latest = [...myPlayoffSeries].sort((a, b) => b.round - a.round)[0];
      if (!latest.finished) return false;

      if (latest.winnerId !== team.id) return true;
      return latest.round === 4;
  }, [playoffSeries, team?.id]);

  const defensiveStats = useMemo(() => {
      if (!team?.id) return computeDefensiveStats([], '');
      return computeDefensiveStats(schedule, team.id);
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

  const handleAutoSet = useCallback(() => {
    const autoTactics = generateAutoTactics({ ...team, roster: effectiveRoster });
    onUpdateTactics(autoTactics);
  }, [team, effectiveRoster, onUpdateTactics]);

  if (!team) return null;

  const playerTeam = viewPlayer ? (effectiveRoster.some(rp => rp.id === viewPlayer.id) ? team : teams.find(t => t.roster.some(rp => rp.id === viewPlayer.id))) : null;

  return (
    <div className="h-full animate-in fade-in duration-700 ko-normal relative text-slate-200 flex flex-col overflow-hidden">
      {viewPlayer && <PlayerDetailModal player={{...viewPlayer, ovr: calculatePlayerOvr(viewPlayer)}} teamName={playerTeam?.name} teamId={playerTeam?.id} onClose={() => setViewPlayer(null)} allTeams={teams} />}

      <DashboardReviewBanners
        onShowSeasonReview={onShowSeasonReview}
        onShowPlayoffReview={onShowPlayoffReview}
        hasPlayoffHistory={hasPlayoffHistory}
        showSeasonBanner={isRegularSeasonFinished}
        showPlayoffBanner={isPostseasonOver}
      />

      {/* Main Content Area with Navigation */}
      <div className="w-full flex flex-col flex-1 min-h-0">

          {/* Internal Tab Navigation */}
          <div className="px-8 border-b border-slate-800 bg-slate-950 flex items-center justify-between h-14 flex-shrink-0">
                <div className="flex items-center gap-8 h-full">
                    <button
                        onClick={() => setActiveTab('rotation')}
                        className={`flex items-center gap-2 transition-all h-full border-b-2 font-black oswald tracking-tight uppercase text-sm ${activeTab === 'rotation' ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 hover:text-slate-300 border-transparent'}`}
                    >
                        <span>뎁스차트 & 로테이션</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('tactics')}
                        className={`flex items-center gap-2 transition-all h-full border-b-2 font-black oswald tracking-tight uppercase text-sm ${activeTab === 'tactics' ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 hover:text-slate-300 border-transparent'}`}
                    >
                        <span>전술 관리</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('opponent')}
                        className={`flex items-center gap-2 transition-all h-full border-b-2 font-black oswald tracking-tight uppercase text-sm ${activeTab === 'opponent' ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 hover:text-slate-300 border-transparent'}`}
                    >
                        <span>상대 전력 분석</span>
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
                      onViewPlayer={setViewPlayer}
                      onUpdateDepthChart={onUpdateDepthChart}
                  />
              )}

              {activeTab === 'tactics' && (
                  <div className="animate-in fade-in duration-500 h-full">
                    <TacticsBoard
                        team={team}
                        tactics={tactics}
                        roster={effectiveRoster}
                        onUpdateTactics={onUpdateTactics}
                        onAutoSet={handleAutoSet}
                        onForceSave={onForceSave}
                        defensiveStats={defensiveStats}
                    />
                  </div>
              )}

              {activeTab === 'opponent' && (
                  <OpponentScoutPanel
                      opponent={teams.find(t => t.id !== team.id && t.roster.some(rp => rp.id === oppHealthySorted[0]?.id))}
                      oppHealthySorted={oppHealthySorted}
                      onViewPlayer={setViewPlayer}
                  />
              )}
          </div>
      </div>
    </div>
  );
};
