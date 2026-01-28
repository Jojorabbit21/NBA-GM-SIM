
import React, { useMemo, useState, useEffect } from 'react';
import { Team, Game, Player, OffenseTactic, DefenseTactic, PlayoffSeries } from '../types';
import { GameTactics, generateAutoTactics } from '../services/gameEngine';
import { PlayerDetailModal } from '../components/SharedComponents';
import { calculatePlayerOvr } from '../utils/constants';
import { logEvent } from '../services/analytics'; 
import { calculateTacticScore } from '../utils/tacticUtils';

// Import sub-components
import { DashboardHeader, DashboardReviewBanners } from '../components/dashboard/DashboardHeader';
import { RosterTable } from '../components/dashboard/RosterTable';
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
  playoffSeries?: PlayoffSeries[]; // Added prop to receive series data
}

export const DashboardView: React.FC<DashboardViewProps> = ({ 
  team, teams, schedule, onSim, tactics, onUpdateTactics, 
  currentSimDate, isSimulating, onShowSeasonReview, onShowPlayoffReview, hasPlayoffHistory = false,
  playoffSeries = []
}) => {
  // 1. Find the next game for the user's team (regardless of unplayed/played) to show branding
  const userGamesToday = useMemo(() => {
    if (!team?.id || !currentSimDate) return [];
    return schedule.filter(g => g.date === currentSimDate && (g.homeTeamId === team.id || g.awayTeamId === team.id));
  }, [schedule, team?.id, currentSimDate]);

  // 2. Determine if there's an actual game to simulate TODAY
  const unplayedGamesToday = useMemo(() => {
      if (!currentSimDate) return [];
      return schedule.filter(g => g.date === currentSimDate && !g.played);
  }, [schedule, currentSimDate]);

  // [Fix] 사용자의 팀이 오늘 경기가 있는지 여부 판단
  const userHasGameToday = useMemo(() => {
      return unplayedGamesToday.some(g => g.homeTeamId === team?.id || g.awayTeamId === team?.id);
  }, [unplayedGamesToday, team?.id]);

  // 3. Current next game to show in header (prioritize unplayed today, then overall next)
  const nextGameDisplay = useMemo(() => {
      if (!team?.id) return undefined;
      return schedule.find(g => !g.played && (g.homeTeamId === team.id || g.awayTeamId === team.id)) 
             || schedule.filter(g => (g.homeTeamId === team.id || g.awayTeamId === team.id)).reverse().find(g => g.played);
  }, [schedule, team?.id]);

  const isHome = nextGameDisplay?.homeTeamId === team?.id;
  const opponentId = isHome ? nextGameDisplay?.awayTeamId : nextGameDisplay?.homeTeamId;
  const opponent = useMemo(() => teams.find(t => t.id === opponentId), [teams, opponentId]);

  // 4. Determine Current Playoff Series
  const currentSeries = useMemo(() => {
      if (!nextGameDisplay?.isPlayoff || !nextGameDisplay.seriesId || !playoffSeries) return undefined;
      return playoffSeries.find(s => s.id === nextGameDisplay.seriesId);
  }, [nextGameDisplay, playoffSeries]);

  const [activeRosterTab, setActiveRosterTab] = useState<'mine' | 'opponent'>('mine');
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);
  
  const { starters, stopperId, defenseTactics } = tactics;
  
  const healthySorted = useMemo(() => (team?.roster || []).filter(p => p.health !== 'Injured').sort((a, b) => b.ovr - a.ovr), [team?.roster]);
  const injuredSorted = useMemo(() => (team?.roster || []).filter(p => p.health === 'Injured').sort((a, b) => b.ovr - a.ovr), [team?.roster]);
  const oppHealthySorted = useMemo(() => (opponent?.roster || []).filter(p => p.health !== 'Injured').sort((a, b) => b.ovr - a.ovr), [opponent?.roster]);
  
  // Ensure starters are valid
  useEffect(() => {
    if (healthySorted.length >= 5 && Object.values(starters).every(v => v === '')) {
      const newStarters = {
        PG: healthySorted.find(p => p.position.includes('PG'))?.id || healthySorted[0]?.id || '',
        SG: healthySorted.find(p => p.position.includes('SG') && !['PG'].includes(p.position))?.id || healthySorted[1]?.id || '',
        SF: healthySorted.find(p => p.position.includes('SF'))?.id || healthySorted[2]?.id || '',
        PF: healthySorted.find(p => p.position.includes('PF'))?.id || healthySorted[3]?.id || '',
        C: healthySorted.find(p => p.position === 'C')?.id || healthySorted[4]?.id || ''
      };
      onUpdateTactics({ ...tactics, starters: newStarters });
    }
  }, [healthySorted, starters, tactics, onUpdateTactics]);

  const myOvr = useMemo(() => {
    if (!team?.roster?.length) return 0;
    return Math.round(team.roster.reduce((s, p) => s + p.ovr, 0) / team.roster.length);
  }, [team?.roster]);

  const opponentOvrValue = useMemo(() => {
    if (!opponent?.roster?.length) return 0;
    return Math.round(opponent.roster.reduce((s, p) => s + p.ovr, 0) / opponent.roster.length);
  }, [opponent?.roster]);

  const handleCalculateTacticScore = (type: OffenseTactic | DefenseTactic) => {
      return calculateTacticScore(type, team, tactics);
  };

  const handleAutoSet = () => {
    const autoTactics = generateAutoTactics(team);
    onUpdateTactics(autoTactics);
  };

  const handleSimClick = () => {
    onSim(tactics);
  };

  const playerTeam = viewPlayer ? (team.roster.some(rp => rp.id === viewPlayer.id) ? team : opponent) : null;

  if (!team) return null;

  return (
    <div className="min-h-screen animate-in fade-in duration-700 ko-normal pb-20 relative text-slate-200 flex flex-col items-center gap-10">
      {viewPlayer && <PlayerDetailModal player={viewPlayer} teamName={playerTeam?.name} teamId={playerTeam?.id} onClose={() => setViewPlayer(null)} />}
      
      {/* Review Banners */}
      <DashboardReviewBanners 
        onShowSeasonReview={onShowSeasonReview} 
        onShowPlayoffReview={onShowPlayoffReview} 
        hasPlayoffHistory={hasPlayoffHistory} 
      />

      {/* Main Dashboard Header Section */}
      <DashboardHeader 
        team={team}
        nextGame={nextGameDisplay}
        opponent={opponent}
        isHome={isHome}
        myOvr={myOvr}
        opponentOvrValue={opponentOvrValue}
        isGameToday={userHasGameToday} 
        isSimulating={isSimulating}
        onSimClick={handleSimClick}
        onShowSeasonReview={onShowSeasonReview}
        onShowPlayoffReview={onShowPlayoffReview}
        hasPlayoffHistory={hasPlayoffHistory}
        currentSeries={currentSeries}
      />

      {/* [Optimization] Reduced background transparency and blur (bg-slate-900/80, backdrop-blur-xl) */}
      <div className="w-full max-w-[1900px] grid grid-cols-1 lg:grid-cols-12 min-h-0 border border-white/10 rounded-3xl overflow-hidden shadow-2xl bg-slate-900/80 backdrop-blur-xl">
          {/* Left Panel: Roster Table */}
          <RosterTable 
            activeRosterTab={activeRosterTab}
            setActiveRosterTab={setActiveRosterTab}
            team={team}
            opponent={opponent}
            healthySorted={healthySorted}
            injuredSorted={injuredSorted}
            oppHealthySorted={oppHealthySorted}
            tactics={tactics}
            onUpdateTactics={onUpdateTactics}
            onViewPlayer={setViewPlayer}
          />

          {/* Right Panel: Tactics Board */}
          <TacticsBoard 
            tactics={tactics}
            onUpdateTactics={onUpdateTactics}
            onAutoSet={handleAutoSet}
            calculateTacticScore={handleCalculateTacticScore}
          />
      </div>
    </div>
  );
};
